import { describe, expect, test } from "bun:test";
import { parseSource, splitRepo } from "../src/source.ts";

describe("parseSource", () => {
  test("parses org/repo@ref", () => {
    expect(parseSource("org/repo@v1.0.0")).toEqual({
      ok: true,
      repo: "org/repo",
      ref: "v1.0.0",
    });
  });

  test("ref may be a commit SHA or branch", () => {
    expect(parseSource("org/repo@main")).toEqual({
      ok: true,
      repo: "org/repo",
      ref: "main",
    });
  });

  test("splits on the last @ so the repo half may contain none", () => {
    expect(parseSource("org/repo@weird@ref")).toEqual({
      ok: true,
      repo: "org/repo@weird",
      ref: "ref",
    });
  });

  test("rejects empty input", () => {
    expect(parseSource("")).toEqual({
      ok: false,
      error: "source input is required",
    });
  });

  test("rejects input without @", () => {
    expect(parseSource("org/repo")).toEqual({
      ok: false,
      error: "source must be in 'org/repo@ref' format, got: org/repo",
    });
  });

  test("rejects missing repo", () => {
    expect(parseSource("@v1.0.0")).toEqual({
      ok: false,
      error: "source must be in 'org/repo@ref' format, got: @v1.0.0",
    });
  });

  test("rejects missing ref", () => {
    expect(parseSource("org/repo@")).toEqual({
      ok: false,
      error: "source must be in 'org/repo@ref' format, got: org/repo@",
    });
  });

  test("rejects a repo half without an owner/name slash", () => {
    expect(parseSource("justrepo@v1.0.0")).toEqual({
      ok: false,
      error: "source must be in 'org/repo@ref' format, got: justrepo@v1.0.0",
    });
  });

  test("rejects an empty owner", () => {
    expect(parseSource("/repo@v1.0.0")).toEqual({
      ok: false,
      error: "source must be in 'org/repo@ref' format, got: /repo@v1.0.0",
    });
  });

  test("rejects an empty name", () => {
    expect(parseSource("org/@v1.0.0")).toEqual({
      ok: false,
      error: "source must be in 'org/repo@ref' format, got: org/@v1.0.0",
    });
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
