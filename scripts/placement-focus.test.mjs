/**
 * #158 m2: the focus smoke runs in CI when Chromium is installed.
 * The script itself is scripts/placement-focus-smoke.mjs.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { runFocusSmoke } from "./placement-focus-smoke.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

let browser = null;
let serverProc = null;

after(async () => {
  if (browser) await browser.close();
  if (serverProc) {
    try {
      process.kill(-serverProc.pid, "SIGTERM");
    } catch {
      /* already gone */
    }
  }
});

test("#158: placement and Today never drop focus on body", { timeout: 180_000 }, async (t) => {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch {
    browser = null;
  }
  if (!browser) {
    t.skip("Chromium is not installed in this environment");
    return;
  }

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  serverProc = spawn(
    process.execPath,
    [
      join(root, "node_modules/vite/bin/vite.js"),
      "dev",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  let log = "";
  serverProc.stdout.on("data", (d) => (log += d));
  serverProc.stderr.on("data", (d) => (log += d));
  const deadline = Date.now() + 120_000;
  for (;;) {
    const ok = await fetch(`${base}/`, { signal: AbortSignal.timeout(5000) }).then(
      (r) => r.status === 200,
      () => false,
    );
    if (ok) break;
    if (Date.now() > deadline) {
      throw new Error(`dev server did not come up on ${base}\n${log.slice(-2000)}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const failures = await runFocusSmoke(page, base);
  assert.deepEqual(failures, []);
});
