/** ADR 0011: cookieless Cloudflare Web Analytics gating — production only, fail closed. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CF_BEACON_SRC,
  initAnalytics,
  loadBeacon,
  resetAnalyticsForTest,
} from "../src/lib/analytics.mjs";
import { buildCsp, CF_BEACON_ORIGIN, CF_RUM_ORIGIN } from "../src/lib/security-headers.mjs";

function fakeDocument() {
  const scripts = [];
  const doc = {
    querySelector: (sel) =>
      sel === "script[data-cf-beacon]" && scripts.length > 0 ? scripts[0] : null,
    createElement: () => {
      const script = {
        defer: false,
        src: "",
        attrs: {},
        setAttribute(name, value) {
          this.attrs[name] = value;
        },
      };
      scripts.push(script);
      return script;
    },
    head: { appendChild: (el) => el },
  };
  return { doc, scripts };
}

const health = (stage) => async () => ({ ok: true, stage, sha: "a".repeat(40) });

async function run(deps) {
  resetAnalyticsForTest();
  await initAnalytics(deps);
}

test("production with a token injects the beacon exactly once", async () => {
  const { doc, scripts } = fakeDocument();
  await run({ token: "tok123", health: health("production"), doc });
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, CF_BEACON_SRC);
  assert.equal(scripts[0].defer, true);
  assert.deepEqual(JSON.parse(scripts[0].attrs["data-cf-beacon"]), { token: "tok123" });
  await run({ token: "tok123", health: health("production"), doc });
  assert.equal(scripts.length, 1, "at most once per load");
});

test("staging, health failure, and empty token inject nothing", async () => {
  const cases = [
    { token: "tok", health: health("staging") },
    { token: "tok", health: async () => { throw new Error("offline"); } },
    { token: "tok", health: async () => undefined },
    { token: "  ", health: health("production") },
    { token: "", health: health("production") },
  ];
  for (const deps of cases) {
    const { doc, scripts } = fakeDocument();
    await run({ ...deps, doc });
    assert.equal(scripts.length, 0, JSON.stringify(deps.token));
  }
});

test("default health probe: 503/offline/staging inject nothing, 200 production injects", async () => {
  const realFetch = globalThis.fetch;
  try {
    const cases = [
      [{ ok: false, status: 503 }, 0],
      [{ ok: true, json: async () => ({ ok: true, stage: "production", sha: "a".repeat(40) }) }, 1],
      [{ ok: true, json: async () => ({ ok: true, stage: "staging", sha: "a".repeat(40) }) }, 0],
    ];
    for (const [response, expected] of cases) {
      globalThis.fetch = async () => response;
      const { doc, scripts } = fakeDocument();
      await run({ token: "tok", doc });
      assert.equal(scripts.length, expected, JSON.stringify(response));
    }
    globalThis.fetch = async () => {
      throw new Error("offline");
    };
    const { doc, scripts } = fakeDocument();
    await run({ token: "tok", doc });
    assert.equal(scripts.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("loadBeacon is idempotent per document", () => {
  const { doc, scripts } = fakeDocument();
  assert.equal(loadBeacon(doc, "t"), true);
  assert.equal(loadBeacon(doc, "t"), false);
  assert.equal(scripts.length, 1);
});

test("the shipped CSP allows the beacon host in script-src and the RUM host in connect-src", () => {
  const csp = buildCsp("N0nce");
  const esc = (s) => s.replaceAll(".", "\\.");
  assert.match(csp, new RegExp(`script-src [^;]*${esc(CF_BEACON_ORIGIN)};`));
  assert.match(csp, new RegExp(`connect-src [^;]*${esc(CF_RUM_ORIGIN)};`));
});
