/** #156 (ADR 0023): placement-check item bank contract and recommendLevel scoring boundaries.
 * Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".placement-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const compiled = new Map();
function compile(file) {
  if (compiled.has(file)) return compiled.get(file);
  const dest = join(tmp, file.replace(/\W/g, "_") + ".mjs");
  compiled.set(file, dest);
  const out = ts
    .transpileModule(readFileSync(join(root, file), "utf8"), {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    .outputText.replace(/from "(@\/|\.\.?\/)([^"]+)"/g, (_, lead, p) => {
      const base = lead === "@/" ? `src/${p}` : join(dirname(file), lead + p);
      const dep = [".ts", ".tsx"].map((e) => base + e).find((f) => existsSync(join(root, f)));
      return `from "${pathToFileURL(compile(dep)).href}"`;
    });
  writeFileSync(dest, out);
  return dest;
}
const load = (file, fresh = "") => import(pathToFileURL(compile(file)).href + fresh);

const placement = await load("src/data/placement.ts");
const { placementBands, recommendLevel, PLACEMENT_PER_BAND, CLEAR_THRESHOLD } = placement;
const { levels } = await load("src/data/curriculum.ts");

const KINDS = new Set(["choice", "truefalse", "listen", "type"]);

test("bank: 5 bands in cefrRank order, PLACEMENT_PER_BAND items each, unique ids", () => {
  assert.deepEqual(
    placementBands.map((b) => b.level),
    levels.map((l) => l.id),
  );
  const ids = new Set();
  for (const band of placementBands) {
    assert.equal(band.items.length, PLACEMENT_PER_BAND);
    for (const item of band.items) {
      assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
      ids.add(item.id);
      assert.ok(item.id.startsWith(`${band.level.toLowerCase()}-`), `id ${item.id} off-band`);
    }
  }
});

test("bank: valid QuizQuestion shapes; every kind is used", () => {
  const used = new Set();
  for (const band of placementBands) {
    for (const q of band.items) {
      assert.ok(KINDS.has(q.kind), `bad kind ${q.kind}`);
      used.add(q.kind);
      assert.ok(q.prompt.trim() && q.explain.trim(), `${q.id} needs prompt and explain`);
      if (q.kind === "choice" || q.kind === "truefalse") {
        assert.ok(Array.isArray(q.options) && q.options.length >= 2, `${q.id} options`);
        assert.ok(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.options.length);
      }
      if (q.kind === "type") assert.ok(q.accept?.length >= 1 && q.accept[0], `${q.id} accept`);
      if (q.kind === "listen") assert.ok(q.speak?.trim(), `${q.id} speak`);
    }
  }
  assert.deepEqual([...used].sort(), [...KINDS].sort());
});

test("placement.ts is pure data: no progress-store import", () => {
  const src = readFileSync(join(root, "src/data/placement.ts"), "utf8");
  assert.ok(!src.includes("progress-store"), "bank must not touch the store");
});

test("recommendLevel: all perfect -> C1, all zero -> A1", () => {
  assert.equal(recommendLevel({ A1: 3, A2: 3, B1: 3, B2: 3, C1: 3 }), "C1");
  assert.equal(recommendLevel({ A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }), "A1");
});

test("recommendLevel: highest cleared band wins", () => {
  assert.equal(recommendLevel({ A1: 3, A2: 3, B1: 0, B2: 0, C1: 0 }), "A2");
  assert.equal(recommendLevel({ A1: 2, A2: 2, B1: 2, B2: 2, C1: 2 }), "C1");
  assert.equal(recommendLevel({ A1: 3, A2: 0, B1: 0, B2: 0, C1: 0 }), "A1");
});

test("recommendLevel: lucky-hard-hit guard caps at the lowest failed band", () => {
  assert.equal(recommendLevel({ A1: 3, A2: 0, B1: 3, B2: 0, C1: 0 }), "A1");
  assert.equal(recommendLevel({ A1: 3, A2: 3, B1: 3, B2: 0, C1: 2 }), "B1");
  assert.equal(recommendLevel({ A1: 3, A2: 1, B1: 3, B2: 3, C1: 0 }), "A1");
  assert.equal(recommendLevel({ A1: 0, A2: 3, B1: 3, B2: 3, C1: 3 }), "A1");
});

test("recommendLevel: cleared means at least CLEAR_THRESHOLD of PLACEMENT_PER_BAND", () => {
  assert.equal(CLEAR_THRESHOLD, 2);
  assert.equal(recommendLevel({ A1: 1, A2: 0, B1: 0, B2: 0, C1: 0 }), "A1");
  assert.equal(recommendLevel({ A1: 2, A2: 0, B1: 0, B2: 0, C1: 0 }), "A1");
});
