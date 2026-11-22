/** #139 + #140 (parent #82, ADR 0018): Portugal notes — shape of every `ptNote`,
 * the required A1/A2 contrasts, the planned set of noted lessons, the
 * "mentions Brazil ⇒ has a note" coverage guard for A1/A2 (#140), and a source
 * assertion that only the European `pt` form is playable.
 * #168 (gap L4, ADR 0031): lesson `a2-saude` joins NOTED_LESSONS with the
 * centro de saúde vs posto de saúde contrast, plus a guard pin for its shape
 * (order 6 in a2-life, 12 min, vocab ≥5 for the S1 lessonId contract, image,
 * quiz kinds, 112/inscrição/utente/marcar-consulta coverage, orders 7/8).
 * Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".pt-notes-test-"));
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

const { lessons } = await load("src/data/curriculum.ts");

const a1a2 = lessons.filter((l) => l.level === "A1" || l.level === "A2");
const notesOf = (lesson) => lesson.sections.flatMap((s) => (s.ptNote ? [s.ptNote] : []));

/** The planned #82 pass: every A1/A2 lesson teaching a form that differs in Brazil. */
const NOTED_LESSONS = [
  "a1-ola",
  "a1-como-esta",
  "a1-de-onde",
  "a1-numeros",
  "a1-ordinais",
  "a1-bica",
  "a1-onde-fica",
  "a1-dias",
  "a1-metro",
  "a1-mesa",
  "a2-tempo",
  "a2-planos",
  "a2-farmacia",
  "a2-compras",
  "a2-saude",
];

test("the A1/A2 lessons carrying a note are exactly the planned set", () => {
  const noted = a1a2.filter((l) => notesOf(l).length > 0).map((l) => l.id);
  assert.deepEqual([...noted].sort(), [...NOTED_LESSONS].sort());
});

test("every ptNote has non-empty pt/br/en and pt !== br", () => {
  let count = 0;
  for (const lesson of a1a2) {
    for (const note of notesOf(lesson)) {
      count++;
      assert.ok(
        note.pt.trim() && note.br.trim() && note.en.trim(),
        `${lesson.id}: empty ptNote field`,
      );
      assert.notEqual(note.pt, note.br, `${lesson.id}: pt and br must differ`);
    }
  }
  assert.ok(count >= NOTED_LESSONS.length, `expected at least ${NOTED_LESSONS.length} notes, got ${count}`);
});

test("the three required contrasts are present in A1 and A2", () => {
  const hasNote = (lessonId, ptFrag, brFrag) => {
    const lesson = lessons.find((l) => l.id === lessonId);
    assert.ok(lesson, `lesson ${lessonId} not found`);
    return notesOf(lesson).find(
      (n) => n.pt.toLowerCase().includes(ptFrag) && n.br.toLowerCase().includes(brFrag),
    );
  };
  assert.ok(hasNote("a1-como-esta", "tu estás", "você está"), "tu vs você missing in A1");
  assert.ok(hasNote("a1-de-onde", "a aprender", "aprendendo"), "estar a + infinitive missing in A1");
  assert.ok(hasNote("a2-tempo", "a chover", "chovendo"), "estar a + infinitive missing in A2");
  assert.ok(hasNote("a1-ola", "chamo-me", "meu nome é"), "pronoun after the verb missing in A1");
  assert.ok(hasNote("a2-farmacia", "dói-me", "garganta dói"), "pronoun after the verb missing in A2");
});

test("the T2 widening contrasts are present (spelling, words, word order)", () => {
  const hasNote = (lessonId, ptFrag, brFrag) => {
    const lesson = lessons.find((l) => l.id === lessonId);
    assert.ok(lesson, `lesson ${lessonId} not found`);
    return notesOf(lesson).find(
      (n) => n.pt.toLowerCase().includes(ptFrag) && n.br.toLowerCase().includes(brFrag),
    );
  };
  assert.ok(hasNote("a1-numeros", "dezasseis", "dezesseis"), "teens contrast missing");
  assert.ok(hasNote("a1-ordinais", "rés-do-chão", "térreo"), "floor contrast missing");
  assert.ok(hasNote("a1-bica", "bica", "cafezinho"), "coffee contrast missing");
  assert.ok(hasNote("a1-onde-fica", "autocarro", "ônibus"), "transport contrast missing (a1-onde-fica)");
  assert.ok(hasNote("a1-metro", "autocarro", "ônibus"), "transport contrast missing (a1-metro)");
  assert.ok(hasNote("a1-mesa", "ementa", "cardápio"), "menu contrast missing");
  assert.ok(hasNote("a1-dias", "à segunda", "na segunda"), "weekday preposition contrast missing (a1-dias)");
  assert.ok(hasNote("a2-planos", "connosco", "conosco"), "spelling contrast missing");
  assert.ok(hasNote("a2-compras", "ficam-lhe bem", "em você"), "word-order contrast missing");
  assert.ok(hasNote("a2-saude", "centro de saúde", "posto de saúde"), "health-centre contrast missing");
});

test("every A1/A2 lesson whose section body or quiz explain mentions Brazil has a ptNote (#82 AC1)", () => {
  for (const lesson of a1a2) {
    const prose = [
      ...lesson.sections.map((s) => ("body" in s ? s.body : "")),
      ...lesson.quiz.map((q) => q.explain),
    ].join("\n");
    if (/brazil/i.test(prose)) {
      assert.ok(notesOf(lesson).length > 0, `${lesson.id} mentions Brazil but has no ptNote`);
    }
  }
});

test("a2-saude (#168, ADR 0031): order 6 in a2-life, 12 min, vocab >= 5, image exists, quiz kinds, coverage; compras/hotel renumbered 7/8", () => {
  const lesson = lessons.find((l) => l.id === "a2-saude");
  assert.ok(lesson, "a2-saude missing");
  assert.equal(lesson.level, "A2");
  assert.equal(lesson.unitId, "a2-life");
  assert.equal(lesson.order, 6, "inserted after a2-farmacia");
  assert.equal(lesson.minutes, 12);
  assert.equal(lesson.image, "/scenes/farmacia.jpg");
  assert.ok(existsSync(join(root, "public", lesson.image)), "lesson image must exist under public/");
  const vocab = lesson.sections.find((s) => s.type === "vocab");
  assert.ok(vocab && vocab.items.length >= 5, "vocab section with >=5 items (the S1/#173 lessonId contract needs vocab)");
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
      ...("items" in s ? s.items.flatMap((i) => [i.pt, i.en, i.examplePt, i.exampleEn]) : []),
      ...("examples" in s ? s.examples.flatMap((e) => [e.pt, e.en]) : []),
      ...("lines" in s ? s.lines.flatMap((l) => [l.pt, l.en]) : []),
      ...("phrase" in s ? [s.phrase.pt, s.phrase.en] : []),
    ]),
    ...lesson.quiz.flatMap((q) => [q.prompt, ...(q.options ?? []), ...(q.accept ?? []), q.explain]),
  ].join(" ");
  for (const frag of ["112", "inscri", "utente", "marcar uma consulta"]) {
    assert.ok(all.toLowerCase().includes(frag), `coverage: "${frag}" missing from a2-saude`);
  }
  assert.equal(lessons.find((l) => l.id === "a2-compras")?.order, 7, "a2-compras renumbered 6→7");
  assert.equal(lessons.find((l) => l.id === "a2-hotel")?.order, 8, "a2-hotel renumbered 7→8");
});

test("portugal-note.tsx renders SpeakButton only for the pt form", () => {
  const src = readFileSync(new URL("../src/components/portugal-note.tsx", import.meta.url), "utf8");
  const speakButtons = [...src.matchAll(/<SpeakButton\b[^>]*>/g)].map((m) => m[0]);
  assert.equal(speakButtons.length, 1, "exactly one SpeakButton, on the Portugal row");
  assert.ok(speakButtons[0].includes("text={note.pt}"), "the SpeakButton plays only note.pt");
  assert.ok(!/<SpeakButton\b[^>]*note\.br/.test(src), "the br form is never playable");
});

test("lesson-player renders the note below the current non-quiz section", () => {
  const src = readFileSync(new URL("../src/components/lesson-player.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("<SectionView section={section} />"), "SectionView render site");
  assert.ok(
    /section\.ptNote && <PortugalNote note=\{section\.ptNote\} \/>/.test(src),
    "ptNote render site below SectionView",
  );
});
