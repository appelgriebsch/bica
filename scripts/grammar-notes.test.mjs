/** #160 (ADR 0024): Portugal notes on grammar drills — the `gram-a1-enclise` drill
 * shape (A1, 4th position, 8 min, 7 questions of all four kinds, `listen` has
 * `speak`, `type` has `accept`), the `ptNote` shape on `gram-a1-enclise` and
 * `gram-b2-cliticos`, the single render site in `grammar/$id.tsx` (below the
 * examples list, above "Start the drill"), exactly one `SpeakButton` on `note.pt`
 * in `portugal-note.tsx`, the per-level >=3 drills guard, and the reworded
 * "at least three" copy sites.
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

test("ptNote shape on gram-a1-enclise and gram-b2-cliticos: non-empty pt/br/en, pt !== br", () => {
  for (const id of ["gram-a1-enclise", "gram-b2-cliticos"]) {
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
