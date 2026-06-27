/**
 * Reject paths that would escape the workspace. The GitHub API would also
 * refuse most of these, but constructing destination paths from untrusted
 * entries warrants an explicit guard before mkdir/write.
 */
export function isUnsafePath(entry: string): boolean {
  return (
    entry.startsWith("/") ||
    entry === ".." ||
    entry.startsWith("../") ||
    entry.endsWith("/..") ||
    entry.includes("/../")
  );
}
