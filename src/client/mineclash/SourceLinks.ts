// mineclash #31: AGPL §13 source offer. Links point at the commit of the
// running build when the server knows it, else at the deployed branch.
import { ClientEnv } from "../ClientEnv";

export const REPO_URL = "https://github.com/Pldnwlf/mineclash-wars";
const FALLBACK_REF = "release";
const SHA_RE = /^[0-9a-f]{7,40}$/i;

/** Git ref for links: the build's commit, or "release" (DEV/unknown/empty). */
export function sourceRef(commit: string): string {
  const c = commit.trim();
  return SHA_RE.test(c) ? c.toLowerCase() : FALLBACK_REF;
}

export function sourceCodeUrl(commit: string): string {
  return `${REPO_URL}/tree/${sourceRef(commit)}`;
}

/** Link to a file of the repo (LICENSE, LICENSE-ASSETS, LICENSING.md, ...). */
export function sourceFileUrl(file: string, commit: string): string {
  return `${REPO_URL}/blob/${sourceRef(commit)}/${file}`;
}

/** Commit of this build; "" when BOOTSTRAP_CONFIG is missing. */
export function buildCommit(): string {
  try {
    return ClientEnv.gitCommit();
  } catch {
    return "";
  }
}
