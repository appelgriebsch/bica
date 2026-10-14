/**
 * Conversas (#13, #35): the per-IP burst and daily budget (Durable Object
 * logic), the Turnstile gate and session cookie, sendChat end to end with a
 * mocked siteverify / xAI / bindings, chatTurn's timeout and caps, and the
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
  transform: { define: { "import.meta.env.DEV": "false" } },
  plugins: [
    {
      name: "entry",
      resolveId: (id) => (id === "entry" ? "\0entry" : null),
      load: (id) =>
        id === "\0entry"
          ? `export * from "@/lib/chat-limit"; export * from "@/lib/chat-core";
             export * from "@/lib/chat-gate"; export * from "@/lib/chat-budget.mjs";
             export * from "@/lib/chat-messages";`
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
const SESSION = "test-session-secret";
const verifyOk = async () => Response.json({ success: true });
const verifyNo = async () =>
  Response.json({ success: false, "error-codes": ["invalid-input-response"] });
const gate = (o) =>
  m.checkGate({
    token: undefined,
    cookie: undefined,
    firstTurn: false,
    secret: SECRET,
    sessionSecret: SESSION,
    ip: "203.0.113.7",
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

test("verifyTurnstile: posts secret, token and remoteip; only success: true passes", async () => {
  let req;
  const spy = async (url, init) => ((req = { url, init }), Response.json({ success: true }));
  assert.equal(await m.verifyTurnstile("tok", "sec", "203.0.113.7", spy), true);
  assert.equal(req.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  assert.equal(req.init.method, "POST");
  assert.deepEqual(Object.fromEntries(req.init.body), {
    secret: "sec",
    response: "tok",
    remoteip: "203.0.113.7",
  });
  assert.ok(req.init.signal instanceof AbortSignal);
  assert.equal(m.SITEVERIFY_TIMEOUT_MS, 5000);
  for (const f of [
    verifyNo,
    async () => Response.json({ success: "true" }),
    async () => Response.json({ success: true }, { status: 500 }),
    async () => new Response("<html>", { headers: { "content-type": "text/html" } }),
    async () => Promise.reject(new TypeError("fetch failed")),
  ]) {
    assert.equal(await m.verifyTurnstile("tok", "sec", undefined, f), false);
  }
});

test("session cookie: signed, expires, tamper-proof", async () => {
  const c = await m.signSession(SESSION, { exp: T0 + 1000, n: 3 });
  assert.match(c, /^v1\.\d+\.3\.[A-Za-z0-9_-]{43}$/);
  assert.deepEqual(await m.readSession(SESSION, c, T0), { exp: T0 + 1000, n: 3 });
  assert.equal(await m.readSession(SESSION, c, T0 + 1000), null); // expired
  assert.equal(await m.readSession("other", c, T0), null);
  assert.equal(await m.readSession(SESSION, c.replace(".3.", ".1."), T0), null); // n rewound
  assert.equal(await m.readSession(SESSION, c.replace(/^v1\.\d+/, `v1.${T0 + 9e9}`), T0), null);
  for (const v of [undefined, "", "v1.1.1.x", "garbage"])
    assert.equal(await m.readSession(SESSION, v, T0), null);
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
  assert.deepEqual(await m.readSession(SESSION, g.cookie, T0), { exp: T0 + 30 * 60_000, n: 1 });
  assert.equal(m.SESSION_TTL_MS, 30 * 60_000);
  let cookie = g.cookie;
  for (let n = 2; n <= 10; n++) {
    const next = await gate({ cookie, now: T0 + n });
    assert.equal(next.ok, true, `turn ${n}`);
    assert.deepEqual(await m.readSession(SESSION, next.cookie, T0), { exp: T0 + 30 * 60_000, n });
    cookie = next.cookie;
  }
  // the 11th turn needs a fresh token
  assert.deepEqual(await gate({ cookie, now: T0 + 11 }), { ok: false });
  const again = await gate({ cookie, token: "t2", now: T0 + 12, fetch: verifyOk });
  assert.deepEqual(await m.readSession(SESSION, again.cookie, T0), {
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
  const cookie = await m.signSession(SESSION, { exp: T0 + 1000, n: 1 });
  assert.deepEqual(await gate({ sessionSecret: undefined, cookie }), { ok: false });
  assert.deepEqual(await gate({ sessionSecret: undefined, token: "t", fetch: verifyOk }), {
    ok: true,
    cookie: undefined,
  });
});

// ---- sendChat end to end (mocked siteverify, xAI and bindings) ----------

const XAI = "https://api.x.ai/v1/chat/completions";
const ENV = { XAI_API_KEY: "sk-test", TURNSTILE_SECRET_KEY: SECRET, CHAT_SESSION_SECRET: SESSION };
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
    if (String(url) === XAI) return reply();
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
  out.xai = calls.filter((u) => u === XAI).length;
  return out;
}
const refuseLimiter = {
  CHAT_RATE: { limit: () => assert.fail("limiter reached") },
  CHAT_BUDGET: { idFromName: () => assert.fail("budget reached") },
};

test("sendChat: no XAI_API_KEY or no TURNSTILE_SECRET_KEY → unavailable, nothing called", async () => {
  for (const env of [
    { ...ENV, XAI_API_KEY: undefined },
    { ...ENV, TURNSTILE_SECRET_KEY: undefined },
    {},
  ]) {
    const r = await send({ env, token: "t", bindings: refuseLimiter });
    assert.deepEqual(r.result, { ok: false, error: m.UNAVAILABLE });
    assert.deepEqual(r.calls, []);
  }
});

test("sendChat: missing token → 403, no limiter, no xAI", async () => {
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

test("sendChat: invalid token → 403 after siteverify, no xAI", async () => {
  const r = await send({ token: "bad", siteverify: verifyNo, bindings: refuseLimiter });
  assert.equal(r.status, 403);
  assert.deepEqual(r.calls, [m.SITEVERIFY_URL]);
});

test("sendChat: valid token → cookie set, xAI answers; later turns ride the cookie", async () => {
  const r = await send({ token: "good" });
  assert.deepEqual(r.result, { ok: true, text: "Olá!" });
  assert.equal(r.status, 200);
  assert.deepEqual(r.calls, [m.SITEVERIFY_URL, XAI]);
  assert.deepEqual(await m.readSession(SESSION, r.cookie, T0), { exp: T0 + 30 * 60_000, n: 1 });
  const turn2 = {
    ...data,
    messages: [
      ...data.messages,
      { role: "assistant", content: "Olá" },
      { role: "user", content: "Um café" },
    ],
  };
  const r2 = await send({ data: turn2, cookie: r.cookie, ip: "203.0.113.8" });
  assert.deepEqual(r2.calls, [XAI]); // no siteverify
  assert.equal((await m.readSession(SESSION, r2.cookie, T0)).n, 2);
  // a new conversation (one user line) needs a token even with the cookie
  const fresh = await send({ cookie: r.cookie, bindings: refuseLimiter });
  assert.equal(fresh.status, 403);
  assert.deepEqual(fresh.calls, []);
});

test("S1: sendChat takes the limiter: a burst refusal → 429 + retry-after, keyed by IP/64, no xAI", async () => {
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
  assert.equal(r.xai, 0);
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
  assert.equal(r.xai, 0);
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
  assert.equal(r.xai, 0);
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
    fetch: () => assert.fail("xAI called"),
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
  assert.match(reqSrc, /getRequestHeader\("cf-connecting-ip"\)/);
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

test("chatTurn: over the limit returns rate_limited without calling xAI", async () => {
  const r = await turn(() => assert.fail("xAI called"), {
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
  assert.equal(m.XAI_TIMEOUT_MS, 20_000);
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
