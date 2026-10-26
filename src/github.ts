import { warning } from "./actions.ts";
import { interpretContents, type ReadResult } from "./contents.ts";
import { splitRepo } from "./source.ts";

const API_BASE = "https://api.github.com";

/**
 * Read a single file from the source repo at `ref` via the Contents API.
 * An empty token reads as an unauthenticated request (fine for public
 * sources, subject to a lower rate limit).
 */
export async function readSourceFile(
  repo: string,
  ref: string,
  path: string,
  token: string,
): Promise<ReadResult> {
  const { owner, name } = splitRepo(repo);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${API_BASE}/repos/${owner}/${name}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;

  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "iwamot/oide",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let waited = 0;
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, { headers });
    const delay = await rateLimitDelay(res);
    if (delay === null) break;
    if (attempt === 2 || waited + delay > 60_000) {
      const authHint = token
        ? ""
        : "; pass the token input to use the authenticated quota";
      throw new Error(
        `GitHub API rate limited for ${repo}@${ref}:${path}; retry after ${Math.ceil(delay / 1000)}s${authHint}`,
      );
    }
    warning(`GitHub API rate limited; retrying in ${Math.ceil(delay / 1000)}s`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    waited += delay;
  }
  if (res.status === 404) {
    return { kind: "absent" };
  }
  if (!res.ok) {
    throw new Error(
      `GitHub API ${res.status} ${res.statusText} for ${repo}@${ref}:${path}`,
    );
  }

  return interpretContents(await res.json());
}

/** Only rate-limit responses are retried; ordinary permission failures fail immediately. */
async function rateLimitDelay(res: Response): Promise<number | null> {
  if (res.status !== 403 && res.status !== 429) return null;
  const retryAfter = res.headers.get("retry-after");
  const remaining = res.headers.get("x-ratelimit-remaining");
  const limited =
    res.status === 429 ||
    remaining === "0" ||
    retryAfter !== null ||
    /rate limit/i.test(await res.clone().text());
  if (!limited) return null;
  if (retryAfter !== null) {
    const seconds = Number(retryAfter);
    if (retryAfter.trim() && Number.isFinite(seconds) && seconds >= 0) {
      return Math.max(1000, Math.ceil(seconds * 1000));
    }
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(1000, date - Date.now());
  }
  if (remaining === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    if (Number.isFinite(reset) && reset * 1000 > Date.now()) {
      return reset * 1000 - Date.now();
    }
  }
  return 60_000;
}
