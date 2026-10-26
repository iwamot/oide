export type RateLimitResponse = {
  status: number;
  retryAfter: string | null;
  remaining: string | null;
  reset: string | null;
  body: string;
};

type RetryDecision =
  | { kind: "proceed" }
  | { kind: "retry" | "stop"; delay: number };

/** Decide using response data and explicit time; no requests or waiting occur here. */
export function rateLimitDecision(
  response: RateLimitResponse,
  now: number,
  attempt: number,
  waited: number,
): RetryDecision {
  const delay = rateLimitDelay(response, now);
  if (delay === null) return { kind: "proceed" };
  return {
    kind: attempt >= 2 || waited + delay > 60_000 ? "stop" : "retry",
    delay,
  };
}

function rateLimitDelay(
  { status, retryAfter, remaining, reset, body }: RateLimitResponse,
  now: number,
): number | null {
  if (status !== 403 && status !== 429) return null;
  const limited =
    status === 429 ||
    remaining === "0" ||
    retryAfter !== null ||
    /rate limit/i.test(body);
  if (!limited) return null;
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (retryAfter.trim() && Number.isFinite(seconds) && seconds >= 0) {
      return Math.max(1000, Math.ceil(seconds * 1000));
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(1000, date - now);
  }
  if (remaining === "0") {
    const resetTime = Number(reset);
    if (Number.isFinite(resetTime) && resetTime * 1000 > now) {
      return resetTime * 1000 - now;
    }
  }
  return 60_000;
}
