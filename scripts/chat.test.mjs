/**
 * #13 chat limits, timeout and caps: the limiter (in memory and against a local
 * D1 via getPlatformProxy), the binding wiring, chatTurn with a mocked fetch,
 * and the input validator. TS sources bundled with rolldown.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";
import { getPlatformProxy } from "wrangler";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".chat-test-"));
const bundle = await build({
  input: "entry",
  cwd: root,
  write: false,
  platform: "node",
  resolve: { alias: { "@": join(root, "src") } },
  external: ["zod", "wrangler"],
  transform: { define: { "import.meta.env.DEV": "false" } },
  plugins: [
    {
      name: "entry",
      resolveId: (id) => (id === "entry" ? "\0entry" : null),
      load: (id) =>
        id === "\0entry"
          ? `export * from "@/lib/chat-limit"; export * from "@/lib/chat-core";
             export { applyMigrations } from "@/lib/db.local";`
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

const migrations = Object.fromEntries(
  readdirSync(join(root, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => [`/migrations/${f}`, readFileSync(join(root, "migrations", f), "utf8")]),
);
let proxy, db;
before(async () => {
  proxy = await getPlatformProxy({ persist: false });
  db = proxy.env.DB;
  await m.applyMigrations(db, migrations);
  for (const u of ["a", "b"])
    await db
      .prepare(
        `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt) VALUES (?1, ?1, ?1 || '@t', 0, 'x', 'x')`,
      )
      .bind(u)
      .run();
});
after(async () => {
  delete globalThis.__env__;
  await proxy?.dispose();
  rmSync(tmp, { recursive: true, force: true });
});

const T0 = Date.UTC(2026, 9, 14, 10, 0, 0); // a 10-min window start
const limits = { perMinute: 1000, per10Min: 3, perDay: 5 };
const open = async () => true;
const counters = {
  memory: () => m.memoryCounter(),
  d1: async () => {
    await db.prepare("DELETE FROM chat_usage").run();
    return m.d1Counter(db);
  },
};
const chatOk = (counter) => counter("b", T0, m.DEFAULT_LIMITS);
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

test("limit (d1): at most two rows per user; counted across handles (isolates)", async () => {
  await db.prepare("DELETE FROM chat_usage").run();
  await take(m.d1Counter(db), "a", T0);
  await take(m.d1Counter(db), "a", T0 + 1);
  await take(m.d1Counter(db), "a", T0 + 2);
  assert.equal((await take(m.d1Counter(db), "a", T0 + 3)).ok, false); // a new counter, same DB
  await take(m.d1Counter(db), "a", T0 + 24 * 3600_000);
  const rows = await db.prepare("SELECT window FROM chat_usage WHERE user_id = 'a'").all();
  assert.equal(rows.results.length, 2);
});

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
    DB: db,
    CHAT_RATE: { limit: async ({ key }) => (keys.push(key), { success: false }) },
  };
  const l = m.chatLimiter();
  assert.equal(await l.burst("a", T0), false);
  assert.deepEqual(keys, ["a"]);
  delete globalThis.__env__;
  assert.equal(await m.chatLimiter().burst("zz", T0), true); // memory fallback
  assert.deepEqual(keys, ["a"]);
});

test("wiring: with the Worker's DB, chatLimiter counts in chat_usage; without it, in memory", async () => {
  await db.prepare("DELETE FROM chat_usage").run();
  const rows = async () =>
    (await db.prepare("SELECT turns FROM chat_usage WHERE user_id = 'b'").all()).results.length;
  globalThis.__env__ = { DB: db };
  try {
    assert.equal(await chatOk(m.chatLimiter().counter), "ok");
    assert.equal(await rows(), 2); // 10-min and day rows
  } finally {
    delete globalThis.__env__;
  }
  await db.prepare("DELETE FROM chat_usage").run();
  assert.equal(await chatOk(m.chatLimiter().counter), "ok");
  assert.equal(await rows(), 0);
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
  const within = (p) =>
    Promise.race([
      p,
      new Promise((r) => setTimeout(() => r("still hanging after 2 s"), 2000).unref()),
    ]);
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
