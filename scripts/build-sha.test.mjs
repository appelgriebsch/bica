import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBuildSha } from "./build-sha.mjs";

test("git wins over GITHUB_SHA and is truncated to 7", () => {
  assert.equal(
    resolveBuildSha({ GITHUB_SHA: "abcdef1234567890" }, () => "0123456789abcdef\n"),
    "0123456",
  );
});

test("GITHUB_SHA fallback when git throws or is empty, truncated to 7", () => {
  const full = { GITHUB_SHA: "abcdef1234567890" };
  assert.equal(
    resolveBuildSha(full, () => {
      throw new Error("no git");
    }),
    "abcdef1",
  );
  assert.equal(
    resolveBuildSha(full, () => ""),
    "abcdef1",
  );
});

test("dev when both missing, and never throws", () => {
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
    resolveBuildSha({ GITHUB_SHA: "  " }, () => "  "),
    "dev",
  );
});
