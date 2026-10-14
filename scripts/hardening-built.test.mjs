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
// Since #33 sendChat is the only server function.
const SEND_CHAT = "a6c1db121df31c780863651ffdf226f842441dec27cf2216ec61f708eb327331";
// What the TanStack client (seroval) sends for `{ data: undefined }`.
const NO_DATA = '{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":2,"s":1}]},"o":0},"f":127,"m":[]}';
// ...and for `{ data: { scenarioId: "pastelaria", messages: [{ role: "user", content: "Olá" }] } }`.
const CHAT_TURN =
  '{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":10,"i":1,"p":{"k":["scenarioId","messages"],"v":[{"t":1,"s":"pastelaria"},{"t":9,"i":2,"a":[{"t":10,"i":3,"p":{"k":["role","content"],"v":[{"t":1,"s":"user"},{"t":1,"s":"Olá"}]},"o":0}],"o":0}]},"o":0}]},"o":0},"f":127,"m":[]}';

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

for (const path of ["/", "/me", "/practice"]) {
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

// Staging smoke probes with `curl -I`; HEAD must carry the same headers as GET.
for (const path of ["/", "/me"]) {
  test(`HEAD ${path}: same security headers and nonce CSP as GET`, { skip }, async () => {
    const res = await fetch(base + path, {
      method: "HEAD",
      headers: { host: HOST, accept: "text/html" },
      redirect: "manual",
    });
    assert.equal(res.status, 200);
    for (const [k, v] of Object.entries(STATIC_SECURITY_HEADERS)) {
      assert.equal(res.headers.get(k), v, k);
    }
    assert.match(res.headers.get("content-security-policy-report-only") ?? "", /'nonce-[^']+'/);
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

test("#33: /login and /api/auth/* are 404 (GET and POST); / has no Sign in", { skip }, async () => {
  for (const path of ["/login", "/api/auth/get-session", "/api/auth/sign-in/social", "/auth/popup"]) {
    assert.equal((await get(path)).status, 404, `GET ${path}`);
  }
  const post = await fetch(`${base}/api/auth/sign-in/social`, {
    method: "POST",
    headers: { host: HOST, "content-type": "application/json" },
    body: "{}",
  });
  assert.equal(post.status, 404, "POST /api/auth/sign-in/social");
  for (const path of ["/", "/me", "/speak"]) {
    assert.doesNotMatch(await (await get(path)).text(), /Sign in|href="\/login"/, path);
  }
});

test("#33: the CSP names no auth broker; COOP is plain same-origin", { skip }, async () => {
  const res = await get("/");
  const csp = res.headers.get("content-security-policy-report-only") ?? "";
  assert.match(csp, /form-action 'self';/);
  assert.doesNotMatch(csp, /auth\.grok\.me/);
  assert.equal(res.headers.get("cross-origin-opener-policy"), "same-origin");
});

test("#33: sendChat without sign-in answers 'temporarily unavailable'; bad bodies 400", { skip }, async () => {
  // No session or cookie: the flag refuses before xAI.
  const res = await callFn(SEND_CHAT, CHAT_TURN);
  const text = await res.text();
  assert.equal(res.status, 200, text);
  assert.match(text, /Conversas is temporarily unavailable\./);
  // TanStack still refuses a cross-site server-function call on its own.
  const cross = await callFn(SEND_CHAT, CHAT_TURN, {
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "cors",
    origin: "https://evil.example",
  });
  assert.equal(cross.status, 403);
  assert.doesNotMatch(await cross.text(), /temporarily unavailable|"ok":true/);
  // The validator (no data) → 400 via serverFnErrors; the message is invalid_input.
  const noData = await callFn(SEND_CHAT, NO_DATA);
  assert.equal(noData.status, 400);
  assert.match(await noData.text(), /"invalid_input"/);
  for (const bad of ['{"bogus":1', '{"t":99}', "not json"]) {
    const res = await callFn(SEND_CHAT, bad);
    assert.equal(res.status, 400, bad);
    assert.deepEqual(await res.json(), { error: "invalid_input" });
  }
});

test("CSP reports are accepted with 204", { skip }, async () => {
  const res = await fetch(`${base}/api/csp-report`, {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: JSON.stringify({ "csp-report": { "violated-directive": "script-src" } }),
  });
  assert.equal(res.status, 204);
});

test("CSP reports over 8 KB get 413", { skip }, async () => {
  const res = await fetch(`${base}/api/csp-report`, {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: "x".repeat(8 * 1024 + 1),
  });
  assert.equal(res.status, 413);
});
