/**
 * #28 against the built Worker (`npm run build:cf`, then BICA_BUILT=1): runs
 * it under `wrangler dev` (local workerd, no account) and probes over HTTP.
 * Security headers + nonce CSP on HTML, manifest name, server-function status
 * codes, the CSP report sink, and `/` rendering the home page (not Not Found).
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { STATIC_SECURITY_HEADERS } from "../src/lib/security-headers.mjs";
import { resolveBuildShaFull } from "./build-sha.mjs";

const skip = !process.env.BICA_BUILT && "set BICA_BUILT=1 after npm run build:cf";
const root = fileURLToPath(new URL("..", import.meta.url));
const HOST = "bica-staging.appelgriebsch.workers.dev";
const PROD_HOST = "bica.appelgriebsch.org";
// Server-function ids are content hashes of file + export name (stable across builds).
// Since #33 sendChat is the only server function.
const SEND_CHAT = "a6c1db121df31c780863651ffdf226f842441dec27cf2216ec61f708eb327331";
// What the TanStack client (seroval) sends for `{ data: undefined }`.
const NO_DATA = '{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":2,"s":1}]},"o":0},"f":127,"m":[]}';
// ...and for `{ data: { scenarioId: "pastelaria", messages: [{ role: "user", content: "Olá" }] } }`.
const CHAT_TURN =
  '{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":10,"i":1,"p":{"k":["scenarioId","messages"],"v":[{"t":1,"s":"pastelaria"},{"t":9,"i":2,"a":[{"t":10,"i":3,"p":{"k":["role","content"],"v":[{"t":1,"s":"user"},{"t":1,"s":"Olá"}]},"o":0}],"o":0}]},"o":0}]},"o":0},"f":127,"m":[]}';

let base, proc, state, prodBase, prodProc, prodState;

const freePort = () =>
  new Promise((resolve) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

function spawnWorker(port, inspectorPort, dir, extraVars) {
  return spawn(
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
      // CI probes only 9229. Two dev servers started together both take it.
      "--inspector-port",
      String(inspectorPort),
      "--persist-to",
      dir,
      "--show-interactive-dev-session=false",
      // #35: fake key + Cloudflare's always-fails Turnstile test secret, so
      // sendChat reaches the gate (and can never reach xAI).
      "--var",
      "XAI_API_KEY:sk-test-not-a-real-key",
      "--var",
      "TURNSTILE_SECRET_KEY:2x0000000000000000000000000000000AA",
      "--var",
      "CHAT_SESSION_SECRET:built-test-session-secret-0123456789",
      "--var",
      "TURNSTILE_HOSTNAMES:bica-staging.appelgriebsch.workers.dev",
      ...extraVars.flatMap((v) => ["--var", v]),
    ],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"], detached: true },
  );
}

async function waitForPing(child, url) {
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  for (let i = 0; i < 120; i++) {
    const ok = await fetch(`${url}/api/ping`).then(
      (r) => r.status === 204,
      () => false,
    );
    if (ok) return;
    if (child.exitCode != null) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev did not start:\n${log.slice(-4000)}`);
}

function httpGet(url, headers) {
  const u = new URL(url);
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { hostname: "127.0.0.1", port: u.port, path: `${u.pathname}${u.search}`, headers },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    req.on("error", reject);
    req.end();
  });
}

before(async () => {
  if (skip) return;
  const [port, prodPort, inspector, prodInspector] = await Promise.all([
    freePort(),
    freePort(),
    freePort(),
    freePort(),
  ]);
  state = mkdtempSync(join(tmpdir(), "bica-wd-"));
  prodState = mkdtempSync(join(tmpdir(), "bica-wd-"));
  base = `http://127.0.0.1:${port}`;
  prodBase = `http://127.0.0.1:${prodPort}`;
  // Assign before the wait so after() can kill a worker that never becomes ready.
  proc = spawnWorker(port, inspector, state, [`BICA_STAGE:staging`, `PUBLIC_HOSTNAME:${HOST}`]);
  prodProc = spawnWorker(prodPort, prodInspector, prodState, [
    "BICA_STAGE:production",
    `PUBLIC_HOSTNAME:${PROD_HOST}`,
  ]);
  await Promise.all([waitForPing(proc, base), waitForPing(prodProc, prodBase)]);
});

after(() => {
  for (const child of [proc, prodProc]) {
    if (child) {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        // already gone
      }
    }
  }
  if (state) rmSync(state, { recursive: true, force: true });
  if (prodState) rmSync(prodState, { recursive: true, force: true });
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

test(
  "#51: one build serves both public hosts; health sha matches the injected id",
  { skip },
  async () => {
    // This suite does not rebuild. The sha matches when this process sees the same
    // BICA_BUILD_SHA / git HEAD / GITHUB_SHA the build used (CI builds, then tests).
    // The about page's short SHA is checked in about.test.mjs against the built JS.
    const full = resolveBuildShaFull();
    for (const [origin, stage, publicHost] of [
      [base, "staging", HOST],
      [prodBase, "production", PROD_HOST],
    ]) {
      const health = await fetch(`${origin}/api/health`);
      assert.equal(health.status, 200, stage);
      assert.equal(health.headers.get("cache-control"), "no-store", stage);
      assert.equal(health.headers.get("content-type"), "application/json; charset=utf-8", stage);
      assert.equal(await health.text(), JSON.stringify({ ok: true, stage, sha: full }), stage);
      // A different Host must not override the wrangler var.
      const page = await httpGet(`${origin}/`, {
        host: "not-the-public.example",
        accept: "text/html",
      });
      assert.equal(page.status, 200, stage);
      assert.match(
        page.body,
        new RegExp(`property="og:image" content="https://${publicHost}/og\\.jpg"`),
        stage,
      );
      const manifest = await httpGet(`${origin}/__grok/manifest.webmanifest`, {
        host: "not-the-public.example",
        accept: "*/*",
      });
      assert.equal(JSON.parse(manifest.body).id, `https://${publicHost}/`, stage);
    }
  },
);

test("manifest is named Bica on a workers.dev host", { skip }, async () => {
  const res = await get("/__grok/manifest.webmanifest", { accept: "*/*" });
  const manifest = await res.json();
  assert.equal(manifest.name, "Bica");
  assert.equal(manifest.short_name, "Bica");
  assert.equal(manifest.background_color, "#f3eee6");
  assert.equal(manifest.theme_color, "#1E4D73");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
});

test("GET / serves both theme-color metas and no black one", { skip }, async () => {
  const html = await (await get("/")).text();
  const tags = html.match(/<meta\b[^>]*\bname="theme-color"[^>]*>/g) ?? [];
  assert.equal(tags.length, 2);
  assert.ok(
    tags.some(
      (tag) =>
        tag.includes('content="#1E4D73"') && tag.includes('media="(prefers-color-scheme: light)"'),
    ),
  );
  assert.ok(
    tags.some(
      (tag) =>
        tag.includes('content="#141922"') && tag.includes('media="(prefers-color-scheme: dark)"'),
    ),
  );
  assert.ok(tags.every((tag) => tag.includes("media=")));
  assert.doesNotMatch(html, /content="#000000"/);
});

test("#33: /login and /api/auth/* are 404 (GET and POST); / has no Sign in", { skip }, async () => {
  for (const path of [
    "/login",
    "/api/auth/get-session",
    "/api/auth/sign-in/social",
    "/auth/popup",
  ]) {
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

test(
  "#35: sendChat without a Turnstile token or cookie → 403; bad tokens 403; bad bodies 400",
  { skip },
  async () => {
    // No token, no cookie: the gate refuses before the limiter and xAI.
    const res = await callFn(SEND_CHAT, CHAT_TURN);
    const text = await res.text();
    assert.equal(res.status, 403, text);
    assert.match(text, /challenge_required/);
    assert.equal(res.headers.get("set-cookie"), null);
    // A forged cookie doesn't help.
    const forged = await callFn(SEND_CHAT, CHAT_TURN, {
      cookie: "bica_chat=v1.99999999999999.1.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    });
    assert.equal(forged.status, 403);
    // A token the (always-fails test) secret rejects: 403 and no session cookie.
    // Offline, siteverify fails closed with the same answer.
    const withToken = CHAT_TURN.replace(
      '"k":["scenarioId","messages"],"v":[{"t":1,"s":"pastelaria"},',
      '"k":["scenarioId","turnstileToken","messages"],"v":[{"t":1,"s":"pastelaria"},{"t":1,"s":"XXXX.DUMMY.TOKEN.XXXX"},',
    );
    assert.notEqual(withToken, CHAT_TURN);
    const bad = await callFn(SEND_CHAT, withToken);
    assert.equal(bad.status, 403, await bad.clone().text());
    assert.match(await bad.text(), /challenge_required/);
    assert.equal(bad.headers.get("set-cookie"), null);
    // TanStack still refuses a cross-site server-function call on its own.
    const cross = await callFn(SEND_CHAT, CHAT_TURN, {
      "sec-fetch-site": "cross-site",
      "sec-fetch-mode": "cors",
      origin: "https://evil.example",
    });
    assert.equal(cross.status, 403);
    assert.doesNotMatch(await cross.text(), /challenge_required|"ok":true/);
    // The validator (no data) → 400 via serverFnErrors; the message is invalid_input.
    const noData = await callFn(SEND_CHAT, NO_DATA);
    assert.equal(noData.status, 400);
    assert.match(await noData.text(), /"invalid_input"/);
    for (const bad of ['{"bogus":1', '{"t":99}', "not json"]) {
      const res = await callFn(SEND_CHAT, bad);
      assert.equal(res.status, 400, bad);
      assert.deepEqual(await res.json(), { error: "invalid_input" });
    }
  },
);

test(
  "#35: the CSP allows Turnstile (script, frame, connect) and no other third party",
  { skip },
  async () => {
    const csp =
      (await get("/speak/pastelaria")).headers.get("content-security-policy-report-only") ?? "";
    assert.match(
      csp,
      /script-src 'self' 'nonce-[^']+' 'strict-dynamic' https:\/\/challenges\.cloudflare\.com;/,
    );
    assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com;/);
    assert.match(csp, /connect-src 'self' https:\/\/challenges\.cloudflare\.com;/);
    const hosts = new Set(csp.match(/https:\/\/[^\s;]+/g));
    assert.deepEqual([...hosts].sort(), [
      "https://challenges.cloudflare.com",
      "https://og.grok.me",
    ]);
  },
);

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
