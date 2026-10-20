#!/usr/bin/env node
/**
 * Offline cold-start + upgrade check for the built app (issue #5).
 * Run after `npm run build`: node scripts/offline-smoke.mjs
 * 1. Load / online, wait for the worker to finish precaching.
 * 2. Go offline and open every route fresh: content renders, no console errors.
 * 3. Ship a "next build" whose manifest has a broken entry: the install fails
 *    and the current worker + cache stay active.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { buildOutput } from "./build-output.mjs";
import { startBuildServer } from "./serve-build.mjs";

const PORT = Number(process.env.PORT || 8093);
const BASE = `http://127.0.0.1:${PORT}`;
const ROUTES = [
  "/",
  "/path",
  "/practice",
  "/me",
  "/about",
  "/review",
  "/grammar",
  "/verbs",
  "/speak",
  "/lesson/a1-ola",
  "/grammar/gram-a1-ser-estar",
  "/verbs/verb-a1-presente",
  "/read/read-aviso",
  "/listen/radio-tempo",
  "/speak/pastelaria",
];

const server = await startBuildServer(PORT);
const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const failures = [];
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  const errors = [];
  // Network-only endpoints (session check) are expected to fail offline.
  const expectedOffline = (url) => /\/api\//.test(new URL(url, BASE).pathname);
  page.on("console", (m) => {
    if (m.type() === "error" && !expectedOffline(m.location().url || BASE)) errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e.message)));
  page.on("requestfailed", (r) => !expectedOffline(r.url()) && errors.push("failed " + r.url()));

  await page.goto(BASE + "/", { waitUntil: "load" });
  const version = await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise((r) =>
        navigator.serviceWorker.addEventListener("controllerchange", r, { once: true }),
      );
    }
    return (await caches.keys()).find((k) => /^bica-[0-9a-f]{16}$/.test(k));
  });
  if (!version) throw new Error("no versioned precache after install");
  console.log("precache", version);

  await context.setOffline(true);
  for (const route of ROUTES) {
    errors.length = 0;
    await page.goto(BASE + route, { waitUntil: "load" });
    await page.waitForTimeout(800);
    const text = (await page.locator("body").innerText()).trim();
    const ok = text.length > 40 && !text.includes("Bica is offline.") && errors.length === 0;
    console.log(ok ? "ok  " : "FAIL", route, errors.join(" | ").slice(0, 200));
    if (!ok) failures.push(route);
  }
  const scenes = await page.evaluate(async () => {
    const cache = await caches.open(
      (await caches.keys()).find((k) => /^bica-[0-9a-f]{16}$/.test(k)),
    );
    const keys = await cache.keys();
    return keys.filter((r) => new URL(r.url).pathname.startsWith("/scenes/")).length;
  });
  console.log("scenes cached", scenes);
  const shell = await page.evaluate(async (v) => {
    const r = await (await caches.open(v)).match("/_shell");
    return r && { status: r.status, redirected: r.redirected };
  }, version);
  const shellOk = shell && shell.status === 200 && !shell.redirected;
  console.log(
    shellOk ? "ok  " : "FAIL",
    "cached shell is a 200, not a redirect",
    JSON.stringify(shell),
  );
  if (!shellOk) failures.push("shell");
  if (scenes !== 20) failures.push("scenes");
  await context.setOffline(false);

  // Upgrades that must be refused: the new install fails, the old cache stays active.
  const swPath = join(process.cwd(), buildOutput().publicDir, "sw.js");
  const original = await readFile(swPath, "utf8");
  async function refusedUpgrade(what, nextSw, setup = () => {}, teardown = () => {}) {
    await writeFile(swPath, nextSw);
    setup();
    try {
      const after = await page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg.update().catch(() => {});
        const sw = reg.installing;
        // "installed" = the upgrade wrongly succeeded; resolve on either so a regression fails, not hangs.
        if (sw)
          await new Promise((r) =>
            sw.addEventListener(
              "statechange",
              () => ["redundant", "installed", "activated"].includes(sw.state) && r(),
            ),
          );
        return {
          active: reg.active?.state,
          waiting: Boolean(reg.waiting),
          keys: await caches.keys(),
        };
      });
      const kept =
        after.active === "activated" &&
        !after.waiting &&
        after.keys.includes(version) &&
        !after.keys.includes("bica-ffffffffffffffff");
      console.log(kept ? "ok  " : "FAIL", what, "keeps", version, JSON.stringify(after));
      if (!kept) failures.push(what);
    } finally {
      teardown();
      await writeFile(swPath, original);
    }
  }
  const nextVersion = original.replace(
    /const VERSION = "[^"]*";/,
    'const VERSION = "ffffffffffffffff";',
  );
  await refusedUpgrade(
    "broken asset upgrade",
    nextVersion.replace(/const PRECACHE = \[/, 'const PRECACHE = ["/assets/missing-0000.js",'),
  );
  await refusedUpgrade(
    "redirected /_shell upgrade (301)",
    nextVersion,
    () => (server.redirectShell = true),
    () => (server.redirectShell = false),
  );
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error("offline smoke failed:", failures.join(", "));
  process.exit(1);
}
console.log("offline smoke passed");
process.exit(0);
