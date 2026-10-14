/** #28: /api/csp-report rate cap (20/60 s) and 8 KB body cap. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_BODY_BYTES, createCspReportHandler } from "../src/lib/csp-report.mjs";

const URL_ = "https://bica.test/api/csp-report";
const report = () =>
  new Request(URL_, {
    method: "POST",
    headers: { "content-type": "application/csp-report" },
    body: JSON.stringify({ "csp-report": { "violated-directive": "script-src" } }),
  });

function setup() {
  const logged = [];
  let t = 1_000_000;
  const handle = createCspReportHandler({ log: (...a) => logged.push(a), now: () => t });
  return { logged, handle, advance: (ms) => (t += ms) };
}

test("a small report is logged and answered 204", async () => {
  const { logged, handle } = setup();
  const res = await handle(report());
  assert.equal(res.status, 204);
  assert.equal(logged.length, 1);
  assert.match(logged[0][1], /violated-directive/);
});

test("only 20 reports per 60 s window are logged; the window resets", async () => {
  const { logged, handle, advance } = setup();
  for (let i = 0; i < 25; i++) assert.equal((await handle(report())).status, 204);
  assert.equal(logged.length, 20);
  advance(60_001);
  await handle(report());
  assert.equal(logged.length, 21);
});

test("413 when content-length is over 8 KB, without reading the body", async () => {
  const { logged, handle } = setup();
  let pulled = false;
  const body = new ReadableStream(
    {
      // A small body: only the header can trigger the 413.
      pull(c) {
        pulled = true;
        c.enqueue(new TextEncoder().encode("{}"));
        c.close();
      },
    },
    { highWaterMark: 0 },
  );
  const req = new Request(URL_, {
    method: "POST",
    headers: { "content-length": String(MAX_BODY_BYTES + 1) },
    body,
    duplex: "half",
  });
  const res = await handle(req);
  assert.equal(res.status, 413);
  assert.equal(pulled, false);
  assert.equal(logged.length, 0);
});

test("413 by streamed size: no/lying content-length, reading stops past 8 KB", async () => {
  const { logged, handle } = setup();
  let chunks = 0;
  const body = new ReadableStream({
    pull(c) {
      chunks++;
      if (chunks > 100) return c.close(); // 400 KB if read fully
      c.enqueue(new Uint8Array(4096).fill(120));
    },
  });
  const req = new Request(URL_, {
    method: "POST",
    headers: { "content-length": "10" },
    body,
    duplex: "half",
  });
  const res = await handle(req);
  assert.equal(res.status, 413);
  assert.ok(chunks <= 5, `read ${chunks} chunks`);
  assert.equal(logged.length, 0);
});

test("a body of exactly 8 KB is accepted", async () => {
  const { handle } = setup();
  const req = new Request(URL_, { method: "POST", body: "x".repeat(MAX_BODY_BYTES) });
  assert.equal((await handle(req)).status, 204);
});
