import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".sync-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

// Bundle the real store + sync with the server functions and the online module stubbed.
const calls = [];
globalThis.__stub = {
  online: true,
  announced: [],
  fetchProgress: async () => (calls.push("fetch"), {}),
  saveProgressSnapshot: async () => {
    calls.push("save");
    await globalThis.__stub.duringSave?.();
  },
};
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = globalThis;
const stubs = {
  "@/lib/progress-server": `export const fetchProgress = (...a) => globalThis.__stub.fetchProgress(...a);
    export const saveProgressSnapshot = (...a) => globalThis.__stub.saveProgressSnapshot(...a);`,
  "@/lib/online": `export const isOnline = () => globalThis.__stub.online;
    export const announce = (t) => globalThis.__stub.announced.push(t);`,
};
const bundle = await build({
  input: join(root, "scripts/sync-queue.entry.mjs"),
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
const file = join(tmp, "entry.mjs");
(await import("node:fs")).writeFileSync(file, bundle.output[0].code);
const { useProgress, syncProgressWithAccount } = await import(pathToFileURL(file).href);
const state = () => useProgress.getState();

test("every local change action queues a sync", () => {
  for (const act of [
    () => state().setFloor("B1"),
    () => state().touchStudy(3),
    () => state().gradeVocab("v1", true),
    () => state().completeLesson("a1-ola", { quizScore: 3, quizTotal: 4, xp: 14 }),
  ]) {
    state().markSynced();
    assert.equal(state().syncPending, false);
    act();
    assert.equal(state().syncPending, true);
  }
});

test("offline: stays queued, nothing sent; online: flushes, clears, says Synced", async () => {
  state().setFloor("A2");
  calls.length = 0;
  globalThis.__stub.online = false;
  assert.deepEqual(await syncProgressWithAccount(), { ok: false, error: "offline" });
  assert.deepEqual(calls, []);
  assert.equal(state().syncPending, true);

  globalThis.__stub.online = true;
  assert.equal((await syncProgressWithAccount()).ok, true);
  assert.deepEqual(calls, ["fetch", "save"]);
  assert.equal(state().syncPending, false);
  assert.deepEqual(globalThis.__stub.announced.slice(-1), ["Synced"]);
});

test("a change during the push keeps the flag (markSynced compares the snapshot)", async () => {
  state().setFloor("B2");
  globalThis.__stub.announced.length = 0;
  globalThis.__stub.duringSave = () => state().gradeVocab("v2", false);
  try {
    assert.equal((await syncProgressWithAccount()).ok, true);
  } finally {
    globalThis.__stub.duringSave = undefined;
  }
  assert.equal(state().syncPending, true, "the grade made during the push is still queued");
  assert.deepEqual(globalThis.__stub.announced, [], "no Synced while something is still queued");
});
