import { describe, expect, test } from "bun:test";
import {
  type RateLimitResponse,
  rateLimitDecision,
} from "../src/rate-limit.ts";

const response = (fields: Partial<RateLimitResponse>): RateLimitResponse => ({
  status: 429,
  retryAfter: null,
  remaining: null,
  reset: null,
  body: "",
  ...fields,
});

describe("rateLimitDecision", () => {
  test("successful responses and missing files proceed", () => {
    for (const status of [200, 404, 500]) {
      expect(rateLimitDecision(response({ status }), 1_000_000, 0, 0)).toEqual({
        kind: "proceed",
      });
    }
  });
  test("permission errors proceed to normal error handling", () => {
    expect(
      rateLimitDecision(
        response({ status: 403, body: "Resource not accessible" }),
        1_000_000,
        0,
        0,
      ),
    ).toEqual({ kind: "proceed" });
  });
  test("429 without headers and secondary 403 limits wait a minute", () => {
    for (const fields of [
      {},
      { status: 403, body: '{"message":"secondary rate limit"}' },
    ]) {
      expect(rateLimitDecision(response(fields), 1_000_000, 0, 0)).toEqual({
        kind: "retry",
        delay: 60_000,
      });
    }
  });
  test("honors Retry-After seconds and HTTP dates", () => {
    for (const retryAfter of ["2", new Date(1_002_000).toUTCString()]) {
      expect(
        rateLimitDecision(response({ retryAfter }), 1_000_000, 0, 0),
      ).toEqual({ kind: "retry", delay: 2000 });
    }
  });
  test("Retry-After takes precedence over the reset", () => {
    expect(
      rateLimitDecision(
        response({
          status: 403,
          retryAfter: "2",
          remaining: "0",
          reset: "1003",
        }),
        1_000_000,
        0,
        0,
      ),
    ).toEqual({ kind: "retry", delay: 2000 });
  });
  test("hourly limits use reset time when Retry-After is absent or invalid", () => {
    for (const retryAfter of [null, "invalid", ""]) {
      expect(
        rateLimitDecision(
          response({ status: 403, retryAfter, remaining: "0", reset: "1003" }),
          1_000_000,
          0,
          0,
        ),
      ).toEqual({ kind: "retry", delay: 3000 });
    }
  });
  test("past or invalid reset times fall back to a minute", () => {
    for (const reset of [null, "invalid", "999"]) {
      expect(
        rateLimitDecision(
          response({ status: 403, remaining: "0", reset }),
          1_000_000,
          0,
          0,
        ),
      ).toEqual({ kind: "retry", delay: 60_000 });
    }
  });
  test("zero and past Retry-After values wait at least a second", () => {
    for (const retryAfter of ["0", new Date(999_000).toUTCString()]) {
      expect(
        rateLimitDecision(response({ retryAfter }), 1_000_000, 0, 0),
      ).toEqual({ kind: "retry", delay: 1000 });
    }
  });
  test("stops before a long wait", () => {
    expect(
      rateLimitDecision(
        response({ status: 403, remaining: "0", reset: "4600" }),
        1_000_000,
        0,
        0,
      ),
    ).toEqual({ kind: "stop", delay: 3_600_000 });
  });
  test("allows two retries and stops on the next limit", () => {
    for (const [attempt, kind] of [
      [0, "retry"],
      [1, "retry"],
      [2, "stop"],
    ] as const) {
      expect(
        rateLimitDecision(response({ retryAfter: "1" }), 1_000_000, attempt, 0),
      ).toEqual({ kind, delay: 1000 });
    }
  });
  test("allows exactly 60 seconds total waiting but no more", () => {
    for (const [waited, kind] of [
      [20_000, "retry"],
      [20_001, "stop"],
    ] as const) {
      expect(
        rateLimitDecision(response({ retryAfter: "40" }), 1_000_000, 1, waited),
      ).toEqual({ kind, delay: 40_000 });
    }
  });
});
