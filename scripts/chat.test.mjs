/**
 * #13 chat limits, timeout and caps: the in-memory limiter, the binding wiring,
 * chatTurn with a mocked fetch, the input validator, and #33's CHAT_ENABLED
 * gate on sendChat. TS sources bundled with rolldown.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
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
             export * from "@/lib/chat-availability";`
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

const T0 = Date.UTC(2026, 9, 14, 10, 0, 0); // a 10-min window start
const limits = { perMinute: 1000, per10Min: 3, perDay: 5 };
const open = async () => true;
const counters = { memory: () => m.memoryCounter() };
const take = (counter, user, now) => m.checkChatLimit(user, now, { burst: open, counter, limits });

for (const [name, make] of Object.entries(counters)) {
  test(`limit (${name}): N per 10 min, N+1 refused with retryAfter, per user, window resets`, async () => {
    const c = await make();
    for (let i = 0; i < 3; i++) assert.deepEqual(await take(c, "a", T0 + i * 1000), { ok: true });
    assert.deepEqual(await take(c, "a", T0 + 4 * 60_000), { ok: false, retryAfter: 360 });
    assert.deepEqual(await take(c, "b", T0 + 4 * 60_000), { ok: true }); // per user
    assert.deepEqual(await take(c, "a", T0 + 10 * 60_000), { ok: true }); // next window
  });

  test(`limit (${name}): daily cap; a 10-min refusal doesn't use daily turns`, async () => {
    const c = await make();
    for (let i = 0; i < 3; i++) await take(c, "a", T0 + i);
    for (let i = 0; i < 5; i++) await take(c, "a", T0 + 60_000 + i); // all refused (10 min)
    assert.deepEqual(await take(c, "a", T0 + 10 * 60_000), { ok: true }); // day turn 4
    assert.deepEqual(await take(c, "a", T0 + 10 * 60_000 + 1), { ok: true }); // day turn 5
    const r = await take(c, "a", T0 + 20 * 60_000); // fresh 10-min window, day full
    assert.deepEqual(r, { ok: false, retryAfter: 14 * 3600 - 20 * 60 }); // to UTC midnight
    assert.deepEqual(await take(c, "a", T0 + 14 * 3600_000), { ok: true }); // next day
  });
}

test("burst: memory per minute; the binding is used when present, keyed by user", async () => {
  const b = m.memoryBurst(2);
  assert.deepEqual(
    [await b("a", T0), await b("a", T0 + 1), await b("a", T0 + 2)],
    [true, true, false],
  );
  assert.equal(await b("b", T0), true);
  assert.equal(await b("a", T0 + 60_000), true);
  const never = async () => assert.fail("counter reached after a burst refusal");
  assert.deepEqual(
    await m.checkChatLimit("a", T0, { burst: async () => false, counter: never, limits }),
    { ok: false, retryAfter: 60 },
  );

  const keys = [];
  globalThis.__env__ = {
    CHAT_RATE: { limit: async ({ key }) => (keys.push(key), { success: false }) },
  };
  const l = m.chatLimiter();
  assert.equal(await l.burst("a", T0), false);
  assert.deepEqual(keys, ["a"]);
  delete globalThis.__env__;
  assert.equal(await m.chatLimiter().burst("zz", T0), true); // memory fallback
  assert.deepEqual(keys, ["a"]);
});

test("wiring: no D1 since #33; the 10-min and day caps count in memory", async () => {
  assert.equal(m.d1Counter, undefined);
  const c = m.chatLimiter().counter;
  assert.equal(c, m.chatLimiter().counter); // one per isolate, shared across calls
  const l = { ...m.DEFAULT_LIMITS, per10Min: 1 };
  assert.equal(await c("wiring", T0, l), "ok");
  assert.equal(await c("wiring", T0 + 1, l), "10m");
});

test("limits: configurable via env, bad values ignored", () => {
  assert.deepEqual(m.limitsFromEnv({}), m.DEFAULT_LIMITS);
  assert.deepEqual(m.limitsFromEnv({ CHAT_LIMIT_PER_10_MIN: "5", CHAT_LIMIT_PER_DAY: "50" }), {
    ...m.DEFAULT_LIMITS,
    per10Min: 5,
    perDay: 50,
  });
  assert.deepEqual(
    m.limitsFromEnv({ CHAT_LIMIT_PER_10_MIN: "0", CHAT_LIMIT_PER_DAY: "x" }),
    m.DEFAULT_LIMITS,
  );
  process.env.CHAT_LIMIT_PER_DAY = "7";
  assert.equal(m.chatLimiter().limits.perDay, 7); // what sendChat uses
  delete process.env.CHAT_LIMIT_PER_DAY;
  const toml = readFileSync(join(root, "wrangler.toml"), "utf8");
  assert.match(
    toml,
    new RegExp(
      `\\[\\[env\\.staging\\.ratelimits\\]\\]\\nname = "CHAT_RATE"\\nnamespace_id = "\\d+"\\nsimple = \\{ limit = ${m.DEFAULT_LIMITS.perMinute}, period = 60 \\}`,
    ),
  );
});

const data = { scenarioId: "pastelaria", messages: [{ role: "user", content: "Olá" }] };
const ok = async () => ({ ok: true });
const json = (body, init = {}) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    ...init,
  });
const turn = (fetch, o = {}) => m.chatTurn({ data, apiKey: "k", limit: ok, fetch, ...o });

test("chatTurn: over the limit returns rate_limited without calling xAI", async () => {
  const r = await turn(() => assert.fail("xAI called"), {
    limit: async () => ({ ok: false, retryAfter: 300 }),
  });
  assert.deepEqual(r, { ok: false, error: "rate_limited", retryAfter: 300 });
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

// #33: no sign-in, so Conversas is off behind a server-side flag until #35.
test("#33: CHAT_ENABLED is false, and sendChat runs the gated handler without auth", () => {
  assert.equal(m.CHAT_ENABLED, false);
  const server = readFileSync(join(root, "src/lib/chat-server.ts"), "utf8");
  assert.match(server, /\.handler\(\(\{ data \}\) => sendChatHandler\(data\)\)/);
  assert.match(server, /\.middleware\(\[serverFnErrors\]\)/);
  assert.doesNotMatch(server, /authMiddleware|lib\/auth/);
  const core = readFileSync(join(root, "src/lib/chat-core.ts"), "utf8");
  assert.match(core, /enabled: CHAT_ENABLED,/);
  // A code constant, not an env var: no deploy setting can open chat.
  const flag = readFileSync(join(root, "src/lib/chat-availability.ts"), "utf8");
  assert.match(flag, /^export const CHAT_ENABLED: boolean = false;$/m);
  assert.doesNotMatch(flag, /process\.env|import\.meta\.env/);
});

test("#33: sendChat is rejected while the flag is off: no key, limiter or xAI touched", async () => {
  const realFetch = globalThis.fetch;
  process.env.XAI_API_KEY = "sk-test";
  globalThis.fetch = () => assert.fail("xAI called while chat is disabled");
  globalThis.__env__ = { CHAT_RATE: { limit: () => assert.fail("limiter reached") } };
  try {
    assert.deepEqual(await m.sendChatHandler(data, T0), {
      ok: false,
      error: m.CHAT_UNAVAILABLE,
    });
    assert.match(m.CHAT_UNAVAILABLE, /temporarily unavailable/);
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.XAI_API_KEY;
    delete globalThis.__env__;
  }
});

test("#33: chatTurn with enabled: false refuses first, even with a key and an open limit", async () => {
  const r = await turn(() => assert.fail("xAI called"), {
    enabled: false,
    limit: () => assert.fail("limit taken"),
  });
  assert.deepEqual(r, { ok: false, error: m.CHAT_UNAVAILABLE });
  // enabled defaults to true so chatTurn's own tests still reach xAI
  assert.deepEqual(await turn(async () => json({ choices: [{ message: { content: "Olá" } }] })), {
    ok: true,
    text: "Olá",
  });
});
