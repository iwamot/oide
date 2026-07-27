/** One source repo, and the Oidefile to read for it. */
export type Source = { repo: string; ref: string; oidefile: string | null };

export type ParsedSource =
  | ({ ok: true } & Source)
  | { ok: false; error: string };

export type ParsedSources =
  | { ok: true; sources: Source[] }
  | { ok: false; error: string };

/**
 * Parse the `sources` input into one entry per line, in the order given.
 *
 * Each line names a source, optionally followed by the Oidefile to read
 * for it. Pairing the two is what lets a repo pull from several sources:
 * a list per source keeps them from claiming the same paths, so no
 * precedence between sources has to be defined.
 */
export function parseSources(input: string): ParsedSources {
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return { ok: false, error: "sources input is required" };
  }

  const sources: Source[] = [];
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

/**
 * Parse one `sources` line (`org/repo@ref` or `org/repo@ref Oidefile`).
 * The ref is everything after the last `@` of the first field, so it never
 * swallows an `@` that belongs to the repo half. The repo half must be
 * `owner/name` with both sides present.
 */
export function parseSource(line: string): ParsedSource {
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

function formatError(line: string): ParsedSource {
  return {
    ok: false,
    error:
      "each source must be in 'org/repo@ref' or 'org/repo@ref Oidefile'" +
      ` format, got: ${line}`,
  };
}

/** Split an `owner/name` repo slug for the GitHub API. */
export function splitRepo(repo: string): { owner: string; name: string } {
  const slash = repo.indexOf("/");
  return { owner: repo.slice(0, slash), name: repo.slice(slash + 1) };
}
