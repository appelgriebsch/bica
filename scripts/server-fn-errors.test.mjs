/**
 * #28: server-function statuses. The classifier, the real `serverFnErrors`
 * middleware (bundled with rolldown; setResponseStatus stubbed) wrapping the
 * real validators and auth errors, and the client-side 400 check. The built
 * Worker probes (401/400/403 over HTTP) are in hardening-built.test.mjs.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";
import {
  INVALID_INPUT,
  classifyServerFnError,
  isInvalidInputError,
  isUndecodablePayloadError,
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
             export { parseSnapshot, parseLessonSave } from "@/lib/progress-merge";
             export { chatInput } from "@/lib/chat-core";
             export { UnauthorizedError } from "@/lib/auth/verify.server";
             export { CrossSiteRequestError } from "@/lib/auth/isolation.server";`
          : id === "\0status"
            ? `export const setResponseStatus = (s) => { globalThis.__status = s; };`
            : null,
    },
    {
      // verify/isolation import server-only modules; the error classes need none of them.
      name: "stub-server",
      resolveId: (id) =>
        /^@tanstack\/react-start\/server$|\/db$|\.\/server$/.test(id) ? "\0stub" : null,
      load: (id) =>
        id === "\0stub"
          ? `export const getRequest = () => undefined; export const boundDb = () => undefined;
             export const auth = {}; export const authConfigured = true;`
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

test("no session → 401 with the same Unauthorized error", async () => {
  const err = new m.UnauthorizedError();
  const [status, thrown] = await through(() => {
    throw err;
  });
  assert.equal(status, 401);
  assert.equal(thrown, err);
  assert.equal(thrown.message, "Unauthorized");
});

test("cross-site → 403", async () => {
  const [status, thrown] = await through(() => {
    throw new m.CrossSiteRequestError();
  });
  assert.equal(status, 403);
  assert.match(thrown.message, /Forbidden/);
});

test("out-of-bounds snapshot and lesson save → 400 invalid_input", async () => {
  for (const bad of [
    () => m.parseSnapshot({ floor: "Z9" }),
    () => m.parseSnapshot("garbage"),
    () => m.parseLessonSave({ lessonId: "x", quizScore: -5, quizTotal: 1, xp: 1 }),
  ]) {
    const [status, thrown] = await through(throwsFrom(bad));
    assert.equal(status, 400);
    assert.equal(thrown.message, INVALID_INPUT);
  }
});

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

test("classifier ignores non-error statuses and plain objects", () => {
  assert.equal(classifyServerFnError({ status: 500 }), null);
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

test("client: invalid_input and the old snapshot message count as a 400 bug", () => {
  assert.ok(isInvalidInputError(new Error(INVALID_INPUT)));
  assert.ok(isInvalidInputError(new Error("Invalid progress snapshot")));
  assert.equal(isInvalidInputError(new Error("Unauthorized")), false);
});
