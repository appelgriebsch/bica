import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { healthForStage, resolveBicaStage } from "../src/lib/health-stage.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("staging and production are the only accepted stages", () => {
  for (const stage of ["staging", "production"]) {
    const ok = healthForStage(stage);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, { ok: true, stage });
  }
});

test("missing, blank, and unknown values fail closed", () => {
  for (const stage of [undefined, "", "  ", "preview", "prod", "STAGING", "Production", " production"]) {
    const rejected = healthForStage(stage);
    assert.equal(rejected.status, 503);
    assert.deepEqual(rejected.body, { ok: false });
  }
});

test("worker env wins over process.env", () => {
  assert.equal(
    resolveBicaStage({ workerEnv: "staging", processEnv: "production" }),
    "staging",
  );
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
  assert.match(source, /cache-control/);
});
