/** #154 (ADR 0022): Conversas topic contract. Every `speakScenarios` entry carries a
 * valid `topic` from SCENARIO_TOPICS with a label, and `speakScenarioGroups()` renders
 * each scenario exactly once — levels in cefrRank order, topics in SCENARIO_TOPICS
 * order, authored array order kept inside a group. Run with `bun run test`. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".speak-topics-test-"));
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

const { speakScenarios, speakScenarioGroups, cefrRank } = await load("src/data/curriculum.ts");
const { SCENARIO_TOPICS, topicLabels } = await load("src/data/types.ts");

test("every scenario has a valid topic and a label (#154, ADR 0022)", () => {
  assert.ok(speakScenarios.length > 0, "no scenarios");
  for (const s of speakScenarios) {
    assert.ok(SCENARIO_TOPICS.includes(s.topic), `invalid topic on ${s.id}: ${s.topic}`);
    assert.ok(topicLabels[s.topic], `missing label for topic ${s.topic}`);
  }
});

test("speakScenarioGroups covers each scenario exactly once (#154)", () => {
  const seen = [];
  for (const g of speakScenarioGroups()) {
    for (const t of g.topics) for (const s of t.scenarios) seen.push(s.id);
  }
  assert.equal(new Set(seen).size, seen.length, "duplicate scenario in groups");
  assert.deepEqual([...seen].sort(), speakScenarios.map((s) => s.id).sort(), "coverage mismatch");
});

test("group order: levels in cefrRank order, topics in SCENARIO_TOPICS order, no empty groups (#154)", () => {
  const groups = speakScenarioGroups();
  const levelOrder = groups.map((g) => g.level);
  assert.deepEqual(
    levelOrder,
    [...levelOrder].sort((a, b) => cefrRank[a] - cefrRank[b]),
    "level groups not in cefrRank order",
  );
  for (const g of groups) {
    assert.ok(g.topics.length > 0, `empty level group must be dropped: ${g.level}`);
    const topicOrder = g.topics.map((t) => t.topic);
    assert.deepEqual(
      topicOrder,
      SCENARIO_TOPICS.filter((tp) => topicOrder.includes(tp)),
      `topic order wrong in ${g.level}`,
    );
    for (const t of g.topics) {
      assert.ok(t.scenarios.length > 0, "empty topic group must be dropped");
      assert.ok(
        t.scenarios.every((s) => s.level === g.level && s.topic === t.topic),
        `misgrouped scene in ${g.level}/${t.topic}`,
      );
      assert.equal(t.label, topicLabels[t.topic], `label mismatch in ${g.level}/${t.topic}`);
    }
  }
});

test("authored array order is kept within each group (#154)", () => {
  for (const g of speakScenarioGroups()) {
    for (const t of g.topics) {
      const expected = speakScenarios
        .filter((s) => s.level === g.level && s.topic === t.topic)
        .map((s) => s.id);
      assert.deepEqual(
        t.scenarios.map((s) => s.id),
        expected,
        `order changed in ${g.level}/${t.topic}`,
      );
    }
  }
});
