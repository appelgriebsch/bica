/**
 * Issue #110 — each of the four minor UI/a11y findings has a check here:
 *   m1: /path lesson cards stay inside their column at 320/375 px
 *       (browser layout check when Chromium is installed; source assertion always).
 *   m2: the progress bars on Home and in the lesson header expose an accessible name.
 *   m3: the Conversas card's accessible name contains its visible label (WCAG 2.5.3).
 *   m4: an unknown route renders the in-app 404 view with a working link to Home.
 *
 * The rendered-output checks run against a dev server spawned on a loopback port
 * (no public binding); browser checks skip when no Chromium is installed.
 *
 * Also covers #134 (ADR 0018): s1 /speak heading structure + register pills (SSR),
 * s2 /speak at 390px without horizontal overflow (browser).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => readFileSync(join(root, f), "utf8");

// ---------------------------------------------------------------- source level

test("m1: /path lesson cards are min-w-0 at every grid/flex level (#110)", () => {
  const path = read("src/routes/path.tsx");
  // The lessons <ul> is a grid whose items must be allowed to shrink below
  // their content's min-content (the nowrap title), like the grammar/verbs lists.
  assert.match(path, /<ul className="grid min-w-0 gap-2">\s*\{unitLessons\.map/);
  assert.match(path, /<li key=\{lesson\.id\} className="min-w-0">/);
  assert.match(path, /to="\/lesson\/\$id"[\s\S]{0,300}?className="flex min-w-0 /);
  assert.ok(!/<li>/.test(path), "every <li> in path.tsx carries min-w-0");
});

test("m2: both Progress call sites pass an accessible-name label (#110)", () => {
  assert.match(
    read("src/routes/index.tsx"),
    /<Progress value=\{pct\} label=\{`\$\{doneCount\} of \$\{lessons\.length\} lessons`\} \/>/,
  );
  assert.match(
    read("src/components/lesson-player.tsx"),
    /<Progress[\s\S]*?label=\{`Lesson progress: /,
  );
  assert.match(read("src/components/ui/progress.tsx"), /aria-label=\{label\}/);
});

test("m3: OnlineOnly never overrides the accessible name; state is the description (#110)", () => {
  const onlineOnly = read("src/components/online-only.tsx");
  assert.ok(!/aria-label\s*=/.test(onlineOnly), "no aria-label prop in OnlineOnly");
  assert.match(onlineOnly, /aria-describedby=\{stateId\}/);
  assert.match(onlineOnly, /className="sr-only"/);
  const practice = read("src/routes/practice.tsx");
  assert.match(practice, /<OnlineOnly feature="conversas" placement="corner">/);
  assert.match(practice, /Conversas/);
});

test("m4: router registers an in-app 404 with a link to Home (#110)", () => {
  assert.match(read("src/router.tsx"), /defaultNotFoundComponent: NotFound/);
  const notFound = read("src/components/not-found.tsx");
  assert.match(notFound, /<AppShell>/);
  assert.match(notFound, /<Link to="\/">/);
});

// ------------------------------------------------------- rendered output (HTTP)

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

let base, serverProc;

before(async () => {
  const port = await freePort();
  base = `http://127.0.0.1:${port}`;
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
    if (ok) return;
    if (Date.now() > deadline)
      throw new Error(`dev server did not come up on ${base}\n${log.slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
});

after(() => {
  if (serverProc) {
    try {
      process.kill(-serverProc.pid, "SIGTERM");
    } catch {
      serverProc.kill("SIGTERM");
    }
  }
});

const get = async (path) => {
  const res = await fetch(base + path, {
    signal: AbortSignal.timeout(60_000),
    redirect: "manual",
  });
  return { status: res.status, body: await res.text() };
};

/** Opening tags of all progressbar elements in an SSR HTML string. */
const progressbarTags = (html) =>
  [...html.matchAll(/<[^>]*\brole="progressbar"[^>]*>/g)].map((m) => m[0]);

test(
  "m2: Home progress bar has a non-empty accessible name (#110)",
  { timeout: 180_000 },
  async () => {
    const { status, body } = await get("/");
    assert.equal(status, 200);
    const bars = progressbarTags(body);
    assert.ok(bars.length >= 1, "expected at least one progressbar on Home");
    for (const tag of bars) {
      const label = tag.match(/aria-label="([^"]*)"/)?.[1];
      assert.ok(label && label.length > 0, `progressbar without accessible name: ${tag}`);
    }
    assert.ok(
      bars.some((tag) => /aria-label="\d+ of \d+ lessons"/.test(tag)),
      `expected a "N of M lessons" name, got: ${bars.join(" | ")}`,
    );
  },
);

test(
  "m2: lesson-header progress bar has a non-empty accessible name (#110)",
  { timeout: 180_000 },
  async () => {
    const path = await get("/path");
    const id = path.body.match(/href="\/lesson\/([^"]+)"/)?.[1];
    assert.ok(id, "no lesson link found on /path");
    const { status, body } = await get(`/lesson/${id}`);
    assert.equal(status, 200);
    const bars = progressbarTags(body);
    assert.ok(bars.length >= 1, "expected a progressbar in the lesson header");
    for (const tag of bars) {
      const label = tag.match(/aria-label="([^"]*)"/)?.[1];
      assert.ok(label && label.length > 0, `progressbar without accessible name: ${tag}`);
    }
    assert.ok(
      bars.some((tag) => /aria-label="Lesson progress: \d+ of \d+ steps"/.test(tag)),
      `expected a step name, got: ${bars.join(" | ")}`,
    );
  },
);

test(
  "m3: Conversas card has no aria-label override and shows its visible label (#110)",
  { timeout: 180_000 },
  async () => {
    const { status, body } = await get("/practice");
    assert.equal(status, 200);
    const card = body.match(/<a\b[^>]*href="\/speak"[^>]*>([\s\S]*?)<\/a>/);
    assert.ok(card, "no Conversas card link on /practice");
    const [tag, inner] = [card[0].slice(0, card[0].indexOf(">") + 1), card[1]];
    assert.ok(!/aria-label/.test(tag), `card must not override its name: ${tag}`);
    assert.match(tag, /aria-describedby="[^"]+"/, "online state exposed as description");
    assert.ok(inner.includes("Conversas"), "card shows its visible label");
  },
);

test(
  "m4: unknown route is a 404 rendering the in-app view with a Home link (#110)",
  { timeout: 180_000 },
  async () => {
    const { status, body } = await get("/nope-404-issue-110");
    assert.equal(status, 404, "unknown route must answer 404");
    assert.ok(body.includes("Page not found"), "in-app 404 view rendered");
    assert.match(body, /<a\b[^>]*href="\/"[^>]*>/, "404 view links to Home");
    assert.ok(!/<p>Not Found<\/p>/.test(body), "not the framework's plain-text fallback");
  },
);

// ------------------------------------------------------- browser (when present)

let browser = null;
before(async () => {
  try {
    const { chromium } = await import("playwright");
    browser = await chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  } catch {
    browser = null;
  }
});
after(async () => {
  if (browser) await browser.close();
});

const needBrowser = (t) => {
  if (browser) return false;
  t.skip("Chromium is not installed in this environment");
  return true;
};

test("m1: /path lesson cards fit at 320 px and 375 px (#110)", { timeout: 180_000 }, async (t) => {
  if (needBrowser(t)) return;
  for (const width of [320, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    await page.goto(`${base}/path`, { waitUntil: "networkidle", timeout: 60_000 });
    const res = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('a[href^="/lesson/"]')];
      return {
        count: cards.length,
        overflowing: cards
          .filter(
            (a) =>
              a.scrollWidth > a.clientWidth ||
              a.getBoundingClientRect().right > window.innerWidth + 0.5,
          )
          .map((a) => ({
            href: a.getAttribute("href"),
            scrollWidth: a.scrollWidth,
            clientWidth: a.clientWidth,
            right: a.getBoundingClientRect().right,
          })),
        docScrollWidth: document.documentElement.scrollWidth,
        docClientWidth: document.documentElement.clientWidth,
      };
    });
    await page.close();
    assert.ok(res.count > 0, "no lesson cards found on /path");
    assert.deepEqual(res.overflowing, [], `@${width}px: cards overflow their column`);
    assert.ok(
      res.docScrollWidth <= res.docClientWidth,
      `@${width}px: page scrolls horizontally (${res.docScrollWidth} > ${res.docClientWidth})`,
    );
  }
});

test(
  "m3: Conversas card accessible name contains its visible label in a browser (#110)",
  { timeout: 180_000 },
  async (t) => {
    if (needBrowser(t)) return;
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${base}/practice`, { waitUntil: "networkidle", timeout: 60_000 });
    const info = await page.locator('a[href="/speak"]').evaluate((el) => {
      const norm = (s) => s.replace(/\s+/g, " ").trim();
      // Whitespace-insensitive comparison: textContent concatenates nested spans
      // without spaces, while the leaf join below inserts them at element edges.
      const squash = (s) => norm(s).replace(/\s/g, "");
      const label = el.getAttribute("aria-label");
      // Approximate the accessible name: aria-label wins, otherwise text content.
      const name = norm(label ?? el.textContent ?? "");
      // Visible text computed once: leaf nodes only, so nested spans are not
      // double-counted the way a parent's textContent + children would be.
      const visible = norm(
        [...el.querySelectorAll("h2, p, span:not(.sr-only)")]
          .filter((n) => !n.querySelector("h2, p, span"))
          .map((n) => n.textContent)
          .join(" "),
      );
      return { label, name, visible, squashedName: squash(name), squashedVisible: squash(visible) };
    });
    await page.close();
    assert.equal(info.label, null, "aria-label must not override the card's name");
    assert.ok(info.visible.includes("Conversas"), "visible label present");
    assert.ok(
      info.squashedName.includes(info.squashedVisible) ||
        info.squashedVisible.includes(info.squashedName),
      `accessible name "${info.name}" does not contain the visible text "${info.visible}"`,
    );
  },
);

test("m4: 404 view's Home link navigates back (#110)", { timeout: 180_000 }, async (t) => {
  if (needBrowser(t)) return;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const resp = await page.goto(`${base}/nope-404-issue-110`, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  assert.equal(resp?.status(), 404);
  await page.getByRole("link", { name: /Back to Today/ }).click();
  await page.waitForURL(`${base}/`, { timeout: 15_000 });
  assert.equal(new URL(page.url()).pathname, "/");
  await page.close();
});

// ------------------------------------------------------- #134 social scenes (ADR 0018)

test(
  "s1 (#134): /speak renders one h1, the Cenas sociais h2 after it, and a register pill per social card",
  { timeout: 180_000 },
  async () => {
    const { status, body } = await get("/speak");
    assert.equal(status, 200);
    assert.equal((body.match(/<h1[\s>]/g) ?? []).length, 1, "exactly one h1");
    assert.ok(body.includes("Cenas sociais"), "social section header missing");
    assert.ok(body.indexOf("<h2") > body.indexOf("<h1"), "h2 must come after the h1");
    const pills = body.match(/bg-accent px-2 py-0\.5[^>]*>(tu|você)</g) ?? [];
    assert.ok(pills.length >= 5, `expected >= 5 register pills, got ${pills.length}: ${pills}`);
  },
);

test("s2 (#134): /speak at 390px has no horizontal overflow and shows the register pills", { timeout: 180_000 }, async (t) => {
  if (needBrowser(t)) return;
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${base}/speak`, { waitUntil: "networkidle", timeout: 60_000 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  assert.ok(overflow <= 0, `horizontal overflow at 390px: ${overflow}px`);
  const pills = await page.locator('span[class*="rounded-full bg-accent"]').count();
  assert.ok(pills >= 5, `expected >= 5 register pills, got ${pills}`);
  await page.close();
});
