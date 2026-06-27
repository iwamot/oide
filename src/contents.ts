export type ReadResult =
  | { kind: "file"; content: Buffer }
  | { kind: "absent" }
  | { kind: "too-large" };

/**
 * Interpret a 200 response body from the Contents API.
 *
 * - `absent`: a directory listing (array) or any non-file entry (symlink,
 *   submodule, malformed body).
 * - `too-large`: a regular file the API won't inline (>1MB), where `content`
 *   is empty and `encoding` is "none" rather than "base64".
 */
export function interpretContents(data: unknown): ReadResult {
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

function asFileContent(
  data: unknown,
): { type: string; encoding: string; content: string } | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  if (!("type" in data) || !("encoding" in data) || !("content" in data)) {
    return null;
  }

  const { type, encoding, content } = data as {
    type: unknown;
    encoding: unknown;
    content: unknown;
  };
  if (
    typeof type !== "string" ||
    typeof encoding !== "string" ||
    typeof content !== "string"
  ) {
    return null;
  }

  return { type, encoding, content };
}
