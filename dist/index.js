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
function parseSource(input) {
  if (!input) {
    return { ok: false, error: "source input is required" };
  }
  const at = input.lastIndexOf("@");
  if (at === -1) {
    return formatError(input);
  }
  const repo = input.slice(0, at);
  const ref = input.slice(at + 1);
  if (!repo || !ref) {
    return formatError(input);
  }
  const slash = repo.indexOf("/");
  if (slash <= 0 || slash === repo.length - 1) {
    return formatError(input);
  }
  return { ok: true, repo, ref };
}
function formatError(input) {
  return {
    ok: false,
    error: `source must be in 'org/repo@ref' format, got: ${input}`
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
  const parsed = parseSource(getInput("source"));
  if (!parsed.ok) {
    setFailed(parsed.error);
    return;
  }
  const { repo: sourceRepo, ref: sourceRef } = parsed;
  if (shouldSelfSkip(process.env.GITHUB_REPOSITORY, sourceRepo)) {
    notice(`source equals github.repository (${sourceRepo}); self-skip`);
    return;
  }
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  let oidefileRel = "";
  for (const candidate of OIDEFILE_CANDIDATES) {
    if (existsSync(join(workspace, candidate))) {
      oidefileRel = candidate;
      break;
    }
  }
  if (!oidefileRel) {
    const [root, nested] = OIDEFILE_CANDIDATES;
    setFailed(`Oidefile not found at ${join(workspace, root)} or ${join(workspace, nested)}`);
    return;
  }
  const token = getInput("token");
  const initial = parseOidefile(readFileSync(join(workspace, oidefileRel), "utf8"));
  info(`Fetching ${sourceRepo} @ ${sourceRef} ...`);
  let pulled = 0;
  let skipped = 0;
  let oidefilePulled = false;
  let authoritative = initial;
  if (isSelfListed(initial, oidefileRel)) {
    const result = await readSourceFile(sourceRepo, sourceRef, oidefileRel, token);
    if (result.kind === "file") {
      writeWorkspaceFile(workspace, oidefileRel, result.content);
      info(`  pulled: ${oidefileRel}`);
      pulled++;
      oidefilePulled = true;
      authoritative = parseOidefile(result.content.toString("utf8"));
    }
  }
  for (const entry of authoritative) {
    if (entry === oidefileRel && oidefilePulled) {
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
  info(`Done. pulled=${pulled}, skipped=${skipped}`);
}
function writeWorkspaceFile(workspace, rel, content) {
  const dest = join(workspace, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}
main().catch((err) => {
  setFailed(err instanceof Error ? err.message : String(err));
});
