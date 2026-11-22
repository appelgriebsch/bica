/** #176 (gap G7, plan #207 — no ADR, owner decision): Verbos desk contract. Exactly one
 * desk per level (GLOSSARY "one desk per level"), and the A2 desk widened in place
 * (id stays `verb-a2-preterito` — progress is keyed by it): an Imperfeito tense on each
 * of the five core verbs (ser/ir/estar/ter/fazer), a conditional-of-courtesy tense whose
 * forms include queria and podia (plus seria/estaria), and a quiz of only the four
 * existing kinds with explain on each, listen→speak, type→accept.
 * Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".verb-desks-test-"));
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

const { verbDesks } = await load("src/data/curriculum.ts");
const LEVELS = ["A1", "A2", "B1", "B2", "C1"];

test("exactly one desk per level, all five levels present (GLOSSARY: one desk per level)", () => {
  for (const lv of LEVELS) {
    const desks = verbDesks.filter((d) => d.level === lv);
    assert.equal(desks.length, 1, `${lv} must carry exactly one desk, got ${desks.length}`);
  }
  const ids = verbDesks.map((d) => d.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate desk ids");
});

test("#176: the A2 desk keeps its id verb-a2-preterito (progress is keyed by it) and is widened in place", () => {
  const a2 = verbDesks.find((d) => d.level === "A2");
  assert.ok(a2, "no A2 desk");
  assert.equal(a2.id, "verb-a2-preterito", "id must stay stable — stored progress keys on it");
  assert.equal(a2.minutes, 16, "12 → 16 min with the extra tenses");
});

test("#176: the five core verbs of the A2 desk each carry an Imperfeito tense", () => {
  const a2 = verbDesks.find((d) => d.level === "A2");
  assert.ok(a2);
  for (const inf of ["ser", "ir", "estar", "ter", "fazer"]) {
    const v = a2.verbs.find((x) => x.inf === inf);
    assert.ok(v, `A2 desk missing ${inf}`);
    assert.ok(
      v.tenses.some((t) => /imperfeito/i.test(t.label)),
      `${inf}: needs an Imperfeito tense in the A2 desk`,
    );
  }
});

test("#176: conditional of courtesy rows — queria / podia / seria / estaria present", () => {
  const a2 = verbDesks.find((d) => d.level === "A2");
  assert.ok(a2);
  const cortesia = a2.verbs.flatMap((v) => v.tenses.filter((t) => /cortesia/i.test(t.label)));
  assert.ok(cortesia.length > 0, "no Cond. de cortesia tense in the A2 desk");
  const forms = cortesia.flatMap((t) => t.forms.map((f) => f.form)).join(" ");
  for (const w of ["queria", "podia", "seria", "estaria"]) {
    assert.ok(new RegExp(`\\b${w}\\b`, "i").test(forms), `courtesy form ${w} missing`);
  }
  const querer = a2.verbs.find((v) => v.inf === "querer");
  const poder = a2.verbs.find((v) => v.inf === "poder");
  assert.ok(querer && poder, "querer and poder entries must be added to the A2 desk");
  assert.ok(
    /queria um café/i.test(querer.note ?? "") || /cortesia/i.test(querer.note ?? ""),
    "querer note should name the polite order (queria um café)",
  );
});

test("#176: the A2 quiz is extended to 10 questions of only the four existing kinds, with speak/accept/explain", () => {
  const a2 = verbDesks.find((d) => d.level === "A2");
  assert.ok(a2);
  assert.equal(a2.quiz.length, 10, "quiz 7 → 10");
  assert.deepEqual(
    [...new Set(a2.quiz.map((q) => q.kind))].sort(),
    ["choice", "listen", "truefalse", "type"],
    "all four existing quiz kinds",
  );
  for (const q of a2.quiz) {
    assert.ok(q.explain.trim(), `${q.id}: explain required`);
    if (q.kind === "listen") assert.ok(q.speak?.trim(), `${q.id}: listen needs a speak line (Play + Slower)`);
    if (q.kind === "type") assert.ok(q.accept?.length, `${q.id}: type needs accept`);
  }
  const all = [
    a2.body,
    ...a2.verbs.flatMap((v) => [v.inf, ...v.tenses.flatMap((t) => t.forms.map((f) => f.form)), v.note ?? ""]),
    ...a2.quiz.flatMap((q) => [q.prompt, ...(q.options ?? []), ...(q.accept ?? []), q.explain]),
  ].join(" ");
  for (const re of [/imperfeito/i, /\bera\b/i, /\bia\b/i, /queria/i, /podia/i]) {
    assert.ok(re.test(all), `coverage: ${re} missing from the A2 desk`);
  }
});
