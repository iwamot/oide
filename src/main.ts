import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getInput, info, notice, setFailed, warning } from "./actions.ts";
import { readSourceFile } from "./github.ts";
import { OIDEFILE_CANDIDATES, parseOidefile } from "./oidefile.ts";
import { isUnsafePath } from "./path-safety.ts";
import { isSelfListed, shouldSelfSkip } from "./plan.ts";
import { parseSources, type Source } from "./source.ts";

type PullResult =
  | { ok: true; pulled: number; skipped: number }
  | { ok: false; error: string };

async function main(): Promise<void> {
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

async function pullSource(
  source: Source,
  workspace: string,
  token: string,
): Promise<PullResult> {
  const { repo: sourceRepo, ref: sourceRef } = source;

  if (shouldSelfSkip(process.env.GITHUB_REPOSITORY, sourceRepo)) {
    notice(`source equals github.repository (${sourceRepo}); self-skip`);
    return { ok: true, pulled: 0, skipped: 0 };
  }

  const oidefileRel = resolveOidefile(workspace, source.oidefile);
  if (!oidefileRel.ok) {
    return oidefileRel;
  }

  const initial = parseOidefile(
    readFileSync(join(workspace, oidefileRel.path), "utf8"),
  );

  info(`Fetching ${sourceRepo} @ ${sourceRef} (${oidefileRel.path}) ...`);

  let pulled = 0;
  let skipped = 0;
  let oidefilePulled = false;
  let authoritative = initial;

  // Self-listing: pull source's Oidefile first and re-read for an
  // authoritative list, so file additions on the source side propagate in a
  // single run. The self entry is the path this source's Oidefile was read
  // from, so source must keep its own at that same path for this to fire.
  if (isSelfListed(initial, oidefileRel.path)) {
    const result = await readSourceFile(
      sourceRepo,
      sourceRef,
      oidefileRel.path,
      token,
    );
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

type ResolvedOidefile =
  | { ok: true; path: string }
  | { ok: false; error: string };

/**
 * Locate the Oidefile for one source: the path it named, or the first
 * candidate present when it named none.
 */
function resolveOidefile(
  workspace: string,
  named: string | null,
): ResolvedOidefile {
  if (named !== null) {
    if (isUnsafePath(named)) {
      return { ok: false, error: `invalid Oidefile path: ${named}` };
    }
    if (!existsSync(join(workspace, named))) {
      return {
        ok: false,
        error: `Oidefile not found at ${join(workspace, named)}`,
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
    error: `Oidefile not found at ${join(workspace, root)} or ${join(workspace, nested)}`,
  };
}

function writeWorkspaceFile(
  workspace: string,
  rel: string,
  content: Buffer,
): void {
  const dest = join(workspace, rel);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, content);
}

main().catch((err: unknown) => {
  setFailed(err instanceof Error ? err.message : String(err));
});
