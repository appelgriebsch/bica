import { execFileSync } from "node:child_process";

function gitShort() {
  return execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** 7-char build id: git HEAD, else GITHUB_SHA, else "dev". Never throws. */
export function resolveBuildSha(env = process.env, readGitSha = gitShort) {
  try {
    const git = String(readGitSha() ?? "").trim();
    if (git) return git.slice(0, 7);
  } catch {
    // no git, or a test double that throws
  }
  const ci = (env.GITHUB_SHA ?? "").trim();
  if (ci) return ci.slice(0, 7);
  return "dev";
}
