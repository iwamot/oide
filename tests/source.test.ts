import { describe, expect, test } from "bun:test";
import { parseSource, parseSources, splitRepo } from "../src/source.ts";

const formatError = (line: string) => ({
  ok: false as const,
  error: `each source must be in 'org/repo@ref' or 'org/repo@ref Oidefile' format, got: ${line}`,
});

describe("parseSource", () => {
  test("parses org/repo@ref", () => {
    expect(parseSource("org/repo@v1.0.0")).toEqual({
      ok: true,
      repo: "org/repo",
      ref: "v1.0.0",
      oidefile: null,
    });
  });

  test("parses an Oidefile after the source", () => {
    expect(parseSource("org/repo@v1.0.0 .github/Oidefile.other")).toEqual({
      ok: true,
      repo: "org/repo",
      ref: "v1.0.0",
      oidefile: ".github/Oidefile.other",
    });
  });

  test("takes any run of whitespace as the separator", () => {
    expect(parseSource("org/repo@v1.0.0\t  Oidefile")).toEqual({
      ok: true,
      repo: "org/repo",
      ref: "v1.0.0",
      oidefile: "Oidefile",
    });
  });

  test("ref may be a commit SHA or branch", () => {
    expect(parseSource("org/repo@main")).toEqual({
      ok: true,
      repo: "org/repo",
      ref: "main",
      oidefile: null,
    });
  });

  test("splits on the last @ so the repo half may contain none", () => {
    expect(parseSource("org/repo@weird@ref")).toEqual({
      ok: true,
      repo: "org/repo@weird",
      ref: "ref",
      oidefile: null,
    });
  });

  test("rejects a third field", () => {
    expect(parseSource("org/repo@v1.0.0 Oidefile extra")).toEqual(
      formatError("org/repo@v1.0.0 Oidefile extra"),
    );
  });

  test("rejects input without @", () => {
    expect(parseSource("org/repo")).toEqual(formatError("org/repo"));
  });

  test("rejects missing repo", () => {
    expect(parseSource("@v1.0.0")).toEqual(formatError("@v1.0.0"));
  });

  test("rejects missing ref", () => {
    expect(parseSource("org/repo@")).toEqual(formatError("org/repo@"));
  });

  test("rejects a repo half without an owner/name slash", () => {
    expect(parseSource("justrepo@v1.0.0")).toEqual(
      formatError("justrepo@v1.0.0"),
    );
  });

  test("rejects an empty owner", () => {
    expect(parseSource("/repo@v1.0.0")).toEqual(formatError("/repo@v1.0.0"));
  });

  test("rejects an empty name", () => {
    expect(parseSource("org/@v1.0.0")).toEqual(formatError("org/@v1.0.0"));
  });
});

describe("parseSources", () => {
  test("parses one source per line, in order", () => {
    expect(
      parseSources(
        "org/template@v1.0.0\norg/other@v2.0.0 .github/Oidefile.other\n",
      ),
    ).toEqual({
      ok: true,
      sources: [
        { repo: "org/template", ref: "v1.0.0", oidefile: null },
        {
          repo: "org/other",
          ref: "v2.0.0",
          oidefile: ".github/Oidefile.other",
        },
      ],
    });
  });

  test("ignores blank lines and surrounding whitespace", () => {
    expect(parseSources("\n  org/repo@v1.0.0  \n\n")).toEqual({
      ok: true,
      sources: [{ repo: "org/repo", ref: "v1.0.0", oidefile: null }],
    });
  });

  test("ignores comment lines", () => {
    expect(
      parseSources(
        "# renovate: datasource=github-tags depName=org/repo\norg/repo@v1.0.0",
      ),
    ).toEqual({
      ok: true,
      sources: [{ repo: "org/repo", ref: "v1.0.0", oidefile: null }],
    });
  });

  test("takes a # only at the start of a line as a comment", () => {
    expect(parseSources("org/repo@v1.0.0 .github/Oidefile#1")).toEqual({
      ok: true,
      sources: [
        { repo: "org/repo", ref: "v1.0.0", oidefile: ".github/Oidefile#1" },
      ],
    });
  });

  test("rejects empty input", () => {
    expect(parseSources("   \n\n")).toEqual({
      ok: false,
      error: "sources input is required",
    });
  });

  test("rejects input that is only comments", () => {
    expect(parseSources("# nothing here\n")).toEqual({
      ok: false,
      error: "sources input is required",
    });
  });

  test("reports the offending line", () => {
    expect(parseSources("org/repo@v1.0.0\nbroken")).toEqual(
      formatError("broken"),
    );
  });
});

describe("splitRepo", () => {
  test("splits owner and name", () => {
    expect(splitRepo("org/repo")).toEqual({ owner: "org", name: "repo" });
  });

  test("keeps the rest of the path in name", () => {
    expect(splitRepo("org/sub/repo")).toEqual({
      owner: "org",
      name: "sub/repo",
    });
  });
});
