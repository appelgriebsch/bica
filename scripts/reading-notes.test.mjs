/** #164 (gap P2, ADR 0027): ptNote on reading pieces + three aviso notices —
 * the ptNote shape on every reading that has one (non-empty pt/br/en, pt !== br),
 * the single render site in read/$id.tsx (below Notes, above "Check what stuck"),
 * exactly one SpeakButton on note.pt in portugal-note.tsx, the Brazil-mention
 * guard, and the shape of the three new aviso pieces (read-aviso-obras A1,
 * read-aviso-horario A2 with the encerrado/fechado ptNote, read-aviso-evento A2).
 * Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".reading-notes-test-"));
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

const { readingPieces } = await load("src/data/curriculum.ts");

test("every reading ptNote has non-empty pt/br/en and pt !== br", () => {
  let count = 0;
  for (const piece of readingPieces) {
    if (!piece.ptNote) continue;
    count++;
    const { pt, br, en } = piece.ptNote;
    assert.ok(pt.trim() && br.trim() && en.trim(), `${piece.id}: empty ptNote field`);
    assert.notEqual(pt, br, `${piece.id}: pt and br must differ`);
  }
  assert.ok(count >= 1, "expected at least the read-aviso-horario ptNote");
});

test("read/$id.tsx renders <PortugalNote> only under piece.ptNote, after Notes, above the quiz CTA", () => {
  const src = readFileSync(new URL("../src/routes/read/$id.tsx", import.meta.url), "utf8");
  const sites = [...src.matchAll(/piece\.ptNote && <PortugalNote note=\{piece\.ptNote\} \/>/g)];
  assert.equal(sites.length, 1, "exactly one render site in read/$id.tsx");
  const notesEnd = src.indexOf("</section>");
  const cta = src.indexOf("Check what stuck");
  assert.ok(
    notesEnd !== -1 && cta !== -1 && notesEnd < sites[0].index && sites[0].index < cta,
    "the note must sit between the Notes section and Check what stuck",
  );
});

test("portugal-note.tsx keeps exactly one SpeakButton, on note.pt", () => {
  const src = readFileSync(new URL("../src/components/portugal-note.tsx", import.meta.url), "utf8");
  const speakButtons = [...src.matchAll(/<SpeakButton\b[^>]*>/g)].map((x) => x[0]);
  assert.equal(speakButtons.length, 1, "exactly one SpeakButton, on the Portugal row");
  assert.ok(speakButtons[0].includes("text={note.pt}"), "the SpeakButton plays only note.pt");
  assert.ok(!/<SpeakButton\b[^>]*note\.br/.test(src), "the br form is never playable");
});

test("every reading whose paragraphs or quiz mention Brazil carries a ptNote", () => {
  for (const piece of readingPieces) {
    const prose = [
      ...piece.paragraphs.flatMap((p) => [p.pt, p.en]),
      ...piece.quiz.map((q) => `${q.prompt} ${q.explain}`),
    ].join("\n");
    if (/brazil/i.test(prose)) {
      assert.ok(piece.ptNote, `${piece.id} mentions Brazil but has no ptNote`);
    }
  }
});

test("the three new aviso pieces: level, kind notice, 8 min, notes, 3–4-question quiz, precached image", () => {
  const expected = [
    ["read-aviso-obras", "A1", "/scenes/street.jpg"],
    ["read-aviso-horario", "A2", "/scenes/padaria.jpg"],
    ["read-aviso-evento", "A2", "/scenes/terrace.jpg"],
  ];
  for (const [id, level, image] of expected) {
    const piece = readingPieces.find((p) => p.id === id);
    assert.ok(piece, `${id} missing`);
    assert.equal(piece.level, level, `${id} level`);
    assert.equal(piece.kind, "notice", `${id} kind`);
    assert.equal(piece.minutes, 8, `${id} minutes`);
    assert.ok(piece.notes.length > 0, `${id} needs notes`);
    assert.ok(piece.quiz.length >= 3 && piece.quiz.length <= 4, `${id} needs a 3–4-question quiz`);
    for (const q of piece.quiz) {
      assert.ok(
        ["choice", "truefalse", "listen", "type"].includes(q.kind),
        `${id}/${q.id} uses an existing quiz kind`,
      );
    }
    assert.equal(piece.image, image, `${id} image`);
    assert.ok(
      existsSync(join(root, "public", image)),
      `${image} must exist under public/ (precache scans it)`,
    );
  }
});

test("read-aviso-horario carries the PT encerrado vs BR fechado ptNote", () => {
  const piece = readingPieces.find((p) => p.id === "read-aviso-horario");
  assert.ok(piece?.ptNote, "read-aviso-horario needs a ptNote");
  assert.equal(piece.ptNote.pt, "encerrado");
  assert.equal(piece.ptNote.br, "fechado");
});
