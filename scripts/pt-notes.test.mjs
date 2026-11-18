/** #139 (parent #82, ADR 0018): Portugal notes — shape of every `ptNote`, the
 * three required A1/A2 contrasts, and a source assertion that only the European
 * `pt` form is playable. T2 (#140) adds the "mentions Brazil ⇒ has a note"
 * coverage guard. Run with `bun run test` (node --test scripts/*.test.mjs). */
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
  assert.ok(count >= 5, `expected at least the 5 T1 notes, got ${count}`);
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
