import { describe, expect, test } from "bun:test";
import { isSelfListed, shouldSelfSkip } from "../src/plan.ts";

describe("shouldSelfSkip", () => {
  test("skips when running in the source repo", () => {
    expect(shouldSelfSkip("org/template", "org/template")).toBe(true);
  });

  test("does not skip a different repo", () => {
    expect(shouldSelfSkip("org/consumer", "org/template")).toBe(false);
  });

  test("does not skip when GITHUB_REPOSITORY is unset", () => {
    expect(shouldSelfSkip(undefined, "org/template")).toBe(false);
  });
});

describe("isSelfListed", () => {
  test("true when the Oidefile lists its own path", () => {
    expect(isSelfListed(["LICENSE", "Oidefile"], "Oidefile")).toBe(true);
  });

  test("false when it does not", () => {
    expect(isSelfListed(["LICENSE", "SECURITY.md"], "Oidefile")).toBe(false);
  });

  test("matches the discovered path exactly", () => {
    expect(isSelfListed(["Oidefile"], ".github/Oidefile")).toBe(false);
  });
});
