import { describe, expect, test } from "bun:test";
import { isUnsafePath } from "../src/path-safety.ts";

// These names contain dots without containing a parent-directory component.
const names = [
  "LICENSE",
  ".github",
  "Oidefile",
  "dir",
  ".dotfile",
  "日本語",
  "space name",
  "..suffix",
  "a..b",
  "trailing..",
  "etc",
  "passwd",
  "nested",
  "escape",
  "a",
  "b",
];
const relativePaths = [
  ...names.map((name) => [name]),
  ...names.flatMap((first) => names.map((second) => [first, second])),
  ["a", "b", "c.txt"],
];

describe("isUnsafePath", () => {
  test("accepts relative paths without parent-directory components", () => {
    for (const parts of relativePaths)
      expect(isUnsafePath(parts.join("/"))).toBe(false);
  });

  test("rejects absolute paths and parent-directory components at every position", () => {
    for (const parts of [[], ...relativePaths]) {
      expect(isUnsafePath("/" + parts.join("/"))).toBe(true);
      for (let i = 0; i <= parts.length; i++)
        for (const parent of [[".."], ["..", ".."]]) {
          const unsafe = [
            ...parts.slice(0, i),
            ...parent,
            ...parts.slice(i),
          ].join("/");
          expect(isUnsafePath(unsafe)).toBe(true);
        }
    }
  });
});
