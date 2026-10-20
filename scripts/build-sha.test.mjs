import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBuildSha } from "./build-sha.mjs";

test("GITHUB_SHA wins and is truncated to 7", () => {
  let called = false;
  const sha = resolveBuildSha({ GITHUB_SHA: "abcdef1234567890" }, () => {
    called = true;
    return "ignored";
  });
  assert.equal(sha, "abcdef1");
  assert.equal(called, false);
});

test("git fallback is truncated to 7", () => {
  assert.equal(
    resolveBuildSha({}, () => "0123456789abcdef\n"),
    "0123456",
  );
});

test("dev when git throws or is empty, and never throws", () => {
  assert.equal(
    resolveBuildSha({}, () => {
      throw new Error("no git");
    }),
    "dev",
  );
  assert.equal(
    resolveBuildSha({}, () => ""),
    "dev",
  );
  assert.equal(
    resolveBuildSha({ GITHUB_SHA: "  " }, () => ""),
    "dev",
  );
});
