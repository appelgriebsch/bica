import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveBuildSha, resolveBuildShaFull } from "./build-sha.mjs";

const FULL = "0123456789abcdef0123456789abcdef01234567";
const OTHER = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

test("BICA_BUILD_SHA wins over git and GITHUB_SHA", () => {
  const env = { BICA_BUILD_SHA: FULL, GITHUB_SHA: OTHER };
  const read = () => OTHER + "\n";
  assert.equal(resolveBuildShaFull(env, read), FULL);
  assert.equal(resolveBuildSha(env, read), "0123456");
});

test("without BICA_BUILD_SHA, git wins over GITHUB_SHA", () => {
  const env = { BICA_BUILD_SHA: "  ", GITHUB_SHA: OTHER };
  assert.equal(
    resolveBuildShaFull(env, () => FULL + "\n"),
    FULL,
  );
  assert.equal(
    resolveBuildSha(env, () => FULL + "\n"),
    "0123456",
  );
  assert.equal(
    resolveBuildSha({ GITHUB_SHA: OTHER }, () => "0123456789abcdef\n"),
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
    resolveBuildShaFull(full, () => ""),
    "abcdef1234567890",
  );
  assert.equal(
    resolveBuildSha(full, () => ""),
    "abcdef1",
  );
});

test("dev when nothing resolves, and dev stays dev", () => {
  const none = () => {
    throw new Error("no git");
  };
  assert.equal(resolveBuildShaFull({}, none), "dev");
  assert.equal(resolveBuildSha({}, none), "dev");
  assert.equal(
    resolveBuildSha({}, () => ""),
    "dev",
  );
  assert.equal(
    resolveBuildShaFull({ BICA_BUILD_SHA: "  ", GITHUB_SHA: "  " }, () => ""),
    "dev",
  );
  assert.equal(
    resolveBuildSha({ GITHUB_SHA: "  " }, () => "  "),
    "dev",
  );
  assert.equal(
    resolveBuildShaFull({ BICA_BUILD_SHA: "dev" }, () => FULL),
    "dev",
  );
  assert.equal(
    resolveBuildSha({ BICA_BUILD_SHA: "dev" }, () => FULL),
    "dev",
  );
});
