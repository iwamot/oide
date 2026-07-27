// src/main.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// src/actions.ts
function getInput(name) {
  return (process.env[`INPUT_${name.toUpperCase()}`] ?? "").trim();
}
function info(message) {
  write(message);
}
function notice(message) {
  write(`::notice::${escapeData(message)}`);
}
function warning(message) {
  write(`::warning::${escapeData(message)}`);
}
function setFailed(message) {
  write(`::error::${escapeData(message)}`);
  process.exitCode = 1;
}
function write(line) {
  process.stdout.write(`${line}
`);
}
function escapeData(value) {
  return value.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

// src/contents.ts
function interpretContents(data) {
  if (Array.isArray(data)) {
    return { kind: "absent" };
  }
  const file = asFileContent(data);
  if (!file || file.type !== "file") {
    return { kind: "absent" };
  }
  if (file.encoding !== "base64") {
    return { kind: "too-large" };
  }
  return { kind: "file", content: Buffer.from(file.content, "base64") };
}
function asFileContent(data) {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  if (!("type" in data) || !("encoding" in data) || !("content" in data)) {
    return null;
  }
  const { type, encoding, content } = data;
  if (typeof type !== "string" || typeof encoding !== "string" || typeof content !== "string") {
    return null;
  }
  return { type, encoding, content };
}

// src/source.ts
function parseSources(input) {
  const lines = input.split(`
`).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { ok: false, error: "sources input is required" };
  }
  const sources = [];
  for (const line of lines) {
    const parsed = parseSource(line);
    if (!parsed.ok) {
      return parsed;
    }
    const { repo, ref, oidefile } = parsed;
    sources.push({ repo, ref, oidefile });
  }
  return { ok: true, sources };
}
function parseSource(line) {
  const fields = line.split(/\s+/).filter((field) => field.length > 0);
  const target = fields[0];
  if (target === undefined || fields.length > 2) {
    return formatError(line);
  }
  const oidefile = fields[1] ?? null;
  const at = target.lastIndexOf("@");
  if (at === -1) {
    return formatError(line);
  }
  const repo = target.slice(0, at);
  const ref = target.slice(at + 1);
  if (!repo || !ref) {
    return formatError(line);
  }
  const slash = repo.indexOf("/");
  if (slash <= 0 || slash === repo.length - 1) {
    return formatError(line);
  }
  return { ok: true, repo, ref, oidefile };
}
function formatError(line) {
  return {
    ok: false,
    error: "each source must be in 'org/repo@ref' or 'org/repo@ref Oidefile'" + ` format, got: ${line}`
  };
}
function splitRepo(repo) {
  const slash = repo.indexOf("/");
  return { owner: repo.slice(0, slash), name: repo.slice(slash + 1) };
}

// src/github.ts
var API_BASE = "https://api.github.com";
async function readSourceFile(repo, ref, path, token) {
  const { owner, name } = splitRepo(repo);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${API_BASE}/repos/${owner}/${name}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "iwamot/oide"
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const res = await fetch(url, { headers });
  if (res.status === 404) {
    return { kind: "absent" };
  }
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} ${res.statusText} for ${repo}@${ref}:${path}`);
  }
  return interpretContents(await res.json());
}

// src/oidefile.ts
var OIDEFILE_CANDIDATES = ["Oidefile", ".github/Oidefile"];
function parseOidefile(text) {
  return text.split(`
`).map((line) => line.trim()).filter((line) => line.length > 0);
}

// src/path-safety.ts
function isUnsafePath(entry) {
  return entry.startsWith("/") || entry === ".." || entry.startsWith("../") || entry.endsWith("/..") || entry.includes("/../");
}

// src/plan.ts
function shouldSelfSkip(githubRepository, sourceRepo) {
  return Boolean(githubRepository) && githubRepository === sourceRepo;
}
function isSelfListed(entries, oidefilePath) {
  return entries.includes(oidefilePath);
}

// src/main.ts
async function main() {
  const parsed = parseSources(getInput("sources"));
  if (!parsed.ok) {
    setFailed(parsed.error);
    return;
  }
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const token = getInput("token");
  let pulled = 0;
  let skipped = 0;
  for (const source of parsed.sources) {
    const result = await pullSource(source, workspace, token);
    if (!result.ok) {
      setFailed(result.error);
      return;
    }
    pulled += result.pulled;
    skipped += result.skipped;
  }
  info(`Done. pulled=${pulled}, skipped=${skipped}`);
}
async function pullSource(source, workspace, token) {
  const { repo: sourceRepo, ref: sourceRef } = source;
  if (shouldSelfSkip(process.env.GITHUB_REPOSITORY, sourceRepo)) {
    notice(`source equals github.repository (${sourceRepo}); self-skip`);
    return { ok: true, pulled: 0, skipped: 0 };
  }
  const oidefileRel = resolveOidefile(workspace, source.oidefile);
  if (!oidefileRel.ok) {
    return oidefileRel;
  }
  const initial = parseOidefile(readFileSync(join(workspace, oidefileRel.path), "utf8"));
  info(`Fetching ${sourceRepo} @ ${sourceRef} (${oidefileRel.path}) ...`);
  let pulled = 0;
  let skipped = 0;
  let oidefilePulled = false;
  let authoritative = initial;
  if (isSelfListed(initial, oidefileRel.path)) {
    const result = await readSourceFile(sourceRepo, sourceRef, oidefileRel.path, token);
    if (result.kind === "file") {
      writeWorkspaceFile(workspace, oidefileRel.path, result.content);
      info(`  pulled: ${oidefileRel.path}`);
      pulled++;
      oidefilePulled = true;
      authoritative = parseOidefile(result.content.toString("utf8"));
    }
  }
  for (const entry of authoritative) {
    if (entry === oidefileRel.path && oidefilePulled) {
      continue;
    }
    if (isUnsafePath(entry)) {
      warning(`invalid path, skipping: ${entry}`);
      skipped++;
      continue;
    }
    const result = await readSourceFile(sourceRepo, sourceRef, entry, token);
    if (result.kind === "absent") {
      warning(`not in source tree, skipping: ${entry}`);
      skipped++;
      continue;
    }
    if (result.kind === "too-large") {
      warning(`too large for the Contents API (>1MB), skipping: ${entry}`);
      skipped++;
      continue;
    }
    writeWorkspaceFile(workspace, entry, result.content);
    info(`  pulled: ${entry}`);
    pulled++;
  }
  return { ok: true, pulled, skipped };
}
function resolveOidefile(workspace, named) {
  if (named !== null) {
    if (isUnsafePath(named)) {
      return { ok: false, error: `invalid Oidefile path: ${named}` };
    }
    if (!existsSync(join(workspace, named))) {
      return {
        ok: false,
        error: `Oidefile not found at ${join(workspace, named)}`
      };
    }
    return { ok: true, path: named };
  }
  for (const candidate of OIDEFILE_CANDIDATES) {
    if (existsSync(join(workspace, candidate))) {
      return { ok: true, path: candidate };
    }
  }
  const [root, nested] = OIDEFILE_CANDIDATES;
  return {
    ok: false,
    error: `Oidefile not found at ${join(workspace, root)} or ${join(workspace, nested)}`
  };
}
function writeWorkspaceFile(workspace, rel, content) {
  const dest = join(workspace, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}
main().catch((err) => {
  setFailed(err instanceof Error ? err.message : String(err));
});
