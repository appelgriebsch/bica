#!/usr/bin/env node
/**
 * Online-only gating check (issue #7) against a dev build:
 *   bunx vite dev --port 8096
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

  // Scene cards: marker, not muted, still open offline (content is bundled)
  await fakeOffline(page, false);
  await page.goto(BASE + "/speak", { waitUntil: "networkidle" });
  // #33: no sign-in anywhere.
  check((await page.getByRole("link", { name: /Sign in/ }).count()) === 0, "no Sign in link");
  check(
    await page.getByText("Conversas is temporarily unavailable.").isVisible(),
    "speak: temporarily unavailable notice",
  );
  await fakeOffline(page, true);
  const scene = page.locator('a[href="/speak/pastelaria"]');
  check((await scene.locator("svg.lucide-cloud").count()) === 1, "scene card: marker offline");
  check(
    (await scene.getAttribute("aria-disabled")) === null,
    "scene card: not muted/disabled offline",
  );
  await scene.click();
  await page.waitForURL("**/speak/pastelaria");
  await page.locator("#line").waitFor({ timeout: 5000 });
  check(
    new URL(page.url()).pathname === "/speak/pastelaria",
    "scene opens offline (no sign-in redirect)",
  );

  // #33: chat is off until #35. The scene and opener stay readable, the
  // composer is disabled, and nothing is sent online or offline.
  let sent = 0;
  page.on("request", (r) => r.url().includes("_serverFn") && r.method() === "POST" && sent++);
  check((await page.locator("ol li").count()) >= 1, "scene: opener shown");
  check(await page.locator("#line").isDisabled(), "scene: composer disabled while chat is off");
  await fakeOffline(page, false);
  await page.goto(BASE + "/speak/pastelaria", { waitUntil: "networkidle" });
  check(
    await page.getByText("Conversas is temporarily unavailable.").isVisible(),
    "scene: temporarily unavailable notice online",
  );
  await page.getByRole("button", { name: /^Send/ }).click({ force: true });
  await page.waitForTimeout(500);
  check(sent === 0, "scene: nothing sent while chat is off");
} finally {
  await browser.close();
}
if (failures.length) {
  console.error("online smoke failed:", failures.join("; "));
  process.exit(1);
}
console.log("online smoke passed");
