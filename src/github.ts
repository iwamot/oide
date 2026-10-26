import { warning } from "./actions.ts";
import { interpretContents, type ReadResult } from "./contents.ts";
import { rateLimitDecision } from "./rate-limit.ts";
import { splitRepo } from "./source.ts";

const API_BASE = "https://api.github.com";

/** Build a Contents API request; an empty token leaves public reads anonymous. */
export function sourceRequest(
  repo: string,
  ref: string,
  path: string,
  token: string,
) {
  const { owner, name } = splitRepo(repo);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = `${API_BASE}/repos/${owner}/${name}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "iwamot/oide",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return { url, headers };
}

/** Read source contents, retrying within the rate-limit policy's wait budget. */
export async function readSourceFile(
  repo: string,
  ref: string,
  path: string,
  token: string,
): Promise<ReadResult> {
  const { url, headers } = sourceRequest(repo, ref, path, token);
  let waited = 0;
  let res: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, { headers });
    const decision = rateLimitDecision(
      {
        status: res.status,
        retryAfter: res.headers.get("retry-after"),
        remaining: res.headers.get("x-ratelimit-remaining"),
        reset: res.headers.get("x-ratelimit-reset"),
        body: res.status === 403 ? await res.clone().text() : "",
      },
      Date.now(),
      attempt,
      waited,
    );
    if (decision.kind === "proceed") break;
    const { delay } = decision;
    if (decision.kind === "stop") {
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
  if (res.status === 404) return { kind: "absent" };
  if (!res.ok) {
    throw new Error(
      `GitHub API ${res.status} ${res.statusText} for ${repo}@${ref}:${path}`,
    );
  }
  return interpretContents(await res.json());
}
