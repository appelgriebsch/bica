/** #116 (ADR 0013): Travel Scenes data contract — every scene resolves to a matching
 * A1/A2 lesson with vocab (feeds Palavras), an optional Conversas partner, and a
 * precached image. Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".travel-scenes-test-"));
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

const { travelScenes, getTravelScene, getLesson, speakScenarios } =
  await load("src/data/curriculum.ts");

const SITUATIONS = ["cafe", "restaurant", "transport", "accommodation", "chemist", "directions"];

test("travel scenes exist with unique ids and known situations at A1/A2", () => {
  assert.ok(travelScenes.length > 0, "no travel scenes");
  const ids = travelScenes.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate scene ids");
  for (const s of travelScenes) {
    assert.ok(SITUATIONS.includes(s.situation), `unknown situation: ${s.situation}`);
    assert.ok(s.level === "A1" || s.level === "A2", `level must be A1/A2: ${s.id}`);
    assert.equal(getTravelScene(s.id), s, `getTravelScene(${s.id})`);
    assert.ok(s.title && s.titlePt && s.setting && s.partner, `fields: ${s.id}`);
  }
});

test("every scene links a matching lesson whose vocab feeds Palavras", () => {
  for (const s of travelScenes) {
    const lesson = getLesson(s.lessonId);
    assert.ok(lesson, `${s.id}: lessonId ${s.lessonId} not found`);
    assert.equal(lesson.level, s.level, `${s.id}: lesson level mismatch`);
    assert.ok(
      lesson.sections.some((sec) => sec.type === "vocab" && sec.items.length > 0),
      `${s.id}: lesson ${s.lessonId} has no vocab section`,
    );
  }
});

test("every scenarioId resolves to a Conversas scenario at the same level", () => {
  for (const s of travelScenes) {
    if (!s.scenarioId) continue;
    const scenario = speakScenarios.find((x) => x.id === s.scenarioId);
    assert.ok(scenario, `${s.id}: scenarioId ${s.scenarioId} not found`);
    assert.equal(scenario.level, s.level, `${s.id}: scenario level mismatch`);
  }
});

test("every scene image exists under public/scenes (precached by sw.js)", () => {
  for (const s of travelScenes) {
    assert.ok(s.image.startsWith("/scenes/"), `${s.id}: image ${s.image}`);
    assert.ok(existsSync(join(root, "public", s.image)), `${s.id}: missing ${s.image}`);
  }
});

test("scene dialogues are complete: 6-10 lines with speaker, pt and en", () => {
  for (const s of travelScenes) {
    assert.ok(s.lines.length >= 6 && s.lines.length <= 10, `${s.id}: ${s.lines.length} lines`);
    for (const line of s.lines) {
      assert.ok(line.speaker && line.pt && line.en, `${s.id}: incomplete line`);
    }
  }
});
