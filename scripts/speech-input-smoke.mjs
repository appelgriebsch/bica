#!/usr/bin/env node
/**
 * #83 (ADR 0020) browser checks against a running app, with a mocked
 * SpeechRecognition that records sessions and lets the test fire results:
 *   - /speak/$id shows the mic button next to the typed input; tapping it
 *     starts a pt-PT session (lang, interimResults, continuous=false) and the
 *     button becomes pressed Stop; the live region announces "Listening…".
 *   - interim + final transcripts stream into the composer input, so what was
 *     understood is visible (and editable) before Send; stopping keeps the text.
 *   - typed input still works while the mic exists.
 *   - no SpeechRecognition on the device: the mic is aria-disabled (still
 *     focusable), says so on tap (toast), and the typed composer keeps working.
 *   - a language-not-supported error flips the button to aria-disabled.
 *   - 390 px: no horizontal overflow on /speak/$id.
 * Usage: node scripts/speech-input-smoke.mjs [baseUrl]   (default http://127.0.0.1:8080)
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { checkedOutputPath, checkedUrl } from "./browser-guard.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const BASE = checkedUrl(process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
const SHOTS = join(root, "screenshots");
const NOTE = "No European Portuguese speech recognition on this device. Typing still works.";

function mockRecognition() {
  window.__sessions = [];
  window.SpeechRecognition = class {
    constructor() {
      this.lang = "";
      this.continuous = true;
      this.interimResults = false;
      this.maxAlternatives = 0;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      window.__sessions.push(this);
    }
    start() {
      this.started = true;
    }
    stop() {
      if (this.stopped) return;
      this.stopped = true;
      queueMicrotask(() => this.onend?.());
    }
    abort() {
      if (this.aborted) return;
      this.aborted = true;
      queueMicrotask(() => this.onend?.());
    }
  };
  window.__res = (transcript, isFinal) => ({
    isFinal,
    length: 1,
    item: () => ({ transcript }),
    0: { transcript },
  });
  window.__fire = (i, results) => {
    const s = window.__sessions[i];
    s.onresult?.({ resultIndex: 0, results: { length: results.length, item: (k) => results[k] } });
  };
  window.__err = (i, code) => window.__sessions[i].onerror?.({ error: code });
}

function noRecognition() {
  delete window.SpeechRecognition;
  delete window.webkitSpeechRecognition;
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const failures = [];
const check = (ok, what) => {
  console.log(ok ? "ok  " : "FAIL", what);
  if (!ok) failures.push(what);
};

async function openScene(page) {
  await page.goto(BASE + "/speak", { waitUntil: "networkidle" });
  const href = await page.locator('a[href^="/speak/"]').first().getAttribute("href");
  await page.goto(BASE + href, { waitUntil: "networkidle" });
  await page.locator("#line").waitFor({ timeout: 15_000 });
  return href;
}

try {
  // ------------------------------------------- supported: full speaking flow
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const consoleErrors = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e?.message || e)));
  await page.addInitScript(mockRecognition);
  const href = await openScene(page);

  const mic = page.getByRole("button", { name: "Speak your line in Portuguese" });
  await mic.waitFor({ timeout: 10_000 });
  check((await mic.getAttribute("aria-disabled")) === null, "mic is enabled when supported");
  const input = page.locator("#line");
  check((await input.getAttribute("placeholder")) === "Write in Portuguese…", "typed input present");

  await mic.click();
  const stop = page.getByRole("button", { name: "Stop listening" });
  await stop.waitFor({ timeout: 5_000 });
  check((await stop.getAttribute("aria-pressed")) === "true", "listening: button is pressed Stop");
  check((await input.getAttribute("placeholder")) === "A ouvir…", "placeholder switches while listening");
  await page.getByRole("status").filter({ hasText: "Listening…" }).waitFor({ timeout: 5_000 });
  check(true, "live region announces Listening…");
  const cfg = await page.evaluate(() => {
    const s = window.__sessions[0];
    return { lang: s.lang, interim: s.interimResults, cont: s.continuous, max: s.maxAlternatives, started: s.started };
  });
  check(
    cfg.lang === "pt-PT" && cfg.interim === true && cfg.cont === false && cfg.max === 1 && cfg.started,
    `session pins pt-PT + interim + single utterance (${JSON.stringify(cfg)})`,
  );

  await page.evaluate(() => window.__fire(0, [window.__res("ol", false)]));
  await page.waitForFunction(() => document.querySelector("#line").value === "ol");
  check(true, "interim transcript streams into the composer");
  await page.evaluate(() =>
    window.__fire(0, [window.__res("olá ", true), window.__res("tudo", false)]),
  );
  await page.waitForFunction(() => document.querySelector("#line").value === "olá tudo");
  await page.evaluate(() =>
    window.__fire(0, [window.__res("olá ", true), window.__res("tudo bem?", true)]),
  );
  await page.waitForFunction(() => document.querySelector("#line").value === "olá tudo bem?");
  check(true, "final transcript is visible in the composer before sending");

  await stop.click();
  await mic.waitFor({ timeout: 5_000 });
  check(
    (await input.inputValue()) === "olá tudo bem?",
    "stopping keeps the understood text in the composer (edit before send)",
  );

  await input.fill("");
  await input.type("isto é escrito");
  check((await input.inputValue()) === "isto é escrito", "typed input still works");
  await page.screenshot({
    path: checkedOutputPath(join(SHOTS, "speech-input-desk.png"), [root]),
    fullPage: true,
  });
  check(consoleErrors.length === 0, `clean console (${consoleErrors.join(" | ")})`);
  await page.close();

  // -------------------------------------- unsupported device: note + typed input
  const nv = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await nv.addInitScript(noRecognition);
  await openScene(nv);
  const nvMic = nv.getByRole("button", { name: new RegExp(`Speak your line\\. ${NOTE}`) });
  await nvMic.waitFor({ timeout: 10_000 });
  check((await nvMic.getAttribute("aria-disabled")) === "true", "no recognition: mic is aria-disabled");
  check((await nvMic.getAttribute("disabled")) === null, "no recognition: mic stays focusable");
  await nvMic.dispatchEvent("click");
  await nv
    .locator('section[aria-label*="Notifications"]')
    .getByText(NOTE)
    .waitFor({ timeout: 5_000 });
  check(true, "no recognition: tapping says so as a toast");
  const nvInput = nv.locator("#line");
  await nvInput.type("ainda escrevo");
  check((await nvInput.inputValue()) === "ainda escrevo", "no recognition: typed Scene keeps working");
  const overflow = await nv.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check(overflow <= 0, `390 px: no horizontal overflow on /speak/$id (delta ${overflow})`);
  await nv.screenshot({
    path: checkedOutputPath(join(SHOTS, "speech-input-mobi.png"), [root]),
    fullPage: true,
  });
  await nv.close();

  // -------------------------------------- language-not-supported flips to disabled
  const lang = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await lang.addInitScript(mockRecognition);
  await openScene(lang);
  const langMic = lang.getByRole("button", { name: "Speak your line in Portuguese" });
  await langMic.click();
  await lang.getByRole("button", { name: "Stop listening" }).waitFor({ timeout: 5_000 });
  await lang.evaluate(() => window.__err(0, "language-not-supported"));
  await lang.waitForFunction(
    () => document.querySelector('button[aria-disabled="true"]') !== null,
    { timeout: 5_000 },
  );
  check(true, "language-not-supported: mic flips to aria-disabled (says so)");
  await lang.close();

  console.log(`checked /speak scene ${href}`);
} finally {
  await browser.close();
}
if (failures.length) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("speech-input smoke passed");
