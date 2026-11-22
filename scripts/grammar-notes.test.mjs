/** #160 (ADR 0024): Portugal notes on grammar drills — the `gram-a1-enclise` drill
 * shape (A1, 4th position, 8 min, 7 questions of all four kinds, `listen` has
 * `speak`, `type` has `accept`), the `ptNote` shape on `gram-a1-enclise` and
 * `gram-b2-cliticos`, the single render site in `grammar/$id.tsx` (below the
 * examples list, above "Start the drill"), exactly one `SpeakButton` on `note.pt`
 * in `portugal-note.tsx`, the per-level >=3 drills guard, and the reworded
 * "at least three" copy sites.
 * #161 (gap G2): the `gram-a2-imperativo` drill shape (A2, 4th position, 8 min,
 * 7 questions of all four kinds), its coverage (affirmative + negative
 * imperativo, tu / você / o senhor, dá-me vs dá-lhe placement) and its ptNote
 * (Brazilian proclise side by side).
 * #165 (gap G4, ADR 0028): the `gram-a2-comparativos` drill shape (A2, 5th
 * position, 8 min, 7 questions of all four kinds), its coverage (mais/menos …
 * do que, o mais / o menos + adjective, the irregulars melhor/pior/maior/menor)
 * and its ptNote (PT keeps "do que", BR drops it).
 * #166 (gap G3, ADR 0029): the `gram-b1-perfeito-composto` drill shape (B1,
 * 4th position, 10 min, 7 questions of all four kinds), its coverage (ter +
 * participle, the irregulars feito/dito/visto/posto, the composto-vs-simples
 * contrast) and its ptNote (PT keeps "tenho …", BR uses the simple pretérito).
 * #175 (gap G6, plan #206 — no ADR, owner decision): the `gram-b1-passiva`
 * drill appended as the 5th B1 drill (10 min, 7 questions of all four kinds),
 * its coverage (ser + participle agreement foi escrita / foram escritas, the
 * por agent, the dizem que contrast) and its ptNote (PT analytic passive vs
 * BR active / se-passive); GLOSSARY B1 count updated in the same PR.
 * Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".grammar-notes-test-"));
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

const { grammarDrills } = await load("src/data/curriculum.ts");
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

test("gram-a1-enclise is the 4th A1 drill: 8 min, 7 questions of all four kinds", () => {
  const a1 = grammarDrills.filter((d) => d.level === "A1");
  const drill = a1.find((d) => d.id === "gram-a1-enclise");
  assert.ok(drill, "gram-a1-enclise missing");
  assert.equal(
    a1.indexOf(drill),
    3,
    "gram-a1-enclise must be the 4th A1 drill (the Next-drill chain follows array order)",
  );
  assert.equal(drill.minutes, 8);
  assert.equal(drill.quiz.length, 7);
  assert.deepEqual(
    [...new Set(drill.quiz.map((q) => q.kind))].sort(),
    ["choice", "listen", "truefalse", "type"],
    "all four existing quiz kinds",
  );
  for (const q of drill.quiz) {
    assert.ok(q.explain.trim(), `${drill.id}/${q.id}: explain required`);
    if (q.kind === "listen") assert.ok(q.speak?.trim(), `${q.id}: listen needs a speak line (Play + Slower)`);
    if (q.kind === "type") assert.ok(q.accept?.length, `${q.id}: type needs accept`);
  }
  assert.ok(drill.quiz.some((q) => q.kind === "listen" && q.speak), "at least one listen with speak");
  assert.equal(drill.examples.length, 3, "three examples, like every drill");
});

test("ptNote shape on the drills that carry one: non-empty pt/br/en, pt !== br", () => {
  for (const id of ["gram-a1-enclise", "gram-a2-imperativo", "gram-a2-comparativos", "gram-b1-perfeito-composto", "gram-b1-passiva", "gram-b2-cliticos"]) {
    const drill = grammarDrills.find((d) => d.id === id);
    assert.ok(drill?.ptNote, `${id} needs a ptNote`);
    const { pt, br, en } = drill.ptNote;
    assert.ok(pt.trim() && br.trim() && en.trim(), `${id}: empty ptNote field`);
    assert.notEqual(pt, br, `${id}: pt and br must differ`);
  }
});

test("the gram-a1-enclise ptNote shows the Brazilian order side by side", () => {
  const drill = grammarDrills.find((d) => d.id === "gram-a1-enclise");
  const { pt, br } = drill.ptNote;
  assert.ok(pt.includes("Chamo-me") && pt.includes("Dói-me"), "pt side keeps énclise");
  assert.ok(!/chamo-me|dói-me/i.test(br), "br side must not use énclise");
  assert.ok(/nome é/i.test(br) && /dói/i.test(br), "br side uses proclise / plain order");
});

test("gram-a2-imperativo is the 4th A2 drill: 8 min, 7 questions of all four kinds", () => {
  const a2 = grammarDrills.filter((d) => d.level === "A2");
  const drill = a2.find((d) => d.id === "gram-a2-imperativo");
  assert.ok(drill, "gram-a2-imperativo missing");
  assert.equal(
    a2.indexOf(drill),
    3,
    "gram-a2-imperativo must be the 4th A2 drill (the Next-drill chain follows array order)",
  );
  assert.equal(drill.minutes, 8);
  assert.equal(drill.quiz.length, 7);
  assert.deepEqual(
    [...new Set(drill.quiz.map((q) => q.kind))].sort(),
    ["choice", "listen", "truefalse", "type"],
    "all four existing quiz kinds",
  );
  for (const q of drill.quiz) {
    assert.ok(q.explain.trim(), `${drill.id}/${q.id}: explain required`);
    if (q.kind === "listen") assert.ok(q.speak?.trim(), `${q.id}: listen needs a speak line (Play + Slower)`);
    if (q.kind === "type") assert.ok(q.accept?.length, `${q.id}: type needs accept`);
  }
  assert.ok(drill.quiz.some((q) => q.kind === "listen" && q.speak), "at least one listen with speak");
  assert.equal(drill.examples.length, 3, "three examples, like every drill");
});

test("gram-a2-imperativo covers affirmative + negative, tu / você / o senhor, dá-me vs dá-lhe", () => {
  const drill = grammarDrills.find((d) => d.id === "gram-a2-imperativo");
  assert.ok(drill, "gram-a2-imperativo missing");
  const all = [
    drill.body,
    ...drill.examples.map((e) => e.pt),
    ...drill.quiz.flatMap((q) => [q.prompt, ...(q.options ?? []), ...(q.accept ?? []), q.explain]),
  ].join(" ");
  assert.ok(/dá-me/i.test(all) && /dá-lhe/i.test(all), "dá-me vs dá-lhe placement must be drilled");
  assert.ok(/não (fales|venhas|dês|me dês|lhe dês|diga|venga)/i.test(all), "a negative imperativo form must appear");
  assert.ok(/\bdiga\b|\bvenha\b|\bvá\b|\bdê\b/i.test(all), "the você / o senhor subjunctive form must appear");
});

test("the gram-a2-imperativo ptNote shows the Brazilian proclise side by side", () => {
  const drill = grammarDrills.find((d) => d.id === "gram-a2-imperativo");
  assert.ok(drill?.ptNote, "gram-a2-imperativo needs a ptNote");
  const { pt, br } = drill.ptNote;
  assert.ok(/dá-me|diga-me/i.test(pt), "pt side keeps the enclitic imperativo (dá-me / diga-me)");
  assert.ok(/me dá|me diz/i.test(br), "br side uses proclise (me dá / me diz)");
});

test("gram-a2-comparativos is the 5th A2 drill: 8 min, 7 questions of all four kinds", () => {
  const a2 = grammarDrills.filter((d) => d.level === "A2");
  const drill = a2.find((d) => d.id === "gram-a2-comparativos");
  assert.ok(drill, "gram-a2-comparativos missing");
  assert.equal(
    a2.indexOf(drill),
    4,
    "gram-a2-comparativos must be the 5th A2 drill (the Next-drill chain follows array order)",
  );
  assert.equal(drill.minutes, 8);
  assert.equal(drill.quiz.length, 7);
  assert.deepEqual(
    [...new Set(drill.quiz.map((q) => q.kind))].sort(),
    ["choice", "listen", "truefalse", "type"],
    "all four existing quiz kinds",
  );
  for (const q of drill.quiz) {
    assert.ok(q.explain.trim(), `${drill.id}/${q.id}: explain required`);
    if (q.kind === "listen") assert.ok(q.speak?.trim(), `${q.id}: listen needs a speak line (Play + Slower)`);
    if (q.kind === "type") assert.ok(q.accept?.length, `${q.id}: type needs accept`);
  }
  assert.ok(drill.quiz.some((q) => q.kind === "listen" && q.speak), "at least one listen with speak");
  assert.equal(drill.examples.length, 3, "three examples, like every drill");
});

test("gram-a2-comparativos covers mais/menos … do que, o mais/o menos + adjective, and the irregulars", () => {
  const drill = grammarDrills.find((d) => d.id === "gram-a2-comparativos");
  assert.ok(drill, "gram-a2-comparativos missing");
  const all = [
    drill.body,
    ...drill.examples.map((e) => e.pt),
    ...drill.quiz.flatMap((q) => [q.prompt, ...(q.options ?? []), ...(q.accept ?? []), q.explain]),
  ].join(" ");
  assert.ok(/mais\b[^.]{0,20}do que/i.test(all), "mais … do que must be drilled");
  assert.ok(/menos\b[^.]{0,20}do que/i.test(all), "menos … do que must be drilled");
  assert.ok(/\b[oa] mais\b|\b[oa] menos\b/i.test(all), "o mais / o menos + adjective (superlative) must appear");
  for (const w of ["melhor", "pior", "maior", "menor"]) {
    assert.ok(new RegExp(`\\b${w}\\b`, "i").test(all), `irregular ${w} missing`);
  }
});

test("the gram-a2-comparativos ptNote contrasts PT 'do que' with BR 'que'", () => {
  const drill = grammarDrills.find((d) => d.id === "gram-a2-comparativos");
  assert.ok(drill?.ptNote, "gram-a2-comparativos needs a ptNote");
  const { pt, br } = drill.ptNote;
  assert.ok(/mais\b[^.]{0,20}do que/i.test(pt), "pt side keeps 'do que' (mais … do que)");
  assert.ok(/mais\b[^.]{0,20}que/i.test(br) && !/do que/i.test(br), "br side drops the 'do' (mais … que)");
});

test("gram-b1-perfeito-composto is the 4th B1 drill: 10 min, 7 questions of all four kinds", () => {
  const b1 = grammarDrills.filter((d) => d.level === "B1");
  const drill = b1.find((d) => d.id === "gram-b1-perfeito-composto");
  assert.ok(drill, "gram-b1-perfeito-composto missing");
  assert.equal(
    b1.indexOf(drill),
    3,
    "gram-b1-perfeito-composto must be the 4th B1 drill (the Next-drill chain follows array order)",
  );
  assert.equal(drill.minutes, 10);
  assert.equal(drill.quiz.length, 7);
  assert.deepEqual(
    [...new Set(drill.quiz.map((q) => q.kind))].sort(),
    ["choice", "listen", "truefalse", "type"],
    "all four existing quiz kinds",
  );
  for (const q of drill.quiz) {
    assert.ok(q.explain.trim(), `${drill.id}/${q.id}: explain required`);
    if (q.kind === "listen") assert.ok(q.speak?.trim(), `${q.id}: listen needs a speak line (Play + Slower)`);
    if (q.kind === "type") assert.ok(q.accept?.length, `${q.id}: type needs accept`);
  }
  assert.ok(drill.quiz.some((q) => q.kind === "listen" && q.speak), "at least one listen with speak");
  assert.equal(drill.examples.length, 3, "three examples, like every drill");
});

test("gram-b1-perfeito-composto covers ter + participle, the irregulars, and the composto-vs-simples contrast", () => {
  const drill = grammarDrills.find((d) => d.id === "gram-b1-perfeito-composto");
  assert.ok(drill, "gram-b1-perfeito-composto missing");
  const all = [
    drill.body,
    ...drill.examples.map((e) => e.pt),
    ...drill.quiz.flatMap((q) => [q.prompt, ...(q.options ?? []), ...(q.accept ?? []), q.explain]),
  ].join(" ");
  assert.ok(/\b(tenho|tens|tem)\s+[a-zà-ú]+/i.test(all), "ter (presente) + participle must be drilled");
  for (const w of ["feito", "dito", "visto", "posto"]) {
    assert.ok(new RegExp(`\\b${w}\\b`, "i").test(all), `irregular participle ${w} missing`);
  }
  assert.ok(/composto/i.test(all) && /simples/i.test(all), "the composto-vs-simples contrast must be drilled");
});

test("the gram-b1-perfeito-composto ptNote contrasts PT 'tenho …' with BR simple pretérito", () => {
  const drill = grammarDrills.find((d) => d.id === "gram-b1-perfeito-composto");
  assert.ok(drill?.ptNote, "gram-b1-perfeito-composto needs a ptNote");
  const { pt, br } = drill.ptNote;
  assert.ok(/\btenho\b/i.test(pt), "pt side keeps ter + participle (tenho andado)");
  assert.ok(/\bandei\b|\bcomi\b|\bfiz\b/i.test(br) && !/\btenho\b/i.test(br), "br side uses the simple pretérito (andei)");
});

test("gram-b1-passiva is the 5th B1 drill: 10 min, 7 questions of all four kinds", () => {
  const b1 = grammarDrills.filter((d) => d.level === "B1");
  const drill = b1.find((d) => d.id === "gram-b1-passiva");
  assert.ok(drill, "gram-b1-passiva missing");
  assert.equal(
    b1.indexOf(drill),
    4,
    "gram-b1-passiva must be the 5th B1 drill, appended after gram-b1-perfeito-composto (the Next-drill chain follows array order)",
  );
  assert.equal(drill.minutes, 10);
  assert.equal(drill.quiz.length, 7);
  assert.deepEqual(
    [...new Set(drill.quiz.map((q) => q.kind))].sort(),
    ["choice", "listen", "truefalse", "type"],
    "all four existing quiz kinds",
  );
  for (const q of drill.quiz) {
    assert.ok(q.explain.trim(), `${drill.id}/${q.id}: explain required`);
    if (q.kind === "listen") assert.ok(q.speak?.trim(), `${q.id}: listen needs a speak line (Play + Slower)`);
    if (q.kind === "type") assert.ok(q.accept?.length, `${q.id}: type needs accept`);
  }
  assert.ok(drill.quiz.some((q) => q.kind === "listen" && q.speak), "at least one listen with speak");
  assert.equal(drill.examples.length, 3, "three examples, like every drill");
});

test("gram-b1-passiva covers ser + participle agreement, the por agent, and the dizem que contrast", () => {
  const drill = grammarDrills.find((d) => d.id === "gram-b1-passiva");
  assert.ok(drill, "gram-b1-passiva missing");
  const all = [
    drill.focus,
    drill.body,
    ...drill.examples.flatMap((e) => [e.pt, e.en]),
    ...drill.quiz.flatMap((q) => [q.prompt, ...(q.options ?? []), ...(q.accept ?? []), q.explain]),
  ].join(" ");
  assert.ok(/foi escrita/i.test(all), "feminine singular agreement (foi escrita) must be drilled");
  assert.ok(/foram escritas/i.test(all), "plural agreement (foram escritas) must be drilled");
  assert.ok(/\bpor\b|pelo|pela/i.test(all), "the por agent must be drilled");
  assert.ok(/dizem que/i.test(all), "the impersonal dizem que contrast must be drilled");
});

test("the gram-b1-passiva ptNote contrasts the PT analytic passive with BR active / se-passive", () => {
  const drill = grammarDrills.find((d) => d.id === "gram-b1-passiva");
  assert.ok(drill?.ptNote, "gram-b1-passiva needs a ptNote");
  const { pt, br } = drill.ptNote;
  assert.ok(/foi aprovada|é controlada/i.test(pt), "pt side keeps the analytic passive (foi aprovada)");
  assert.ok(/aprovaram|aprovou-se/i.test(br) && !/foi aprovada/i.test(br), "br side uses active (aprovaram) or se-passive (aprovou-se)");
});

test("grammar/$id.tsx renders <PortugalNote> only under drill.ptNote, after the examples list", () => {
  const src = readFileSync(new URL("../src/routes/grammar/$id.tsx", import.meta.url), "utf8");
  const m = /drill\.ptNote && <PortugalNote note=\{drill\.ptNote\} \/>/.exec(src);
  assert.ok(m, "render site `drill.ptNote && <PortugalNote note={drill.ptNote} />` missing");
  const examplesEnd = src.indexOf("</ul>");
  const startBtn = src.indexOf("Start the drill");
  assert.ok(
    examplesEnd !== -1 && startBtn !== -1 && examplesEnd < m.index && m.index < startBtn,
    "the note must sit between the examples list and Start the drill",
  );
});

test("portugal-note.tsx keeps exactly one SpeakButton, on note.pt", () => {
  const src = readFileSync(new URL("../src/components/portugal-note.tsx", import.meta.url), "utf8");
  const speakButtons = [...src.matchAll(/<SpeakButton\b[^>]*>/g)].map((x) => x[0]);
  assert.equal(speakButtons.length, 1, "exactly one SpeakButton, on the Portugal row");
  assert.ok(speakButtons[0].includes("text={note.pt}"), "the SpeakButton plays only note.pt");
  assert.ok(!/<SpeakButton\b[^>]*note\.br/.test(src), "the br form is never playable");
});

test("every level keeps at least three drills", () => {
  for (const lv of LEVELS) {
    const n = grammarDrills.filter((d) => d.level === lv).length;
    assert.ok(n >= 3, `${lv} has only ${n} drills`);
  }
});

test("the old 'three on every level' phrasing is gone from the three copy sites", () => {
  const files = ["GLOSSARY.md", "src/routes/grammar/index.tsx", "src/routes/practice.tsx"];
  for (const f of files) {
    const src = readFileSync(join(root, f), "utf8");
    assert.ok(
      !/(?<!at least )three (drills )?on every\s+level/i.test(src),
      `${f}: old phrasing still present`,
    );
    assert.ok(/at least three/i.test(src), `${f}: missing the reworded 'at least three'`);
  }
});
