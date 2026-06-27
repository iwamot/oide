export type ParsedSource =
  | { ok: true; repo: string; ref: string }
  | { ok: false; error: string };

/**
 * Parse the `source` input (`org/repo@ref`) into its repo and ref parts.
 * The ref is everything after the last `@`, so it never swallows an `@`
 * that belongs to the repo half. The repo half must be `owner/name` with
 * both sides present.
 */
export function parseSource(input: string): ParsedSource {
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

function formatError(input: string): ParsedSource {
  return {
    ok: false,
    error: `source must be in 'org/repo@ref' format, got: ${input}`,
  };
}

/** Split an `owner/name` repo slug for the GitHub API. */
export function splitRepo(repo: string): { owner: string; name: string } {
  const slash = repo.indexOf("/");
  return { owner: repo.slice(0, slash), name: repo.slice(slash + 1) };
}
