#!/usr/bin/env node
/**
 * Browser check of QR progress transfer (#36) against the built app.
 * Run after `bun run build`: node scripts/transfer-smoke.mjs
 * 1. Sender: real /me/send frames, decoded with the app's own jsQR worker; pause/step; expiry.
 * 2. Those frames become a fake camera (y4m). Receiver goes offline, scans with
 *    the jsQR worker, unlocks (wrong code first), reviews, merges; a second scan is a no-op.
 * 3. A stubbed BarcodeDetector covers the native path, duplicates and a foreign session,
 *    the newer-format Update state, camera denial with Retry and the 20 s stall.
 * Not a replacement for the manual iPhone check in ADR 0005.
 */
import { readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { encode } from "uqr";
import { buildOutput } from "./build-output.mjs";
import { startBuildServer } from "./serve-build.mjs";

const PORT = Number(process.env.PORT || 8094);
const BASE = `http://127.0.0.1:${PORT}`;
const KEY = "bica.progress.v1";
const ARGS = ["--no-sandbox", "--disable-dev-shm-usage"];
const worker =
  "/assets/" +
  readdirSync(join(process.cwd(), buildOutput().publicDir, "assets")).find((f) =>
    f.startsWith("qr-worker-"),
  );
const failures = [];
const check = (ok, what, detail = "") => {
  console.log(ok ? "ok  " : "FAIL", what, detail);
  if (!ok) failures.push(what);
};

const iso = new Date().toISOString();
const today = iso.slice(0, 10);
/** Sender: 60 lessons and 600 cards — a well-used phone. */
function senderState() {
  const completed = {};
  const cards = {};
  for (let i = 0; i < 60; i++)
    completed[`lesson-${i}`] = { quizScore: 3, quizTotal: 4, xp: 14, completedAt: iso };
  for (let i = 0; i < 600; i++)
    cards[`lesson-${i % 60}:palavra ${i}`] = {
      interval: 3,
      ease: 2,
      due: today,
      reps: 2,
      lapses: 0,
    };
  return {
    completed,
    cards,
    xp: 840,
    streak: 9,
    lastStudyDate: today,
    floor: "A2",
    floorUpdatedAt: iso,
  };
}
const receiverState = {
  completed: { "a1-ola": { quizScore: 4, quizTotal: 4, xp: 16, completedAt: iso } },
  cards: {},
  xp: 16,
  streak: 1,
  lastStudyDate: today,
  floor: "A1",
  floorUpdatedAt: null,
};
const seed = (state) => ({ key: KEY, value: JSON.stringify({ state, version: 0 }) });
/** Seed progress once per context (not on every navigation). */
const seedScript = ({ key, value }) => {
  if (!sessionStorage.getItem("seeded")) {
    localStorage.setItem(key, value);
    sessionStorage.setItem("seeded", "1");
  }
};
/** Record every camera stream so the test can see tracks stop. */
const trackStreams = () => {
  const real = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
  window.__streams = [];
  window.__gum = 0;
  if (real)
    navigator.mediaDevices.getUserMedia = async (c) => {
      window.__gum++;
      if (window.__denyCamera) throw new DOMException("denied", "NotAllowedError");
      const s = await real(c);
      window.__streams.push(s);
      return s;
    };
};
/** Native decoder stub: returns the given texts in turn. */
/** Hold every PBKDF2 key derivation while window.__hold is set; window.__release() lets them run. */
const holdDeriveKey = () => {
  const real = crypto.subtle.deriveKey.bind(crypto.subtle);
  let waiting = [];
  window.__hold = true;
  window.__held = 0;
  window.__release = () => {
    window.__hold = false;
    waiting.forEach((go) => go());
    waiting = [];
  };
  crypto.subtle.deriveKey = async (...args) => {
    if (window.__hold) {
      window.__held++;
      await new Promise((go) => waiting.push(go));
    }
    return real(...args);
  };
};

const nativeStub = (texts) => {
  let i = 0;
  window.BarcodeDetector = class {
    static async getSupportedFormats() {
      return ["qr_code"];
    }
    async detect() {
      await new Promise((r) => setTimeout(r, 30));
      return [{ rawValue: texts[i++ % texts.length] }];
    }
  };
};

/** Each QR as a 640x480 4:2:0 y4m frame: black on white, 4-module quiet zone. */
function writeY4m(frames, repeat) {
  const W = 640;
  const H = 480;
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F6:1 Ip A1:1 C420jpeg\n`)];
  for (const text of frames) {
    const { data, size } = encode(text, { border: 4, boostEcc: true });
    const scale = Math.floor(440 / size);
    const off = [(W - size * scale) >> 1, (H - size * scale) >> 1];
    const y = Buffer.alloc(W * H, 235);
    for (let r = 0; r < size; r++)
      for (let c = 0; c < size; c++)
        if (data[r][c])
          for (let dy = 0; dy < scale; dy++)
            y.fill(
              16,
              (off[1] + r * scale + dy) * W + off[0] + c * scale,
              (off[1] + r * scale + dy) * W + off[0] + (c + 1) * scale,
            );
    const uv = Buffer.alloc((W * H) / 2, 128);
    for (let k = 0; k < repeat; k++) parts.push(Buffer.from("FRAME\n"), y, uv);
  }
  const file = join(tmpdir(), `bica-transfer-${process.pid}.y4m`);
  writeFileSync(file, Buffer.concat(parts));
  return file;
}

const server = await startBuildServer(PORT);
let browser = await chromium.launch({ args: ARGS });
let frames = [];
let code = "";
try {
  // --- 1. Sender ------------------------------------------------------------
  const sender = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await sender.addInitScript(seedScript, seed(senderState()));
  const page = await sender.newPage();
  await page.clock.install();
  await page.goto(BASE + "/me");
  const res = await page.request.get(BASE + "/me");
  check(
    /camera=\(self\)/.test(res.headers()["permissions-policy"] ?? ""),
    "camera=(self) policy",
    res.headers()["permissions-policy"],
  );
  check(
    await page.getByText("Copy progress between devices. Nothing is uploaded.").isVisible(),
    "/me Move progress section",
  );
  await page.getByRole("link", { name: "Send progress" }).click();
  await page.getByText("Transfer code").waitFor({ timeout: 30000 });
  code = (await page.locator("span.font-mono").innerText()).replace("-", "");
  check(/^[A-HJKMNP-Z2-9]{8}$/.test(code), "code alphabet", code);
  const n = Number((await page.getByText(/^Part \d+ of \d+$/).innerText()).split(" of ")[1]);
  await page.getByRole("button", { name: "Pause" }).click();
  const decoded = new Map();
  for (let k = 0; k < n; k++) {
    const src = await page.locator("figure img").getAttribute("src");
    const text = await page.evaluate(
      async ({ src, worker }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = c.height = 640;
        const ctx = c.getContext("2d");
        ctx.drawImage(img, 0, 0, 640, 640);
        const d = ctx.getImageData(0, 0, 640, 640);
        const w = new Worker(worker, { type: "module" });
        const out = await new Promise((r) => {
          w.onmessage = (e) => r(e.data);
          w.postMessage({ data: d.data, width: 640, height: 640 });
        });
        w.terminate();
        return out;
      },
      { src, worker },
    );
    const svg = decodeURIComponent(src.split(",")[1]);
    const modules = Number(svg.match(/viewBox="0 0 (\d+)/)[1]) / 8 - 8;
    decoded.set(text, modules);
    await page.getByRole("button", { name: "Next QR part" }).click();
  }
  frames = [...decoded.keys()]
    .filter(Boolean)
    .sort((a, b) => Number(a.split(":")[2].split("/")[0]) - Number(b.split(":")[2].split("/")[0]));
  const sids = new Set(frames.map((f) => f.split(":")[1]));
  check(
    frames.length === n &&
      sids.size === 1 &&
      frames.every((f) => f.startsWith("BQ1:") && f.length <= 600),
    "sender frames decode with the app's jsQR worker",
    `${n} parts, ${Math.max(...frames.map((f) => f.length))} chars max, QR ${Math.max(...decoded.values())} modules`,
  );
  check(!frames.some((f) => f.includes(code)), "code never in QR data");
  await page.clock.fastForward("05:01");
  await page.getByText("Code expired").waitFor({ timeout: 5000 });
  check(!(await page.locator("figure img").count()), "expiry clears QR and code");
  await page.getByRole("button", { name: "Make a new code" }).click();
  await page.getByText("Transfer code").waitFor({ timeout: 30000 });
  check(
    (await page.locator("span.font-mono").innerText()).replace("-", "") !== code,
    "new code after expiry",
  );
  await sender.close();
  await browser.close();

  // --- 2. Receiver with a fake camera, offline, jsQR worker -------------------
  const y4m = writeY4m(frames, 2);
  browser = await chromium.launch({
    args: [
      ...ARGS,
      "--use-fake-device-for-media-stream",
      "--use-fake-ui-for-media-stream",
      `--use-file-for-fake-video-capture=${y4m}`,
    ],
  });
  const rx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await rx.addInitScript(seedScript, seed(receiverState));
  await rx.addInitScript(trackStreams);
  const r = await rx.newPage();
  await r.goto(BASE + "/");
  await r.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise((ok) =>
        navigator.serviceWorker.addEventListener("controllerchange", ok, { once: true }),
      );
  });
  await rx.setOffline(true);
  async function scanToCode(page) {
    await page.goto(BASE + "/me/receive");
    await page.getByRole("button", { name: "Allow camera" }).click();
    await page
      .getByRole("heading", { name: "Enter the transfer code" })
      .waitFor({ timeout: 90000 });
  }
  const t0 = Date.now();
  await scanToCode(r);
  check(
    true,
    "offline scan via jsQR worker",
    `${frames.length} parts in ${((Date.now() - t0) / 1000).toFixed(1)} s, native=${await r.evaluate(() => "BarcodeDetector" in window)}`,
  );
  const live = await r.evaluate(
    () =>
      window.__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length,
  );
  check(live === 0, "camera tracks stopped once complete");
  const input = r.getByLabel(/Transfer code/);
  await input.fill("aaaa aaaa");
  await r.getByRole("button", { name: "Unlock progress" }).click();
  await r.getByText(/Couldn.t unlock this code/).waitFor({ timeout: 30000 });
  check(
    (await input.getAttribute("aria-invalid")) === "true" && (await input.inputValue()) !== "",
    "wrong code: linked error, input kept",
  );
  await input.fill(code.toLowerCase());
  await r.getByRole("button", { name: "Try code again" }).click();
  await r.getByRole("heading", { name: "Ready to merge" }).waitFor({ timeout: 30000 });
  check(
    await r
      .getByText("Newest/best wins per field. Nothing is deleted or wholesale replaced.")
      .isVisible(),
    "review shows the merge rule",
  );
  check(await r.getByText("+60", { exact: true }).isVisible(), "review shows lessons added");
  await r.getByRole("button", { name: "Merge progress" }).click();
  await r.getByRole("heading", { name: "Progress merged. Saved on this phone." }).waitFor();
  const saved = await r.evaluate((k) => JSON.parse(localStorage.getItem(k)).state, KEY);
  check(
    Object.keys(saved.completed).length === 61 &&
      Object.keys(saved.cards).length === 600 &&
      saved.floor === "A2",
    "merged and saved",
    `${Object.keys(saved.completed).length} lessons, floor ${saved.floor}`,
  );
  check(await r.getByRole("link", { name: "Send from this phone" }).isVisible(), "swap prompt");
  const before = await r.evaluate((k) => localStorage.getItem(k), KEY);
  await scanToCode(r);
  await r.getByLabel(/Transfer code/).fill(code);
  await r.getByRole("button", { name: "Unlock progress" }).click();
  await r.getByRole("heading", { name: "Nothing new to merge" }).waitFor({ timeout: 30000 });
  check(
    before === (await r.evaluate((k) => localStorage.getItem(k), KEY)),
    "identical re-import writes nothing",
  );
  await rx.close();

  // --- 3. Native decoder path and edge states -------------------------------
  async function stubbed(texts, extra) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(seedScript, seed(receiverState));
    await ctx.addInitScript(trackStreams);
    await ctx.addInitScript(nativeStub, texts);
    if (extra) await ctx.addInitScript(extra);
    const p = await ctx.newPage();
    return { ctx, p };
  }
  const foreign = frames[0].replace(/^BQ1:..../, "BQ1:ZZZZ");
  {
    const { ctx, p } = await stubbed([...frames, frames[0], foreign, ...frames]);
    await scanToCode(p);
    check(true, "native BarcodeDetector path with duplicates and a foreign session");
    await ctx.close();
  }
  {
    const { ctx, p } = await stubbed(["BQ2:ABCD:1/1:XYZ"]);
    await p.goto(BASE + "/me/receive");
    await p.getByRole("button", { name: "Allow camera" }).click();
    await p
      .getByRole("heading", { name: "Update Bica on this phone to receive this" })
      .waitFor({ timeout: 30000 });
    await p.getByRole("button", { name: "Update app" }).click();
    const said = await p
      .getByText(/No update available yet|Connect to the internet/)
      .waitFor({ timeout: 30000 })
      .then(
        () => true,
        () => false,
      );
    check(said, "newer format: Update state, no reload loop");
    await ctx.close();
  }
  {
    const { ctx, p } = await stubbed([frames[0]], () => (window.__denyCamera = true));
    await p.goto(BASE + "/me/receive");
    await p.getByRole("button", { name: "Allow camera" }).click();
    await p.getByRole("heading", { name: "Camera not allowed" }).waitFor({ timeout: 10000 });
    await p.evaluate(() => (window.__denyCamera = false));
    await p.getByRole("button", { name: "Retry" }).click();
    await p.getByRole("heading", { name: "Scanning" }).waitFor({ timeout: 10000 });
    check((await p.evaluate(() => window.__gum)) >= 2, "camera denied: Retry asks again");
    await ctx.close();
  }
  // An unlock still deriving its key must not land after Scan again or expiry (Avery C1).
  async function pendingUnlock(p) {
    await scanToCode(p);
    await p.getByLabel(/Transfer code/).fill(code);
    await p.getByRole("button", { name: "Unlock progress" }).click();
    await p.waitForFunction(() => window.__held > 0);
  }
  async function settles(p) {
    await p.evaluate(() => window.__release());
    await p.waitForTimeout(2000); // 600k PBKDF2 + inflate + parse finish well inside this
    return !(await p.getByRole("heading", { name: /Ready to merge|Nothing new to merge/ }).count());
  }
  {
    const { ctx, p } = await stubbed(frames, holdDeriveKey);
    await pendingUnlock(p);
    await p.getByRole("button", { name: "Scan again" }).click();
    await p.getByRole("heading", { name: "Enter the transfer code" }).waitFor({ timeout: 30000 });
    const ignored = await settles(p);
    check(
      ignored && (await p.getByRole("button", { name: "Unlock progress" }).isEnabled()),
      "unlock pending across Scan again is ignored",
    );
    await p.getByLabel(/Transfer code/).fill(code);
    await p.getByRole("button", { name: "Unlock progress" }).click();
    await p.getByRole("heading", { name: "Ready to merge" }).waitFor({ timeout: 30000 });
    check(true, "the new session still unlocks");
    await ctx.close();
  }
  {
    const { ctx, p } = await stubbed(frames, holdDeriveKey);
    await p.clock.install();
    await pendingUnlock(p);
    await p.clock.fastForward("05:01");
    await p.getByRole("heading", { name: "Code no longer usable" }).waitFor({ timeout: 5000 });
    const ignored = await settles(p);
    check(
      ignored && (await p.getByRole("heading", { name: "Code no longer usable" }).isVisible()),
      "unlock pending across expiry is ignored",
    );
    await ctx.close();
  }
  if (frames.length > 1) {
    const { ctx, p } = await stubbed([frames[0]]);
    await p.clock.install();
    await p.goto(BASE + "/me/receive");
    await p.getByRole("button", { name: "Allow camera" }).click();
    await p.getByText(`1 of ${frames.length} received`).waitFor({ timeout: 10000 });
    await p.clock.fastForward("00:22");
    await p.getByRole("heading", { name: "Lost the code" }).waitFor({ timeout: 5000 });
    check(
      await p.getByText(`1 of ${frames.length} received`).isVisible(),
      "20 s stall pauses and keeps parts",
    );
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (failures.length) {
  console.error("transfer smoke failed:", failures.join(", "));
  process.exit(1);
}
console.log("transfer smoke passed");
process.exit(0);
