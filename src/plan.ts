/**
 * Self-skip when the workflow runs in the source repo itself (e.g. because
 * the workflow file was distributed via Template Repository). Skipped when
 * GITHUB_REPOSITORY is unset (local invocation).
 */
export function shouldSelfSkip(
  githubRepository: string | undefined,
  sourceRepo: string,
): boolean {
  return Boolean(githubRepository) && githubRepository === sourceRepo;
}

/** Whether the Oidefile lists its own discovered path. */
export function isSelfListed(entries: string[], oidefilePath: string): boolean {
  return entries.includes(oidefilePath);
}
