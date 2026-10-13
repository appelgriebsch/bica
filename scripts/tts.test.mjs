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
writeFileSync(join(tmp, "tts.mjs"), out);
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
  globalThis.window = { speechSynthesis: synth };
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
  fire(type) {
    this.handlers[type]?.();
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

test("no xAI TTS left in src", () => {
  let hits = "";
  try {
    hits = execFileSync("grep", ["-rnE", "api\\.x\\.ai/v1/tts|synthesizePt", join(root, "src")], {
      encoding: "utf8",
    });
  } catch (err) {
    if (err.status !== 1) throw err; // 1 = no match
  }
  assert.equal(hits, "");
});
