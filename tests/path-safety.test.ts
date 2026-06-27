import { describe, expect, test } from "bun:test";
import { isUnsafePath } from "../src/path-safety.ts";

describe("isUnsafePath", () => {
  test.each([
    "LICENSE",
    ".github/Oidefile",
    "a/b/c.txt",
    "dir/.dotfile",
  ])("accepts %p", (entry) => {
    expect(isUnsafePath(entry)).toBe(false);
  });

  test.each([
    "/etc/passwd",
    "..",
    "../escape",
    "nested/..",
    "a/../../b",
  ])("rejects %p", (entry) => {
    expect(isUnsafePath(entry)).toBe(true);
  });
});
