import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getInput, info, notice, setFailed, warning } from "./actions.ts";
import { readSourceFile } from "./github.ts";
import { OIDEFILE_CANDIDATES, parseOidefile } from "./oidefile.ts";
import { isUnsafePath } from "./path-safety.ts";
import { isSelfListed, shouldSelfSkip } from "./plan.ts";
import { parseSource } from "./source.ts";

async function main(): Promise<void> {
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
    setFailed(
      `Oidefile not found at ${join(workspace, root)} or ${join(workspace, nested)}`,
    );
    return;
  }

  const token = getInput("token");
  const initial = parseOidefile(
    readFileSync(join(workspace, oidefileRel), "utf8"),
  );

  info(`Fetching ${sourceRepo} @ ${sourceRef} ...`);

  let pulled = 0;
  let skipped = 0;
  let oidefilePulled = false;
  let authoritative = initial;

  // Self-listing: pull source's Oidefile first and re-read for an
  // authoritative list, so file additions on the source side propagate in a
  // single run. The self entry is whichever path the Oidefile was discovered
  // at, so source must keep its Oidefile at that same path for this to fire.
  if (isSelfListed(initial, oidefileRel)) {
    const result = await readSourceFile(
      sourceRepo,
      sourceRef,
      oidefileRel,
      token,
    );
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
