/** #179 (gap L7, plan #211 — no ADR, owner decision): guard pin for the new B1
 * work unit + lesson `b1-trabalho-serio`. The unit `b1-work` exists at level B1 in
 * `units` (after b1-nuance); the lesson sits at order 1 in it with a vocab section
 * (the S2 entrevista scene pairs via lessonId when its offline scene lands, #172/#200),
 * an existing precached image, a 5-question quiz of only the four existing kinds, and
 * coverage of entrevista / contrato / Exmo / cumprimentos / CV vocabulary; its ptNote
 * carries the Exmo. Senhor vs Prezado Senhor contrast (NOTED_LESSONS is A1/A2-only, so
 * the shape is pinned here). Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".lesson-trabalho-test-"));
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

const { lessons, units } = await load("src/data/curriculum.ts");

test("#179: the b1-work unit exists at B1, placed after b1-nuance, with a precached image", () => {
  const unit = units.find((u) => u.id === "b1-work");
  assert.ok(unit, "b1-work unit missing");
  assert.equal(unit.level, "B1");
  assert.ok(unit.title && unit.titlePt && unit.blurb, "unit fields");
  assert.equal(unit.image, "/scenes/office.jpg");
  assert.ok(existsSync(join(root, "public", unit.image)), "unit image must exist under public/");
  const ids = units.map((u) => u.id);
  assert.ok(ids.indexOf("b1-work") > ids.indexOf("b1-nuance"), "b1-work placed after b1-nuance");
});

test("#179: b1-trabalho-serio — B1, unitId b1-work, order 1, 15 min, skill mix, vocab >= 5, image exists, quiz kinds, coverage", () => {
  const lesson = lessons.find((l) => l.id === "b1-trabalho-serio");
  assert.ok(lesson, "b1-trabalho-serio missing");
  assert.equal(lesson.level, "B1");
  assert.equal(lesson.unitId, "b1-work");
  assert.equal(lesson.unit, "Work");
  assert.equal(lesson.order, 1, "first lesson of the new unit — no existing lesson renumbered");
  assert.equal(lesson.minutes, 15);
  assert.equal(lesson.skill, "mix");
  assert.equal(lesson.image, "/scenes/office.jpg");
  assert.ok(existsSync(join(root, "public", lesson.image)), "lesson image must exist under public/");
  const vocab = lesson.sections.find((s) => s.type === "vocab");
  assert.ok(vocab && vocab.items.length >= 5, "vocab section with >=5 items (the scene lessonId contract + Palavras need it)");
  assert.equal(lesson.quiz.length, 5);
  assert.deepEqual(
    [...new Set(lesson.quiz.map((q) => q.kind))].sort(),
    ["choice", "listen", "truefalse", "type"],
    "quiz uses only the four existing kinds",
  );
  for (const q of lesson.quiz) {
    assert.ok(q.explain.trim(), `${q.id}: explain required`);
    if (q.kind === "listen") assert.ok(q.speak?.trim(), `${q.id}: listen needs a speak line (Play + Slower)`);
    if (q.kind === "type") assert.ok(q.accept?.length, `${q.id}: type needs accept`);
  }
  const all = [
    lesson.summary,
    ...lesson.goals,
    ...lesson.sections.flatMap((s) => [
      "title" in s ? s.title : "",
      "body" in s ? s.body : "",
      "kicker" in s ? s.kicker : "",
      ...("setting" in s ? [s.setting] : []),
      ...("items" in s ? s.items.flatMap((i) => [i.pt, i.en, i.examplePt, i.exampleEn]) : []),
      ...("examples" in s ? s.examples.flatMap((e) => [e.pt, e.en]) : []),
      ...("lines" in s ? s.lines.flatMap((l) => [l.pt, l.en]) : []),
      ...("phrase" in s ? [s.phrase.pt, s.phrase.en] : []),
    ]),
    ...lesson.quiz.flatMap((q) => [q.prompt, ...(q.options ?? []), ...(q.accept ?? []), q.explain]),
  ].join(" ");
  for (const re of [/entrevista/i, /contrato/i, /exmo/i, /cumprimentos/i, /curr[íi]culo/i, /sal[áa]rio/i]) {
    assert.ok(re.test(all), `coverage: ${re} missing from b1-trabalho-serio`);
  }
});

test("#179: the ptNote carries the formal-email contrast (Exmo. Senhor / cumprimentos vs Prezado / Atenciosamente)", () => {
  const lesson = lessons.find((l) => l.id === "b1-trabalho-serio");
  const note = lesson?.sections.flatMap((s) => (s.ptNote ? [s.ptNote] : [])).find((n) => /exmo/i.test(n.pt));
  assert.ok(note, "ptNote with Exmo. missing");
  assert.ok(note.pt.trim() && note.br.trim() && note.en.trim(), "non-empty pt/br/en");
  assert.notEqual(note.pt, note.br, "pt and br must differ");
  assert.ok(/exmo/i.test(note.pt) && /prezado/i.test(note.br), "Exmo. (PT) vs Prezado (BR)");
  assert.ok(/cumprimentos/i.test(note.pt) && /atenciosamente/i.test(note.br), "cumprimentos (PT) vs Atenciosamente (BR)");
});
