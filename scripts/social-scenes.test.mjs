/** #134/#135 (ADR 0018): Social Scenes data contract. Conversas side: every
 * `group: "social"` scene declares a register (tu/você), sits at A2 or above,
 * states the register in its setting, and has a precached image. Practice side:
 * every SocialScene has a unique id, level >= A2, a lesson with vocab (feeds
 * Palavras), a 1:1 link to a social Conversas partner, an existing image, and a
 * register sentence in its setting. Run with `bun run test`. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".social-scenes-test-"));
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

const { speakScenarios, cefrRank, socialScenes, getSocialScene, getScriptedScene, getLesson, travelScenes } =
  await load("src/data/curriculum.ts");

const registerSentence = (r) => (r === "tu" ? "Falam de tu." : "Falam de você.");

test("social scenarios (#134, ADR 0018): unique ids, register declared, level >= A2, precached image", () => {
  const ids = speakScenarios.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate scenario ids");
  const social = speakScenarios.filter((s) => s.group === "social");
  assert.ok(social.length >= 5, `expected at least the 5 tagged social scenes, got ${social.length}`);
  for (const s of social) {
    assert.ok(s.register === "tu" || s.register === "você", `register missing on social scene ${s.id}`);
    assert.ok(cefrRank[s.level] >= cefrRank.A2, `social scene below A2: ${s.id} (${s.level})`);
    assert.ok(existsSync(join(root, "public", s.image)), `image not in public/: ${s.image}`);
    assert.ok(
      s.setting.endsWith(registerSentence(s.register)),
      `setting of ${s.id} must state the register in words`,
    );
  }
});

test("the three new social chat scenes (#135): ids, levels, registers", () => {
  const expected = {
    "almoco-familia": ["A2", "você"],
    "amigos-da-ines": ["A2", "tu"],
    "cafe-colegas": ["B1", "você"],
  };
  for (const [id, [level, register]] of Object.entries(expected)) {
    const s = speakScenarios.find((sc) => sc.id === id);
    assert.ok(s, `missing scenario ${id}`);
    assert.equal(s.group, "social", `${id} group`);
    assert.equal(s.level, level, `${id} level`);
    assert.equal(s.register, register, `${id} register`);
    assert.ok(s.openerPt && s.openerEn && s.partner && s.setting, `${id} fields`);
    assert.ok(s.goals.length >= 3, `${id} goals`);
  }
});

test("social scenes (#135, ADR 0018): contract — ids, level, lesson with vocab, partner link, image, register words", () => {
  assert.ok(socialScenes.length >= 8, `expected at least 8 social scenes, got ${socialScenes.length}`);
  const ids = socialScenes.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate social scene ids");
  const socialScenarioIds = new Set(
    speakScenarios.filter((s) => s.group === "social").map((s) => s.id),
  );
  const linked = new Set();
  for (const s of socialScenes) {
    assert.ok(cefrRank[s.level] >= cefrRank.A2, `social scene below A2: ${s.id} (${s.level})`);
    const lesson = getLesson(s.lessonId);
    assert.ok(lesson, `lessonId does not resolve: ${s.lessonId} (${s.id})`);
    assert.ok(
      lesson.sections.some((sec) => sec.type === "vocab" && sec.items.length > 0),
      `lesson ${s.lessonId} has no vocab section (${s.id})`,
    );
    assert.ok(socialScenarioIds.has(s.scenarioId), `scenarioId not a social scene: ${s.scenarioId} (${s.id})`);
    const scenario = speakScenarios.find((sc) => sc.id === s.scenarioId);
    assert.ok(scenario.register, `partner ${s.scenarioId} has no register`);
    assert.equal(s.level, scenario.level, `${s.id} level should match its partner scenario`);
    assert.ok(!linked.has(s.scenarioId), `scenario ${s.scenarioId} linked by two social scenes`);
    linked.add(s.scenarioId);
    assert.ok(existsSync(join(root, "public", s.image)), `image not in public/: ${s.image}`);
    assert.ok(s.lines.length >= 4, `${s.id} needs scripted lines`);
    assert.ok(s.setting.endsWith(registerSentence(scenario.register)), `${s.id} setting register sentence`);
  }
  // 1:1 — every social chat scene has exactly one offline scene
  assert.deepEqual([...linked].sort(), [...socialScenarioIds].sort(), "social scenes must map 1:1 to social scenarios");
});

test("getScriptedScene resolves both kinds (#135, ADR 0018)", () => {
  const travel = travelScenes[0];
  assert.deepEqual(getScriptedScene(travel.id), { scene: travel, kind: "travel" });
  const social = socialScenes[0];
  assert.deepEqual(getScriptedScene(social.id), { scene: social, kind: "social" });
  assert.equal(getSocialScene(social.id), social);
  assert.equal(getScriptedScene("nope"), undefined);
});
