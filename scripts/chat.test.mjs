/**
 * Conversas (#13, #35): the per-IP burst and daily budget (Durable Object
 * logic), the Turnstile gate and session cookie, sendChat end to end with a
 * mocked siteverify / Mistral / bindings, chatTurn's timeout and caps, and the
 * input validator. TS sources bundled with rolldown.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { build } from "rolldown";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".chat-test-"));
const bundle = await build({
  input: "entry",
  cwd: root,
  write: false,
  platform: "node",
  resolve: { alias: { "@": join(root, "src") } },
  external: ["zod"],
  transform: { define: { "import.meta.env.DEV": "false", "import.meta.env.TURNSTILE_SITE_KEY": "\"\"" } },
  plugins: [
    {
      name: "entry",
      resolveId: (id) => (id === "entry" ? "\0entry" : null),
      load: (id) =>
        id === "\0entry"
          ? `export * from "@/lib/chat-limit"; export * from "@/lib/chat-core";
             export * from "@/lib/chat-gate"; export * from "@/lib/chat-budget.mjs";
             export * from "@/lib/chat-messages"; export * from "@/lib/turnstile";`
          : null,
    },
    {
      name: "no-glob",
      transform: (code) =>
        code.includes("import.meta.glob")
          ? code.replace(/import\.meta\.glob\(/, "((..._) => ({}))(")
          : null,
    },
  ],
  output: { format: "esm" },
});
const file = join(tmp, "entry.mjs");
writeFileSync(file, bundle.output[0].code);
const m = await import(pathToFileURL(file).href);

after(() => {
  delete globalThis.__env__;
  rmSync(tmp, { recursive: true, force: true });
});

const T0 = Date.UTC(2026, 9, 14, 10, 0, 0);
const MIDNIGHT = Date.UTC(2026, 9, 15);
const TO_MIDNIGHT = (MIDNIGHT - T0) / 1000;

// ---- per-IP key ---------------------------------------------------------

test("ipKey: IPv4 as is, IPv6 by /64, mapped IPv4, missing → unknown", () => {
  assert.equal(m.ipKey("203.0.113.7"), "203.0.113.7");
  assert.equal(m.ipKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), "2001:db8:1:2::/64");
  assert.equal(m.ipKey("2001:DB8:0001:0002::1"), "2001:db8:1:2::/64");
  assert.equal(m.ipKey("2001:db8::1"), "2001:db8:0:0::/64");
  assert.equal(m.ipKey("::1"), "0:0:0:0::/64");
  assert.equal(m.ipKey("2001:db8:1:2::"), "2001:db8:1:2::/64");
  assert.equal(m.ipKey("::ffff:198.51.100.9"), "198.51.100.9");
  // two hosts in one /64 share a bucket; different /64s don't
  assert.equal(m.ipKey("2001:db8:1:2::a"), m.ipKey("2001:db8:1:2:ffff::b"));
  assert.notEqual(m.ipKey("2001:db8:1:2::a"), m.ipKey("2001:db8:1:3::a"));
  for (const v of [undefined, null, "", "  "]) assert.equal(m.ipKey(v), "unknown");
});

// ---- burst --------------------------------------------------------------

test("burst: memory per minute per key; the binding is used when present, keyed by IP", async () => {
  const b = m.memoryBurst(2);
  assert.deepEqual(
    [await b("a", T0), await b("a", T0 + 1), await b("a", T0 + 2)],
    [true, true, false],
  );
  assert.equal(await b("b", T0), true);
  assert.equal(await b("a", T0 + 60_000), true);
  const keys = [];
  globalThis.__env__ = {
    CHAT_RATE: { limit: async ({ key }) => (keys.push(key), { success: false }) },
  };
  try {
    assert.equal(await m.chatLimiter().burst("203.0.113.7", T0), false);
    assert.deepEqual(keys, ["203.0.113.7"]);
  } finally {
    delete globalThis.__env__;
  }
  assert.equal(await m.chatLimiter().burst("zz", T0), true); // memory fallback
  assert.deepEqual(keys, ["203.0.113.7"]);
  assert.equal(m.DEFAULT_LIMITS.perMinute, 6);
});

test("checkChatLimit: a burst refusal is 60 s and never touches the daily budget", async () => {
  const never = async () => assert.fail("budget reached after a burst refusal");
  assert.deepEqual(
    await m.checkChatLimit("a", T0, {
      burst: async () => false,
      budget: never,
      limits: m.DEFAULT_LIMITS,
    }),
    { ok: false, retryAfter: 60, scope: "burst" },
  );
  const seen = [];
  const budget = async (k, now, l) => (
    seen.push([k, now, l]),
    { ok: false, scope: "global_day", retryAfter: 5 }
  );
  const limits = { perMinute: 6, dailyGlobal: 9, dailyPerIp: 3 };
  assert.deepEqual(await m.checkChatLimit("a", T0, { burst: async () => true, budget, limits }), {
    ok: false,
    retryAfter: 5,
    scope: "global_day",
  });
  assert.deepEqual(seen, [["a", T0, { global: 9, perIp: 3 }]]);
});

// ---- daily budget (Durable Object logic) --------------------------------

const daily = { global: 5, perIp: 2 };
const store = () => m.memoryStorage();

test("budget: per-IP daily cap → ip_day with seconds to UTC midnight; other IPs unaffected", async () => {
  const s = store();
  assert.deepEqual(await m.takeBudget(s, "a", T0, daily), { ok: true });
  assert.deepEqual(await m.takeBudget(s, "a", T0 + 1, daily), { ok: true });
  assert.deepEqual(await m.takeBudget(s, "a", T0 + 2, daily), {
    ok: false,
    scope: "ip_day",
    retryAfter: TO_MIDNIGHT,
  });
  assert.deepEqual(await m.takeBudget(s, "b", T0 + 3, daily), { ok: true });
  assert.equal(await s.get("global"), 3); // the refusal didn't count
});

test("budget: global daily cap → global_day; refusals use no per-IP turns", async () => {
  const s = store();
  for (const ip of ["a", "a", "b", "b", "c"])
    assert.equal((await m.takeBudget(s, ip, T0, daily)).ok, true);
  assert.deepEqual(await m.takeBudget(s, "d", T0 + 1000, daily), {
    ok: false,
    scope: "global_day",
    retryAfter: TO_MIDNIGHT - 1,
  });
  assert.equal(await s.get("ip:d"), undefined);
  assert.equal(await s.get("global"), 5);
});

test("budget: day rollover at 00:00 UTC resets both caps and drops old keys", async () => {
  const s = store();
  for (const ip of ["a", "a", "b", "b", "c"]) await m.takeBudget(s, ip, T0, daily);
  assert.equal((await m.takeBudget(s, "a", MIDNIGHT - 1, daily)).ok, false);
  assert.deepEqual(await m.takeBudget(s, "a", MIDNIGHT, daily), { ok: true });
  assert.equal(await s.get("global"), 1);
  assert.equal(await s.get("ip:b"), undefined);
  assert.equal(await s.get("day"), MIDNIGHT);
  assert.equal(m.secondsToMidnight(MIDNIGHT - 1), 1);
  assert.equal(m.secondsToMidnight(MIDNIGHT), 86_400);
  assert.deepEqual(m.DEFAULT_DAILY, { global: 2000, perIp: 60 });
});

/** DO-like storage whose every call yields for a random few ms. */
function slowStorage() {
  const map = new Map();
  const tick = () => new Promise((r) => setTimeout(r, Math.random() * 3));
  return {
    map,
    get: async (k) => (await tick(), map.get(k)),
    put: async (k, v) => (await tick(), void map.set(k, v)),
    deleteAll: async () => (await tick(), void map.clear()),
  };
}
const Stub = class {
  constructor(ctx) {
    this.ctx = ctx;
  }
};

test("ChatBudget DO: the global cap holds under 60 concurrent turns (serialized take)", async () => {
  const Budget = m.makeChatBudget(Stub);
  const storage = slowStorage();
  const doObj = new Budget({ storage });
  const results = await Promise.all(
    Array.from({ length: 60 }, (_, i) => doObj.take(`ip${i % 30}`, T0, { global: 25, perIp: 60 })),
  );
  assert.equal(results.filter((r) => r.ok).length, 25);
  assert.equal(storage.map.get("global"), 25);
  // and per IP: 20 concurrent turns from one address, cap 4
  const one = new Budget({ storage: slowStorage() });
  const mine = await Promise.all(
    Array.from({ length: 20 }, () => one.take("x", T0, { global: 100, perIp: 4 })),
  );
  assert.equal(mine.filter((r) => r.ok).length, 4);
  // a failing call doesn't wedge the queue
  const bad = new Budget({
    storage: {
      ...slowStorage(),
      get: async () => {
        throw new Error("io");
      },
    },
  });
  await assert.rejects(bad.take("x", T0, daily));
  bad.ctx.storage = slowStorage();
  assert.deepEqual(await bad.take("x", T0, daily), { ok: true });
});

test("budget wiring: the CHAT_BUDGET binding (one global instance) when present, else memory", async () => {
  const calls = [];
  globalThis.__env__ = {
    CHAT_BUDGET: {
      idFromName: (n) => `id:${n}`,
      get: (id) => ({ take: async (...a) => (calls.push([id, ...a]), { ok: true }) }),
    },
  };
  try {
    assert.deepEqual(await m.chatLimiter().budget("a", T0, daily), { ok: true });
    assert.deepEqual(calls, [["id:global", "a", T0, daily]]);
  } finally {
    delete globalThis.__env__;
  }
  const mem = m.chatLimiter().budget;
  const l = { global: 1000, perIp: 1 };
  assert.deepEqual(await mem("wiring", T0, l), { ok: true });
  assert.equal((await mem("wiring", T0 + 1, l)).scope, "ip_day"); // one per isolate, shared
  assert.equal(calls.length, 1);
});

test("limits: CHAT_DAILY_GLOBAL / CHAT_DAILY_PER_IP override, bad values ignored", () => {
  assert.deepEqual(m.limitsFromEnv({}), m.DEFAULT_LIMITS);
  assert.deepEqual(m.limitsFromEnv({ CHAT_DAILY_GLOBAL: "500", CHAT_DAILY_PER_IP: "10" }), {
    perMinute: 6,
    dailyGlobal: 500,
    dailyPerIp: 10,
  });
  assert.deepEqual(
    m.limitsFromEnv({ CHAT_DAILY_GLOBAL: "0", CHAT_DAILY_PER_IP: "x" }),
    m.DEFAULT_LIMITS,
  );
  process.env.CHAT_DAILY_PER_IP = "7";
  assert.equal(m.chatLimiter().limits.dailyPerIp, 7); // what sendChat uses
  delete process.env.CHAT_DAILY_PER_IP;
  const toml = readFileSync(join(root, "wrangler.toml"), "utf8");
  assert.match(
    toml,
    new RegExp(
      `\\[\\[env\\.staging\\.ratelimits\\]\\]\\nname = "CHAT_RATE"\\nnamespace_id = "\\d+"\\nsimple = \\{ limit = ${m.DEFAULT_LIMITS.perMinute}, period = 60 \\}`,
    ),
  );
});

// ---- Turnstile gate -----------------------------------------------------

const SECRET = m.TURNSTILE_TEST_KEYS.secretAlwaysPasses;
const SESSION = "test-session-secret-0123456789abcdef"; // 32+ bytes
const IP = "203.0.113.7";
const HOST = "bica-staging.appelgriebsch.workers.dev";
const HOSTS = new Set([HOST]);
const verifyOk = async () => Response.json({ success: true, action: "chat", hostname: HOST });
const verifyNo = async () =>
  Response.json({ success: false, "error-codes": ["invalid-input-response"] });
const gate = (o) =>
  m.checkGate({
    token: undefined,
    cookie: undefined,
    firstTurn: false,
    secret: SECRET,
    sessionSecret: SESSION,
    ip: IP,
    bind: IP,
    hostnames: HOSTS,
    now: T0,
    fetch: () => assert.fail("siteverify called"),
    ...o,
  });

test("Turnstile test keys are Cloudflare's documented ones", () => {
  assert.deepEqual(
    { ...m.TURNSTILE_TEST_KEYS },
    {
      siteAlwaysPasses: "1x00000000000000000000AA",
      secretAlwaysPasses: "1x0000000000000000000000000000000AA",
      secretAlwaysFails: "2x0000000000000000000000000000000AA",
    },
  );
});

const never = () => assert.fail("siteverify called");
const answer = (body, init) => async () => Response.json(body, init);
const passed = { success: true, action: "chat", hostname: HOST };

test("verifyTurnstile: canonical POST: form-encoded secret, response, remoteip; 10 s timeout", async () => {
  let req;
  const timeouts = [];
  const realTimeout = AbortSignal.timeout;
  AbortSignal.timeout = (ms) => (timeouts.push(ms), realTimeout.call(AbortSignal, ms));
  try {
    const spy = async (url, init) => ((req = { url, init }), Response.json(passed));
    assert.equal(await m.verifyTurnstile("tok", "sec", "203.0.113.7", HOSTS, spy), true);
  } finally {
    AbortSignal.timeout = realTimeout;
  }
  assert.equal(req.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(req.init.method, "POST");
  assert.equal(req.init.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.ok(req.init.body instanceof URLSearchParams);
  assert.deepEqual(Object.fromEntries(req.init.body), {
    secret: "sec",
    response: "tok",
    remoteip: "203.0.113.7",
  });
  assert.ok(req.init.signal instanceof AbortSignal);
  assert.deepEqual(timeouts, [10_000]);
  assert.equal(m.SITEVERIFY_TIMEOUT_MS, 10_000);
});

test("verifyTurnstile: empty and oversize tokens and an empty allowlist never reach fetch", async () => {
  for (const t of [undefined, "", "x".repeat(2049)]) {
    assert.equal(await m.verifyTurnstile(t, "sec", "1.2.3.4", HOSTS, never), false, String(t?.length));
  }
  assert.equal(await m.verifyTurnstile("x".repeat(2048), "sec", "1.2.3.4", HOSTS, answer(passed)), true);
  assert.equal(await m.verifyTurnstile("tok", "sec", "1.2.3.4", new Set(), never), false);
  assert.equal(m.MAX_TOKEN_LENGTH, 2048);
});

test("verifyTurnstile: requires success === true, action 'chat' and an allowed hostname", async () => {
  const v = (body, init) => m.verifyTurnstile("tok", "sec", undefined, HOSTS, answer(body, init));
  assert.equal(await v(passed), true);
  assert.equal(await v({ ...passed, hostname: "BICA-STAGING.appelgriebsch.workers.dev" }), true);
  assert.equal(await v({ ...passed, success: false, "error-codes": ["invalid-input-response"] }), false);
  assert.equal(await v({ ...passed, success: "true" }), false);
  assert.equal(await v({ ...passed, action: "login" }), false); // wrong action
  assert.equal(await v({ success: true, hostname: HOST }), false); // no action (test keys)
  assert.equal(await v({ ...passed, hostname: "localhost" }), false); // wrong hostname
  assert.equal(await v({ ...passed, hostname: "evil.example" }), false);
  assert.equal(await v({ success: true, action: "chat" }), false); // no hostname
  assert.equal(await v(passed, { status: 500 }), false); // non-OK
  assert.equal(await v(null), false);
  const html = async () => new Response("<html>", { headers: { "content-type": "text/html" } });
  assert.equal(await m.verifyTurnstile("tok", "sec", undefined, HOSTS, html), false);
  const boom = async () => Promise.reject(new TypeError("fetch failed"));
  assert.equal(await m.verifyTurnstile("tok", "sec", undefined, HOSTS, boom), false); // fetch error
});

test("TURNSTILE_HOSTNAMES parsing: comma list, trimmed, lower-cased, empty → none", () => {
  assert.deepEqual([...m.parseHostnames(` ${HOST} , Example.com,,`)], [HOST, "example.com"]);
  assert.equal(m.parseHostnames(undefined).size, 0);
  assert.equal(m.parseHostnames(" , ").size, 0);
  // Spaces are not separators: the whole string is one token, so neither host matches.
  assert.deepEqual([...m.parseHostnames("a.example b.example")], ["a.example b.example"]);
});

test("session cookie: signed, expires, tamper-proof", async () => {
  const c = await m.signSession(SESSION, { exp: T0 + 1000, n: 3 }, IP);
  assert.match(c, /^v1\.\d+\.3\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await m.readSession(SESSION, c, T0, IP), { exp: T0 + 1000, n: 3 });
  assert.equal(await m.readSession(SESSION, c, T0 + 1000, IP), null); // expired
  assert.equal(await m.readSession("other", c, T0, IP), null);
  assert.equal(await m.readSession(SESSION, c.replace(".3.", ".1."), T0, IP), null); // n rewound
  assert.equal(await m.readSession(SESSION, c.replace(/^v1\.\d+/, `v1.${T0 + 9e9}`), T0, IP), null);
  for (const v of [undefined, "", "v1.1.1.x", "garbage"])
    assert.equal(await m.readSession(SESSION, v, T0, IP), null);
});

test("gate: no token and no cookie → refused, siteverify never called", async () => {
  assert.deepEqual(await gate({}), { ok: false });
  assert.deepEqual(await gate({ firstTurn: true }), { ok: false });
});

test("gate: an invalid token → refused, no cookie", async () => {
  assert.deepEqual(await gate({ token: "bad", fetch: verifyNo }), { ok: false });
});

test("gate: a valid token → a 30-min session covering 10 turns", async () => {
  const g = await gate({ token: "good", firstTurn: true, fetch: verifyOk });
  assert.equal(g.ok, true);
  assert.deepEqual(await m.readSession(SESSION, g.cookie, T0, IP), { exp: T0 + 30 * 60_000, n: 1 });
  assert.equal(m.SESSION_TTL_MS, 30 * 60_000);
  let cookie = g.cookie;
  for (let n = 2; n <= 10; n++) {
    const next = await gate({ cookie, now: T0 + n });
    assert.equal(next.ok, true, `turn ${n}`);
    assert.deepEqual(await m.readSession(SESSION, next.cookie, T0, IP), { exp: T0 + 30 * 60_000, n });
    cookie = next.cookie;
  }
  // the 11th turn needs a fresh token
  assert.deepEqual(await gate({ cookie, now: T0 + 11 }), { ok: false });
  const again = await gate({ cookie, token: "t2", now: T0 + 12, fetch: verifyOk });
  assert.deepEqual(await m.readSession(SESSION, again.cookie, T0, IP), {
    exp: T0 + 12 + 30 * 60_000,
    n: 1,
  });
  // and after 30 min the cookie alone is refused
  const fresh = (await gate({ token: "t", fetch: verifyOk })).cookie;
  assert.deepEqual(await gate({ cookie: fresh, now: T0 + 30 * 60_000 }), { ok: false });
});

test("gate: the first turn of a conversation needs a token even with a valid cookie", async () => {
  const cookie = (await gate({ token: "t", fetch: verifyOk })).cookie;
  assert.deepEqual(await gate({ cookie, firstTurn: true }), { ok: false });
  assert.equal((await gate({ cookie, firstTurn: false })).ok, true);
});

test("gate: without CHAT_SESSION_SECRET every turn needs a token and no cookie is set", async () => {
  const cookie = await m.signSession(SESSION, { exp: T0 + 1000, n: 1 }, IP);
  assert.deepEqual(await gate({ sessionSecret: undefined, cookie }), { ok: false });
  assert.deepEqual(await gate({ sessionSecret: undefined, token: "t", fetch: verifyOk }), {
    ok: true,
    cookie: undefined,
  });
});

// ---- sendChat end to end (mocked siteverify, Mistral and bindings) ----------

const MISTRAL = "https://api.mistral.ai/v1/chat/completions";
const MISTRAL_EU = "https://api.eu.mistral.ai/v1/chat/completions";
const ENV = {
  MISTRAL_API_KEY: "sk-test",
  TURNSTILE_SECRET_KEY: SECRET,
  CHAT_SESSION_SECRET: SESSION,
  TURNSTILE_HOSTNAMES: HOST,
};
const reply = () => Response.json({ choices: [{ message: { content: "Olá!" } }] });

/** Runs sendChatHandler with mocked fetch; returns the result, status, headers, cookie and calls. */
async function send({
  data: d = data,
  token,
  cookie,
  ip = "203.0.113.7",
  now = T0,
  env = ENV,
  siteverify = verifyOk,
  bindings,
} = {}) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url) === m.SITEVERIFY_URL) return siteverify(url, init);
    if (String(url) === MISTRAL) return reply();
    return assert.fail(`unexpected fetch ${url}`);
  };
  if (bindings) globalThis.__env__ = bindings;
  const out = { status: 200, headers: {}, cookie: undefined };
  try {
    out.result = await m.sendChatHandler(
      { ...d, ...(token ? { turnstileToken: token } : {}) },
      {
        ip,
        cookie,
        setCookie: (v) => (out.cookie = v),
        setStatus: (s, h = {}) => ((out.status = s), Object.assign(out.headers, h)),
      },
      now,
      env,
    );
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.__env__;
  }
  out.calls = calls;
  out.mistral = calls.filter((u) => u === MISTRAL).length;
  return out;
}
const refuseLimiter = {
  CHAT_RATE: { limit: () => assert.fail("limiter reached") },
  CHAT_BUDGET: { idFromName: () => assert.fail("budget reached") },
};

test("sendChat: no MISTRAL_API_KEY or no TURNSTILE_SECRET_KEY → unavailable, nothing called", async () => {
  for (const env of [
    { ...ENV, MISTRAL_API_KEY: undefined },
    { ...ENV, TURNSTILE_SECRET_KEY: undefined },
    {},
  ]) {
    const r = await send({ env, token: "t", bindings: refuseLimiter });
    assert.deepEqual(r.result, { ok: false, error: m.UNAVAILABLE });
    assert.deepEqual(r.calls, []);
  }
});

test("sendChat: a non-Mistral MISTRAL_API_BASE fails closed before gate, limiter and upstream", async () => {
  const r = await send({
    token: "good",
    bindings: refuseLimiter,
    env: { ...ENV, MISTRAL_API_BASE: "https://evil.example.com/v1" },
  });
  assert.deepEqual(r.result, { ok: false, error: m.UNAVAILABLE });
  assert.deepEqual(r.calls, []);
  assert.equal(r.status, 200);
});

test("sendChat: missing token → 403, no limiter, no Mistral", async () => {
  const r = await send({ bindings: refuseLimiter });
  assert.deepEqual(r.result, { ok: false, error: "challenge_required" });
  assert.equal(r.status, 403);
  assert.deepEqual(r.calls, []);
  assert.equal(r.cookie, undefined);
  // a later turn with no cookie is refused the same way
  const later = await send({
    data: {
      ...data,
      messages: [
        ...data.messages,
        { role: "assistant", content: "Olá" },
        { role: "user", content: "Um café" },
      ],
    },
    bindings: refuseLimiter,
  });
  assert.equal(later.status, 403);
});

test("sendChat: Turnstile replay: the second use of a token gets timeout-or-duplicate → 403", async () => {
  const redeemed = new Set();
  const siteverify = async (_url, init) => {
    const t = init.body.get("response");
    if (redeemed.has(t)) {
      return Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] });
    }
    redeemed.add(t);
    return Response.json(passed);
  };
  const first = await send({ token: "once", siteverify, ip: "198.51.100.201" });
  assert.equal(first.result.ok, true);
  const replay = await send({ token: "once", siteverify, ip: "198.51.100.201", bindings: refuseLimiter });
  assert.equal(replay.status, 403);
  assert.deepEqual(replay.result, { ok: false, error: "challenge_required" });
  assert.equal(replay.mistral, 0);
  assert.equal(replay.cookie, undefined);
});

test("sendChat: empty/oversize token never reaches siteverify; wrong action/hostname, fetch error, non-OK → 403", async () => {
  for (const token of ["", "x".repeat(2049)]) {
    const r = await send({ data: { ...data, turnstileToken: token }, bindings: refuseLimiter });
    assert.equal(r.status, 403);
    assert.deepEqual(r.calls, []);
  }
  for (const siteverify of [
    answer({ ...passed, action: "signup" }),
    answer({ ...passed, hostname: "localhost" }),
    answer(passed, { status: 502 }),
    async () => Promise.reject(new TypeError("fetch failed")),
  ]) {
    const r = await send({ token: "t", siteverify, bindings: refuseLimiter });
    assert.equal(r.status, 403);
    assert.deepEqual(r.calls, [m.SITEVERIFY_URL]);
  }
  // an allowlist without the reported host (e.g. unset on a deploy) refuses before fetch
  const r = await send({ token: "t", env: { ...ENV, TURNSTILE_HOSTNAMES: "" }, bindings: refuseLimiter });
  assert.equal(r.status, 403);
  assert.deepEqual(r.calls, []);
});

test("sendChat: remoteip sent to siteverify is the CF-Connecting-IP; the secret never leaves the body", async () => {
  let body;
  const logs = [];
  const orig = { log: console.log, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) console[k] = (...a) => logs.push(a.join(" "));
  try {
    const siteverify = async (_url, init) => ((body = Object.fromEntries(init.body)), Response.json(passed));
    await send({ token: "t", ip: "2001:db8:9:9::5", siteverify });
    await send({ token: "bad", siteverify: verifyNo, bindings: refuseLimiter });
  } finally {
    Object.assign(console, orig);
  }
  assert.equal(body.remoteip, "2001:db8:9:9::5");
  assert.equal(body.secret, SECRET);
  assert.ok(!logs.some((l) => l.includes(SECRET)), "secret logged");
});

test("sendChat: invalid token → 403 after siteverify, no Mistral", async () => {
  const r = await send({ token: "bad", siteverify: verifyNo, bindings: refuseLimiter });
  assert.equal(r.status, 403);
  assert.deepEqual(r.calls, [m.SITEVERIFY_URL]);
});

test("sendChat: valid token → cookie set, Mistral answers; later turns ride the cookie", async () => {
  const r = await send({ token: "good" });
  assert.deepEqual(r.result, { ok: true, text: "Olá!" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.calls, [m.SITEVERIFY_URL, MISTRAL]);
  assert.deepEqual(await m.readSession(SESSION, r.cookie, T0, IP), { exp: T0 + 30 * 60_000, n: 1 });
  const turn2 = {
    ...data,
    messages: [
      ...data.messages,
      { role: "assistant", content: "Olá" },
      { role: "user", content: "Um café" },
    ],
  };
  const r2 = await send({ data: turn2, cookie: r.cookie });
  assert.deepEqual(r2.calls, [MISTRAL]); // no siteverify
  assert.equal((await m.readSession(SESSION, r2.cookie, T0, IP)).n, 2);
  // a new conversation (one user line) needs a token even with the cookie
  const fresh = await send({ cookie: r.cookie, bindings: refuseLimiter });
  assert.equal(fresh.status, 403);
  assert.deepEqual(fresh.calls, []);
});

test("S1: sendChat takes the limiter: a burst refusal → 429 + retry-after, keyed by IP/64, no Mistral", async () => {
  const keys = [];
  const r = await send({
    token: "good",
    ip: "2001:db8:1:2::99",
    bindings: { CHAT_RATE: { limit: async ({ key }) => (keys.push(key), { success: false }) } },
  });
  assert.deepEqual(r.result, { ok: false, error: "rate_limited", retryAfter: 60, scope: "burst" });
  assert.equal(r.status, 429);
  assert.deepEqual(r.headers, { "retry-after": "60" });
  assert.deepEqual(keys, ["2001:db8:1:2::/64"]);
  assert.equal(r.mistral, 0);
});

test("S1: the limiter runs once per allowed turn, after the gate, with the IP key", async () => {
  const keys = [];
  const takes = [];
  const r = await send({
    token: "good",
    bindings: {
      CHAT_RATE: { limit: async ({ key }) => (keys.push(key), { success: true }) },
      CHAT_BUDGET: {
        idFromName: (n) => n,
        get: () => ({ take: async (...a) => (takes.push(a), { ok: true }) }),
      },
    },
  });
  assert.equal(r.result.ok, true);
  assert.deepEqual(keys, ["203.0.113.7"]);
  assert.deepEqual(takes, [["203.0.113.7", T0, { global: 2000, perIp: 60 }]]);
});

test("sendChat: more than 6 turns / 60 s from one IP → 429 (memory burst fallback)", async () => {
  const ip = "198.51.100.66";
  const statuses = [];
  for (let i = 0; i < 7; i++)
    statuses.push((await send({ token: "t", ip, now: T0 + 5 * 60_000 + i })).status);
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429]);
});

test("sendChat: per-IP daily cap → 429 with the reset time; another IP still passes", async () => {
  const env = { ...ENV, CHAT_DAILY_PER_IP: "2" };
  const ip = "198.51.100.10";
  const at = (i) => T0 + i * 60_000; // one per minute: no burst
  assert.equal((await send({ token: "t", ip, env, now: at(1) })).status, 200);
  assert.equal((await send({ token: "t", ip, env, now: at(2) })).status, 200);
  const r = await send({ token: "t", ip, env, now: at(3) });
  assert.equal(r.status, 429);
  assert.deepEqual(r.result, {
    ok: false,
    error: "rate_limited",
    retryAfter: TO_MIDNIGHT - 180,
    scope: "ip_day",
  });
  assert.deepEqual(r.headers, { "retry-after": String(TO_MIDNIGHT - 180) });
  assert.equal(r.mistral, 0);
  assert.equal((await send({ token: "t", ip: "198.51.100.11", env, now: at(4) })).status, 200);
  // day rollover: the same IP passes again after 00:00 UTC
  assert.equal((await send({ token: "t", ip, env, now: MIDNIGHT + 1 })).status, 200);
});

test("sendChat: global daily cap → 429 global_day for every IP", async () => {
  const day = MIDNIGHT + 2 * 86_400_000; // a fresh day for the shared memory budget
  const env = { ...ENV, CHAT_DAILY_GLOBAL: "3" };
  for (let i = 0; i < 3; i++)
    assert.equal((await send({ token: "t", ip: `192.0.2.${i}`, env, now: day + i })).status, 200);
  const r = await send({ token: "t", ip: "192.0.2.200", env, now: day + 10 });
  assert.equal(r.status, 429);
  assert.equal(r.result.scope, "global_day");
  assert.equal(r.mistral, 0);
  assert.equal(
    (await send({ token: "t", ip: "192.0.2.200", env, now: day + 86_400_000 })).status,
    200,
  );
});

test("chatTurn: the gate runs before the limiter; refused → challenge_required", async () => {
  const r = await m.chatTurn({
    data,
    apiKey: "k",
    gate: async () => false,
    limit: () => assert.fail("limit taken"),
    fetch: () => assert.fail("Mistral called"),
  });
  assert.deepEqual(r, { ok: false, error: "challenge_required" });
});

test("UI messages: solve the challenge, slow down, today's budget used up", () => {
  assert.match(m.chatErrorMessage({ ok: false, error: "challenge_required" }), /quick check/);
  assert.match(
    m.chatErrorMessage({ ok: false, error: "rate_limited", retryAfter: 60, scope: "burst" }),
    /Slow down/,
  );
  assert.equal(
    m.chatErrorMessage(
      { ok: false, error: "rate_limited", retryAfter: TO_MIDNIGHT, scope: "ip_day" },
      T0,
    ),
    "You've used today's chat budget. It resets at 00:00 UTC.",
  );
  assert.match(
    m.chatErrorMessage(
      { ok: false, error: "rate_limited", retryAfter: TO_MIDNIGHT, scope: "global_day" },
      T0,
    ),
    /Today's chat budget is used up for everyone\. It resets at 00:00 UTC\./,
  );
  assert.equal(m.chatErrorMessage({ ok: false, error: m.BUSY }), m.BUSY);
});

test("#35: the #33 CHAT_ENABLED flag is gone; sendChat wires the request into the handler", () => {
  assert.equal(m.CHAT_ENABLED, undefined);
  const r = spawnSync(
    "git",
    ["grep", "-nE", "CHAT_ENABLED|chat-availability|CHAT_UNAVAILABLE", "--", "src"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(r.stdout, "");
  const server = readFileSync(join(root, "src/lib/chat-server.ts"), "utf8");
  assert.match(server, /\.middleware\(\[serverFnErrors\]\)/);
  assert.match(server, /return sendChatHandler\(data, chatRequest\(\)\);/);
  assert.doesNotMatch(server, /authMiddleware|lib\/auth/);
  const reqSrc = readFileSync(join(root, "src/lib/chat-request.server.ts"), "utf8");
  assert.match(reqSrc, /ip: clientIp\(\(name\) => getRequestHeader\(name\)\),/);
  assert.match(reqSrc, /httpOnly: true,\n\s+secure: true,\n\s+sameSite: "strict",/);
  const speak = readFileSync(join(root, "src/routes/speak/$id.tsx"), "utf8");
  assert.match(speak, /chatErrorMessage\(res\)/);
  assert.match(speak, /turnstileToken/);
});

const data = { scenarioId: "pastelaria", messages: [{ role: "user", content: "Olá" }] };
const ok = async () => ({ ok: true });
const json = (body, init = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
const yes = async () => true;
const turn = (fetch, o = {}) =>
  m.chatTurn({ data, apiKey: "k", gate: yes, limit: ok, fetch, ...o });

test("chatTurn: over the limit returns rate_limited without calling Mistral", async () => {
  const r = await turn(() => assert.fail("Mistral called"), {
    limit: async () => ({ ok: false, retryAfter: 300, scope: "ip_day" }),
  });
  assert.deepEqual(r, { ok: false, error: "rate_limited", retryAfter: 300, scope: "ip_day" });
});

test("chatTurn: a hung upstream returns BUSY within the timeout", async () => {
  // Settles only when aborted: without a signal it would hang for good.
  const hung = (_url, init) =>
    new Promise((_, reject) =>
      init?.signal?.addEventListener("abort", () => reject(init.signal.reason)),
    );
  // A ref'd guard timer: AbortSignal.timeout doesn't keep the event loop alive, and
  // without the old D1 proxy nothing else does (#33). Cleared once p settles.
  const within = async (p) => {
    let t;
    try {
      return await Promise.race([
        p,
        new Promise((r) => (t = setTimeout(() => r("still hanging after 2 s"), 2000))),
      ]);
    } finally {
      clearTimeout(t);
    }
  };
  assert.deepEqual(await within(turn(hung, { timeoutMs: 100 })), { ok: false, error: m.BUSY });
  // headers arrive, the body hangs
  const slowBody = async (_url, init) =>
    new Response(
      new ReadableStream({
        start: (c) => init.signal.addEventListener("abort", () => c.error(init.signal.reason)),
      }),
      { headers: { "content-type": "application/json" } },
    );
  assert.deepEqual(await within(turn(slowBody, { timeoutMs: 100 })), { ok: false, error: m.BUSY });
  assert.equal(m.CHAT_TIMEOUT_MS, 20_000);
});

test("chatTurn: HTML, 500, bad JSON, odd shapes and network errors never throw", async () => {
  const html = async () =>
    new Response("<html>oops</html>", { headers: { "content-type": "text/html" } });
  assert.deepEqual(await turn(html), { ok: false, error: m.BAD_REPLY });
  assert.deepEqual(await turn(async () => json({}, { status: 500 })), { ok: false, error: m.BUSY });
  assert.deepEqual(await turn(async () => json("{not json")), { ok: false, error: m.BAD_REPLY });
  for (const body of [null, { choices: [{ message: { content: 42 } }] }, { choices: "x" }])
    assert.equal((await turn(async () => json(body))).ok, false, JSON.stringify(body));
  assert.deepEqual(await turn(async () => Promise.reject(new TypeError("fetch failed"))), {
    ok: false,
    error: m.BUSY,
  });
  const good = await turn(async () =>
    json({ choices: [{ message: { content: " Olá! \n(Hi!) " } }] }),
  );
  assert.deepEqual(good, { ok: true, text: "Olá! \n(Hi!)" });
});

test("chatTurn: Mistral request shape — global endpoint, mistral-small-latest, Bearer key, caps", async () => {
  const seen = [];
  const spy = async (url, init) => (
    seen.push({ url: String(url), init }),
    json({ choices: [{ message: { content: "Olá!" } }] })
  );
  const r = await turn(spy);
  assert.deepEqual(r, { ok: true, text: "Olá!" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.mistral.ai/v1/chat/completions");
  assert.equal(seen[0].init.method, "POST");
  assert.equal(seen[0].init.headers.Authorization, "Bearer k");
  const body = JSON.parse(seen[0].init.body);
  assert.equal(body.model, "mistral-small-latest");
  assert.equal(body.max_tokens, 280);
  assert.equal(body.temperature, 0.7);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages.at(-1).role, "user");
  assert.equal(m.CHAT_API_BASE, "https://api.mistral.ai/v1");
  assert.equal(m.CHAT_MODEL, "mistral-small-latest");
  // apiBase / model params override (a trailing slash is stripped)
  const r2 = await turn(spy, { apiBase: "https://api.eu.mistral.ai/v1/", model: "mistral-large-latest" });
  assert.deepEqual(r2, { ok: true, text: "Olá!" });
  assert.equal(seen[1].url, "https://api.eu.mistral.ai/v1/chat/completions");
  assert.equal(JSON.parse(seen[1].init.body).model, "mistral-large-latest");
});

test("chatTurn: a non-Mistral apiBase fails closed and never sends the Bearer key", async () => {
  for (const apiBase of [
    "https://evil.example.com/v1",
    "https://api.mistral.ai.evil.example.com/v1",
    "https://evilmistral.ai/v1",
    "not a url",
    "",
  ]) {
    const r = await turn(() => assert.fail(`Mistral called for ${apiBase}`), { apiBase });
    assert.deepEqual(r, { ok: false, error: m.UNAVAILABLE }, apiBase);
  }
  // the EU regional host is a Mistral host and stays allowed
  const seen = [];
  const spy = async (url) => (seen.push(String(url)), json({ choices: [{ message: { content: "Olá!" } }] }));
  assert.deepEqual(await turn(spy, { apiBase: "https://api.eu.mistral.ai/v1" }), { ok: true, text: "Olá!" });
  assert.deepEqual(seen, [MISTRAL_EU]);
});

test("chatTurn: content as a blocks array (Mistral) is joined; non-text blocks ignored", async () => {
  // ADR 0006: choices[0].message.content may be [{ type: "text", text }] blocks.
  assert.equal(
    m.messageContentToString("plain"),
    "plain",
  );
  assert.equal(
    m.messageContentToString([
      { type: "text", text: " Olá! " },
      { type: "image_url", image_url: { url: "https://x" } },
      { type: "text", text: "(Hi!)" },
      "not-a-block",
      null,
    ]),
    " Olá! (Hi!)",
  );
  assert.equal(m.messageContentToString(42), "");
  assert.equal(m.messageContentToString(undefined), "");
  assert.equal(m.messageContentToString([{ type: "text" }]), "");
  const blocks = async () =>
    json({
      choices: [
        {
          message: {
            content: [
              { type: "text", text: " Olá! " },
              { type: "text", text: "(Hi!) " },
            ],
          },
        },
      ],
    });
  assert.deepEqual(await turn(blocks), { ok: true, text: "Olá! (Hi!)" });
  // blocks with no text at all → empty reply, not a crash
  const emptyBlocks = async () =>
    json({ choices: [{ message: { content: [{ type: "image_url", image_url: {} }] } }] });
  assert.deepEqual(await turn(emptyBlocks), {
    ok: false,
    error: "Empty reply. Try a shorter line.",
  });
});

test("sendChat: MISTRAL_API_BASE / MISTRAL_MODEL (plain vars) override endpoint and model", async () => {
  const seen = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url) === m.SITEVERIFY_URL) return verifyOk();
    seen.push({ url: String(url), init });
    return reply();
  };
  try {
    const out = { status: 200, headers: {}, cookie: undefined };
    const result = await m.sendChatHandler(
      { ...data, turnstileToken: "good" },
      {
        ip: "203.0.113.7",
        cookie: undefined,
        setCookie: (v) => (out.cookie = v),
        setStatus: (s, h = {}) => ((out.status = s), Object.assign(out.headers, h)),
      },
      T0,
      { ...ENV, MISTRAL_API_BASE: "https://api.eu.mistral.ai/v1/", MISTRAL_MODEL: "mistral-large-latest" },
    );
    assert.deepEqual(result, { ok: true, text: "Olá!" });
  } finally {
    globalThis.fetch = realFetch;
  }
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, "https://api.eu.mistral.ai/v1/chat/completions");
  assert.equal(JSON.parse(seen[0].init.body).model, "mistral-large-latest");
  assert.equal(seen[0].init.headers.Authorization, "Bearer sk-test");
});

test("validator: known scene, at most 16 messages, 8000 chars in total", () => {
  const msg = (n) => ({ role: "user", content: "x".repeat(n) });
  const v = (o) => m.chatInput.safeParse({ ...data, ...o }).success;
  assert.ok(v({}));
  assert.ok(!v({ scenarioId: "nope" }));
  assert.ok(!v({ messages: Array.from({ length: 17 }, () => msg(1)) }));
  assert.ok(v({ messages: [msg(2000), msg(2000), msg(2000), msg(2000)] }));
  assert.ok(!v({ messages: [msg(2000), msg(2000), msg(2000), msg(2000), msg(1)] }));
  assert.ok(!v({ messages: [msg(2001)] }));
});

test("client: explicit render (widget id, action chat), execute, reset after every request", async () => {
  const calls = [];
  let cb;
  const fake = {
    render: (el, o) => (calls.push(["render", el, o.sitekey, o.action, o.execution]), (cb = o.callback), "w1"),
    execute: (id) => (calls.push(["execute", id]), queueMicrotask(() => cb(`tok-${calls.length}`))),
    reset: (id) => calls.push(["reset", id]),
  };
  globalThis.window = { turnstile: fake };
  try {
    const t = m.createTurnstile("EL", "site-key");
    t.reset(); // nothing rendered yet: no-op
    assert.match(await t.token(), /^tok-/);
    t.reset(); // after the request
    assert.match(await t.token(), /^tok-/);
    assert.match(await t.token(), /^tok-/); // a retry without reset resets first
    t.reset();
    assert.deepEqual(calls, [
      ["render", "EL", "site-key", "chat", "execute"],
      ["execute", "w1"],
      ["reset", "w1"],
      ["execute", "w1"],
      ["reset", "w1"],
      ["execute", "w1"],
      ["reset", "w1"],
    ]);
  } finally {
    delete globalThis.window;
  }
  assert.equal(m.TURNSTILE_SCRIPT, "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit");
  const speak = readFileSync(join(root, "src/routes/speak/$id.tsx"), "utf8");
  assert.match(speak, /\} finally \{\n(?:\s*\/\/.*\n)*\s*turnstile\.current\?\.reset\(\);/);
});

test("#17: clientIp uses CF-Connecting-IP only; never X-Forwarded-For or x-real-ip", () => {
  const h = (o) => (name) => o[name];
  assert.equal(
    m.clientIp(h({ "x-forwarded-for": "6.6.6.6", "cf-connecting-ip": "203.0.113.7" })),
    "203.0.113.7",
  );
  assert.equal(m.clientIp(h({ "x-forwarded-for": "6.6.6.6" })), "unknown");
  assert.equal(m.clientIp(h({ "x-real-ip": "198.51.100.1" })), "unknown");
  assert.equal(m.clientIp(h({ "x-forwarded-for": "6.6.6.6", "x-real-ip": "198.51.100.1" })), "unknown");
  assert.equal(m.clientIp(h({ "cf-connecting-ip": "203.0.113.7", "x-real-ip": "198.51.100.1" })), "203.0.113.7");
  assert.equal(m.clientIp(h({ "cf-connecting-ip": " " })), "unknown");
  assert.equal(m.clientIp(h({})), "unknown");
  assert.equal(m.clientIp(() => null), "unknown");
});

test("S1: the session cookie is bound to the client IP (IPv4, or IPv6 /64)", async () => {
  const c = await m.signSession(SESSION, { exp: T0 + 1000, n: 1 }, m.ipKey("2001:db8:1:2::a"));
  assert.ok(await m.readSession(SESSION, c, T0, m.ipKey("2001:db8:1:2:ffff::b"))); // same /64
  assert.equal(await m.readSession(SESSION, c, T0, m.ipKey("2001:db8:1:3::a")), null);
  // the tag can't be swapped: it's under the HMAC
  const other = await m.signSession(SESSION, { exp: T0 + 1000, n: 1 }, "198.51.100.9");
  const swapped = c.split(".").slice(0, 3).concat(other.split(".")[3], c.split(".")[4]).join(".");
  assert.equal(await m.readSession(SESSION, swapped, T0, "198.51.100.9"), null);
  // end to end: same IP accepted, a different IP → 403 challenge_required
  const r = await send({ token: "good", ip: "198.51.100.70" });
  const turn2 = { ...data, messages: [...data.messages, { role: "assistant", content: "Olá" }, { role: "user", content: "Um café" }] };
  const same = await send({ data: turn2, cookie: r.cookie, ip: "198.51.100.70" });
  assert.equal(same.result.ok, true);
  assert.deepEqual(same.calls, [MISTRAL]);
  const moved = await send({ data: turn2, cookie: r.cookie, ip: "198.51.100.71", bindings: refuseLimiter });
  assert.equal(moved.status, 403);
  assert.deepEqual(moved.result, { ok: false, error: "challenge_required" });
  assert.deepEqual(moved.calls, []);
});

test("S3: sendChat signs with CHAT_SESSION_SECRET; missing or < 32 bytes → unavailable, nothing called", async () => {
  const r = await send({ token: "good", ip: "198.51.100.80" });
  assert.ok(await m.readSession(SESSION, r.cookie, T0, "198.51.100.80"));
  assert.equal(await m.readSession("fallback", r.cookie, T0, "198.51.100.80"), null);
  for (const v of [undefined, "", "x".repeat(31), "é".repeat(15)]) {
    const u = await send({ token: "good", env: { ...ENV, CHAT_SESSION_SECRET: v }, bindings: refuseLimiter });
    assert.deepEqual(u.result, { ok: false, error: m.UNAVAILABLE }, String(v));
    assert.deepEqual(u.calls, []);
  }
  assert.equal(m.sessionSecretOk("x".repeat(32)), true);
  assert.equal(m.sessionSecretOk("é".repeat(16)), true); // bytes, not chars
  assert.equal(m.MIN_SESSION_SECRET_BYTES, 32);
});

test("S4: a turn refused by the burst limit or daily budget doesn't renew or spend the cookie", async () => {
  const ip = "198.51.100.90";
  const first = await send({ token: "good", ip });
  const turn2 = { ...data, messages: [...data.messages, { role: "assistant", content: "Olá" }, { role: "user", content: "Um café" }] };
  for (const bindings of [
    { CHAT_RATE: { limit: async () => ({ success: false }) } },
    {
      CHAT_RATE: { limit: async () => ({ success: true }) },
      CHAT_BUDGET: { idFromName: (n) => n, get: () => ({ take: async () => ({ ok: false, scope: "ip_day", retryAfter: 9 }) }) },
    },
  ]) {
    const r = await send({ data: turn2, cookie: first.cookie, ip, bindings });
    assert.equal(r.status, 429);
    assert.equal(r.cookie, undefined); // not renewed, n not spent
  }
  // a fresh token refused by the limiter doesn't earn a cookie either
  const t = await send({ token: "good", ip, bindings: { CHAT_RATE: { limit: async () => ({ success: false }) } } });
  assert.equal(t.status, 429);
  assert.equal(t.cookie, undefined);
  // the old cookie still has its turn: n goes 1 → 2
  const ok2 = await send({ data: turn2, cookie: first.cookie, ip });
  assert.equal((await m.readSession(SESSION, ok2.cookie, T0, ip)).n, 2);
});

// ---- reviewScene (#131, ADR 0017) ------------------------------------------

const reviewData = {
  scenarioId: "pastelaria",
  messages: [
    { role: "assistant", content: "Bom dia.\n(Good morning.)" },
    { role: "user", content: "Eu vou pegar o ônibus" },
  ],
};
const BR = {
  youSaid: "Eu vou pegar o ônibus",
  pt: "Eu vou apanhar o autocarro",
  note: "In Portugal: o autocarro, apanhar.",
  brazilian: true,
};
const reviewOk = (corrections) =>
  Response.json({ choices: [{ message: { content: JSON.stringify({ corrections }) } }] });
const reviewTurn = (fetch, o = {}) =>
  m.reviewTurn({ data: reviewData, apiKey: "k", gate: yes, limit: ok, fetch, ...o });

test("review validator (#131): known scene, at least one user turn, 16 msgs / 2000-per-msg / 8000 chars", () => {
  const v = (o) => m.reviewInput.safeParse({ ...reviewData, ...o }).success;
  assert.ok(v({}));
  assert.ok(v({ turnstileToken: "t" }));
  assert.ok(!v({ scenarioId: "nope" }));
  assert.ok(!v({ messages: [{ role: "assistant", content: "só a fala do parceiro" }] }));
  assert.ok(!v({ messages: Array.from({ length: 17 }, () => ({ role: "user", content: "x" })) }));
  assert.ok(!v({ messages: [{ role: "user", content: "x".repeat(2001) }] }));
  assert.ok(!v({ messages: [{ role: "user", content: "x".repeat(8001) }] }));
  assert.ok(v({ messages: [...reviewData.messages, { role: "user", content: "x".repeat(2000) }] }));
});

test("reviewTurn (#131): JSON-mode request (temp 0.2, max_tokens 600, transcript); validated reply", async () => {
  const seen = [];
  const spy = async (url, init) => (
    seen.push({ url: String(url), body: JSON.parse(init.body) }),
    reviewOk([BR])
  );
  assert.deepEqual(await reviewTurn(spy), { ok: true, corrections: [BR] });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, MISTRAL);
  const b = seen[0].body;
  assert.equal(b.model, "mistral-small-latest");
  assert.deepEqual(b.response_format, { type: "json_object" });
  assert.equal(b.temperature, 0.2);
  assert.equal(b.max_tokens, 600);
  assert.equal(b.messages[0].role, "system");
  assert.match(b.messages[0].content, /JSON/);
  assert.deepEqual(b.messages.slice(1), reviewData.messages);
  // defaults fill note / brazilian; an empty list is a valid "no errors" reply
  assert.deepEqual(await reviewTurn(async () => reviewOk([{ youSaid: "a", pt: "b" }])), {
    ok: true,
    corrections: [{ youSaid: "a", pt: "b", note: "", brazilian: false }],
  });
  assert.deepEqual(await reviewTurn(async () => reviewOk([])), { ok: true, corrections: [] });
  // a model that wraps the JSON in markdown fences despite JSON mode still parses
  const fenced = async () =>
    Response.json({
      choices: [
        { message: { content: "```json\n" + JSON.stringify({ corrections: [BR] }) + "\n```" } },
      ],
    });
  assert.deepEqual(await reviewTurn(fenced), { ok: true, corrections: [BR] });
});

test("reviewTurn (#131): non-JSON, wrong shape, over-long fields → BAD_REPLY; upstream 500/network → BUSY; never throws", async () => {
  for (const body of [
    "{not json",
    "null",
    JSON.stringify({}),
    JSON.stringify({ nope: [] }),
    JSON.stringify({ corrections: "x" }),
    JSON.stringify({ corrections: [{ youSaid: 1, pt: "y" }] }),
    JSON.stringify({ corrections: [{ youSaid: "x".repeat(301), pt: "y" }] }),
  ]) {
    const r = await reviewTurn(
      async () => new Response(body, { headers: { "content-type": "application/json" } }),
    );
    assert.deepEqual(r, { ok: false, error: m.BAD_REPLY }, body.slice(0, 40));
  }
  assert.deepEqual(await reviewTurn(async () => json({}, { status: 500 })), {
    ok: false,
    error: m.BUSY,
  });
  assert.deepEqual(await reviewTurn(async () => Promise.reject(new TypeError("fetch failed"))), {
    ok: false,
    error: m.BUSY,
  });
});

test("reviewTurn (#131): at most MAX_CORRECTIONS entries come back", async () => {
  const many = Array.from({ length: 20 }, (_, i) => ({ youSaid: `a${i}`, pt: `b${i}` }));
  const r = await reviewTurn(async () => reviewOk(many));
  assert.equal(r.ok, true);
  assert.equal(r.corrections.length, 12);
  assert.equal(m.MAX_CORRECTIONS, 12);
});

test("reviewTurn (#131): shared preamble — no key / bad base / unknown scene refuse before gate+limit; gate before limit before upstream", async () => {
  const never = () => assert.fail("called");
  for (const o of [{ apiKey: undefined }, { apiKey: "k", apiBase: "https://evil.example.com/v1" }]) {
    assert.deepEqual(await reviewTurn(never, { gate: never, limit: never, ...o }), {
      ok: false,
      error: m.UNAVAILABLE,
    });
  }
  assert.deepEqual(
    await reviewTurn(never, { data: { ...reviewData, scenarioId: "nope" }, gate: never, limit: never }),
    { ok: false, error: "Unknown scene." },
  );
  assert.deepEqual(await reviewTurn(never, { gate: async () => false, limit: never }), {
    ok: false,
    error: "challenge_required",
  });
  assert.deepEqual(
    await reviewTurn(never, { limit: async () => ({ ok: false, retryAfter: 42, scope: "global_day" }) }),
    { ok: false, error: "rate_limited", retryAfter: 42, scope: "global_day" },
  );
});

/** Runs sendReviewHandler with mocked fetch; mirrors the sendChat `send` helper. */
async function sendReview({
  data: d = reviewData,
  token,
  cookie,
  ip = "203.0.113.7",
  now = T0,
  env = ENV,
  siteverify = verifyOk,
  bindings,
} = {}) {
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push(String(url));
    if (String(url) === m.SITEVERIFY_URL) return siteverify(url, init);
    if (String(url) === MISTRAL) return reviewOk([BR]);
    return assert.fail(`unexpected fetch ${url}`);
  };
  if (bindings) globalThis.__env__ = bindings;
  const out = { status: 200, headers: {}, cookie: undefined };
  try {
    out.result = await m.sendReviewHandler(
      { ...d, ...(token ? { turnstileToken: token } : {}) },
      {
        ip,
        cookie,
        setCookie: (v) => (out.cookie = v),
        setStatus: (s, h = {}) => ((out.status = s), Object.assign(out.headers, h)),
      },
      now,
      env,
    );
  } finally {
    globalThis.fetch = realFetch;
    delete globalThis.__env__;
  }
  out.calls = calls;
  out.mistral = calls.filter((u) => u === MISTRAL).length;
  return out;
}

test("sendReview (#131): missing token → 403 challenge_required, no limiter, no Mistral, no cookie", async () => {
  const r = await sendReview({ bindings: refuseLimiter });
  assert.deepEqual(r.result, { ok: false, error: "challenge_required" });
  assert.equal(r.status, 403);
  assert.deepEqual(r.calls, []);
  assert.equal(r.cookie, undefined);
});

test("sendReview (#131): valid token → cookie set, corrections returned; later reviews ride the cookie", async () => {
  const r = await sendReview({ token: "good" });
  assert.deepEqual(r.result, { ok: true, corrections: [BR] });
  assert.equal(r.status, 200);
  assert.deepEqual(r.calls, [m.SITEVERIFY_URL, MISTRAL]);
  assert.ok(await m.readSession(SESSION, r.cookie, T0, IP));
  // a longer transcript is no longer a "first turn": the cookie rides, no token
  const full = {
    ...reviewData,
    messages: [
      ...reviewData.messages,
      { role: "assistant", content: "Claro.\n(Sure.)" },
      { role: "user", content: "Quanto custa?" },
    ],
  };
  const again = await sendReview({ data: full, cookie: r.cookie });
  assert.equal(again.result.ok, true);
  assert.deepEqual(again.calls, [MISTRAL]);
  assert.equal(again.mistral, 1);
  // ...but a one-line conversation is still a first turn and needs a token
  const solo = await sendReview({ data: reviewData, cookie: r.cookie, bindings: refuseLimiter });
  assert.equal(solo.status, 403);
  assert.deepEqual(solo.result, { ok: false, error: "challenge_required" });
});

test("sendReview (#131): the review is billed — burst refusal → 429 retry-after, no cookie, no Mistral", async () => {
  const r = await sendReview({
    token: "good",
    bindings: { CHAT_RATE: { limit: async () => ({ success: false }) } },
  });
  assert.equal(r.status, 429);
  assert.deepEqual(r.headers, { "retry-after": "60" });
  assert.deepEqual(r.result, { ok: false, error: "rate_limited", retryAfter: 60, scope: "burst" });
  assert.equal(r.mistral, 0);
  assert.equal(r.cookie, undefined);
});

test("sendReview (#131): per-IP daily cap → 429 ip_day; another IP still passes", async () => {
  const env = { ...ENV, CHAT_DAILY_PER_IP: "1" };
  const ip = "198.51.100.77";
  const at = (i) => T0 + i * 60_000; // one per minute: no burst
  assert.equal((await sendReview({ token: "t", ip, env, now: at(1) })).status, 200);
  const r = await sendReview({ token: "t", ip, env, now: at(2) });
  assert.equal(r.status, 429);
  assert.deepEqual(r.result, {
    ok: false,
    error: "rate_limited",
    retryAfter: TO_MIDNIGHT - 120,
    scope: "ip_day",
  });
  assert.equal(r.mistral, 0);
  assert.equal((await sendReview({ token: "t", ip: "198.51.100.78", env, now: at(3) })).status, 200);
});

test("#131: reviewScene is wired like sendChat — validator + handler, no auth; panel renders text only", () => {
  const server = readFileSync(join(root, "src/lib/chat-server.ts"), "utf8");
  assert.match(server, /export const reviewScene = createServerFn\(\{ method: "POST" \}\)/);
  assert.match(server, /\.validator\(\(input: unknown\) => reviewInput\.parse\(input\)\)/);
  assert.match(server, /return sendReviewHandler\(data, chatRequest\(\)\);/);
  assert.doesNotMatch(server, /authMiddleware|lib\/auth/);
  const core = readFileSync(join(root, "src/lib/chat-core.ts"), "utf8");
  assert.match(core, /response_format: \{ type: "json_object" \}/);
  assert.match(core, /reviewOutputSchema\.safeParse/);
  const speak = readFileSync(join(root, "src/routes/speak/$id.tsx"), "utf8");
  assert.match(speak, /reviewScene/);
  assert.match(speak, /SceneReview/);
  const panel = readFileSync(join(root, "src/components/scene-review.tsx"), "utf8");
  assert.match(panel, /aria-live="polite"/);
  assert.doesNotMatch(panel, /dangerouslySetInnerHTML/);
});

test("#132: corrections panel UI states + a11y (source level)", () => {
  const panel = readFileSync(join(root, "src/components/scene-review.tsx"), "utf8");
  // BR → PT badge next to the European form, as a solid accent pill (AA in both themes:
  // accent/15 over soft was 4.40:1 in dark)
  assert.match(panel, /c\.brazilian &&/);
  assert.match(panel, /BR → PT/);
  assert.match(panel, /bg-accent px-2 py-0\.5 text-xs font-medium text-accent-fg/);
  assert.doesNotMatch(panel, /bg-accent\/\d+/);
  // empty state ("a learner with no errors is told so") and a semantic list
  assert.match(panel, /Sem erros — muito bem! No corrections needed\./);
  assert.match(panel, /<ul className="mt-3 space-y-3">/);
  assert.match(panel, /<li/);
  // a11y: live region + accessible name, text-only rendering, ≥44px controls (no size="sm")
  assert.match(panel, /aria-live="polite"/);
  assert.match(panel, /aria-label="Scene corrections"/);
  assert.doesNotMatch(panel, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(panel, /size="sm"/);
  const speak = readFileSync(join(root, "src/routes/speak/$id.tsx"), "utf8");
  // distinct states: loading, error via chatErrorMessage (covers 403 challenge and 429 caps), done panel
  assert.match(speak, /A rever a conversa…/);
  assert.match(speak, /chatErrorMessage\(res\)/);
  assert.match(speak, /review\.status === "loading"/);
  assert.match(speak, /review\.status === "error"/);
  assert.match(speak, /review\.status === "done"/);
  // Finish is a real button, disabled while busy/loading/offline or without a learner turn
  assert.match(speak, /<Flag \/> Finish scene — see my corrections/);
  assert.match(speak, /!turns\.some\(\(t\) => t\.role === "user"\)/);
});
