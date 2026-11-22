/** #173 (ADR 0032, plan #202): Service Scenes data contract — the third scripted-scene
 * kind on Practice. Every `serviceScenes` entry has a unique id, level >= A2, a
 * `lessonId` that resolves to a lesson with vocab (feeds Palavras), a 1:1 Conversas
 * `scenarioId` partner at the same level that carries the register, an existing image
 * under public/, 6-10 scripted lines, and a setting ending with the register sentence.
 * `getScriptedScene` resolves the kind as "service". Run with `bun run test`. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".service-scenes-test-"));
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

const { speakScenarios, cefrRank, serviceScenes, getServiceScene, getScriptedScene, getLesson } =
  await load("src/data/curriculum.ts");

const registerSentence = (r) => (r === "tu" ? "Falam de tu." : "Falam de você.");

test("service scenes (#173, ADR 0032): contract — ids, level, lesson with vocab, partner link, image, lines, register words", () => {
  assert.ok(serviceScenes.length >= 1, "no service scenes");
  const ids = serviceScenes.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate service scene ids");
  const linked = new Set();
  for (const s of serviceScenes) {
    assert.ok(cefrRank[s.level] >= cefrRank.A2, `service scene below A2: ${s.id} (${s.level})`);
    assert.equal(getServiceScene(s.id), s, `getServiceScene(${s.id})`);
    const lesson = getLesson(s.lessonId);
    assert.ok(lesson, `lessonId does not resolve: ${s.lessonId} (${s.id})`);
    assert.ok(
      lesson.sections.some((sec) => sec.type === "vocab" && sec.items.length > 0),
      `lesson ${s.lessonId} has no vocab section (${s.id})`,
    );
    const scenario = speakScenarios.find((sc) => sc.id === s.scenarioId);
    assert.ok(scenario, `scenarioId does not resolve: ${s.scenarioId} (${s.id})`);
    assert.ok(scenario.register, `partner ${s.scenarioId} has no register`);
    assert.equal(s.level, scenario.level, `${s.id} level should match its partner scenario`);
    assert.ok(!linked.has(s.scenarioId), `scenario ${s.scenarioId} linked by two service scenes`);
    linked.add(s.scenarioId);
    assert.ok(existsSync(join(root, "public", s.image)), `image not in public/: ${s.image}`);
    assert.ok(s.lines.length >= 6 && s.lines.length <= 10, `${s.id}: ${s.lines.length} lines`);
    for (const line of s.lines) {
      assert.ok(line.speaker && line.pt && line.en, `${s.id}: incomplete line`);
    }
    assert.ok(s.setting.endsWith(registerSentence(scenario.register)), `${s.id} setting register sentence`);
  }
});

test("the first service scene (#173): service-marcar-consulta pairs with a2-saude and the marcar-consulta partner", () => {
  const scene = getServiceScene("service-marcar-consulta");
  assert.ok(scene, "service-marcar-consulta missing");
  assert.equal(scene.level, "A2");
  assert.equal(scene.lessonId, "a2-saude", "lesson link feeds a2-saude vocab to Palavras (L4/#168)");
  assert.equal(scene.scenarioId, "marcar-consulta");
  assert.equal(scene.image, "/scenes/phone.jpg");
  assert.ok(existsSync(join(root, "public", scene.image)), "image must exist under public/");
  assert.ok(
    scene.lines.some((l) => l.speaker === "You") && scene.lines.some((l) => l.speaker !== "You"),
    "You/counter speakers",
  );
  const scenario = speakScenarios.find((x) => x.id === "marcar-consulta");
  assert.ok(
    scenario && scenario.level === "A2" && scenario.topic === "health" && scenario.register === "você",
    "the marcar-consulta Conversas partner must be A2/health/register você",
  );
  assert.ok(scenario.goals.length >= 3, "partner needs >=3 goals");
  assert.ok(scenario.openerPt && scenario.openerEn, "partner opener feeds the prompt");
});

test("getScriptedScene resolves the service kind (#173, ADR 0032)", () => {
  const service = serviceScenes[0];
  assert.deepEqual(getScriptedScene(service.id), { scene: service, kind: "service" });
});
