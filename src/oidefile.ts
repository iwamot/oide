/**
 * Where the Oidefile is looked for, in order. Root takes precedence over
 * `.github/`, following Renovate's config-file resolution order.
 */
export const OIDEFILE_CANDIDATES = ["Oidefile", ".github/Oidefile"] as const;

/** Parse an Oidefile into trimmed, non-empty path entries. */
export function parseOidefile(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
