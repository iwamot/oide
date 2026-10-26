import { afterEach, describe, expect, test } from "bun:test";
import { readSourceFile } from "../src/github.ts";

const originalFetch = globalThis.fetch;
const originalTimeout = globalThis.setTimeout;
const originalNow = Date.now;
const requests: RequestInit[] = [];
const waits: number[] = [];
const file = () =>
  Response.json({ type: "file", encoding: "base64", content: "aGk=" });

function responses(...items: Response[]) {
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    requests.push(init);
    const item = items.shift();
    if (!item) throw new Error("unexpected request");
    return item;
  }) as typeof fetch;
  globalThis.setTimeout = ((callback: () => void, delay: number) => {
    waits.push(delay);
    return originalTimeout(callback, 0);
  }) as typeof setTimeout;
  Date.now = () => 1_000_000;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  globalThis.setTimeout = originalTimeout;
  Date.now = originalNow;
  requests.length = 0;
  waits.length = 0;
});

const read = (token = "") =>
  readSourceFile("org/repo", "main", "README.md", token);

describe("GitHub source reads", () => {
  test("anonymous reads omit Authorization", async () => {
    responses(file());
    expect(await read()).toEqual({ kind: "file", content: Buffer.from("hi") });
    expect(requests[0]?.headers).not.toHaveProperty("Authorization");
  });

  test("authenticated reads send the supplied token", async () => {
    responses(file());
    await read("test-token");
    expect(requests[0]?.headers).toHaveProperty(
      "Authorization",
      "Bearer test-token",
    );
  });

  test("retries 429 after Retry-After", async () => {
    responses(
      new Response("", { status: 429, headers: { "Retry-After": "2" } }),
      file(),
    );
    expect((await read()).kind).toBe("file");
    expect(waits).toEqual([2000]);
  });

  test("honors an hourly reset", async () => {
    responses(
      new Response("", {
        status: 403,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": "1003",
        },
      }),
      file(),
    );
    await read();
    expect(waits).toEqual([3000]);
  });

  test("does not wait an hour and explains anonymous authentication", async () => {
    responses(
      new Response("", {
        status: 403,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": "4600",
        },
      }),
    );
    await expect(read()).rejects.toThrow(
      "retry after 3600s; pass the token input",
    );
    expect(waits).toEqual([]);
  });

  test("ordinary 403 permissions errors are not retried", async () => {
    responses(new Response("Resource not accessible", { status: 403 }));
    await expect(read("test-token")).rejects.toThrow("GitHub API 403");
    expect(requests).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  test("secondary limits without headers wait a minute", async () => {
    responses(
      new Response('{"message":"secondary rate limit"}', { status: 403 }),
      file(),
    );
    await read();
    expect(waits).toEqual([60_000]);
  });

  test("bounds repeated short retries", async () => {
    responses(
      ...Array.from(
        { length: 3 },
        () =>
          new Response("", {
            status: 429,
            headers: { "Retry-After": "1" },
          }),
      ),
    );
    await expect(read("test-token")).rejects.toThrow("rate limited");
    expect(requests).toHaveLength(3);
    expect(waits).toEqual([1000, 1000]);
  });

  test("bounds total waiting across requests", async () => {
    responses(
      ...Array.from(
        { length: 2 },
        () =>
          new Response("", {
            status: 429,
            headers: { "Retry-After": "40" },
          }),
      ),
    );
    await expect(read()).rejects.toThrow("rate limited");
    expect(waits).toEqual([40_000]);
  });

  test("honors an HTTP-date Retry-After", async () => {
    responses(
      new Response("", {
        status: 429,
        headers: {
          "Retry-After": new Date(1_005_000).toUTCString(),
        },
      }),
      file(),
    );
    await read();
    expect(waits).toEqual([5000]);
  });

  test("invalid Retry-After uses the reset header", async () => {
    responses(
      new Response("", {
        status: 403,
        headers: {
          "Retry-After": "invalid",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": "1003",
        },
      }),
      file(),
    );
    await read();
    expect(waits).toEqual([3000]);
  });

  test("404 remains absent", async () => {
    responses(new Response("", { status: 404 }));
    expect(await read()).toEqual({ kind: "absent" });
  });
});
