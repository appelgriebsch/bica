/**
 * #28 against the built Worker (`npm run build:cf`, then BICA_BUILT=1): runs
 * it under `wrangler dev` (local workerd, no account) and probes over HTTP.
 * Security headers + nonce CSP on HTML, manifest name, server-function status
 * codes, the CSP report sink, and `/` rendering the home page (not Not Found).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { STATIC_SECURITY_HEADERS } from "../src/lib/security-headers.mjs";

const skip = !process.env.BICA_BUILT && "set BICA_BUILT=1 after npm run build:cf";
const root = fileURLToPath(new URL("..", import.meta.url));
const HOST = "bica-staging.appelgriebsch.workers.dev";
// Server-function ids are content hashes of file + export name (stable across builds).
const FNS = {
  fetchProgress: "b6bdbb42b54a50022135003565247329e49dfefe10c3c50e5112907dea6f160b",
  saveLessonProgress: "5ad1aca74ebc7df070b50ea731a261d32a18cd56aca5a1812d1501075841d06a",
  saveProgressSnapshot: "af57669d5ec8bdac9ada812c4dd1ae6c5b27e4b2b4438c549de2303c0df006af",
};
// What the TanStack client sends for `{ data: undefined }`.
const VALID_PAYLOAD =
  '{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":2,"s":1}]},"o":0},"f":127,"m":[]}';

let base, proc, state;

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

before(async () => {
  if (skip) return;
  const port = await freePort();
  state = mkdtempSync(join(tmpdir(), "bica-wd-"));
  proc = spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--config",
      "wrangler.toml",
      "--ip",
      "127.0.0.1",
      "--port",
      String(port),
      "--persist-to",
      state,
      "--show-interactive-dev-session=false",
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
  let log = "";
  proc.stdout.on("data", (d) => (log += d));
  proc.stderr.on("data", (d) => (log += d));
  base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    const ok = await fetch(`${base}/api/ping`).then(
      (r) => r.status === 204,
      () => false,
    );
    if (ok) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev did not start:\n${log}`);
});

after(() => {
  if (proc) process.kill(-proc.pid, "SIGTERM");
  if (state) rmSync(state, { recursive: true, force: true });
});

const get = (path, headers = {}) =>
  fetch(base + path, {
    headers: { host: HOST, accept: "text/html", ...headers },
    redirect: "manual",
  });

const callFn = (id, body, headers = {}) =>
  fetch(`${base}/_serverFn/${id}`, {
    method: "POST",
    body,
    headers: {
      "x-tsr-serverfn": "true",
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
      origin: base,
      ...headers,
    },
  });

for (const path of ["/", "/login", "/practice"]) {
  test(`${path}: security headers and a nonce CSP matching every script`, { skip }, async () => {
    const res = await get(path);
    assert.equal(res.status, 200);
    for (const [k, v] of Object.entries(STATIC_SECURITY_HEADERS)) {
      assert.equal(res.headers.get(k), v, k);
    }
    const csp = res.headers.get("content-security-policy-report-only");
    assert.ok(csp, "Report-Only CSP");
    assert.equal(res.headers.get("content-security-policy"), null, "not enforced on staging yet");
    const nonce = /'nonce-([^']+)'/.exec(csp)?.[1];
    assert.ok(nonce);
    assert.match(csp, /worker-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    const html = await res.text();
    const scripts = html.match(/<script\b[^>]*>/g) ?? [];
    assert.ok(scripts.length >= 3, "inline + module scripts present");
    for (const tag of scripts) assert.ok(tag.includes(`nonce="${nonce}"`), tag);
    assert.doesNotMatch(html, /Grok App/);
    // Zod's eval probe is off before any module script runs (no CSP eval report).
    const jitless = html.indexOf("__zod_globalConfig={jitless:true}");
    assert.ok(jitless > 0 && jitless < html.indexOf('type="module"'), "zod jitless first");
  });
}

test(
  "/ renders the home page, not the Not Found fallback; unknown paths 404",
  { skip },
  async () => {
    const home = await (await get("/")).text();
    assert.doesNotMatch(home, /<p>Not Found<\/p>/);
    assert.match(home, /<title>Bica<\/title>/);
    assert.equal((await get("/nope-404")).status, 404);
  },
);

test("each response gets a fresh nonce", { skip }, async () => {
  const a = (await get("/")).headers.get("content-security-policy-report-only");
  const b = (await get("/")).headers.get("content-security-policy-report-only");
  assert.notEqual(a, b);
});

test("static assets get the _headers security headers", { skip }, async () => {
  const res = await get("/favicon.svg", { accept: "*/*" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("x-frame-options"), "DENY");
});

test("manifest is named Bica on a workers.dev host", { skip }, async () => {
  const res = await get("/__grok/manifest.webmanifest", { accept: "*/*" });
  const manifest = await res.json();
  assert.equal(manifest.name, "Bica");
  assert.equal(manifest.short_name, "Bica");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

for (const [name, id] of Object.entries(FNS)) {
  test(`${name}: signed out 401, bad body 400, cross-site 403`, { skip }, async () => {
    const signedOut = await callFn(id, VALID_PAYLOAD);
    assert.equal(signedOut.status, 401);
    assert.match(await signedOut.text(), /Unauthorized/);

    for (const bad of ['{"bogus":1', '{"t":99}', "not json"]) {
      const res = await callFn(id, bad);
      assert.equal(res.status, 400, bad);
      assert.deepEqual(await res.json(), { error: "invalid_input" });
    }

    const cross = await callFn(id, VALID_PAYLOAD, {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "cors",
      origin: "https://evil.example",
    });
    assert.equal(cross.status, 403);
  });
}

test("CSP reports are accepted with 204", { skip }, async () => {
  const res = await fetch(`${base}/api/csp-report`, {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: JSON.stringify({ "csp-report": { "violated-directive": "script-src" } }),
  });
  assert.equal(res.status, 204);
});
