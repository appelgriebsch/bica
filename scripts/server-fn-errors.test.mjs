/**
 * #28: server-function statuses. The classifier, the real `serverFnErrors`
 * middleware (bundled with rolldown; setResponseStatus stubbed) wrapping the
 * real sendChat validator. The built Worker probes (400 over HTTP) are in
 * hardening-built.test.mjs. Sign-in and its 401/403 went in #33.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";
import {
  INVALID_INPUT,
  classifyServerFnError,
  isUndecodablePayloadError,
  isUnknownServerFnError,
} from "../src/lib/server-fn-status.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".serverfn-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const bundle = await build({
  input: "entry",
  cwd: root,
  write: false,
  platform: "node",
  resolve: { alias: { "@": join(root, "src") } },
  external: ["zod", "@tanstack/react-start"],
  transform: { define: { "import.meta.env.DEV": "false" } },
  plugins: [
    {
      name: "entry",
      resolveId: (id) =>
        id === "entry" ? "\0entry" : id.endsWith("http-status.server") ? "\0status" : null,
      load: (id) =>
        id === "\0entry"
          ? `export { serverFnErrors } from "@/lib/server-fn-errors";
             export { chatInput } from "@/lib/chat-core";`
          : id === "\0status"
            ? `export const setResponseStatus = (s) => { globalThis.__status = s; };`
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
  output: { format: "esm", inlineDynamicImports: true },
});
const file = join(tmp, "entry.mjs");
writeFileSync(file, bundle.output[0].code);
const m = await import(pathToFileURL(file).href);

/** Run the middleware's server half around `inner`; returns [status, thrown]. */
async function through(inner) {
  globalThis.__status = undefined;
  const server = m.serverFnErrors.options.server;
  try {
    const out = await server({ next: async () => inner() });
    return [globalThis.__status, undefined, out];
  } catch (err) {
    return [globalThis.__status, err];
  }
}

const throwsFrom = (fn) => () => {
  fn();
  return "unreachable";
};

test("a zod failure (sendChat's validator) → 400 invalid_input", async () => {
  const [status, thrown] = await through(throwsFrom(() => m.chatInput.parse({ scenarioId: 1 })));
  assert.equal(status, 400);
  assert.equal(thrown.message, INVALID_INPUT);
});

test("a server fault keeps its error and sets no status (stays 500)", async () => {
  const boom = new Error("Could not reach the account.");
  const [status, thrown] = await through(() => {
    throw boom;
  });
  assert.equal(status, undefined);
  assert.equal(thrown, boom);
});

test("a valid call passes through untouched", async () => {
  const [status, thrown, out] = await through(() => ({ result: { ok: true } }));
  assert.equal(status, undefined);
  assert.equal(thrown, undefined);
  assert.deepEqual(out, { result: { ok: true } });
});

test("classifier ignores statuses and plain objects; 401/403 are no longer mapped (#33)", () => {
  assert.equal(classifyServerFnError({ status: 500 }), null);
  assert.equal(
    classifyServerFnError(Object.assign(new Error("Unauthorized"), { status: 401 })),
    null,
  );
  assert.equal(classifyServerFnError(Object.assign(new Error("Forbidden"), { status: 403 })), null);
  assert.equal(classifyServerFnError(null), null);
  assert.equal(classifyServerFnError("Unauthorized"), null);
});

test("Seroval decode failures are recognised, other 500s are not", () => {
  assert.ok(
    isUndecodablePayloadError(
      '{"t":10,"p":{"k":["error"],"v":[{"s":{"message":{"t":1,"s":"Seroval Error (step: 3)"}}}]}}',
    ),
  );
  assert.equal(isUndecodablePayloadError('{"message":"Could not reach the account."}'), false);
});

test("#55: unknown server-fn ids are recognised; a real error is not", () => {
  for (const body of [
    "Server function info not found for deadbeef",
    "Server function not accessible from client: sendChat",
    '{"message":"Server function info not found for deadbeef"}',
  ]) {
    assert.equal(isUnknownServerFnError(body), true, body);
  }
  for (const body of [
    "",
    undefined,
    "Could not reach the account.",
    "Seroval Error (step: 3)",
    "Server function",
  ]) {
    assert.equal(isUnknownServerFnError(body), false, String(body));
  }
  // The nitro wrapper is the only caller. Dropping the branch leaves the 500.
  const mw = readFileSync(join(root, "server/middleware/server-fn-errors.ts"), "utf8");
  assert.match(mw, /isUnknownServerFnError\(body\)/);
  assert.match(mw, /jsonError\(404, "not_found"\)/);
});
