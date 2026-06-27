import { describe, expect, test } from "bun:test";
import { OIDEFILE_CANDIDATES, parseOidefile } from "../src/oidefile.ts";

describe("parseOidefile", () => {
  test("returns one entry per non-empty line", () => {
    expect(parseOidefile("LICENSE\nSECURITY.md\n")).toEqual([
      "LICENSE",
      "SECURITY.md",
    ]);
  });

  test("trims surrounding whitespace", () => {
    expect(parseOidefile("  LICENSE  \n\t.github/Oidefile\t")).toEqual([
      "LICENSE",
      ".github/Oidefile",
    ]);
  });

  test("drops blank and whitespace-only lines", () => {
    expect(parseOidefile("LICENSE\n\n   \nSECURITY.md")).toEqual([
      "LICENSE",
      "SECURITY.md",
    ]);
  });

  test("handles CRLF line endings (Oidefile authored on Windows)", () => {
    expect(parseOidefile("LICENSE\r\nSECURITY.md\r\n")).toEqual([
      "LICENSE",
      "SECURITY.md",
    ]);
  });

  test("returns empty for empty input", () => {
    expect(parseOidefile("")).toEqual([]);
  });
});

describe("OIDEFILE_CANDIDATES", () => {
  test("prefers root over .github/", () => {
    expect(OIDEFILE_CANDIDATES).toEqual(["Oidefile", ".github/Oidefile"]);
  });
});
