import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { setNavigator } from "./test-helpers.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
// Compile inside the repo so `react` resolves from node_modules.
const tmp = mkdtempSync(join(root, ".online-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
async function load(file) {
  const out = ts.transpileModule(readFileSync(join(root, file), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const dest = join(tmp, file.replace(/\W/g, "_") + ".mjs");
  writeFileSync(dest, out);
  return import(pathToFileURL(dest).href);
}

// Fake browser: navigator.onLine, online/offline events, a fetch we control.
const events = {};
const probes = [];
let reachable = true;
let status = 204;
setNavigator({ onLine: true });
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window = {
  addEventListener: (t, fn) => (events[t] = fn),
  fetch: async (url, init) => {
    probes.push({ url, method: init?.method });
    if (!reachable) throw new TypeError("Failed to fetch");
    return { ok: status < 300, status };
  },
};
globalThis.location = { search: "", href: "https://bica.test/", origin: "https://bica.test" };
// online.ts' own timers (debounce, 15 s retry) must never keep the test process
// alive: a regression then fails fast instead of hanging. The test's waits use the real timer.
const realSetTimeout = globalThis.setTimeout;
globalThis.setTimeout = (fn, ms) => realSetTimeout(fn, ms).unref();
const online = await load("src/lib/online.ts");
const features = await load("src/lib/online-features.ts");
const wait = (ms) => new Promise((r) => realSetTimeout(r, ms));

test("online state: events, HEAD probe, debounce, request-failure flip", async (t) => {
  online.startOnlineWatch(); // what the hook's subscribe() does on first use
  assert.equal(online.isOnline(), true);

  await t.test("offline event flips at once", () => {
    navigator.onLine = false;
    events.offline();
    assert.equal(online.isOnline(), false);
  });

  await t.test("online event waits the debounce, then a passing HEAD probe", async () => {
    navigator.onLine = true;
    probes.length = 0;
    events.online();
    await wait(online.DEBOUNCE_MS - 300);
    assert.equal(online.isOnline(), false, "still offline inside the debounce");
    await wait(500);
    assert.equal(online.isOnline(), true);
    assert.deepEqual(probes, [{ url: online.PROBE_URL, method: "HEAD" }]);
  });

  await t.test("failed probe keeps it offline", async () => {
    navigator.onLine = false;
    events.offline();
    navigator.onLine = true;
    reachable = false;
    events.online();
    await wait(online.DEBOUNCE_MS + 200);
    assert.equal(online.isOnline(), false);
    reachable = true;
  });

  await t.test("a non-204 answer (captive portal) keeps it offline", async () => {
    navigator.onLine = false;
    events.offline();
    navigator.onLine = true;
    status = 200;
    events.online();
    await wait(online.DEBOUNCE_MS + 200);
    assert.equal(online.isOnline(), false);
    status = 204;
  });

  await t.test("any failed request flips offline", async () => {
    online.setFakeOffline(false);
    await wait(online.DEBOUNCE_MS + 200);
    assert.equal(online.isOnline(), true);
    reachable = false;
    await assert.rejects(window.fetch("/_serverFn/x"));
    assert.equal(online.isOnline(), false);
    reachable = true;
  });

  await t.test("a failing third-party request does not flip it", async () => {
    online.setFakeOffline(false);
    await wait(online.DEBOUNCE_MS + 200);
    assert.equal(online.isOnline(), true);
    reachable = false;
    try {
      await assert.rejects(window.fetch("https://cdn.example.com/x.js"));
      assert.equal(online.isOnline(), true, "cross-origin failure must not flip the app offline");
    } finally {
      reachable = true;
    }
  });

  await t.test("fake offline wins over a working network", async () => {
    online.setFakeOffline(true);
    assert.equal(online.isOnline(), false);
    await assert.rejects(window.fetch("/anything"));
    online.setFakeOffline(false);
    await wait(online.DEBOUNCE_MS + 200);
    assert.equal(online.isOnline(), true);
  });
});

test("registry is complete and every gated control uses a registered feature", () => {
  const reg = features.ONLINE_FEATURES;
  for (const id of ["conversas", "multiplayer"]) assert.ok(reg[id], id);
  // #33: no sign-in or sync, so neither is an online feature any more.
  for (const id of ["signIn", "sync"]) assert.equal(reg[id], undefined, id);
  for (const [key, f] of Object.entries(reg)) {
    assert.equal(f.id, key);
    for (const field of ["name", "reason"]) {
      assert.ok(f[field].en && f[field].pt, `${key}.${field} has EN and PT`);
    }
  }
  const used = execFileSync("grep", ["-rhoE", 'feature="[a-zA-Z]+"', join(root, "src")], {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .map((s) => s.slice(9, -1));
  for (const id of used) assert.ok(reg[id], `feature="${id}" is registered`);
  assert.ok(used.includes("conversas"), "conversas has a gated entry point");
});
