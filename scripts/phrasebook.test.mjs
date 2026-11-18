/** #125 (ADR 0015): Travel Phrasebook data contract and save-to-Palavras semantics.
 * Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".phrasebook-test-"));
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
const load = (file, fresh = "") => import(pathToFileURL(compile(file)).href + fresh);

const { travelPhrases, phraseGroups, travelScenes, dueVocab, reviewPool } = await load(
  "src/data/curriculum.ts",
);
const { TRAVEL_SITUATIONS } = await load("src/data/types.ts");
const { normalizePt, todayKey } = await load("src/lib/utils.ts");
const { transferSchema } = await load("src/lib/transfer-schema.ts");

test("26 phrases derived from the scenes' You lines: valid situations, scene levels", () => {
  const derived = travelPhrases.filter((p) => p.situation !== "anywhere");
  assert.equal(derived.length, 26, `expected 26 derived phrases, got ${derived.length}`);
  for (const p of derived) {
    assert.ok(TRAVEL_SITUATIONS.includes(p.situation), `unknown situation: ${p.id}`);
    const scene = travelScenes.find((s) => s.situation === p.situation);
    assert.ok(scene, `no scene for situation ${p.situation}`);
    assert.equal(p.level, scene.level, `${p.id}: level must come from the scene`);
    assert.equal(p.id, `travel:${p.situation}:${normalizePt(p.pt)}`, `${p.id}: id shape`);
    assert.ok(p.pt.trim() && p.en.trim(), `${p.id}: pt and en required`);
    const youLines = scene.lines.filter((l) => l.speaker === "You");
    assert.ok(
      youLines.some((l) => normalizePt(l.pt) === normalizePt(p.pt)),
      `${p.id}: not a You line of ${scene.id}`,
    );
  }
});

test("#126: 8 'anywhere' staples, A1, deduped against the 34 total", () => {
  const staples = travelPhrases.filter((p) => p.situation === "anywhere");
  assert.equal(staples.length, 8, `expected 8 staples, got ${staples.length}`);
  assert.equal(travelPhrases.length, 34, `expected 34 phrases total, got ${travelPhrases.length}`);
  const ids = travelPhrases.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate phrase ids across derived + staples");
  for (const p of staples) {
    assert.equal(p.level, "A1", `${p.id}: staples are A1`);
    assert.equal(p.id, `travel:anywhere:${normalizePt(p.pt)}`, `${p.id}: id shape`);
    assert.ok(p.pt.trim() && p.en.trim(), `${p.id}: pt and en required`);
  }
});

test("phraseGroups: 'anywhere' first, then one group per situation in TRAVEL_SITUATIONS order", () => {
  const groups = phraseGroups();
  assert.deepEqual(
    groups.map((g) => g.situation),
    ["anywhere", ...TRAVEL_SITUATIONS],
  );
  assert.equal(groups[0].labelPt, "Qualquer lado");
  assert.equal(groups[0].labelEn, "Anywhere");
  for (const g of groups.slice(1)) {
    const scene = travelScenes.find((s) => s.situation === g.situation);
    assert.equal(g.labelPt, scene.titlePt);
    assert.equal(g.labelEn, scene.title);
    assert.ok(g.phrases.length > 0);
  }
  const total = groups.reduce((n, g) => n + g.phrases.length, 0);
  assert.equal(total, travelPhrases.length, "every phrase is in exactly one group");
});

test("every phrase card id is accepted by the QR transfer schema (CARD_ID pattern)", () => {
  const today = todayKey();
  const schema = transferSchema(today);
  for (const p of travelPhrases) {
    const envelope = {
      v: 1,
      snapshot: {
        completed: {},
        xp: 0,
        streak: 0,
        lastStudyDate: null,
        cards: { [p.id]: { interval: 0, ease: 0, due: today, reps: 0, lapses: 0 } },
        floor: "A1",
      },
    };
    const parsed = schema.safeParse(envelope);
    assert.ok(parsed.success, `${p.id}: transfer schema rejected the phrase card id`);
  }
});

test("reviewPool/dueVocab: a phrase joins the pile only once saved, and is due today", () => {
  const today = todayKey();
  const phrase = travelPhrases[0];
  assert.deepEqual(reviewPool([], {}), [], "nothing saved, nothing in the pool");
  assert.deepEqual(dueVocab([], {}, today), [], "nothing due without cards");

  const cards = { [phrase.id]: { interval: 0, ease: 0, due: today, reps: 0, lapses: 0 } };
  const pool = reviewPool([], cards);
  assert.deepEqual(pool.map((i) => i.id), [phrase.id], "saved phrase is in the pool");
  const due = dueVocab([], cards, today);
  assert.deepEqual(due.map((i) => i.id), [phrase.id], "freshly saved phrase is due today");

  const other = travelPhrases.find((p) => p.id !== phrase.id);
  assert.ok(!pool.some((i) => i.id === other.id), "unsaved phrase stays out of the pool");

  const a1 = travelPhrases.find((p) => p.level === "A1");
  const a2 = travelPhrases.find((p) => p.level === "A2");
  const both = {
    [a1.id]: { interval: 0, ease: 0, due: today, reps: 0, lapses: 0 },
    [a2.id]: { interval: 0, ease: 0, due: today, reps: 0, lapses: 0 },
  };
  assert.deepEqual(
    dueVocab([], both, today, "A2").map((i) => i.id),
    [a2.id],
    "level filter applies to phrases",
  );

  const notYet = { [phrase.id]: { interval: 3, ease: 2, due: "2999-01-01", reps: 2, lapses: 0 } };
  assert.deepEqual(dueVocab([], notYet, today), [], "a saved phrase not yet due stays out");

  const staple = travelPhrases.find((p) => p.situation === "anywhere");
  const stapleCards = {
    [staple.id]: { interval: 0, ease: 0, due: today, reps: 0, lapses: 0 },
  };
  assert.deepEqual(
    dueVocab([], stapleCards, today).map((i) => i.id),
    [staple.id],
    "a saved staple is due today",
  );

  // #142 (ADR 0019): the new savedWords param — a saved Conversas word joins via its chat: card.
  const chatId = "chat:obrigado";
  const saved = { [chatId]: { pt: "Obrigado", en: "Thank you", level: "A1" } };
  const chatCards = { [chatId]: { interval: 0, ease: 0, due: today, reps: 0, lapses: 0 } };
  assert.deepEqual(
    reviewPool([], chatCards, saved).map((i) => i.id),
    [chatId],
    "saved chat word in the pool via the third param",
  );
  assert.deepEqual(
    dueVocab([], chatCards, today, undefined, saved).map((i) => i.id),
    [chatId],
    "saved chat word due today via the fifth param",
  );
});

test("saveToPalavras: creates a due-today card, is idempotent, leaves xp/streak alone", async () => {
  const { useProgress } = await load("src/lib/progress-store.ts", "?fresh=save");
  const today = todayKey();
  const phrase = travelPhrases.find((p) => p.situation === "anywhere");
  const before = useProgress.getState();
  useProgress.getState().saveToPalabras(phrase.id);
  const after = useProgress.getState();
  assert.deepEqual(after.cards[phrase.id], {
    interval: 0,
    ease: 0,
    due: today,
    reps: 0,
    lapses: 0,
  });
  assert.equal(after.xp, before.xp, "no XP for saving a phrase");
  assert.equal(after.streak, before.streak, "no streak change for saving a phrase");
  assert.equal(after.lastStudyDate, before.lastStudyDate, "no study day touched");

  useProgress.getState().gradeVocab(phrase.id, true);
  const graded = useProgress.getState().cards[phrase.id];
  useProgress.getState().saveToPalabras(phrase.id);
  assert.deepEqual(useProgress.getState().cards[phrase.id], graded, "never resets a graded card");
});
