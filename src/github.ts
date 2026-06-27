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

  const res = await fetch(url, { headers });
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
