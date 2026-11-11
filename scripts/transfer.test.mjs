/** #36: QR progress transfer — codec, framing, crypto, schema, merge, persistence. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".transfer-test-"));
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

// A localStorage the tests control (Node's own needs a flag).
const disk = new Map();
const storage = {
  failWrites: false,
  failReads: false,
  writes: 0,
  getItem(k) {
    if (this.failReads) throw new Error("SecurityError");
    return disk.has(k) ? disk.get(k) : null;
  },
  setItem(k, v) {
    if (this.failWrites) throw new DOMException("quota", "QuotaExceededError");
    this.writes++;
    disk.set(k, String(v));
  },
  removeItem: (k) => disk.delete(k),
};
// zustand's persist reads window.localStorage; transfer-merge reads it back.
globalThis.window = { localStorage: storage };
Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });

const T = await load("src/lib/transfer.ts");
const S = await load("src/lib/transfer-schema.ts");
const M = await load("src/lib/transfer-merge.ts");
const { useProgress, mergeProgress } = await load("src/lib/progress-store.ts");
const { catalogVocab, lessons } = await load("src/data/curriculum.ts");
const { todayKey } = await load("src/lib/utils.ts");

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder().decode(b);
const today = todayKey();
const CODE = "K7QM2X9A";

function light() {
  return {
    completed: {
      "a1-ola": { quizScore: 3, quizTotal: 4, xp: 14, completedAt: new Date().toISOString() },
    },
    xp: 14,
    streak: 1,
    lastStudyDate: today,
    cards: {},
    floor: "A1",
    floorUpdatedAt: null,
  };
}
/** Every lesson and every vocab card of the real catalogue: the largest real snapshot. */
function heavy() {
  const completed = {};
  lessons.forEach((l, i) => {
    completed[l.id] = {
      quizScore: i % 5,
      quizTotal: 5,
      xp: 8 + (i % 5) * 2,
      completedAt: new Date(
        Date.UTC(2026, 0, 1 + (i % 300), i % 24, i % 60, 7, i % 1000),
      ).toISOString(),
    };
  });
  const cards = {};
  catalogVocab().forEach((v, i) => {
    cards[v.id] = {
      interval: [1, 3, 7, 14, 30][i % 5],
      ease: 1 + (i % 5),
      due: S.addDayKey(today, i % 31),
      reps: i % 40,
      lapses: i % 7,
    };
  });
  return {
    completed,
    xp: 98765,
    streak: 321,
    lastStudyDate: today,
    cards,
    floor: "B2",
    floorUpdatedAt: new Date().toISOString(),
  };
}

test("base45: RFC 9285 vectors, odd lengths, malformed input", () => {
  for (const [plain, b45] of [
    ["AB", "BB8"],
    ["Hello!!", "%69 VD92EX0"],
    ["base-45", "UJCLQE7W581"],
    ["ietf!", "QED8WEX0"],
    ["", ""],
  ]) {
    assert.equal(T.base45Encode(enc(plain)), b45);
    assert.equal(dec(T.base45Decode(b45)), plain);
  }
  for (let n = 0; n < 64; n++) {
    const bytes = crypto.getRandomValues(new Uint8Array(n));
    const text = T.base45Encode(bytes);
    assert.equal(text.length, T.base45Length(n));
    assert.deepEqual(T.base45Decode(text), bytes);
  }
  assert.deepEqual(
    T.base45Decode(T.base45Encode(new Uint8Array([255, 255, 0]))),
    new Uint8Array([255, 255, 0]),
  );
  for (const bad of ["GGW", "A", "AAAA", "aa", "A#B", ":::", "::"]) {
    assert.throws(() => T.base45Decode(bad), /base45/, bad);
  }
});

test("code: unbiased reduced alphabet, XXXX-XXXX, strict normalisation", () => {
  assert.equal(T.CODE_ALPHABET.length, 31);
  assert.doesNotMatch(T.CODE_ALPHABET, /[OIL01]/);
  const counts = new Map();
  for (let i = 0; i < 40000; i++) {
    const code = T.newCode();
    assert.match(code, /^[A-HJKMNP-Z2-9]{8}$/);
    for (const c of code) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  assert.equal(counts.size, 31);
  // Modulo bias (256 % 31 = 8) would put 8 symbols ~12% above the rest.
  const values = [...counts.values()];
  assert.ok(
    Math.max(...values) / Math.min(...values) < 1.07,
    `spread ${Math.max(...values)}/${Math.min(...values)}`,
  );
  assert.equal(T.formatCode(CODE), "K7QM-2X9A");
  assert.equal(T.normalizeCode(" k7qm-2x9a "), CODE);
  assert.equal(T.normalizeCode("k7 qm 2x 9a"), CODE);
  for (const bad of [
    "K7QM-2X9",
    "K7QM-2X9AB",
    "K7QO-2X9A",
    "K7QI-2X9A",
    "K7QL-2X9A",
    "K7Q0-2X9A",
    "K7Q1-2X9A",
    "K7QM_2X9A",
  ]) {
    assert.equal(T.normalizeCode(bad), null, bad);
  }
  assert.match(T.newSid(), /^[A-Z0-9]{4}$/);
});

test("codec gate: needs deflate-raw both ways", () => {
  assert.equal(T.codecSupported(), true);
  const real = globalThis.CompressionStream;
  globalThis.CompressionStream = class {
    constructor(format) {
      if (format === "deflate-raw") throw new TypeError("unsupported");
    }
  };
  try {
    assert.equal(T.codecSupported(), false);
  } finally {
    globalThis.CompressionStream = real;
  }
});

async function framesOf(payload, code = CODE, sid) {
  return T.encodeTransfer(payload, code, sid);
}
function collectAll(frames) {
  const s = new T.ReceiveSession();
  for (const f of frames) s.add(f);
  return s;
}

test("round trip: light and heavy snapshots, frame sizes and counts", async (t) => {
  for (const [name, snap] of [
    ["light", light()],
    ["heavy", heavy()],
  ]) {
    const frames = await framesOf({ v: 1, snapshot: snap });
    t.diagnostic(
      `${name}: ${frames.length} frames, longest ${Math.max(...frames.map((f) => f.length))} chars, JSON ${JSON.stringify(snap).length} B`,
    );
    assert.ok(frames.length <= T.MAX_PARTS);
    for (const [i, f] of frames.entries()) {
      assert.ok(f.length <= 500, `frame ${f.length}`);
      assert.match(
        f,
        new RegExp(`^BQ1:[A-Z0-9]{4}:${i + 1}/${frames.length}:[0-9A-Z $%*+\\-./:]+$`),
      );
      assert.ok(!f.includes(CODE));
    }
    const s = collectAll([...frames].reverse());
    assert.deepEqual(await s.unlock(CODE), { v: 1, snapshot: snap });
    assert.equal(S.transferSchema(today).safeParse({ v: 1, snapshot: snap }).success, true, name);
  }
});

test("AAD n is computed before encryption and matches the frames", async () => {
  for (const len of [0, 1, 400, 2000, 5000]) {
    const frames = await framesOf({ pad: "x".repeat(len) + crypto.randomUUID().repeat(len / 40) });
    assert.equal(T.parseFrame(frames[0]).n, frames.length);
  }
});

test("overflow: more than 16 frames is refused, never truncated", async () => {
  const noise = T.base45Encode(crypto.getRandomValues(new Uint8Array(6000)));
  await assert.rejects(framesOf({ noise }), (e) => e.kind === "too-large");
});

test("crypto: PBKDF2-SHA256 600k, AES-GCM-256, salt16|iv12|ct+tag, AAD BQ1|n, fresh salt/IV", async () => {
  const payload = { v: 1, snapshot: light() };
  const a = await framesOf(payload, CODE, "ABCD");
  const b = await framesOf(payload, CODE, "ABCD");
  const blob = (fr) => T.base45Decode(fr.map((f) => T.parseFrame(f).payload).join(""));
  const [ba, bb] = [blob(a), blob(b)];
  assert.notDeepEqual(ba.subarray(0, 16), bb.subarray(0, 16), "salt");
  assert.notDeepEqual(ba.subarray(16, 28), bb.subarray(16, 28), "iv");
  // Independent decrypt with the documented parameters.
  const base = await crypto.subtle.importKey("raw", enc(CODE), "PBKDF2", false, ["deriveKey"]);
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: ba.subarray(0, 16), iterations: 600000 },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ba.subarray(16, 28), additionalData: enc(`BQ1|${a.length}`) },
    key,
    ba.subarray(28),
  );
  const json = await new Response(
    new Blob([plain]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
  ).text();
  assert.deepEqual(JSON.parse(json), payload);
  // The wrong n in the AAD fails like a wrong code.
  const text = a.map((f) => T.parseFrame(f).payload).join("");
  await assert.rejects(T.decodeTransfer(text, a.length + 1, CODE), (e) => e.kind === "unlock");
});

test("unlock: wrong code and tampering look the same; no inflate before auth; five failures discard", async () => {
  const frames = await framesOf({ v: 1, snapshot: heavy() });
  const real = globalThis.DecompressionStream;
  let inflates = 0;
  globalThis.DecompressionStream = class extends real {
    constructor(f) {
      super(f);
      inflates++;
    }
  };
  try {
    const s = collectAll(frames);
    for (let i = 1; i < T.MAX_UNLOCK_ATTEMPTS; i++) {
      await assert.rejects(s.unlock("AAAAAAAA"), (e) => e.kind === "unlock");
      assert.ok(s.collection, "parts kept for another try");
    }
    await assert.rejects(s.unlock("AAAAAAAA"), (e) => e.kind === "discarded");
    assert.equal(s.collection, null);
    // Flip one payload character: GCM fails, the message is the same.
    const last = frames.at(-1);
    const flipped = last.slice(0, -1) + (last.at(-1) === "0" ? "1" : "0");
    await assert.rejects(
      collectAll([...frames.slice(0, -1), flipped]).unlock(CODE),
      (e) => e.kind === "unlock",
    );
    assert.equal(inflates, 0, "nothing inflated before authentication");
  } finally {
    globalThis.DecompressionStream = real;
  }
});

test("inflate: streaming 256 KB cap, after authentication", async () => {
  const big = { v: 1, pad: "a".repeat(300 * 1024) };
  const frames = await framesOf(big);
  assert.ok(frames.length <= 2, "compresses to almost nothing");
  await assert.rejects(collectAll(frames).unlock(CODE), (e) => e.kind === "too-large");
  const zeros = await new Response(
    new Blob([new Uint8Array(4 * 1024 * 1024)])
      .stream()
      .pipeThrough(new CompressionStream("deflate-raw")),
  ).arrayBuffer();
  await assert.rejects(T.inflateCapped(new Uint8Array(zeros)), (e) => e.kind === "too-large");
  assert.equal(
    (await T.inflateCapped(new Uint8Array(zeros), 8 * 1024 * 1024)).length,
    4 * 1024 * 1024,
  );
});

test("prototype keys in decrypted JSON are malformed", async () => {
  // JSON.parse keeps "__proto__" as an own key, and JSON.stringify writes it back out.
  const proto = JSON.parse('{"v":1,"snapshot":{"__proto__":{"polluted":1}}}');
  for (const payload of [proto, { v: 1, snapshot: { completed: { constructor: 1 } } }]) {
    const frames = await T.encodeTransfer(payload, CODE);
    await assert.rejects(collectAll(frames).unlock(CODE), (e) => e.kind === "malformed");
  }
  assert.equal({}.polluted, undefined);
});

test("framing: order, duplicates, conflicts, sessions, versions, caps", () => {
  const p = "ABC";
  const s = new T.ReceiveSession(0);
  assert.equal(s.add("hello"), "ignored");
  assert.equal(s.collection, null, "nothing known before a BQ1 frame");
  assert.equal(s.add(`BQ1:SID1:3/3:${p}`), "new");
  assert.equal(s.add(`BQ1:SID1:1/3:${p}`), "new");
  assert.equal(s.add(`BQ1:SID1:1/3:${p}`), "duplicate");
  assert.equal(s.add(`BQ1:SID1:1/3:XYZ`), "conflict");
  assert.equal(s.add(`BQ1:SID1:2/4:${p}`), "conflict", "inconsistent n");
  assert.equal(s.add(`BQ1:SID2:2/3:${p}`), "foreign");
  assert.deepEqual(T.missingParts(s.collection), [2]);
  assert.equal(T.received(s.collection), 2);
  assert.equal(T.isComplete(s.collection), false);
  assert.equal(s.add(`BQ1:SID1:2/3:${p}`), "new");
  assert.equal(T.isComplete(s.collection), true);
  assert.equal(T.joined(s.collection), p + p + p);
  assert.equal(s.add("BQ2:SID1:1/3:ABC"), "version");
  assert.equal(T.parseFrame("BQ10:ABCD:1/1:X"), "version");
  for (const bad of [
    "BQ1:SID1:0/3:ABC", // i = 0
    "BQ1:SID1:4/3:ABC", // i > n
    "BQ1:SID1:01/3:ABC", // non-canonical
    "BQ1:SID1:1/17:ABC", // n > 16
    "BQ1:sid1:1/3:ABC", // lowercase SID
    "BQ1:SID:1/3:ABC",
    "BQ1:SID1:1/3:",
    "BQ1:SID1:1/3:ab#",
    "BQ1:SID1:1-3:ABC",
    `BQ1:SID1:1/3:${"A".repeat(600)}`, // > 600 chars
  ]) {
    assert.equal(T.parseFrame(bad), null, bad);
  }
  assert.ok(T.parseFrame(`BQ1:SID1:16/16:${"A".repeat(600 - 15)}`));
  assert.equal(s.expiresAt, 5 * 60 * 1000);
  s.clear();
  assert.equal(s.collection, null);
});

test("schema: bounds, dates, ids, enums", () => {
  const schema = S.transferSchema(today);
  const ok = (snap) => schema.safeParse({ v: 1, snapshot: snap }).success;
  const base = light();
  const at = (days) => S.addDayKey(today, days);
  const iso = (days) => `${at(days)}T12:00:00.000Z`;
  const card = (over) => ({
    ...base,
    cards: { "a1-ola:bom dia": { interval: 1, ease: 1, due: today, reps: 1, lapses: 0, ...over } },
  });
  const lesson = (over) => ({
    ...base,
    completed: { "a1-ola": { ...base.completed["a1-ola"], ...over } },
  });
  assert.ok(ok(base));
  assert.ok(ok({ ...base, floorUpdatedAt: undefined }), "older snapshot without floorUpdatedAt");
  assert.ok(
    schema.safeParse({
      v: 1,
      snapshot: { completed: {}, xp: 0, streak: 0, lastStudyDate: null, cards: {}, floor: "A1" },
    }).success,
  );
  // Observed dates: today + 1 accepted, today + 2 rejected.
  assert.ok(ok({ ...base, lastStudyDate: at(1) }));
  assert.ok(!ok({ ...base, lastStudyDate: at(2) }));
  assert.ok(ok(lesson({ completedAt: iso(1) })));
  assert.ok(!ok(lesson({ completedAt: iso(2) })));
  assert.ok(ok({ ...base, floorUpdatedAt: iso(1) }));
  assert.ok(!ok({ ...base, floorUpdatedAt: iso(2) }));
  // cards.due: +30, +31 accepted; +32 rejected.
  assert.ok(ok(card({ due: at(30) })));
  assert.ok(ok(card({ due: at(31) })));
  assert.ok(!ok(card({ due: at(32) })));
  // Calendar dates.
  assert.ok(!ok(card({ due: "2026-02-30" })));
  assert.ok(!ok({ ...base, lastStudyDate: "2026-13-01" }));
  assert.ok(!ok(lesson({ completedAt: "2026-02-30T00:00:00.000Z" })));
  assert.ok(!ok(lesson({ completedAt: "yesterday" })));
  // Numbers.
  for (const bad of [-1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1, "1"]) {
    assert.ok(!ok({ ...base, xp: bad }), `xp ${bad}`);
    assert.ok(!ok(card({ reps: bad })), `reps ${bad}`);
  }
  assert.ok(ok({ ...base, xp: S.MAX_XP, streak: S.MAX_STREAK }));
  assert.ok(!ok({ ...base, xp: S.MAX_XP + 1 }));
  assert.ok(!ok({ ...base, streak: S.MAX_STREAK + 1 }));
  assert.ok(ok(card({ ease: S.MAX_EASE, interval: S.MAX_INTERVAL })));
  assert.ok(!ok(card({ ease: S.MAX_EASE + 1 })));
  assert.ok(!ok(card({ interval: S.MAX_INTERVAL + 1 })));
  assert.ok(ok(lesson({ quizScore: 4, quizTotal: 4 })));
  assert.ok(!ok(lesson({ quizScore: 5, quizTotal: 4 })), "quizScore <= quizTotal");
  assert.ok(!ok(lesson({ quizTotal: S.MAX_QUIZ + 1, quizScore: 0 })));
  // Enums, shape, ids.
  assert.ok(!ok({ ...base, floor: "C2" }));
  assert.ok(!ok({ ...base, extra: 1 }));
  assert.ok(!ok(card({ extra: 1 })));
  assert.ok(!schema.safeParse({ v: 2, snapshot: base }).success);
  assert.ok(!ok({ ...base, completed: { constructor: base.completed["a1-ola"] } }));
  assert.ok(!ok({ ...base, completed: { prototype: base.completed["a1-ola"] } }));
  assert.ok(!ok({ ...base, completed: { ["x".repeat(65)]: base.completed["a1-ola"] } }));
  assert.ok(!ok({ ...base, cards: { "no-colon": card({}).cards["a1-ola:bom dia"] } }));
  assert.ok(!ok({ ...base, cards: { "a1:\u0000": card({}).cards["a1-ola:bom dia"] } }));
  // Count caps.
  const many = (n) =>
    Object.fromEntries(Array.from({ length: n }, (_, i) => [`l${i}`, base.completed["a1-ola"]]));
  assert.ok(ok({ ...base, completed: many(S.MAX_LESSONS) }));
  assert.ok(!ok({ ...base, completed: many(S.MAX_LESSONS + 1) }));
  // Every real id passes.
  assert.ok(ok(heavy()));
});

test("merge: existing winners and ties, floor recency, streak can drop", () => {
  const row = (quizScore, completedAt = "2026-01-01T00:00:00.000Z") => ({
    quizScore,
    quizTotal: 5,
    xp: 8,
    completedAt,
  });
  const c = (reps, due) => ({ interval: 1, ease: 1, due, reps, lapses: 0 });
  const local = {
    ...light(),
    completed: { a: row(3, "L"), b: row(4, "L"), c: row(2) },
    cards: { x: c(2, "2026-01-05"), y: c(2, "2026-01-05"), z: c(1, "2026-01-01") },
    xp: 50,
    streak: 7,
    lastStudyDate: "2026-01-10",
  };
  const remote = {
    ...light(),
    completed: { a: row(3, "R"), b: row(2, "R"), d: row(1) },
    cards: { x: c(2, "2026-01-05"), y: c(3, "2026-01-01"), w: c(1, "2026-01-02") },
    xp: 40,
    streak: 2,
    lastStudyDate: "2026-01-11",
  };
  const m = mergeProgress(local, remote);
  assert.equal(m.completed.a.completedAt, "R", "equal score selects remote");
  assert.equal(m.completed.b.completedAt, "L", "best score wins");
  assert.deepEqual(Object.keys(m.completed).sort(), ["a", "b", "c", "d"], "union, nothing deleted");
  assert.equal(m.cards.y.reps, 3, "reps wins");
  assert.deepEqual(Object.keys(m.cards).sort(), ["w", "x", "y", "z"]);
  assert.equal(m.xp, 50);
  assert.equal(m.streak, 2, "later study day wins even when shorter");
  assert.equal(
    mergeProgress({ ...local, lastStudyDate: "2026-01-11" }, remote).streak,
    7,
    "same day: max",
  );
  const floor = (lf, lt, rf, rt) =>
    mergeProgress(
      { ...local, floor: lf, floorUpdatedAt: lt },
      { ...remote, floor: rf, floorUpdatedAt: rt },
    ).floor;
  assert.equal(
    floor("A1", "2026-01-02T00:00:00.000Z", "B1", "2026-01-01T00:00:00.000Z"),
    "A1",
    "newer local wins",
  );
  assert.equal(floor("A1", "2026-01-01T00:00:00.000Z", "B1", "2026-01-02T00:00:00.000Z"), "B1");
  assert.equal(floor("A1", null, "B1", null), "B1", "both undated: higher");
  assert.equal(floor("B1", "2026-01-01T00:00:00.000Z", "C1", null), "B1", "a timestamp beats none");
  assert.equal(
    floor("A2", "2026-01-01T00:00:00.000Z", "B1", "2026-01-01T00:00:00.000Z"),
    "A2",
    "tie keeps local",
  );
});

function resetStore(state) {
  storage.failWrites = false;
  useProgress.setState({
    ...light(),
    completed: {},
    cards: {},
    xp: 0,
    streak: 0,
    lastStudyDate: null,
    floor: "A1",
    floorUpdatedAt: null,
    hydrated: true,
    hydrationFailed: false,
    ...state,
  });
}

test("commit: preview parity, recompute, no-op skips the write, settings-only change", () => {
  resetStore({});
  const remote = heavy();
  const preview = M.previewMerge(useProgress.getState().snapshot(), remote);
  assert.equal(preview.changed, true);
  assert.equal(preview.newLessons, lessons.length);
  // Local study during the review changes the result: a new review, no write.
  useProgress.getState().setFloor("C1");
  const writes = storage.writes;
  const again = M.commitMerge(preview, remote);
  assert.equal(again.status, "changed");
  assert.equal(storage.writes, writes);
  const saved = M.commitMerge(again.preview, remote);
  assert.equal(saved.status, "saved");
  assert.ok(M.sameProgress(useProgress.getState().snapshot(), again.preview.merged));
  assert.ok(M.sameProgress(JSON.parse(disk.get("bica.progress.v1")).state, again.preview.merged));
  // Identical second import: semantic no-op, nothing written.
  const second = M.previewMerge(useProgress.getState().snapshot(), remote);
  assert.equal(second.changed, false);
  const before = storage.writes;
  assert.equal(M.commitMerge(second, remote).status, "noop");
  assert.equal(storage.writes, before);
  // Settings only: a newer floor elsewhere is a change.
  const newer = {
    ...useProgress.getState().snapshot(),
    floor: "A2",
    floorUpdatedAt: new Date(Date.now() + 1000).toISOString(),
  };
  const settings = M.previewMerge(useProgress.getState().snapshot(), newer);
  assert.equal(settings.changed, true);
  assert.equal(
    settings.newLessons + settings.newCards + settings.changedLessons + settings.changedCards,
    0,
  );
  assert.deepEqual(settings.floor, ["C1", "A2"]);
});

test("commit: refuses unhydrated stores; quota failure keeps memory and disk as they were", () => {
  resetStore({ hydrated: false });
  const remote = light();
  const preview = M.previewMerge(useProgress.getState().snapshot(), remote);
  assert.equal(M.commitMerge(preview, remote).status, "unhydrated");
  resetStore({ hydrationFailed: true });
  assert.equal(M.commitMerge(preview, remote).status, "unhydrated");
  resetStore({});
  const onDisk = disk.get("bica.progress.v1");
  storage.failWrites = true;
  const p = M.previewMerge(useProgress.getState().snapshot(), remote);
  assert.equal(M.commitMerge(p, remote).status, "failed");
  assert.deepEqual(useProgress.getState().completed, {}, "memory rolled back");
  assert.equal(disk.get("bica.progress.v1"), onDisk);
  storage.failWrites = false;
  assert.equal(M.commitMerge(p, remote).status, "saved", "retry works");
});

test("persistence (#34 carried over): floorUpdatedAt survives reload, newer local floor wins over an older import", async () => {
  resetStore({});
  useProgress.getState().setFloor("B1");
  const stamped = useProgress.getState().floorUpdatedAt;
  assert.ok(stamped);
  assert.equal(JSON.parse(disk.get("bica.progress.v1")).state.floorUpdatedAt, stamped);
  // "Reload": a fresh store instance hydrates from the same storage.
  const reloaded = (await load("src/lib/progress-store.ts", "?reload=1")).useProgress;
  assert.equal(reloaded.getState().hydrated, true);
  assert.equal(reloaded.getState().floor, "B1");
  assert.equal(reloaded.getState().floorUpdatedAt, stamped);
  reloaded
    .getState()
    .mergeRemote({ ...light(), floor: "C1", floorUpdatedAt: "2026-01-01T00:00:00.000Z" });
  assert.equal(reloaded.getState().floor, "B1");
  // Hydration failure is flagged, never merged into.
  storage.failReads = true;
  const failed = (await load("src/lib/progress-store.ts", "?reload=2")).useProgress;
  storage.failReads = false;
  await new Promise((r) => queueMicrotask(r));
  assert.equal(failed.getState().hydrated, false);
  assert.equal(failed.getState().hydrationFailed, true);
});

test("Update app: only an installed waiting worker, SKIP_WAITING on request, one reload", async (t) => {
  const { updateApp } = await load("src/lib/app-update.ts");
  const real = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const realLocation = globalThis.location;
  t.after(() => {
    Object.defineProperty(globalThis, "navigator", real);
    globalThis.location = realLocation;
  });
  let reloads = 0;
  globalThis.location = { reload: () => reloads++ };
  function worker(state) {
    const listeners = [];
    return {
      state,
      posted: [],
      postMessage(m) {
        this.posted.push(m);
      },
      addEventListener: (_t, fn) => listeners.push(fn),
      removeEventListener: () => {},
      settle(next) {
        this.state = next;
        listeners.forEach((fn) => fn());
      },
    };
  }
  function setup({ reg, onLine = true }) {
    const changes = [];
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        onLine,
        serviceWorker: {
          getRegistration: async () => reg,
          addEventListener: (type, fn) => type === "controllerchange" && changes.push(fn),
        },
      },
    });
    return changes;
  }

  // A worker already waiting: activate it, reload once however often controllerchange fires.
  const waiting = worker("installed");
  const changes = setup({ reg: { waiting, update: async () => assert.fail("no fetch needed") } });
  assert.equal(await updateApp(), "reloading");
  assert.deepEqual(waiting.posted, [{ type: "SKIP_WAITING" }]);
  changes.forEach((fn) => (fn(), fn()));
  assert.equal(reloads, 1);

  // A new build installs completely, then waits.
  const fresh = worker("installing");
  const reg = { waiting: null, installing: null };
  reg.update = async () => {
    reg.installing = fresh;
    setTimeout(() => {
      reg.waiting = fresh;
      fresh.settle("installed");
    }, 5);
  };
  setup({ reg });
  assert.equal(await updateApp(), "reloading");
  assert.deepEqual(fresh.posted, [{ type: "SKIP_WAITING" }]);

  // A failed install leaves the old worker alone.
  const broken = worker("installing");
  const reg2 = { waiting: null, installing: null };
  reg2.update = async () => {
    reg2.installing = broken;
    setTimeout(() => broken.settle("redundant"), 5);
  };
  setup({ reg: reg2 });
  assert.equal(await updateApp(), "none");
  assert.deepEqual(broken.posted, []);

  // Offline with nothing downloaded; no worker at all.
  setup({
    reg: {
      waiting: null,
      installing: null,
      update: async () => {
        throw new TypeError("offline");
      },
    },
    onLine: false,
  });
  assert.equal(await updateApp(), "offline");
  setup({ reg: undefined });
  assert.equal(await updateApp(), "none");
});

test("unlock: a result for a cleared or expired session comes back stale (Avery C1)", async () => {
  const payload = { v: 1, snapshot: light() };
  const frames = await T.encodeTransfer(payload, CODE);
  // Cleared (Scan again, Cancel, leave) while the key derivation runs.
  const s = collectAll(frames);
  const pending = s.unlock(CODE);
  s.clear();
  await assert.rejects(pending, (e) => e.kind === "stale");
  // A wrong code on a cleared session is stale too, and doesn't count as a failure.
  const w = collectAll(frames);
  const wrong = w.unlock("AAAAAAAA");
  w.clear();
  await assert.rejects(wrong, (e) => e.kind === "stale");
  assert.equal(w.failures, 0);
  // Expired before or during the unlock.
  const old = new T.ReceiveSession(Date.now() - T.SESSION_MS);
  for (const f of frames) old.collection = T.collect(old.collection, f).collection;
  await assert.rejects(old.unlock(CODE), (e) => e.kind === "stale");
  const late = new T.ReceiveSession(Date.now() - T.SESSION_MS + 20);
  for (const f of frames) late.collection = T.collect(late.collection, f).collection;
  await assert.rejects(late.unlock(CODE), (e) => e.kind === "stale", "600k PBKDF2 outlasts 20 ms");
  // The live session still unlocks.
  assert.deepEqual(await collectAll(frames).unlock(CODE), payload);
});

test("schema: times become canonical toISOString before the lexical floor merge (Avery C2)", () => {
  const schema = S.transferSchema(today);
  assert.equal(S.canonicalTime("2026-11-06T12:00:00Z"), "2026-11-06T12:00:00.000Z");
  assert.equal(S.canonicalTime("2026-11-06T12:00:00.9Z"), "2026-11-06T12:00:00.900Z");
  assert.equal(S.canonicalTime("2026-11-06T12:00:00.123Z"), "2026-11-06T12:00:00.123Z");
  for (const bad of [
    "2026-11-07T24:00:00.000Z",
    "2026-02-30T00:00:00.000Z",
    "2026-11-06T12:60:00Z",
    "2026-11-06T12:00:60Z",
    "2026-11-06T12:00:00.1234Z",
    "2026-11-06T12:00:00+00:00",
    "2026-11-06 12:00:00",
  ]) {
    assert.equal(S.canonicalTime(bad), null, bad);
  }
  // today + 1 at 24:00 would roll to today + 2: rejected rather than normalised past the bound.
  assert.ok(
    !schema.safeParse({
      v: 1,
      snapshot: { ...light(), floorUpdatedAt: `${S.addDayKey(today, 1)}T24:00:00.000Z` },
    }).success,
  );
  // One fixture: light() stamps wall-clock times, so a second call can differ by a millisecond.
  const remote = { ...light(), floor: "C1", floorUpdatedAt: `${today}T12:00:00Z` };
  const parsed = schema.parse({ v: 1, snapshot: remote });
  assert.equal(parsed.snapshot.floorUpdatedAt, `${today}T12:00:00.000Z`);
  assert.equal(
    parsed.snapshot.completed["a1-ola"].completedAt,
    remote.completed["a1-ola"].completedAt, // already canonical: unchanged
  );
  // Newer local 12:00:00.900Z keeps its floor against the older remote 12:00:00Z.
  const merged = mergeProgress(
    { ...light(), floor: "A1", floorUpdatedAt: `${today}T12:00:00.900Z` },
    parsed.snapshot,
  );
  assert.equal(merged.floor, "A1");
});

test("decoder: stop() during native detection never creates a worker (Avery W1)", async () => {
  const { startDecoding } = await load("src/lib/qr-scan.ts");
  let workers = 0;
  let resolveFormats;
  const saved = {
    document: globalThis.document,
    Worker: globalThis.Worker,
    BD: globalThis.BarcodeDetector,
  };
  globalThis.document = {
    createElement: () => ({
      getContext: () => ({
        drawImage() {},
        getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      }),
    }),
  };
  globalThis.Worker = class {
    constructor() {
      workers++;
    }
    postMessage() {}
    terminate() {}
  };
  globalThis.BarcodeDetector = class {
    static getSupportedFormats() {
      return new Promise((r) => (resolveFormats = r));
    }
  };
  try {
    const stop = startDecoding({ videoWidth: 640, videoHeight: 480 }, () => {});
    await new Promise((r) => setTimeout(r, 150)); // first tick is waiting on detection
    stop();
    resolveFormats([]); // unsupported: the old code went on to the jsQR worker
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(workers, 0);
  } finally {
    Object.assign(globalThis, {
      document: saved.document,
      Worker: saved.Worker,
      BarcodeDetector: saved.BD,
    });
  }
});
