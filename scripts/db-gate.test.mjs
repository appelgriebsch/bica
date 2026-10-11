import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const probe = join(root, "scripts/db-gate-probe.mjs");

function loadDb(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [probe], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`db gate probe timed out\n${stderr}`));
    }, 60_000);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`db gate probe exited ${code}\n${stderr}\n${stdout}`));
        return;
      }
      const line = stdout.trim().split("\n").at(-1);
      try {
        resolve(JSON.parse(line));
      } catch (err) {
        reject(new Error(`probe did not print JSON (${err})\n${stdout}\n${stderr}`));
      }
    });
  });
}

test("staging without DATABASE_URL does not open PGLite", async () => {
  const result = await loadDb({
    PROBE_STAGE: "staging",
    PROBE_DATABASE_URL: "",
    PROBE_CF_BUILD: "",
    PROBE_GET_SQL: "1",
    PROBE_AUTH: "1",
  });
  assert.equal(result.embedded, true);
  assert.equal(result.pglite, false);
  assert.equal(result.authBuilt, false);
  assert.match(result.getSql, /Database is unwired on this worker/);
});

test("cloudflare build flag without a stage still skips PGLite", async () => {
  const result = await loadDb({
    PROBE_STAGE: "",
    PROBE_DATABASE_URL: "",
    PROBE_CF_BUILD: "1",
    PROBE_GET_SQL: "1",
  });
  assert.equal(result.embedded, true);
  assert.equal(result.pglite, false);
  assert.match(result.getSql, /Database is unwired on this worker/);
});

test("DATABASE_URL keeps Neon when the stage or the build flag is set", async () => {
  const withStage = await loadDb({
    PROBE_STAGE: "staging",
    PROBE_DATABASE_URL: "postgres://127.0.0.1:1/none",
    PROBE_CF_BUILD: "",
  });
  assert.equal(withStage.embedded, false);
  assert.equal(withStage.dbSource, "neon");
  assert.equal(withStage.pglite, false);

  const withBuild = await loadDb({
    PROBE_STAGE: "",
    PROBE_DATABASE_URL: "postgres://127.0.0.1:1/none",
    PROBE_CF_BUILD: "1",
  });
  assert.equal(withBuild.embedded, false);
  assert.equal(withBuild.dbSource, "neon");
  assert.equal(withBuild.pglite, false);
});
