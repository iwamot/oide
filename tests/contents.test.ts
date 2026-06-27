import { describe, expect, test } from "bun:test";
import { interpretContents } from "../src/contents.ts";

describe("interpretContents", () => {
  test("decodes a base64 file", () => {
    const result = interpretContents({
      type: "file",
      encoding: "base64",
      content: Buffer.from("hello\n").toString("base64"),
    });
    expect(result).toEqual({ kind: "file", content: Buffer.from("hello\n") });
  });

  test("treats a directory listing (array) as absent", () => {
    expect(interpretContents([{ type: "file" }])).toEqual({ kind: "absent" });
  });

  test("treats a non-file entry as absent", () => {
    expect(
      interpretContents({ type: "symlink", encoding: "base64", content: "" }),
    ).toEqual({ kind: "absent" });
  });

  test("treats a non-base64 (oversized) file as too-large", () => {
    expect(
      interpretContents({ type: "file", encoding: "none", content: "" }),
    ).toEqual({ kind: "too-large" });
  });

  test("treats a malformed body as absent", () => {
    expect(interpretContents(null)).toEqual({ kind: "absent" });
    expect(interpretContents({ type: "file" })).toEqual({ kind: "absent" });
    expect(interpretContents({ type: 1, encoding: 2, content: 3 })).toEqual({
      kind: "absent",
    });
  });
});
