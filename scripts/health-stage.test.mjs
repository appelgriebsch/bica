import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { healthForStage, resolveBicaStage } from "../src/lib/health-stage.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("staging and production are the only accepted stages", () => {
  const sha = "a".repeat(40);
  for (const stage of ["staging", "production"]) {
    const ok = healthForStage(stage, sha);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true, stage, sha });
  }
});

test("a 200 with no sha defaults to dev; 503 never includes sha", () => {
  assert.deepEqual(healthForStage("staging").body, { ok: true, stage: "staging", sha: "dev" });
  assert.deepEqual(healthForStage("production", "  ").body, {
    ok: true,
    stage: "production",
    sha: "dev",
  });
  assert.deepEqual(healthForStage("nope", "abc").body, { ok: false });
  assert.equal(healthForStage(undefined, "abc").status, 503);
});

test("missing, blank, and unknown values fail closed", () => {
  for (const stage of [
    undefined,
    "",
    "  ",
    "preview",
    "prod",
    "STAGING",
    "Production",
    " production",
  ]) {
    const rejected = healthForStage(stage);
    assert.equal(rejected.status, 503);
    assert.deepEqual(rejected.body, { ok: false });
  }
});

test("worker env wins over process.env", () => {
  assert.equal(resolveBicaStage({ workerEnv: "staging", processEnv: "production" }), "staging");
  assert.equal(resolveBicaStage({ workerEnv: "  ", processEnv: "staging" }), "staging");
  assert.equal(resolveBicaStage({ processEnv: "production" }), "production");
  assert.equal(resolveBicaStage({ workerEnv: "nope" }), "nope");
  assert.equal(resolveBicaStage({}), undefined);
});

test("health route does not touch auth or the database", () => {
  const source = readFileSync(join(root, "src/routes/api/health.ts"), "utf8");
  assert.doesNotMatch(source, /from\s+["']@\/lib\/auth\/server["']/);
  assert.doesNotMatch(source, /from\s+["']@\/lib\/db["']/);
  assert.match(source, /healthForStage/);
  assert.match(source, /__BICA_BUILD_SHA_FULL__/);
  assert.match(source, /cache-control/);
});
