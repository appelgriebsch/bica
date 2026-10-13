#!/usr/bin/env node
/**
 * Speak-button check against a running app (issue #6), with a mocked
 * speechSynthesis: only pt-BR → text-only notice + disabled buttons;
 * pt-PT arriving late via voiceschanged → buttons enable without reload.
 * Usage: node scripts/tts-smoke.mjs [baseUrl]   (default http://127.0.0.1:8080)
 */
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

const BASE = checkedUrl(process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
const PAGE = "/grammar/gram-a1-ser-estar";
const NOTE = "No European Portuguese voice on this device. Text only.";

function mock({ voices, late }) {
  const listeners = [];
  const synth = {
    getVoices: () => voices,
    addEventListener: (t, fn) => t === "voiceschanged" && listeners.push(fn),
    removeEventListener() {},
    cancel() {},
    speak() {},
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth });
  window.__lateVoices = () => {
    voices = late;
    listeners.forEach((fn) => fn());
  };
}

const browser = await chromium.launch({ args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const failures = [];
const check = (ok, what) => {
  console.log(ok ? "ok  " : "FAIL", what);
  if (!ok) failures.push(what);
};
try {
  const page = await browser.newPage();
  await page.addInitScript(mock, {
    voices: [{ lang: "pt-BR", name: "Luciana", localService: true }],
    late: [
      { lang: "pt-BR", name: "Luciana", localService: true },
      { lang: "pt-PT", name: "Joana", localService: true },
    ],
  });
  await page.goto(BASE + PAGE, { waitUntil: "networkidle" });
  const speak = page.getByRole("button", { name: /Play pronunciation/ }).first();
  await page
    .getByText(NOTE)
    .first()
    .waitFor({ timeout: 5000 })
    .catch(() => {});
  check(await page.getByText(NOTE).first().isVisible(), "pt-BR only: text-only notice shown");
  check(await speak.isDisabled(), "pt-BR only: speak button visible but disabled");
  await page.evaluate(() => window.__lateVoices());
  await page.waitForTimeout(200);
  check(await speak.isEnabled(), "late pt-PT voice enables the button without reload");
  check(
    !(await page
      .getByText(NOTE)
      .first()
      .isVisible()
      .catch(() => false)),
    "notice gone once pt-PT arrives",
  );
} finally {
  await browser.close();
}
if (failures.length) process.exit(1);
console.log("tts smoke passed");
