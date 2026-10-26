import { execFileSync } from "node:child_process";

function gitFull() {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Full build id: BICA_BUILD_SHA, else git HEAD, else GITHUB_SHA, else "dev".
 * Never throws. A blank explicit value falls through.
 */
export function resolveBuildShaFull(env = process.env, readGitSha = gitFull) {
  const explicit = String(env.BICA_BUILD_SHA ?? "").trim();
  if (explicit) return explicit;
  try {
    const git = String(readGitSha() ?? "").trim();
    if (git) return git;
  } catch {
    // no git, or a test double that throws
  }
  const ci = String(env.GITHUB_SHA ?? "").trim();
  if (ci) return ci;
  return "dev";
}

/** First 7 chars of resolveBuildShaFull. "dev" stays "dev". */
export function resolveBuildSha(env = process.env, readGitSha = gitFull) {
  const full = resolveBuildShaFull(env, readGitSha);
  return full === "dev" ? "dev" : full.slice(0, 7);
}
