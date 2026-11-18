/**
 * #83 (ADR 0020): spoken Conversas answers. Unit tests for the pt-PT
 * SpeechRecognition wrapper in src/lib/speech-input.ts (compiled with the
 * repo's typescript, like tts.test.mjs) plus source-level checks that the
 * /speak/$id composer keeps the typed input next to the mic button.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".speech-input-test-"));
after(() => rmSync(tmp, { recursive: true, force: true }));
const src = readFileSync(join(root, "src/lib/speech-input.ts"), "utf8");
const out = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
writeFileSync(join(tmp, "speech-input.mjs"), out);
const si = await import(pathToFileURL(join(tmp, "speech-input.mjs")).href);

// ------------------------------------------------------------- mock browser

class MockRecognition {
  static instances = [];
  constructor() {
    this.lang = "";
    this.continuous = true;
    this.interimResults = false;
    this.maxAlternatives = 0;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.started = false;
    this.stopped = false;
    this.aborted = false;
    MockRecognition.instances.push(this);
  }
  start() {
    this.started = true;
  }
  stop() {
    if (this.stopped) return; // like the browser: a second stop is a no-op
    this.stopped = true;
    queueMicrotask(() => this.onend?.());
  }
  abort() {
    if (this.aborted) return;
    this.aborted = true;
    queueMicrotask(() => this.onend?.());
  }
  fireResult(resultIndex, results) {
    this.onresult?.({ resultIndex, results: { length: results.length, item: (i) => results[i] } });
  }
  fireError(code) {
    this.onerror?.({ error: code });
  }
  fireEnd() {
    this.onend?.();
  }
}

const res = (transcript, isFinal) => ({
  isFinal,
  length: 1,
  item: () => ({ transcript }),
  0: { transcript },
});

beforeEach(() => {
  MockRecognition.instances = [];
  si.resetSpeechInputForTests();
  globalThis.window = { SpeechRecognition: MockRecognition };
});

const tick = () => new Promise((r) => setTimeout(r, 0));

// ------------------------------------------------------------------ support

test("no SpeechRecognition on the device: unsupported, startSpeechInput returns null", () => {
  delete globalThis.window;
  assert.equal(si.getSpeechInputSupport(), "unsupported");
  assert.equal(si.startSpeechInput({ onTranscript() {}, onError() {}, onEnd() {} }), null);
});

test("webkitSpeechRecognition (Safari) is accepted as the constructor", () => {
  globalThis.window = { webkitSpeechRecognition: MockRecognition };
  assert.equal(si.getSpeechInputSupport(), "supported");
  const s = si.startSpeechInput({ onTranscript() {}, onError() {}, onEnd() {} });
  assert.ok(s);
  s.stop();
});

// ------------------------------------------------------------------ session

test("a session pins pt-PT, interim results, single-utterance, one alternative, and starts", () => {
  const s = si.startSpeechInput({ onTranscript() {}, onError() {}, onEnd() {} });
  const rec = MockRecognition.instances[0];
  assert.equal(rec.lang, "pt-PT");
  assert.equal(rec.lang, si.RECOGNITION_LANG);
  assert.equal(rec.interimResults, true);
  assert.equal(rec.continuous, false);
  assert.equal(rec.maxAlternatives, 1);
  assert.equal(rec.started, true);
  s.stop();
});

test("interim streams live; finals accumulate and replace the interim", () => {
  const seen = [];
  const s = si.startSpeechInput({
    onTranscript: (f, i) => seen.push([f, i]),
    onError() {},
    onEnd() {},
  });
  const rec = MockRecognition.instances[0];
  rec.fireResult(0, [res("ol", false)]);
  rec.fireResult(0, [res("olá ", false)]);
  rec.fireResult(0, [res("olá ", true)]);
  rec.fireResult(0, [res("olá ", true), res("tudo", false)]);
  rec.fireResult(0, [res("olá ", true), res("tudo bem?", true)]);
  assert.deepEqual(seen, [
    ["", "ol"],
    ["", "olá "],
    ["olá ", ""],
    ["olá ", "tudo"],
    ["olá tudo bem?", ""],
  ]);
  s.stop();
});

test("stop() stops recognition and ends the session exactly once", async () => {
  let ends = 0;
  const s = si.startSpeechInput({ onTranscript() {}, onError() {}, onEnd: () => ends++ });
  const rec = MockRecognition.instances[0];
  s.stop();
  s.stop(); // idempotent: a second stop must not end anything twice
  assert.equal(rec.stopped, true);
  await tick();
  assert.equal(ends, 1);
});

test("starting a second session aborts the first", async () => {
  const s1 = si.startSpeechInput({ onTranscript() {}, onError() {}, onEnd() {} });
  si.startSpeechInput({ onTranscript() {}, onError() {}, onEnd() {} });
  assert.equal(MockRecognition.instances[0].aborted, true);
  assert.equal(MockRecognition.instances[1].started, true);
  s1.stop();
  await tick();
});

// ------------------------------------------------------------------- errors

test("language-not-supported: error surfaces and support flips to unsupported (sticky)", () => {
  const errors = [];
  si.startSpeechInput({ onTranscript() {}, onError: (c) => errors.push(c), onEnd() {} });
  const rec = MockRecognition.instances[0];
  assert.equal(si.getSpeechInputSupport(), "supported");
  rec.fireError("language-not-supported");
  assert.deepEqual(errors, ["language-not-supported"]);
  assert.equal(si.getSpeechInputSupport(), "unsupported");
  si.resetSpeechInputForTests();
  assert.equal(si.getSpeechInputSupport(), "supported");
});

test("service-not-allowed is also fatal; not-allowed is not", () => {
  const errors = [];
  si.startSpeechInput({ onTranscript() {}, onError: (c) => errors.push(c), onEnd() {} });
  MockRecognition.instances[0].fireError("not-allowed");
  assert.deepEqual(errors, ["not-allowed"]);
  assert.equal(si.getSpeechInputSupport(), "supported");
  MockRecognition.instances[0].fireError("service-not-allowed");
  assert.equal(si.getSpeechInputSupport(), "unsupported");
});

test("no-speech and aborted end the session quietly (no error callback)", () => {
  const errors = [];
  let ends = 0;
  si.startSpeechInput({
    onTranscript() {},
    onError: (c) => errors.push(c),
    onEnd: () => ends++,
  });
  const rec = MockRecognition.instances[0];
  rec.fireError("no-speech");
  rec.fireEnd();
  rec.fireError("aborted");
  assert.deepEqual(errors, []);
  assert.equal(ends, 1);
});

test("network / audio-capture errors surface without flipping support", () => {
  const errors = [];
  si.startSpeechInput({ onTranscript() {}, onError: (c) => errors.push(c), onEnd() {} });
  const rec = MockRecognition.instances[0];
  rec.fireError("network");
  rec.fireError("audio-capture");
  assert.deepEqual(errors, ["network", "audio-capture"]);
  assert.equal(si.getSpeechInputSupport(), "supported");
});

// ------------------------------------------------- source-level wiring (#83)

const read = (f) => readFileSync(join(root, f), "utf8");

test("the /speak/$id composer keeps the typed input and adds the mic button beside it", () => {
  const page = read("src/routes/speak/$id.tsx");
  assert.match(page, /import \{ MicButton \} from "@\/components\/mic-button";/);
  assert.match(page, /<input[\s\S]{0,200}?id="line"/, "typed input must stay");
  assert.match(page, /<MicButton[\s\S]{0,200}?onChange=\{setDraft\}/, "mic streams into the draft");
  assert.match(page, /placeholder=\{listening \? "A ouvir…" : "Write in Portuguese…"\}/);
  // the mic is not inside the online-only send button: recognition is a local capability
  const form = page.slice(page.indexOf("<form"));
  assert.ok(form.indexOf("<MicButton") < form.indexOf("<OnlineOnly"), "mic before the OnlineOnly gate");
});

test("mic-button.tsx follows the no-voice pattern: aria-disabled + NO_SPEECH_NOTE toast", () => {
  const btn = read("src/components/mic-button.tsx");
  assert.match(btn, /export const NO_SPEECH_NOTE =/);
  assert.match(btn, /aria-disabled=\{unsupported \|\| \(disabled && !listening\) \|\| undefined\}/);
  assert.match(btn, /toast\(NO_SPEECH_NOTE, \{ id: "no-speech-input" \}\)/);
  assert.match(btn, /aria-pressed=\{listening \|\| undefined\}/);
  assert.match(btn, /announce\("Listening…"\)/);
  // a superseded (aborted) session's onEnd must not end the live one (#149 review)
  assert.match(btn, /if \(session\.current !== s\) return;/);
});
