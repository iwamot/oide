import { describe, expect, test } from "bun:test";
import { sourceRequest } from "../src/github.ts";

describe("sourceRequest", () => {
  test("anonymous reads omit Authorization", () => {
    const { headers } = sourceRequest("org/repo", "main", "README.md", "");
    expect(headers).not.toHaveProperty("Authorization");
    expect(headers.Accept).toBe("application/vnd.github+json");
  });
  test("authenticated reads send the supplied token", () => {
    const { headers } = sourceRequest(
      "org/repo",
      "main",
      "README.md",
      "test-token",
    );
    expect(headers.Authorization).toBe("Bearer test-token");
  });
  test("preserves path components and refs without creating extra URL parameters", () => {
    const names = [
      "README.md",
      ".github",
      "docs",
      "a b.md",
      "日本語",
      "100%.txt",
      "a+b",
      "q?x=1&ref=other",
      "hash#file",
      "[draft]",
    ];
    for (const first of names)
      for (const last of names)
        for (const ref of [
          "main",
          "v1.0.0",
          "feature/a+b",
          "tag?x=1&ref=other",
          "日本語#tag",
          "100%",
        ]) {
          const parts = [first, last],
            prefix = "/repos/org/repo/contents/";
          const request = sourceRequest("org/repo", ref, parts.join("/"), "");
          const url = new URL(request.url);
          expect(url.origin).toBe("https://api.github.com");
          expect(url.pathname.startsWith(prefix)).toBe(true);
          expect(
            url.pathname
              .slice(prefix.length)
              .split("/")
              .map(decodeURIComponent),
          ).toEqual(parts);
          expect([...url.searchParams]).toEqual([["ref", ref]]);
          expect(url.hash).toBe("");
        }
  });
});
