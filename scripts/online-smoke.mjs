#!/usr/bin/env node
/**
 * Online-only gating check (issue #7) against a dev build with auth off:
 *   VITE_AUTH_ENABLED=false npx vite dev --port 8096
 *   node scripts/online-smoke.mjs http://127.0.0.1:8096
 * Uses the dev fake-offline switch (window.__bicaFakeOffline).
 */
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const BASE = checkedUrl(process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
const failures = [];
const check = (ok, what) => {
  console.log(ok ? "ok  " : "FAIL", what);
  if (!ok) failures.push(what);
};
const fakeOffline = (page, on) => page.evaluate((v) => window.__bicaFakeOffline(v), on);
// Ours is the only live region besides sonner's own toaster section.
const liveRegions = (page) =>
  page.locator('[aria-live]:not(section[aria-label^="Notifications"])').count();

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE + "/practice?fakeOffline=0", { waitUntil: "networkidle" });

  // (a) marker online, accessible name carries the state
  const card = page.getByRole("link", { name: /^Conversas, / });
  check(
    (await card.getAttribute("aria-label")) === "Conversas, needs internet",
    "online: name says needs internet",
  );
  check(
    (await card.locator("svg.lucide-cloud").count()) === 1,
    "online: Cloud marker on the Conversas card",
  );
  const before = await card.boundingBox();

  // offline: same box (no layout shift), aria-disabled, focusable, tap → toast + alternative
  await fakeOffline(page, true);
  await page.waitForTimeout(100);
  check(
    (await card.getAttribute("aria-label")) === "Conversas, unavailable offline",
    "offline: name says unavailable offline",
  );
  check((await card.getAttribute("aria-disabled")) === "true", "offline: aria-disabled");
  check(
    (await card.locator("svg.lucide-cloud").count()) === 1,
    "offline: Cloud marker still there",
  );
  check(
    JSON.stringify(await card.boundingBox()) === JSON.stringify(before),
    "no layout shift on the swap",
  );
  await card.focus();
  check(await card.evaluate((el) => el === document.activeElement), "offline: still focusable");
  await card.click({ force: true });
  await page.getByText("Conversas talks to a live partner").waitFor({ timeout: 3000 });
  check(new URL(page.url()).pathname === "/practice", "offline tap does not navigate");
  check(
    await page.getByRole("button", { name: "Practise Palavras" }).isVisible(),
    "toast offers the alternative",
  );
  check(
    await page.getByText("You're offline. Lessons, review and audio still work.").isVisible(),
    "offline status line",
  );
  check((await liveRegions(page)) === 1, "single live region");

  // (d) back online quietly within ~2 s of a confirmed connection
  const t0 = Date.now();
  await fakeOffline(page, false);
  await page.waitForFunction(
    () => !document.querySelector('[aria-label^="Conversas"][aria-disabled]'),
    null,
    { timeout: 4000 },
  );
  const ms = Date.now() - t0;
  check(ms < 3000, `re-enabled after ${ms} ms`);
  check(await page.getByText("Back online").isVisible(), "live region says Back online");

  // 320 px: short form, at most 2 lines
  await page.setViewportSize({ width: 320, height: 640 });
  await fakeOffline(page, true);
  const line = page.getByText("Offline. Lessons and audio still work.");
  await line.waitFor();
  const lh = await line.evaluate((el) => parseFloat(getComputedStyle(el).lineHeight));
  check((await line.boundingBox()).height <= lh * 2 + 1, "320 px: status line ≤ 2 lines");
  await page.setViewportSize({ width: 390, height: 844 });

  // mid-Conversas drop: transcript kept, composer gated, nothing sent
  await fakeOffline(page, false);
  await page.goto(BASE + "/speak/pastelaria", { waitUntil: "networkidle" });
  const opener = await page.locator("ol li").first().innerText();
  await page.fill("#line", "Bom dia, queria um café.");
  await fakeOffline(page, true);
  let sent = 0;
  page.on("request", (r) => r.url().includes("_serverFn") && r.method() === "POST" && sent++);
  const send = page.getByRole("button", { name: /^Send, / });
  check((await send.getAttribute("aria-disabled")) === "true", "mid-chat: send aria-disabled");
  await send.click({ force: true });
  await page.waitForTimeout(500);
  check(sent === 0, "mid-chat: no message sent or queued");
  check((await page.locator("ol li").first().innerText()) === opener, "mid-chat: transcript kept");
  check((await page.inputValue("#line")) === "Bom dia, queria um café.", "mid-chat: draft kept");
  check(await page.getByText("Your transcript stays here").isVisible(), "mid-chat: inline reason");
  await fakeOffline(page, false);
  await page.waitForTimeout(2500);
  check(sent === 0, "reconnect: earlier tap does not auto-send");

  // (e) sync queue: pending while offline, flushes on reconnect
  await page.goto(BASE + "/me", { waitUntil: "networkidle" });
  await fakeOffline(page, true);
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("bica.progress.v1") || '{"state":{},"version":0}');
    raw.state.syncPending = true;
    localStorage.setItem("bica.progress.v1", JSON.stringify(raw));
  });
  await page.reload({ waitUntil: "networkidle" }); // fake offline persists in dev
  await page
    .getByText("Waiting to sync, changes saved on this device.")
    .waitFor({ timeout: 3000 })
    .catch(() => {});
  check(
    await page.getByText("Waiting to sync, changes saved on this device.").isVisible(),
    "sync: waiting while offline",
  );
  await fakeOffline(page, false);
  await page
    .getByText("Synced", { exact: true })
    .waitFor({ timeout: 8000 })
    .catch(() => {});
  check(
    await page.getByText("Synced", { exact: true }).isVisible(),
    "sync: flushes and says Synced",
  );
  const pending = await page.evaluate(
    () => JSON.parse(localStorage.getItem("bica.progress.v1")).state.syncPending,
  );
  check(pending === false, "sync: flag cleared");
} finally {
  await browser.close();
}
if (failures.length) {
  console.error("online smoke failed:", failures.join("; "));
  process.exit(1);
}
console.log("online smoke passed");
