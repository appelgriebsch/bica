/**
 * #33: no sign-in, no sync, no D1. Progress is device-only: the real
 * progress-store + record-progress (bundled with rolldown) against a fake
 * localStorage, with fetch rigged to fail so any network call shows. Plus the
 * repo-wide acceptance greps from the ticket.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".no-auth-test-"));
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
  delete globalThis.localStorage;
  delete globalThis.window;
  rmSync(tmp, { recursive: true, force: true });
});

const bundle = await build({
  input: "entry",
  cwd: root,
  write: false,
  platform: "node",
  resolve: { alias: { "@": join(root, "src") } },
  external: ["zustand", "zustand/middleware"],
  plugins: [
    {
      name: "entry",
      resolveId: (id) => (id === "entry" ? "\0entry" : null),
      load: (id) =>
        id === "\0entry"
          ? `export { useProgress } from "@/lib/progress-store";
             export { persistCompletion } from "@/lib/record-progress";`
          : null,
    },
  ],
  output: { format: "esm" },
});
const file = join(tmp, "entry.mjs");
writeFileSync(file, bundle.output[0].code);

/** A browser-like synchronous localStorage backed by a Map. */
function memoryStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  };
}
let n = 0;
/** A fresh module instance: what a page reload does. */
const load = () => import(`${pathToFileURL(file).href}?v=${++n}`);
const KEY = "bica.progress.v1";
const saved = (storage) => JSON.parse(storage.getItem(KEY)).state;

globalThis.window = globalThis;
globalThis.fetch = () => assert.fail("progress made a network call");

test("a guest lesson completion persists locally, with no server call, and survives a reload", async () => {
  const storage = (globalThis.localStorage = memoryStorage());
  const m = await load();
  assert.equal(m.useProgress.getState().hydrated, true);
  const xp = m.persistCompletion("a1-ola", 3, 4);
  assert.equal(xp, 14);
  assert.deepEqual(
    { ...saved(storage).completed["a1-ola"], completedAt: "t" },
    { quizScore: 3, quizTotal: 4, xp: 14, completedAt: "t" },
  );
  assert.equal(saved(storage).xp, 14);
  assert.equal(saved(storage).streak, 1);

  const again = await load(); // reload
  const s = again.useProgress.getState();
  assert.equal(s.completed["a1-ola"].quizScore, 3);
  assert.equal(s.xp, 14);
  assert.equal(s.streak, 1);
});

test("review, streak and floor persist locally too; nothing sync-related is stored", async () => {
  const storage = (globalThis.localStorage = memoryStorage());
  const m = await load();
  const st = () => m.useProgress.getState();
  st().gradeVocab("v-ola", true);
  st().touchStudy(5);
  st().setFloor("B1");
  const after = (await load()).useProgress.getState();
  assert.equal(after.cards["v-ola"].reps, 1);
  assert.equal(after.xp, 5);
  assert.equal(after.streak, 1);
  assert.equal(after.floor, "B1");
  assert.ok(after.floorUpdatedAt);
  const keys = Object.keys(saved(storage)).sort();
  assert.deepEqual(keys, [
    "cards",
    "completed",
    "floor",
    "floorUpdatedAt",
    "lastStudyDate",
    "streak",
    "xp",
  ]);
  for (const gone of [
    "syncPending",
    "lastSyncedAt",
    "syncing",
    "syncError",
    "changes",
    "markSynced",
  ])
    assert.equal(gone in st(), false, gone);
});

test("getItem throws on load: hydrated stays false and hydrationFailed is set", async () => {
  const orig = console.error;
  const errors = [];
  console.error = (...a) => errors.push(a.join(" "));
  try {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error("SecurityError: storage blocked");
      },
      setItem() {},
      removeItem() {},
    };
    const m = await load();
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(m.useProgress.getState().hydrated, false);
    assert.equal(m.useProgress.getState().hydrationFailed, true);
    assert.ok(
      errors.some((e) => /hydration failed/.test(e)),
      errors.join("\n"),
    );
  } finally {
    console.error = orig;
  }
});

// mergeRemote stays for #34's import; these are the client rules the deleted
// d1-progress tests covered.
const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-02T10:00:00.000Z";
const snap = (o = {}) => ({
  completed: {},
  xp: 0,
  streak: 0,
  lastStudyDate: null,
  cards: {},
  floor: "A1",
  ...o,
});

test("mergeRemote: floor by recency, a tie keeps local, rank max only when undated", async () => {
  globalThis.localStorage = memoryStorage();
  const m = await load();
  const st = () => m.useProgress.getState();
  const floorOf = () => [st().floor, st().floorUpdatedAt];
  m.useProgress.setState({ floor: "B1", floorUpdatedAt: T1 });
  st().mergeRemote(snap({ floor: "C1", floorUpdatedAt: T1 }));
  assert.deepEqual(floorOf(), ["B1", T1]);
  m.useProgress.setState({ floor: "B2", floorUpdatedAt: T1 });
  st().mergeRemote(snap({ floor: "A2", floorUpdatedAt: T2 }));
  assert.deepEqual(floorOf(), ["A2", T2]);
  st().mergeRemote(snap({ floor: "B2", floorUpdatedAt: T1 }));
  assert.deepEqual(floorOf(), ["A2", T2]);
  m.useProgress.setState({ floor: "A2", floorUpdatedAt: null });
  st().mergeRemote(snap({ floor: "B1", floorUpdatedAt: null }));
  assert.deepEqual(floorOf(), ["B1", null]);
  st().mergeRemote(snap({ floor: "A1", floorUpdatedAt: T1 }));
  assert.deepEqual(floorOf(), ["A1", T1]);
  m.useProgress.setState({ floor: "C1", floorUpdatedAt: T1 });
  st().mergeRemote(snap({ floor: "A1", floorUpdatedAt: null }));
  assert.deepEqual(floorOf(), ["C1", T1]);
});

test("mergeRemote: cards never roll back, best lesson score wins, streak follows the later day", async () => {
  globalThis.localStorage = memoryStorage();
  const m = await load();
  const st = () => m.useProgress.getState();
  const card = (reps, due) => ({ interval: 1, ease: 2.5, due, reps, lapses: 0 });
  const row = (quizScore) => ({ quizScore, quizTotal: 4, xp: 8 + quizScore * 2, completedAt: T1 });
  m.useProgress.setState({
    cards: { a: card(3, "2026-10-05"), b: card(1, "2026-10-02") },
    completed: { l1: row(2), l2: row(4) },
    xp: 50,
    streak: 10,
    lastStudyDate: "2026-10-01",
  });
  st().mergeRemote(
    snap({
      cards: { a: card(2, "2026-10-09"), b: card(1, "2026-10-03") },
      completed: { l1: row(3), l2: row(1) },
      xp: 40,
      streak: 1,
      lastStudyDate: "2026-10-13",
    }),
  );
  assert.equal(st().cards.a.reps, 3); // more reps wins
  assert.equal(st().cards.b.due, "2026-10-03"); // equal reps: later due
  assert.equal(st().completed.l1.quizScore, 3);
  assert.equal(st().completed.l2.quizScore, 4);
  assert.equal(st().xp, 50);
  assert.deepEqual([st().streak, st().lastStudyDate], [1, "2026-10-13"]);
});

test("#33 acceptance: no auth leftovers in src, server, scripts, docs or .github (ADR note only)", () => {
  const r = spawnSync(
    "git",
    [
      "grep",
      "-nIiE",
      // The ticket's grep; [h]/[w] stop this file matching itself.
      "better-aut[h]|grok_previe[w]|auth[.]grok[.]me|GROK_AUT[H]|BETTER_AUT[H]",
      "--",
      "src",
      "server",
      "scripts",
      "docs",
      ".github",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const hits = r.stdout.trim().split("\n").filter(Boolean);
  assert.ok(hits.length > 0, "the ADR history note should mention what was removed");
  for (const h of hits) assert.match(h, /^docs\/adr\/0002-d1-database\.md:/, h);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  assert.deepEqual(
    Object.keys(pkg.dependencies).filter((d) => /^better-aut[h]$/.test(d)),
    [],
  );
  assert.equal(lock.packages["node_modules/better-aut" + "h"], undefined);
});

test("#33: the auth, sync and D1 modules and routes are gone, and nothing imports them", () => {
  for (const f of [
    "src/lib/auth",
    "server/middleware/auth-popup.ts",
    "src/routes/api/auth/$.ts",
    "src/routes/login.tsx",
    "src/lib/progress-server.ts",
    "src/lib/progress-merge.ts",
    "src/lib/sync-progress.ts",
    "src/components/progress-sync.tsx",
    "src/lib/progress-hydration.ts",
    "src/lib/db.ts",
    "src/lib/db.local.ts",
    "scripts/ci-d1-provision.mjs",
  ])
    assert.equal(existsSync(join(root, f)), false, f);
  const r = spawnSync(
    "git",
    [
      "grep",
      "-nE",
      "@/lib/(auth|progress-server|progress-merge|sync-progress|progress-hydration|db)\\b|components/progress-sync|VITE_AUTH_ENABLED|useCurrentUser",
      "--",
      "src",
      "server",
      "vite.config.ts",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(r.stdout, "", r.stdout);
  const routes = readFileSync(join(root, "src/routeTree.gen.ts"), "utf8");
  assert.doesNotMatch(routes, /'\/login'|'\/api\/auth/);
  const vite = readFileSync(join(root, "vite.config.ts"), "utf8");
  assert.doesNotMatch(vite, /auth-popup|authPopupPlugin/);
});

test("#33: no Sign in UI: header, /me and the speak pages", () => {
  for (const f of [
    "src/components/app-shell.tsx",
    "src/routes/me.tsx",
    "src/routes/speak/index.tsx",
    "src/routes/speak/$id.tsx",
  ]) {
    const src = readFileSync(join(root, f), "utf8");
    assert.doesNotMatch(src, /Sign in|Sign out|\/login|signIn|signOut/, f);
  }
  const me = readFileSync(join(root, "src/routes/me.tsx"), "utf8");
  assert.doesNotMatch(me, /sync|account/i);
  assert.match(me, /StartLevelPicker/);
  assert.match(me, /DailyReminder/);
});
