/** #163 (gap G5, ADR 0026): one mood term app-wide — "conjuntivo". Guard test:
 * no lesson or grammar-drill `title`/`titlePt` matches /subjuntivo/i, the ids
 * `b1-subjuntivo` / `gram-b1-subjuntivo` stay stable (stored progress keys), and
 * both B1 titlePt fields say "conjuntivo".
 * Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".terminology-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const compiled = new Map();
/** Transpile a src file and its `@/` and relative imports into tmp (inside the repo, so packages resolve). */
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
const load = (file) => import(pathToFileURL(compile(file)).href);

const { lessons, grammarDrills } = await load("src/data/curriculum.ts");

test("no lesson or grammar-drill title/titlePt contains \"subjuntivo\"", () => {
  const offenders = [...lessons, ...grammarDrills].filter((item) =>
    /subjuntivo/i.test(`${item.title}\n${item.titlePt}`),
  );
  assert.deepEqual(
    offenders.map((o) => o.id),
    [],
    `subjuntivo still in titles: ${offenders.map((o) => `${o.id} (${o.titlePt})`).join(", ")}`,
  );
});

test("the B1 lesson and drill ids stay stable so stored progress is not lost", () => {
  assert.ok(lessons.some((l) => l.id === "b1-subjuntivo"), "lesson id b1-subjuntivo missing");
  assert.ok(grammarDrills.some((d) => d.id === "gram-b1-subjuntivo"), "drill id gram-b1-subjuntivo missing");
});

test("the B1 lesson and drill titlePt say \"conjuntivo\"", () => {
  const lesson = lessons.find((l) => l.id === "b1-subjuntivo");
  const drill = grammarDrills.find((d) => d.id === "gram-b1-subjuntivo");
  assert.ok(lesson && /conjuntivo/i.test(lesson.titlePt), `b1-subjuntivo titlePt is "${lesson?.titlePt}"`);
  assert.ok(drill && /conjuntivo/i.test(drill.titlePt), `gram-b1-subjuntivo titlePt is "${drill?.titlePt}"`);
});
