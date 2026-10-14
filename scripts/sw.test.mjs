/**
 * #28: every respondWith in public/sw.js resolves to a Response, offline too.
 * Runs the real sw.js in a vm with fake `caches`, `fetch` and `self`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

const SOURCE = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://bica.test";
const SHELL_HTML = "<!doctype html><title>Bica</title>";

/** Load sw.js with PRECACHE filled; `cached` maps path → body in the precache. */
function loadSw({
  precache = ["/_shell", "/assets/app.js"],
  cached = {},
  online = false,
  runtimeSeed = {},
} = {}) {
  const code = SOURCE.replace(
    "const PRECACHE = [];",
    `const PRECACHE = ${JSON.stringify(precache)};`,
  );
  const listeners = {};
  const runtime = new Map(
    Object.entries(runtimeSeed).map(([p, body]) => [ORIGIN + p, new Response(body)]),
  );
  const caches = {
    match: async (path) =>
      path in cached
        ? new Response(cached[path], { headers: { "content-type": "application/octet-stream" } })
        : undefined,
    open: async () => ({
      match: async (req) => runtime.get(req.url),
      put: async (req, res) => void runtime.set(req.url, res),
    }),
    keys: async () => [],
    delete: async () => true,
  };
  const fetch = async (req) => {
    if (!online) throw new TypeError("Failed to fetch");
    return new Response(`net:${new URL(req.url).pathname}`, { status: 200 });
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => (listeners[type] = fn),
    clients: {},
  };
  vm.runInNewContext(code, {
    self,
    caches,
    fetch,
    URL,
    Request,
    Response,
    Promise,
    Set,
    setTimeout: (fn, ms) => setTimeout(fn, ms).unref(),
    console,
  });
  return { listeners, runtime };
}

/** Dispatch a fetch event; returns what respondWith got (undefined if not called). */
async function dispatch(sw, path, { mode = "cors", accept = "*/*", destination = "" } = {}) {
  const req = new Request(ORIGIN + path, { headers: { accept } });
  Object.defineProperty(req, "mode", { value: mode });
  Object.defineProperty(req, "destination", { value: destination });
  let responded;
  sw.listeners.fetch({ request: req, respondWith: (p) => (responded = p) });
  if (responded === undefined) return undefined;
  const res = await responded; // a rejection fails the test, as it fails respondWith
  assert.ok(res instanceof Response, `respondWith(${path}) got ${res}`);
  return res;
}

test("offline navigation to /me gets the shell", async () => {
  const sw = loadSw({ cached: { "/_shell": SHELL_HTML } });
  const res = await dispatch(sw, "/me", { mode: "navigate", accept: "text/html" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "text/html; charset=utf-8");
  assert.equal(await res.text(), SHELL_HTML);
});

test("offline non-navigate fetch of /me with Accept: text/html gets the shell", async () => {
  const sw = loadSw({ cached: { "/_shell": SHELL_HTML } });
  const res = await dispatch(sw, "/me", { accept: "text/html,*/*;q=0.8" });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), SHELL_HTML);
});

test("offline HTML fetch without a cached shell is a 503 page, not undefined", async () => {
  const sw = loadSw();
  const res = await dispatch(sw, "/me", { accept: "text/html" });
  assert.equal(res.status, 503);
});

test("offline uncached JSON/image GET resolves to a 503 Response", async () => {
  const sw = loadSw();
  for (const [path, accept] of [
    ["/data.json", "application/json"],
    ["/scenes/new.jpg", "image/*"],
  ]) {
    const res = await dispatch(sw, path, { accept });
    assert.equal(res.status, 503, path);
    assert.equal(res.statusText, "Offline");
  }
});

test("offline precached entry missing from the cache gives a 503, not a rejection", async () => {
  const sw = loadSw({ precache: ["/_shell", "/assets/app.css"] });
  const res = await dispatch(sw, "/assets/app.css", { accept: "text/css" });
  assert.equal(res.status, 503);
});

test("stale-while-revalidate still answers from the runtime cache offline", async () => {
  const sw = loadSw({ online: true });
  const first = await dispatch(sw, "/data.json", { accept: "application/json" });
  assert.equal(await first.text(), "net:/data.json");
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(sw.runtime.has(ORIGIN + "/data.json"));
});

test("online: precached hit comes from cache, a page from the network", async () => {
  const sw = loadSw({ online: true, cached: { "/assets/app.js": "cached-js" } });
  const js = await dispatch(sw, "/assets/app.js", { destination: "script" });
  assert.equal(await js.text(), "cached-js");
  const page = await dispatch(sw, "/me", { accept: "text/html" });
  assert.equal(await page.text(), "net:/me");
});

test("network-only and unknown scripts are left to the browser", async () => {
  const sw = loadSw();
  assert.equal(await dispatch(sw, "/api/ping", { accept: "text/html" }), undefined);
  assert.equal(await dispatch(sw, "/other.js", { destination: "script" }), undefined);
});

test("an HTML fetch of an app route is network-first, not a stale runtime-cache hit", async () => {
  const sw = loadSw({ online: true, runtimeSeed: { "/me": "stale" } });
  const res = await dispatch(sw, "/me", { accept: "text/html" });
  assert.equal(await res.text(), "net:/me");
});

test("#35: Turnstile (cross-origin) and the sendChat POST are never cached or answered by the SW", async () => {
  const sw = loadSw({ online: false });
  for (const [url, destination, accept] of [
    ["https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", "script", "*/*"],
    [
      "https://challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/x",
      "iframe",
      "text/html",
    ],
  ]) {
    const req = new Request(url, { headers: { accept } });
    Object.defineProperty(req, "mode", {
      value: destination === "iframe" ? "navigate" : "no-cors",
    });
    Object.defineProperty(req, "destination", { value: destination });
    let responded;
    sw.listeners.fetch({ request: req, respondWith: (p) => (responded = p) });
    assert.equal(responded, undefined, url);
  }
  const post = new Request(ORIGIN + "/_serverFn/x", { method: "POST", body: "{}" });
  let responded;
  sw.listeners.fetch({ request: post, respondWith: (p) => (responded = p) });
  assert.equal(responded, undefined);
  assert.doesNotMatch(SOURCE, /challenges\.cloudflare\.com/);
});
