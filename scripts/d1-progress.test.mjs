/**
 * Progress merge, bounds, atomicity, offline re-sync and Better Auth against a
 * local D1 (wrangler's getPlatformProxy, in memory). The TS sources are bundled
 * with rolldown, as in sync-queue.test.mjs.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";
import { getPlatformProxy } from "wrangler";
import { betterAuth } from "better-auth";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".d1-test-"));

globalThis.__stub = { online: true, announced: [] };
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = globalThis;
const stubs = {
  entry: `export * from "@/lib/progress-merge";
    export { applyMigrations } from "@/lib/db.local";
    export { lazyDb } from "@/lib/db";
    export { lessons, catalogVocab } from "@/data/curriculum";
    export { useProgress } from "@/lib/progress-store";
    export { syncProgressWithAccount } from "@/lib/sync-progress";`,
  "@/lib/progress-server": `export const fetchProgress = (...a) => globalThis.__stub.fetchProgress(...a);
    export const saveProgressSnapshot = (...a) => globalThis.__stub.saveProgressSnapshot(...a);`,
  "@/lib/online": `export const isOnline = () => globalThis.__stub.online;
    export const announce = (t) => globalThis.__stub.announced.push(t);`,
};
const bundle = await build({
  input: "entry",
  cwd: root,
  write: false,
  platform: "node",
  resolve: { alias: { "@": join(root, "src") } },
  external: ["zustand", "zustand/middleware", "wrangler"],
  transform: { define: { "import.meta.env.DEV": "false" } },
  plugins: [
    {
      name: "stubs",
      resolveId: (id) => (id in stubs ? "\0" + id : null),
      load: (id) => (id.startsWith("\0") ? stubs[id.slice(1)] : null),
    },
    {
      // Vite inlines the migrations; here the test passes them in explicitly.
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
  assert.deepEqual(await m.applyMigrations(db, migrations), ["0001_auth.sql", "0002_progress.sql"]);
});
after(async () => {
  await proxy?.dispose();
  rmSync(tmp, { recursive: true, force: true });
});

let uid = 0;
let user;
beforeEach(() => {
  user = `u${++uid}`;
});

const L = () => m.lessons.map((l) => l.id);
const row = (quizScore, quizTotal, xp, completedAt = "2026-10-01T10:00:00.000Z") => ({
  quizScore,
  quizTotal,
  xp,
  completedAt,
});
const card = (reps, due, extra = {}) => ({ interval: 1, ease: 1, due, reps, lapses: 0, ...extra });
const snap = (o = {}) => ({ completed: {}, xp: 0, streak: 0, lastStudyDate: null, ...o });
/** What the saveProgressSnapshot server function does after auth. */
const save = async (input) => m.saveSnapshot(db, user, m.parseSnapshot({ data: input }));
const load = () => m.loadProgress(db, user);

test("migrations: applied once, wrangler's table, no conversations table", async () => {
  assert.deepEqual(await m.applyMigrations(db, migrations), []);
  const t = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
  const names = t.results.map((r) => r.name);
  for (const n of [
    "user",
    "session",
    "account",
    "verification",
    "lesson_progress",
    "user_stats",
    "d1_migrations",
  ])
    assert.ok(names.includes(n), n);
  assert.ok(!names.includes("conversations"));
});

test("cards: a stale device never rolls an SRS card back, in either order", async () => {
  const newer = { v1: card(5, "2026-10-20") };
  const stale = { v1: card(3, "2026-10-30") };
  await save(snap({ cards: newer }));
  await save(snap({ cards: stale }));
  assert.deepEqual((await load()).cards, newer);

  user = `${user}-b`;
  await save(snap({ cards: stale }));
  await save(snap({ cards: newer }));
  assert.deepEqual((await load()).cards, newer);
});

test("cards: equal reps keep the later due; other cards are untouched", async () => {
  await save(snap({ cards: { a: card(2, "2026-10-10"), b: card(1, "2026-10-01") } }));
  await save(snap({ cards: { a: card(2, "2026-10-12"), c: card(0, "2026-10-02") } }));
  await save(snap({ cards: { a: card(2, "2026-10-11") } }));
  assert.deepEqual((await load()).cards, {
    a: card(2, "2026-10-12"),
    b: card(1, "2026-10-01"),
    c: card(0, "2026-10-02"),
  });
});

test("streak follows the later study day, even when it drops", async () => {
  await save(snap({ streak: 10, lastStudyDate: "2026-10-08" }));
  await save(snap({ streak: 2, lastStudyDate: "2026-10-13" }));
  let p = await load();
  assert.equal(p.streak, 2);
  assert.equal(p.lastStudyDate, "2026-10-13");
  await save(snap({ streak: 10, lastStudyDate: "2026-10-08" })); // stale device later
  assert.equal((await load()).streak, 2);
  await save(snap({ streak: 3, lastStudyDate: "2026-10-13" })); // tie: max
  await save(snap({ streak: 1, lastStudyDate: "2026-10-13" }));
  p = await load();
  assert.equal(p.streak, 3);
});

test("xp takes the max for the total and each lesson; best score with its total; first completed_at", async () => {
  const [a] = L();
  await save(snap({ xp: 120, completed: { [a]: row(3, 5, 40, "2026-10-02T09:00:00.000Z") } }));
  await save(snap({ xp: 80, completed: { [a]: row(5, 6, 20, "2026-10-01T09:00:00.000Z") } }));
  await save(snap({ xp: 100, completed: { [a]: row(2, 2, 30, "2026-10-05T09:00:00.000Z") } }));
  const p = await load();
  assert.equal(p.xp, 120);
  assert.deepEqual(p.completed[a], row(5, 6, 40, "2026-10-01T09:00:00.000Z"));
});

test("saveLesson: the same upsert in one statement", async () => {
  const [a] = L();
  await m.saveLesson(
    db,
    user,
    m.parseLessonSave({ data: { lessonId: a, quizScore: 4, quizTotal: 5, xp: 30 } }),
  );
  await m.saveLesson(
    db,
    user,
    m.parseLessonSave({ data: { lessonId: a, quizScore: 2, quizTotal: 5, xp: 50 } }),
  );
  const r = (await load()).completed[a];
  assert.equal(r.quizScore, 4);
  assert.equal(r.xp, 50);
});

test("floor round-trips; a snapshot without one keeps it", async () => {
  assert.equal((await load()).floor, "A1");
  await save(snap({ floor: "B2" }));
  assert.equal((await load()).floor, "B2");
  await save(snap());
  assert.equal((await load()).floor, "B2");
  await save(snap({ floor: "A2" }));
  assert.equal((await load()).floor, "A2");
});

test("bounds: every invalid snapshot is rejected with the stable message and nothing written", async () => {
  const [a] = L();
  await save(
    snap({ xp: 5, streak: 1, lastStudyDate: "2026-10-01", cards: { v: card(1, "2026-10-02") } }),
  );
  const before = await load();
  const many = Object.fromEntries(
    Array.from({ length: 10_000 }, (_, i) => [`v${i}`, card(1, "2026-10-02")]),
  );
  const bad = [
    snap({ completed: { "no-such-lesson": row(1, 1, 1) } }),
    snap({ completed: { [a]: row(6, 5, 1) } }),
    snap({ completed: { [a]: row(1, 21, 1) } }),
    snap({ completed: { [a]: row(1, 1, m.LESSON_XP_MAX + 1) } }),
    snap({ xp: m.TOTAL_XP_MAX + 1 }),
    snap({ streak: 1e9 }),
    snap({ cards: many }),
    snap({ cards: { v: card(1, "next tuesday") } }),
    snap({ cards: { v: card(-1, "2026-10-02") } }),
    snap({ lastStudyDate: "13.10.2026" }),
    snap({ floor: "Z9" }),
    { ...snap(), pad: "x".repeat(m.BODY_MAX_BYTES) },
    "not an object",
  ];
  for (const s of bad) {
    await assert.rejects(
      save(s),
      (e) => e.message === m.INVALID_PROGRESS,
      JSON.stringify(s).slice(0, 80),
    );
  }
  assert.deepEqual(await load(), before);
});

test("a full-curriculum snapshot is one batch of a constant number of statements", async () => {
  const completed = Object.fromEntries(L().map((id) => [id, row(5, 5, m.LESSON_XP_MAX)]));
  const cards = Object.fromEntries(
    m.catalogVocab().map((v, i) => [v.id ?? `v${i}`, card(2, "2026-10-20")]),
  );
  const s = m.parseSnapshot({
    data: snap({
      completed,
      cards,
      xp: L().length * m.LESSON_XP_MAX,
      streak: 7,
      lastStudyDate: "2026-10-13",
    }),
  });
  let prepares = 0;
  const batches = [];
  const counting = {
    prepare: (q) => (prepares++, db.prepare(q)),
    batch: (st) => (batches.push(st.length), db.batch(st)),
  };
  await m.saveSnapshot(counting, user, s);
  assert.equal(batches.length, 1);
  assert.ok(batches[0] <= 5, String(batches));
  assert.equal(prepares, batches[0], "no per-lesson queries");
  const p = await load();
  assert.equal(Object.keys(p.completed).length, L().length);
  assert.equal(Object.keys(p.cards).length, Object.keys(cards).length);
});

test("atomicity: a batch that fails on its last statement changes nothing", async () => {
  const [a, b] = L();
  await save(
    snap({ xp: 10, streak: 1, lastStudyDate: "2026-10-01", completed: { [a]: row(1, 5, 10) } }),
  );
  const before = await load();
  const s = m.parseSnapshot({
    data: snap({
      xp: 90,
      streak: 4,
      lastStudyDate: "2026-10-12",
      completed: { [a]: row(5, 5, 90), [b]: row(3, 3, 9) },
      cards: { v: card(9, "2026-11-01") },
    }),
  });
  await assert.rejects(
    db.batch([
      ...m.snapshotStatements(db, user, s),
      db.prepare("INSERT INTO no_such_table VALUES (1)"),
    ]),
  );
  assert.deepEqual(await load(), before);
});

test("offline re-sync: a populated device fills a fresh D1; replaying changes nothing", async () => {
  const state = () => m.useProgress.getState();
  const [a, b] = L();
  globalThis.__stub.online = false;
  state().setFloor("B1");
  state().completeLesson(a, { quizScore: 4, quizTotal: 5, xp: 40 });
  state().completeLesson(b, { quizScore: 2, quizTotal: 3, xp: 20 });
  state().gradeVocab("v-ola", true);
  state().gradeVocab("v-obrigado", false);
  state().touchStudy(5);
  assert.deepEqual(await m.syncProgressWithAccount(), { ok: false, error: "offline" });
  assert.equal(state().syncPending, true);

  // Sign in on a fresh D1: the queue replays through the real merge.
  globalThis.__stub.fetchProgress = () => load();
  globalThis.__stub.saveProgressSnapshot = (input) => save(input.data);
  assert.deepEqual((await load()).completed, {});
  globalThis.__stub.online = true;
  assert.deepEqual(await m.syncProgressWithAccount(), { ok: true });
  assert.equal(state().syncPending, false);

  const device = state().snapshot();
  const account = await load();
  assert.deepEqual(account, { ...device, lastStudyDate: device.lastStudyDate ?? null });

  const rows = async () =>
    (
      await db
        .prepare("SELECT * FROM lesson_progress WHERE user_id = ?1 ORDER BY lesson_id")
        .bind(user)
        .all()
    ).results.map(({ updated_at, ...r }) => r);
  const statsRow = async () => {
    const { updated_at, ...r } = await db
      .prepare("SELECT * FROM user_stats WHERE user_id = ?1")
      .bind(user)
      .first();
    return r;
  };
  const first = [await rows(), await statsRow()];
  state().touchStudy(0); // queue again without new progress
  assert.deepEqual(await m.syncProgressWithAccount(), { ok: true });
  assert.deepEqual([await rows(), await statsRow()], first);
  assert.deepEqual(state().snapshot(), device);
});

test("auth: Better Auth on local D1 through the lazy binding", async () => {
  globalThis.__env__ = { DB: db };
  try {
    const auth = betterAuth({
      database: m.lazyDb,
      secret: "test-secret-at-least-32-characters-long",
      baseURL: "http://localhost:8080",
      emailAndPassword: { enabled: true },
    });
    const { headers, response } = await auth.api.signUpEmail({
      body: { email: "ana@example.com", password: "correct-horse-9", name: "Ana" },
      returnHeaders: true,
    });
    assert.equal(response.user.email, "ana@example.com");
    const cookie = headers.get("set-cookie").split(";")[0];
    const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
    assert.equal(session.user.id, response.user.id);
    const count = async (t, col) =>
      (
        await db
          .prepare(`SELECT count(*) AS n FROM "${t}" WHERE "${col}" = ?1`)
          .bind(response.user.id)
          .first()
      ).n;
    assert.equal(await count("user", "id"), 1);
    assert.equal(await count("account", "userId"), 1);
    assert.equal(await count("session", "userId"), 1);
    const signedIn = await auth.api.signInEmail({
      body: { email: "ana@example.com", password: "correct-horse-9" },
    });
    assert.equal(signedIn.user.id, response.user.id);
    assert.equal(await count("session", "userId"), 2);
  } finally {
    delete globalThis.__env__;
  }
});
