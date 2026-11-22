import { describe, expect, test } from "bun:test";
import { interpretContents } from "../src/contents.ts";

describe("interpretContents", () => {
  test("restores every byte regardless of base64 line wrapping without changing the response", () => {
    const payloads = [
      Buffer.from("hello\n"),
      ...[0, 1, 2, 3, 4, 7, 255, 256, 1024].map((length) =>
        Buffer.from(
          Uint8Array.from({ length }, (_, i) => (i * 73 + length) % 256),
        ),
      ),
    ];
    for (const bytes of payloads) {
      const encoded = bytes.toString("base64");
      for (const content of [
        encoded,
        encoded.replace(/.{4}/g, "$&\n"),
        encoded.replace(/.{76}/g, "$&\n"),
        encoded.replace(/.{76}/g, "$&\r\n"),
      ]) {
        const body = {
          type: "file",
          encoding: "base64",
          content,
          size: bytes.length,
          sha: "0".repeat(40),
        };
        const before = structuredClone(body);
        expect(interpretContents(body)).toEqual({
          kind: "file",
          content: bytes,
        });
        expect(body).toEqual(before);
      }
    }
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
