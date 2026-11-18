/** #80/#142 (ADR 0019): `chat:` card ids, the savedWords store field, transfer schema,
 * reviewPool/dueVocab inclusion, merge, and a Send/Receive round-trip carrying savedWords.
 * Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".chat-words-test-"));
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

// A localStorage the tests control (Node's own needs a flag); zustand persist reads it at import.
const disk = new Map();
const storage = {
  getItem: (k) => (disk.has(k) ? disk.get(k) : null),
  setItem: (k, v) => disk.set(k, String(v)),
  removeItem: (k) => disk.delete(k),
};
globalThis.window = { localStorage: storage };
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

const C = await load("src/lib/chat-words.ts");
const { normalizePt, todayKey } = await load("src/lib/utils.ts");
const S = await load("src/lib/transfer-schema.ts");
const { mergeProgress } = await load("src/lib/progress-store.ts");
const { reviewPool, dueVocab } = await load("src/data/curriculum.ts");
const T = await load("src/lib/transfer.ts");

const today = todayKey();
const CODE = "K7QM2X9A";
const word = { pt: "Obrigado, tudo bem?", en: "Thank you, all good?", level: "A1" };
const id = `chat:${normalizePt(word.pt)}`;
const card = { interval: 0, ease: 0, due: today, reps: 0, lapses: 0 };

const light = (savedWords) => ({
  completed: {},
  xp: 0,
  streak: 0,
  lastStudyDate: null,
  cards: savedWords ? { [id]: card } : {},
  savedWords: savedWords ?? {},
  floor: "A1",
  floorUpdatedAt: null,
});

test("chatCardId: `chat:<normalizePt(pt)>`, and the id parses through the transfer CARD_ID", () => {
  assert.equal(id, "chat:obrigado tudo bem");
  assert.equal(C.chatCardId("  Olá! "), "chat:ola");
  const schema = S.transferSchema(today);
  const envelope = { v: 1, snapshot: light({ [id]: word }) };
  assert.ok(schema.safeParse(envelope).success, "chat: id accepted as card key and savedWords key");
});

test("schema: savedWords optional (old envelopes pass), bounded values, over-cap/proto-key/bad-level rejected", () => {
  const schema = S.transferSchema(today);
  const ok = (snap) => schema.safeParse({ v: 1, snapshot: snap }).success;
  assert.ok(ok(light()), "no savedWords field (old sender)");
  assert.ok(ok(light({ [id]: word })), "savedWords present");
  assert.ok(!ok(light({ [id]: { ...word, level: "C2" } })), "bad level rejected");
  assert.ok(!ok(light({ [id]: { ...word, pt: "" } })), "empty pt rejected");
  assert.ok(!ok(light({ [id]: { ...word, pt: "x".repeat(161) } })), "pt over 160 rejected");
  assert.ok(!ok(light({ [id]: { ...word, en: "x".repeat(201) } })), "en over 200 rejected");
  assert.ok(ok(light({ [id]: { ...word, pt: "x".repeat(160), en: "x".repeat(200) } })), "at the caps");
  // JSON.parse keeps "__proto__" as an own key (object literals do not). zod drops that key
  // instead of storing it; constructor/prototype are rejected outright. The codec layer also
  // rejects proto keys in decrypted JSON as malformed (transfer.test.mjs).
  const withProto = JSON.parse(
    `{"v":1,"snapshot":${JSON.stringify(light()).slice(0, -1)},"savedWords":{"__proto__":${JSON.stringify(word)}}}}`,
  );
  const parsedProto = schema.safeParse(withProto);
  assert.ok(parsedProto.success, "zod never stores a __proto__ key");
  assert.deepEqual(Object.keys(parsedProto.data.snapshot.savedWords), [], "proto key dropped");
  assert.equal({}.polluted, undefined, "no prototype pollution");
  assert.ok(!ok(light({ constructor: word })), "constructor key rejected");
  assert.ok(!ok(light({ prototype: word })), "prototype key rejected");
  const many = Object.fromEntries(
    Array.from({ length: S.MAX_SAVED_WORDS + 1 }, (_, i) => [`chat:w${i}`, word]),
  );
  assert.ok(!ok(light(many)), "over MAX_SAVED_WORDS rejected");
  assert.ok(ok(light(Object.fromEntries(
    Array.from({ length: S.MAX_SAVED_WORDS }, (_, i) => [`chat:w${i}`, word]),
  ))), "at MAX_SAVED_WORDS accepted");
  // A savedWords key without the colon shape is rejected like a bad card id.
  assert.ok(!ok(light({ "no-colon": word })), "savedWords keys must be card ids");
});

test("saveChatWord: due-today chat: card + savedWords entry, idempotent, no XP/streak, rejects bad input", async () => {
  const fresh = (await load("src/lib/progress-store.ts", "?fresh=t1")).useProgress;
  const before = fresh.getState();
  assert.deepEqual(before.savedWords, {}, "hydrates to {} without migration");
  fresh.getState().saveChatWord(word);
  const after = fresh.getState();
  assert.deepEqual(after.savedWords[id], word, "savedWords[id] written");
  assert.deepEqual(after.cards[id], card, "due-today card created");
  assert.equal(after.xp, before.xp, "no XP");
  assert.equal(after.streak, before.streak, "no streak");
  assert.equal(after.lastStudyDate, before.lastStudyDate, "no study day");
  // Idempotent: grading then re-saving never resets the card.
  fresh.getState().gradeVocab(id, true);
  const graded = fresh.getState().cards[id];
  fresh.getState().saveChatWord({ ...word, en: "edited" });
  assert.deepEqual(fresh.getState().cards[id], graded, "never resets a graded card");
  assert.equal(fresh.getState().savedWords[id].en, "edited", "the meaning can still be corrected");
  // Rejects empty and over-long input.
  const cardsBefore = fresh.getState().cards;
  const savedBefore = fresh.getState().savedWords;
  fresh.getState().saveChatWord({ pt: "  !! ", en: "x", level: "A1" });
  fresh.getState().saveChatWord({ pt: "a".repeat(200), en: "x", level: "A1" });
  fresh.getState().saveChatWord({ pt: "ok", en: "   ", level: "A1" });
  assert.equal(fresh.getState().cards, cardsBefore, "rejected input writes no card");
  assert.equal(fresh.getState().savedWords, savedBefore, "rejected input writes no saved word");
  assert.ok(C.MAX_CHAT_TEXT === 120);
  assert.ok(normalizePt("a".repeat(200)).length > C.MAX_CHAT_TEXT);
});

test("mergeProgress: savedWords union, same id with different content selects remote", () => {
  const local = light({ [id]: word, "chat:local only": { pt: "local", en: "local", level: "B1" } });
  const remote = {
    ...light({ [id]: { ...word, en: "remote wins" }, "chat:remote only": { pt: "r", en: "r", level: "A2" } }),
  };
  const m = mergeProgress(local, remote);
  assert.deepEqual(Object.keys(m.savedWords).sort(), [id, "chat:local only", "chat:remote only"].sort(), "union");
  assert.equal(m.savedWords[id].en, "remote wins", "different content: remote wins (completed tie convention)");
  // Old snapshots without the field still merge.
  const old = { ...light(), savedWords: undefined };
  assert.deepEqual(mergeProgress(old, light({ [id]: word })).savedWords, { [id]: word });
  assert.deepEqual(mergeProgress(light({ [id]: word }), old).savedWords, { [id]: word });
});

test("reviewPool/dueVocab: saved chat words join the pile once they have a card, level filter applies", () => {
  assert.deepEqual(reviewPool([], {}), [], "nothing saved, nothing in the pool");
  assert.deepEqual(reviewPool([], {}, { [id]: word }), [], "no card yet: stays out");
  const pool = reviewPool([], { [id]: card }, { [id]: word });
  assert.deepEqual(pool.map((i) => [i.id, i.pt, i.en, i.level]), [[id, word.pt, word.en, "A1"]]);
  assert.equal(pool[0].hint, undefined, "no hint/examples — the review UI guards those");
  assert.deepEqual(dueVocab([], { [id]: card }, today, undefined, { [id]: word }).map((i) => i.id), [id], "due today");
  assert.deepEqual(dueVocab([], { [id]: card }, today, "B1", { [id]: word }), [], "level filter applies");
  assert.deepEqual(dueVocab([], { [id]: { ...card, due: "2999-01-01" } }, today, undefined, { [id]: word }), [], "not yet due stays out");
  // Defaulted param: existing callers keep working — a chat card without a savedWords entry stays out.
  assert.deepEqual(reviewPool([], { [id]: card }), []);
});

test("transfer round-trip carries savedWords (Send → Receive)", async () => {
  const snap = light({ [id]: word });
  const frames = await T.encodeTransfer({ v: 1, snapshot: snap }, CODE);
  const session = new T.ReceiveSession();
  for (const f of frames) session.add(f);
  const unlocked = await session.unlock(CODE);
  const parsed = S.transferSchema(today).safeParse(unlocked);
  assert.ok(parsed.success, "schema accepts the round-tripped envelope");
  assert.deepEqual(parsed.data.snapshot.savedWords, { [id]: word });
  assert.deepEqual(unlocked, { v: 1, snapshot: snap }, "envelope unchanged, v stays 1");
});

test("hydration: an old stored snapshot without savedWords hydrates to {} — no migration, key unchanged", async () => {
  disk.set(
    "bica.progress.v1",
    JSON.stringify({
      state: {
        completed: {},
        xp: 5,
        streak: 1,
        lastStudyDate: today,
        cards: {},
        floor: "A1",
        floorUpdatedAt: null,
      },
      version: 0,
    }),
  );
  const reloaded = (await load("src/lib/progress-store.ts", "?reload=old")).useProgress;
  assert.equal(reloaded.getState().hydrated, true);
  assert.deepEqual(reloaded.getState().savedWords, {}, "missing key hydrates to {}");
  assert.equal(reloaded.getState().xp, 5, "old fields intact");
});

test("glossOf: `pt\\n(en)` → en without parens; missing/odd second line → empty", () => {
  assert.equal(C.glossOf("Obrigado, tudo bem?\n(Thank you, all good?)"), "Thank you, all good?");
  assert.equal(C.glossOf("Só uma linha"), "");
  assert.equal(C.glossOf("pt\nsem parenteses"), "");
  assert.equal(C.glossOf("pt\n()"), "");
  assert.equal(C.glossOf("pt\n(en) linha extra"), "");
});

test("clampSelection / needsGlossCaveat: selection outside the bubble → full line", () => {
  assert.equal(C.clampSelection(null, "linha inteira"), "linha inteira");
  assert.equal(C.clampSelection("   ", "linha inteira"), "linha inteira");
  assert.equal(C.clampSelection("  palavra ", "linha inteira"), "palavra");
  assert.equal(C.needsGlossCaveat(null, "linha inteira"), false, "whole line: no caveat");
  assert.equal(C.needsGlossCaveat("palavra", "linha inteira"), true, "sub-phrase: caveat");
  assert.equal(C.needsGlossCaveat("linha inteira", "linha inteira"), false);
});
