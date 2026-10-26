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
  test("encodes path segments and ref separately", () => {
    const { url } = sourceRequest("org/repo", "feature/a+b", "docs/a b.md", "");
    expect(url).toBe(
      "https://api.github.com/repos/org/repo/contents/docs/a%20b.md?ref=feature%2Fa%2Bb",
    );
  });
});
