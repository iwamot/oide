import { describe, expect, test } from "bun:test";
import { OIDEFILE_CANDIDATES, parseOidefile } from "../src/oidefile.ts";

describe("parseOidefile", () => {
  test("preserves entry spelling, order, and repetitions through whitespace and line-ending changes", () => {
    const paths = [
      "LICENSE",
      "SECURITY.md",
      ".github/Oidefile",
      "dir/space name.txt",
      "資料/設定.json",
      "#filename",
    ];
    const lists = [
      [],
      ...paths.map((path) => [path]),
      ...paths.flatMap((first) => paths.map((second) => [first, second])),
    ];
    for (const entries of lists)
      for (const padding of ["", "  ", "\t", " \t"])
        for (const ending of ["\n", "\r\n"])
          for (const blanks of [[], [""], ["", " \t"]]) {
            const lines = [
              ...blanks,
              ...entries.flatMap((entry) => [
                padding + entry + padding,
                ...blanks,
              ]),
            ];
            expect(parseOidefile(lines.join(ending))).toEqual(entries);
          }
  });
});

describe("OIDEFILE_CANDIDATES", () => {
  test("prefers root over .github/", () => {
    expect(OIDEFILE_CANDIDATES).toEqual(["Oidefile", ".github/Oidefile"]);
  });
});
