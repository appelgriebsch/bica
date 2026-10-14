/**
 * The D1 gate: a build without a `DB` binding has no database (no silent
 * fallback), the shim follows the per-request binding, and auth off on a bound
 * D1 fails closed instead of sharing the dev user.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, afterEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "rolldown";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".db-gate-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
afterEach(() => delete globalThis.__env__);

process.env.VITE_AUTH_ENABLED = "false";
const bundle = await build({
  input: "entry",
  cwd: root,
  write: false,
  platform: "node",
  resolve: { alias: { "@": join(root, "src") } },
  // Packages stay external; DEV=false is what both production builds see.
  external: (id) =>
    !id.startsWith(".") &&
    !id.startsWith("@/") &&
    !id.startsWith("/") &&
    id !== "entry" &&
    !id.startsWith("\0"),
  transform: { define: { "import.meta.env.DEV": "false" } },
  plugins: [
    {
      name: "entry",
      resolveId: (id) => (id === "entry" ? "\0entry" : null),
      load: (id) =>
        id === "\0entry"
          ? `export { boundDb, getDb, lazyDb } from "@/lib/db";
             export { requireUserId, DEV_USER_ID } from "@/lib/auth/verify.server";`
          : null,
    },
  ],
  output: { format: "esm" },
});
const file = join(tmp, "entry.mjs");
writeFileSync(file, bundle.output[0].code);
const m = await import(pathToFileURL(file).href);

const fakeDb = (tag) => ({
  prepare(q) {
    const stmt = { bind: () => stmt, first: async () => ({ tag, q }) };
    return stmt;
  },
  batch: async () => [],
  exec: async () => ({}),
});

test("no DB binding: no database at all, never a silent fallback", async () => {
  assert.equal(m.boundDb(), undefined);
  await assert.rejects(m.getDb(), /no D1 binding named DB/);
  await assert.rejects(m.lazyDb.prepare("SELECT 1").bind().first(), /no D1 binding named DB/);
});

test("the lazy shim resolves the binding on every call", async () => {
  globalThis.__env__ = { DB: fakeDb("a") };
  assert.equal(await m.getDb(), globalThis.__env__.DB);
  assert.equal((await m.lazyDb.prepare("SELECT 1").bind().first()).tag, "a");
  globalThis.__env__ = { DB: fakeDb("b") };
  assert.equal((await m.lazyDb.prepare("SELECT 2").bind().first()).tag, "b");
});

test("auth off: dev user without a binding, fail closed on a bound D1", async () => {
  assert.equal(await m.requireUserId(), m.DEV_USER_ID);
  globalThis.__env__ = { DB: fakeDb("deployed") };
  await assert.rejects(m.requireUserId(), /refusing to fall back to the shared dev user/);
});
