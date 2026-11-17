#!/usr/bin/env node
/**
 * Speak-button checks against a running app, with a mocked speechSynthesis that
 * records speak()/cancel() and never ends an utterance on its own:
 *   issue #6:  pt-BR only -> text-only notice, controls stay focusable (aria-disabled),
 *              tap posts the reason as a toast and never calls speak(); a late pt-PT
 *              voice via voiceschanged enables them without reload.
 *   issue #120 checks 1-7 and 9: the active button becomes Stop (aria-pressed, Square
 *              icon / pressed snail pill, never disabled), the other button switches
 *              speed with one cancel() and a second speak(), focus stays on the button,
 *              natural end returns both to idle. Same for the quiz "Play the line" pair.
 *   issue #123 M1/M2: no-voice state (aria-disabled + toast), footer layout on /read at
 *              320 px (pair below the text, no horizontal overflow).
 * Usage: node scripts/tts-smoke.mjs [baseUrl]   (default http://127.0.0.1:8080)
 */
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const BASE = checkedUrl(process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
const PAGE = "/grammar/gram-a1-ser-estar";
const NOTE = "No European Portuguese voice on this device. Text only.";

function mock({ voices }) {
  const listeners = [];
  window.__spoken = [];
  window.__cancels = 0;
  const synth = {
    getVoices: () => voices,
    addEventListener: (t, fn) => t === "voiceschanged" && listeners.push(fn),
    removeEventListener() {},
    cancel() {
      window.__cancels += 1;
    },
    speak(u) {
      window.__spoken.push(u);
    },
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth });
  window.__lateVoices = (v) => {
    voices = v;
    listeners.forEach((fn) => fn());
  };
  window.__end = (i) => window.__spoken[i]?.dispatchEvent(new Event("end"));
}

const PT = [
  { lang: "pt-BR", name: "Luciana", localService: true },
  { lang: "pt-PT", name: "Joana", localService: true },
];
const PT_BR_ONLY = [{ lang: "pt-BR", name: "Luciana", localService: true }];

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const failures = [];
const check = (ok, what) => {
  console.log(ok ? "ok  " : "FAIL", what);
  if (!ok) failures.push(what);
};
const spokenCount = (page) => page.evaluate(() => window.__spoken.length);
const cancelCount = (page) => page.evaluate(() => window.__cancels);
const rates = (page) => page.evaluate(() => window.__spoken.map((u) => u.rate));
const lastRate = async (page) => (await rates(page)).at(-1);
const endLast = (page) =>
  page.evaluate(() => window.__end(window.__spoken.length - 1));

try {
  // ------------------------------------------------ pt-PT available: #120 checks 1-7
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.addInitScript(mock, { voices: PT });
  await page.goto(BASE + PAGE, { waitUntil: "networkidle" });

  const row = page
    .locator("li", { has: page.getByRole("button", { name: /slower/ }) })
    .first();
  const playIn = () => row.getByRole("button", { name: /^Play “/ });
  const stopIn = () => row.getByRole("button", { name: "Stop" });
  const snailIn = () => row.getByRole("button", { name: /slower/ });
  await playIn().waitFor({ timeout: 10_000 });
  check(
    (await playIn().getAttribute("aria-pressed")) === null &&
      (await snailIn().getAttribute("aria-disabled")) === null,
    "idle: neither button pressed nor aria-disabled",
  );

  // check 1: normal then Stop
  await playIn().click();
  await stopIn().waitFor({ timeout: 5_000 });
  await page.getByRole("status").filter({ hasText: "Playing." }).waitFor({ timeout: 5_000 });
  check(true, "L2: live region announces Playing.");
  check(
    (await stopIn().getAttribute("aria-pressed")) === "true" &&
      (await stopIn().locator("svg.fill-current").count()) === 1,
    "check 1: playing normal -> active button is Stop, aria-pressed, Square icon",
  );
  check(
    (await snailIn().count()) === 1 && (await snailIn().getAttribute("aria-pressed")) === null,
    "check 1: snail stays enabled and not pressed",
  );
  let c0 = await cancelCount(page);
  await stopIn().click();
  await playIn().waitFor({ timeout: 5_000 });
  await page.getByRole("status").filter({ hasText: "Stopped." }).waitFor({ timeout: 5_000 });
  check(
    (await cancelCount(page)) === c0 + 1 &&
      (await spokenCount(page)) === 1 &&
      (await playIn().getAttribute("aria-pressed")) === null,
    "check 1: Stop -> cancel() once, back to idle (L2: announces Stopped.)",
  );

  // check 2: normal -> slow while playing (m-A)
  await playIn().click();
  await stopIn().waitFor({ timeout: 5_000 });
  c0 = await cancelCount(page);
  const s0 = await spokenCount(page);
  await snailIn().click();
  await page.waitForFunction(
    (n) => window.__spoken.length === n + 1 && window.__spoken.at(-1).rate === 0.5,
    s0,
    { timeout: 5_000 },
  );
  check((await cancelCount(page)) === c0 + 1, "check 2 (m-A): switching to slow cancels once");
  check((await lastRate(page)) === 0.5, "check 2: second speak() runs at SLOW_RATE 0.5");
  await page.getByRole("status").filter({ hasText: "Playing slower." }).waitFor({ timeout: 5_000 });
  check(true, "L2: live region announces Playing slower.");
  check(
    (await stopIn().getAttribute("aria-pressed")) === "true" &&
      (await snailIn().count()) === 0,
    "check 2: the snail is now pressed and named Stop",
  );
  check(
    (await playIn().getAttribute("aria-pressed")) === null,
    "check 2: Play is enabled and not pressed",
  );

  // check 4: slow cue — snail glyph on a pressed pill, no spinner (also reduced motion)
  check(
    (await page.locator(".animate-spin").count()) === 0 &&
      (await stopIn().locator("svg").count()) === 1,
    "check 4: while slow plays the snail glyph stays, no Loader2 in the pair",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  check(
    (await stopIn().getAttribute("aria-pressed")) === "true" &&
      (await stopIn().getAttribute("class"))?.includes("bg-soft") &&
      (await page.locator(".animate-spin").count()) === 0,
    "check 4: with prefers-reduced-motion the pressed pill still shows the state",
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // check 3: slow -> normal while playing
  c0 = await cancelCount(page);
  const s1 = await spokenCount(page);
  await playIn().click();
  await page.waitForFunction(
    (n) => window.__spoken.length === n + 1 && window.__spoken.at(-1).rate === 0.88,
    s1,
    { timeout: 5_000 },
  );
  check(
    (await cancelCount(page)) === c0 + 1 && (await lastRate(page)) === 0.88,
    "check 3: slow -> normal replays at the normal rate (0.88) with one cancel",
  );
  check(
    (await stopIn().getAttribute("aria-pressed")) === "true",
    "check 3: Play is now the pressed Stop",
  );

  // check 6 (m-B): focus stays on the button; Space works during and after playback
  await playIn().focus();
  await page.keyboard.press("Space"); // stop the current playback
  await playIn().waitFor({ timeout: 5_000 });
  await playIn().focus();
  await page.keyboard.press("Space"); // speak again
  await stopIn().waitFor({ timeout: 5_000 });
  check(
    (await page.evaluate(() => document.activeElement?.getAttribute("aria-label"))) === "Stop",
    "check 6 (m-B): during playback focus is still the same button",
  );
  const s2 = await spokenCount(page);
  await endLast(page);
  await playIn().waitFor({ timeout: 5_000 });
  check(
    (await page.evaluate(() => document.activeElement?.getAttribute("aria-label")))?.startsWith(
      "Play “",
    ),
    "check 6: after playback ends focus is still on the button",
  );
  await page.keyboard.press("Space"); // speaks again: 2 speak() calls in this focus check
  await page.waitForFunction((n) => window.__spoken.length === n + 1, s2, { timeout: 5_000 });
  check(true, "check 6: Space after playback speaks again (2 speak() calls)");

  // check 7: natural end returns both buttons to idle without user action
  await endLast(page);
  await playIn().waitFor({ timeout: 5_000 });
  check(
    (await snailIn().count()) === 1 &&
      (await playIn().getAttribute("aria-pressed")) === null &&
      (await snailIn().getAttribute("aria-pressed")) === null,
    "check 7: utterance end -> both buttons idle",
  );

  // check 9: the quiz "Play the line" pair behaves the same
  await page.getByRole("button", { name: "Start the drill" }).click();
  for (let i = 0; i < 6; i++) {
    const typed = page.locator("#typed-answer");
    if (await typed.count()) {
      await typed.fill("estou em lisboa");
      await page.getByRole("button", { name: "Check" }).click();
    } else {
      await page.locator("ul li button").first().click();
    }
    await page.getByRole("button", { name: "Next" }).click();
  }
  const qPlay = page.getByRole("button", { name: "Play the line" });
  const qSnail = page.getByRole("button", { name: "Play the line slower" });
  await qPlay.waitFor({ timeout: 10_000 });
  check(
    (await qSnail.locator("svg").count()) === 1 &&
      (await qSnail.textContent())?.includes("Slower"),
    "check 9/M3: snail is a sibling outline button with a visible Slower label",
  );
  await qPlay.click();
  await page.getByRole("button", { name: "Stop" }).waitFor({ timeout: 5_000 });
  check(
    (await page.getByRole("button", { name: "Stop" }).getAttribute("aria-pressed")) === "true",
    "check 9: quiz Play the line becomes pressed Stop",
  );
  c0 = await cancelCount(page);
  const s3 = await spokenCount(page);
  await qSnail.click(); // snail is named "Play the line slower" while idle
  await page.waitForFunction(
    (n) => window.__spoken.length === n + 1 && window.__spoken.at(-1).rate === 0.5,
    s3,
    { timeout: 5_000 },
  );
  check(
    (await cancelCount(page)) === c0 + 1 && (await lastRate(page)) === 0.5,
    "check 9: quiz snail replays at SLOW_RATE with one cancel",
  );
  const s4 = await spokenCount(page);
  await page.getByRole("button", { name: "Play the line" }).click();
  await page.waitForFunction(
    (n) => window.__spoken.length === n + 1 && window.__spoken.at(-1).rate === 0.86,
    s4,
    { timeout: 5_000 },
  );
  check((await lastRate(page)) === 0.86, "check 9: quiz normal replays at QUIZ_RATE 0.86");

  // M2 + overflow: /read at 320 px, pair sits below the paragraph text
  const readHref = await page
    .goto(BASE + "/practice", { waitUntil: "networkidle" })
    .then(() => page.locator('a[href^="/read/"]').first().getAttribute("href"));
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto(BASE + readHref, { waitUntil: "networkidle" });
  await page.locator("span.flex.justify-end").first().waitFor({ timeout: 10_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(overflow <= 0, `M2: /read at 320 px has no horizontal overflow (delta ${overflow})`);
  const geo = await page.evaluate(() => {
    const text = document.querySelector("p.font-display");
    const pair = document.querySelector("span.flex.justify-end");
    const t = text.getBoundingClientRect();
    const p = pair.getBoundingClientRect();
    return { below: p.top >= t.bottom - 1, textWidth: t.width, pairRight: p.right };
  });
  check(
    geo.below && geo.pairRight <= 320.5,
    "M2: /read pair sits in a right-aligned row under the full-width text",
  );
  await page.close();

  // ------------------------------------------------ pt-BR only: #6 + #123 M1 (check 8)
  const nv = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await nv.addInitScript(mock, { voices: PT_BR_ONLY });
  await nv.goto(BASE + PAGE, { waitUntil: "networkidle" });
  const nvRow = nv
    .locator("li", { has: nv.getByRole("button", { name: /slower/i }) })
    .first();
  const nvPlay = nvRow.getByRole("button", { name: /Play “/ });
  await nvPlay.waitFor({ timeout: 10_000 });
  await nv.getByText(NOTE).first().waitFor({ timeout: 10_000 });
  check(await nv.getByText(NOTE).first().isVisible(), "pt-BR only: text-only notice shown");
  check(
    (await nvPlay.getAttribute("aria-disabled")) === "true" &&
      (await nvPlay.getAttribute("disabled")) === null &&
      (await nvPlay.getAttribute("aria-label"))?.includes(NOTE),
    "M1: no-voice button is aria-disabled (not disabled) and keeps NO_VOICE_NOTE in the name",
  );
  await nvPlay.focus();
  check(
    (await nv.evaluate(() => document.activeElement?.getAttribute("aria-label")))?.includes(
      "Play “",
    ),
    "M1: no-voice button stays focusable",
  );
  const nvSpoken0 = await spokenCount(nv);
  await nvPlay.click();
  await nv
    .locator('section[aria-label*="Notifications"]')
    .getByText(NOTE)
    .waitFor({ timeout: 5_000 });
  check(
    (await spokenCount(nv)) === nvSpoken0,
    "M1: activating a no-voice button posts the reason toast and never calls speak()",
  );
  await nv.evaluate(() =>
    window.__lateVoices([
      { lang: "pt-BR", name: "Luciana", localService: true },
      { lang: "pt-PT", name: "Joana", localService: true },
    ]),
  );
  await nv.waitForFunction(
    () => document.querySelector('button[aria-disabled="true"]') === null,
    { timeout: 5_000 },
  );
  check(
    (await nvPlay.getAttribute("aria-disabled")) === null,
    "late pt-PT voice enables the buttons without reload",
  );
  await nv.close();
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("tts smoke passed");
