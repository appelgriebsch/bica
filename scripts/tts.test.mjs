import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
// Compile src/lib/tts.ts inside the repo so `react` resolves from node_modules.
const tmp = mkdtempSync(join(root, ".tts-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const src = readFileSync(join(root, "src/lib/tts.ts"), "utf8");
const out = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
// Stand-in for @/lib/online: online = navigator.onLine, changes fired by the test.
globalThis.__onlineSubs = [];
writeFileSync(
  join(tmp, "online-stub.mjs"),
  `export const isOnline = () => globalThis.navigator?.onLine !== false;
   export const subscribeOnline = (fn) => globalThis.__onlineSubs.push(fn);`,
);
writeFileSync(join(tmp, "tts.mjs"), out.replace('"@/lib/online"', '"./online-stub.mjs"'));
const tts = await import(pathToFileURL(join(tmp, "tts.mjs")).href);

function voice(lang, name = lang, localService = true) {
  return { lang, name, localService };
}

/** Minimal speechSynthesis: `voices` can change, `fire()` sends voiceschanged. */
function mockSynth(voices) {
  const listeners = [];
  const spoken = [];
  const synth = {
    voices,
    getVoices: () => synth.voices,
    addEventListener: (type, fn) => type === "voiceschanged" && listeners.push(fn),
    fire: () => listeners.forEach((fn) => fn()),
    cancel() {},
    speak(u) {
      spoken.push(u);
      setTimeout(() => u.fire("end"), 0);
    },
    spoken,
  };
  const win = {};
  globalThis.window = {
    speechSynthesis: synth,
    addEventListener: (t, fn) => (win[t] = fn),
  };
  synth.win = win;
  return synth;
}

globalThis.SpeechSynthesisUtterance = class {
  constructor(text) {
    this.text = text;
    this.handlers = {};
  }
  addEventListener(type, fn) {
    this.handlers[type] = fn;
  }
  fire(type, event) {
    this.handlers[type]?.(event);
  }
};

beforeEach(() => tts.resetPtVoiceForTests());

test("[pt-BR] only: no voice, never speaks", async () => {
  const s = mockSynth([voice("pt-BR")]);
  assert.equal(await tts.loadPtVoice(), null);
  assert.equal(tts.getPtVoiceStatus(), "none");
  await tts.speakPt("Olá");
  assert.equal(s.spoken.length, 0);
});

test("[pt] generic: no voice", async () => {
  mockSynth([voice("pt")]);
  assert.equal(await tts.loadPtVoice(), null);
  assert.equal(tts.getPtVoiceStatus(), "none");
});

test("[pt_PT]: accepted after normalising", async () => {
  mockSynth([voice("pt_PT", "Joana")]);
  assert.equal((await tts.loadPtVoice())?.name, "Joana");
  assert.equal(tts.getPtVoiceStatus(), "ready");
});

test("[pt-BR, pt-PT]: pt-PT wins, local preferred, and it speaks with it", async () => {
  const s = mockSynth([
    voice("pt-BR", "Luciana"),
    voice("pt-PT", "Online PT", false),
    voice("PT-pt", "Joana", true),
  ]);
  assert.equal((await tts.loadPtVoice())?.name, "Joana");
  await tts.speakPt("Bom dia", 0.9);
  assert.equal(s.spoken[0].voice.name, "Joana");
  assert.equal(s.spoken[0].lang, "pt-PT");
  assert.equal(s.spoken[0].rate, 0.9);
});

test("empty list, then voiceschanged brings pt-PT", async () => {
  const s = mockSynth([]);
  const pending = tts.loadPtVoice();
  assert.equal(tts.getPtVoiceStatus(), "loading");
  s.voices = [voice("pt-PT", "Joana")];
  s.fire();
  assert.equal((await pending)?.name, "Joana");
  assert.equal(tts.getPtVoiceStatus(), "ready");
});

test("voiceschanged never fires: none after the timeout, late voice still enables", async () => {
  const s = mockSynth([]);
  const t0 = Date.now();
  assert.equal(await tts.loadPtVoice(), null);
  assert.ok(Date.now() - t0 >= tts.VOICE_TIMEOUT_MS - 50);
  assert.equal(tts.getPtVoiceStatus(), "none");
  s.voices = [voice("pt-PT", "Joana")];
  s.fire();
  assert.equal(tts.getPtVoiceStatus(), "ready");
  assert.equal((await tts.loadPtVoice())?.name, "Joana");
});

test("stopSpeaking resolves the pending utterance", async () => {
  const s = mockSynth([voice("pt-PT")]);
  s.speak = (u) => s.spoken.push(u); // never ends on its own
  const p = tts.speakPt("Olá");
  await new Promise((r) => setTimeout(r, 0));
  tts.stopSpeaking();
  await p;
  assert.equal(s.spoken.length, 1);
});

// .grok/ is the platform's generic xAI API skill doc, not app code.
test("no xAI TTS anywhere in the tracked tree", () => {
  let hits = "";
  try {
    hits = execFileSync(
      "git",
      [
        "grep",
        "-nE",
        "api\\.x\\.ai/v1/tts|synthesizePt",
        "--",
        ".",
        ":!scripts/tts.test.mjs",
        ":!.grok/",
      ],
      { cwd: root, encoding: "utf8" },
    );
  } catch (err) {
    if (err.status !== 1) throw err; // 1 = no match
  }
  assert.equal(hits, "");
});

test("offline: an online-only pt-PT voice counts as none; back online it is used", async () => {
  globalThis.navigator = { onLine: false };
  const s = mockSynth([voice("pt-PT", "Online (Natural)", false)]);
  try {
    assert.equal(await tts.loadPtVoice(), null);
    assert.equal(tts.getPtVoiceStatus(), "none");
    await tts.speakPt("Olá");
    assert.equal(s.spoken.length, 0);
    globalThis.navigator.onLine = true;
    globalThis.__onlineSubs.forEach((fn) => fn());
    assert.equal(tts.getPtVoiceStatus(), "ready");
    // a local voice is fine offline
    globalThis.navigator.onLine = false;
    s.voices = [voice("pt-PT", "Joana", true)];
    s.fire();
    assert.equal(tts.getPtVoiceStatus(), "ready");
  } finally {
    delete globalThis.navigator;
  }
});

test("a speech error shows the notice (status none); cancel and not-allowed do not", async () => {
  const s = mockSynth([voice("pt-PT", "Joana")]);
  s.speak = (u) => {
    s.spoken.push(u);
    setTimeout(() => u.fire("error", { error: s.nextError }), 0);
  };
  s.nextError = "interrupted";
  await tts.speakPt("Olá");
  assert.equal(tts.getPtVoiceStatus(), "ready");
  s.nextError = "not-allowed"; // autoplay blocked before a gesture: not a missing voice
  await tts.speakPt("Olá");
  assert.equal(tts.getPtVoiceStatus(), "ready");
  s.nextError = "synthesis-failed";
  await tts.speakPt("Olá");
  assert.equal(tts.getPtVoiceStatus(), "none");
  s.fire(); // voices change → try again
  assert.equal(tts.getPtVoiceStatus(), "ready");
});
