/**
 * #15 hydration gate: with a persist store whose hydration takes 2 s (async
 * localStorage), nothing is pushed before it resolves and exactly one sync
 * runs after. A failed hydration never syncs. Real store, sync and gate,
 * bundled with rolldown (server functions stubbed).
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".hydration-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const calls = [];
globalThis.__stub = {
  // A fresh, empty account, as loadProgress returns it.
  fetchProgress: async () => (
    calls.push("fetch"),
    {
      completed: {},
      xp: 0,
      streak: 0,
      lastStudyDate: null,
      cards: {},
      floor: "A1",
      floorUpdatedAt: null,
    }
  ),
  saveProgressSnapshot: async (input) => calls.push(["save", input.data]),
};
globalThis.window = globalThis;
const stubs = {
  entry: `export { useProgress } from "@/lib/progress-store";
    export { syncProgressWithAccount } from "@/lib/sync-progress";
    export { whenHydrated } from "@/lib/progress-hydration";`,
  "@/lib/progress-server": `export const fetchProgress = (...a) => globalThis.__stub.fetchProgress(...a);
    export const saveProgressSnapshot = (...a) => globalThis.__stub.saveProgressSnapshot(...a);`,
  "@/lib/online": `export const isOnline = () => true; export const announce = () => {};`,
};
const bundle = await build({
  input: "entry",
  cwd: root,
  write: false,
  platform: "node",
  resolve: { alias: { "@": join(root, "src") } },
  external: ["zustand", "zustand/middleware"],
  plugins: [
    {
      name: "stubs",
      resolveId: (id) => (id in stubs ? "\0" + id : null),
      load: (id) => (id.startsWith("\0") ? stubs[id.slice(1)] : null),
    },
  ],
  output: { format: "esm" },
});
/** A fresh copy of the modules (a new store) per import. */
let copies = 0;
async function load() {
  const file = join(tmp, `entry-${++copies}.mjs`);
  writeFileSync(file, bundle.output[0].code);
  return import(pathToFileURL(file).href);
}

const device = {
  state: {
    completed: {
      "a1-ola": { quizScore: 4, quizTotal: 5, xp: 40, completedAt: "2026-10-01T10:00:00.000Z" },
    },
    xp: 40,
    streak: 3,
    lastStudyDate: "2026-10-13",
    floor: "A2",
    floorUpdatedAt: "2026-10-13T09:00:00.000Z",
    cards: {},
    syncPending: true,
  },
  version: 0,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test("slow hydration (2 s): no push before it, exactly one sync after, with the device data", async () => {
  let resolve;
  globalThis.localStorage = {
    getItem: () => new Promise((r) => (resolve = () => r(JSON.stringify(device)))),
    setItem() {},
    removeItem() {},
  };
  const m = await load();
  let synced = 0;
  const stop = m.whenHydrated(m.useProgress.persist, () => {
    m.useProgress.getState().markHydrated();
    synced++;
    void m.syncProgressWithAccount();
  });
  setTimeout(() => resolve(), 2000);

  await sleep(1000); // past the old 800 ms fallback
  assert.equal(m.useProgress.getState().hydrated, false);
  assert.deepEqual(await m.syncProgressWithAccount(), { ok: false, error: "not-hydrated" });
  assert.deepEqual(calls, [], "nothing pulled or pushed before hydration");

  await sleep(1300);
  await sleep(0);
  assert.equal(synced, 1);
  assert.equal(m.useProgress.getState().hydrated, true);
  assert.equal(calls.length, 2, JSON.stringify(calls));
  assert.equal(calls[0], "fetch");
  const [, pushed] = calls[1];
  assert.deepEqual(pushed.completed, device.state.completed);
  assert.equal(pushed.xp, 40);
  assert.equal(pushed.floor, "A2");
  stop();
});

test("a failed hydration never syncs and is logged", async () => {
  calls.length = 0;
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  try {
    globalThis.localStorage = {
      getItem: () => Promise.reject(new Error("storage broken")),
      setItem() {},
      removeItem() {},
    };
    const m = await load();
    let synced = 0;
    m.whenHydrated(m.useProgress.persist, () => synced++);
    await sleep(1200);
    assert.equal(synced, 0);
    assert.equal(m.useProgress.getState().hydrated, false);
    assert.deepEqual(await m.syncProgressWithAccount(), { ok: false, error: "not-hydrated" });
    assert.deepEqual(calls, []);
    assert.equal(m.useProgress.getState().syncError, "hydration-failed");
    assert.ok(
      errors.some((e) => /hydration failed/.test(e)),
      errors.join("\n"),
    );
  } finally {
    console.error = orig;
  }
});

test("getItem throws on load: hydrated stays false, sync refuses, error shown", async () => {
  calls.length = 0;
  const orig = console.error;
  console.error = () => {};
  try {
    globalThis.localStorage = {
      getItem: () => {
        throw new Error("SecurityError: storage blocked");
      },
      setItem() {},
      removeItem() {},
    };
    const m = await load();
    let synced = 0;
    m.whenHydrated(m.useProgress.persist, () => synced++);
    await sleep(50);
    assert.equal(synced, 0);
    assert.equal(m.useProgress.getState().hydrated, false);
    assert.equal(m.useProgress.getState().syncError, "hydration-failed");
    assert.deepEqual(await m.syncProgressWithAccount(), { ok: false, error: "not-hydrated" });
    assert.deepEqual(calls, []);
  } finally {
    console.error = orig;
  }
});

test("synchronous storage (the browser): hydrated at once, sync allowed", async () => {
  calls.length = 0;
  globalThis.localStorage = {
    getItem: () => JSON.stringify(device),
    setItem() {},
    removeItem() {},
  };
  const m = await load();
  assert.equal(m.useProgress.getState().hydrated, true);
  assert.equal(m.useProgress.persist.hasHydrated(), true);
  let synced = 0;
  m.whenHydrated(m.useProgress.persist, () => synced++);
  assert.equal(synced, 1);
  assert.equal((await m.syncProgressWithAccount()).ok, true);
  assert.equal(calls.length, 2);
});

test("gate: an already-hydrated store is ready at once, without a second rehydrate; cleanup cancels", async () => {
  const m = await load();
  let rehydrates = 0;
  let finish = [];
  const persist = (hydrated) => ({
    hasHydrated: () => hydrated,
    onFinishHydration: (fn) => (finish.push(fn), () => (finish = finish.filter((f) => f !== fn))),
    rehydrate: () => void rehydrates++,
  });
  let ready = 0;
  m.whenHydrated(persist(true), () => ready++);
  assert.deepEqual([ready, rehydrates], [1, 0]);
  finish.forEach((f) => f()); // a later finish event doesn't run it again
  assert.equal(ready, 1);
  finish = [];
  const stop = m.whenHydrated(persist(false), () => ready++);
  assert.deepEqual([ready, rehydrates], [1, 1]);
  stop();
  finish.forEach((f) => f());
  assert.equal(ready, 1);
});
