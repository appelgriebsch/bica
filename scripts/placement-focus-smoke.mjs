#!/usr/bin/env node
/**
 * #158 m2: keyboard focus through placement and Today's level toggle.
 *   - A fresh Today load does not focus "or choose yourself" (StrictMode
 *     double-invokes mount effects; the toggle moves focus from its click).
 *   - Opening and closing the toggle never leaves focus on body.
 *   - Every placement Next / Next band / See results / Check, and
 *     "Choose another level", never leaves focus on body.
 *   - "Start at X" lands on Today with focus on #today-heading.
 *
 * Usage: node scripts/placement-focus-smoke.mjs [baseUrl]
 *   default http://127.0.0.1:8080
 */
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { checkedUrl } from "./browser-guard.mjs";

export async function runFocusSmoke(page, base) {
  const failures = [];
  const check = (ok, what) => {
    console.log(ok ? "ok  " : "FAIL", what);
    if (!ok) failures.push(what);
  };
  const notBody = async (label) => {
    const tag = await page.evaluate(() =>
      document.activeElement === document.body ? "BODY" : (document.activeElement?.tagName ?? "none"),
    );
    check(tag !== "BODY", `${label} focus is ${tag}`);
  };

  await page.goto(`${base}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const freshToggle = await page.evaluate(() => {
    const el = document.activeElement;
    return (
      el !== document.body &&
      el?.tagName === "BUTTON" &&
      (el.textContent ?? "").includes("or choose yourself")
    );
  });
  check(!freshToggle, "fresh Today does not focus the level toggle");

  const toggle = page.getByRole("button", { name: "or choose yourself" });
  await toggle.click();
  await page.waitForFunction(() => document.activeElement?.id === "today-level-picker");
  await notBody("toggle open");
  check(
    (await toggle.getAttribute("aria-expanded")) === "true",
    "toggle aria-expanded is true",
  );
  await toggle.click();
  await page.waitForFunction(() =>
    (document.activeElement?.textContent ?? "").includes("or choose yourself"),
  );
  await notBody("toggle closed");
  check(
    (await toggle.getAttribute("aria-expanded")) === "false",
    "toggle aria-expanded is false",
  );

  async function placement(then) {
    await page.evaluate(() => localStorage.removeItem("bica.progress.v1"));
    await page.goto(`${base}/placement`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.activeElement?.tagName === "H2");
    for (let n = 1; n <= 15; n++) {
      const lastInBand = n % 3 === 0;
      const band = Math.ceil(n / 3);
      const input = page.locator("#typed-answer");
      if (await input.count()) {
        await input.fill("teste");
        await page.getByRole("button", { name: "Check", exact: true }).click();
        await page.waitForFunction(() => document.activeElement?.tagName === "H3");
      } else {
        await page.locator("article ul button").first().click();
      }
      await notBody(`q${n} after answer`);
      const expected = !lastInBand ? "Next" : band < 5 ? "Next band" : "See results";
      const advance = page.locator("article").getByRole("button", { name: expected, exact: true });
      check((await advance.innerText()).trim() === expected, `q${n} says ${expected}`);
      await advance.click();
      if (n < 15) {
        await page.waitForFunction(() => document.activeElement?.tagName === "H2");
      } else {
        await page.waitForFunction(() =>
          /^[ABC][12]$/.test((document.activeElement?.textContent ?? "").trim()),
        );
      }
      await notBody(`q${n} after ${expected}`);
    }
    await then();
  }

  await placement(async () => {
    await page.getByRole("button", { name: "Choose another level" }).click();
    await page.waitForFunction(() => document.activeElement?.querySelector?.("[aria-pressed]"));
    await notBody("choose another level");
  });

  await placement(async () => {
    const level = (await page.locator("h2").first().innerText()).trim();
    await page.getByRole("button", { name: `Start at ${level}` }).click();
    await page.waitForURL(`${base}/`);
    await page.waitForFunction(() => document.activeElement?.id === "today-heading");
    check(true, `accept lands on Today with focus on #today-heading (${level})`);
  });

  return failures;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const base = checkedUrl(process.argv[2] || "http://127.0.0.1:8080").replace(/\/$/, "");
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const failures = await runFocusSmoke(page, base);
    if (failures.length) {
      console.error(JSON.stringify({ ok: false, failures }, null, 2));
      process.exit(1);
    }
    console.log(JSON.stringify({ ok: true }));
  } finally {
    await browser.close();
  }
}
