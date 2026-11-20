/** #158 source locks: composer shrink, placement accept, focus hooks, band label, picker, Belém. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (f) => readFileSync(new URL("../" + f, import.meta.url), "utf8");

test("composer input can shrink (min-w-0 flex-1) so Send stays in the row", () => {
  const speak = read("src/routes/speak/$id.tsx");
  assert.match(
    speak,
    /id="line"[\s\S]{0,400}?className="[^"]*\bmin-w-0\b[^"]*\bflex-1\b/,
  );
});

test("Finish scene is aria-disabled without a learner line and not native-disabled for that case", () => {
  const speak = read("src/routes/speak/$id.tsx");
  assert.match(speak, /noLearnerLine \? \{ "aria-disabled": true \}/);
  assert.match(speak, /disabled=\{!noLearnerLine && finishBusy\}/);
  assert.match(speak, /announce\("Say something first\."\)/);
});

test("Start at X navigates home after setFloor, and keeps the announcement", () => {
  const placement = read("src/routes/placement.tsx");
  assert.match(placement, /setFloor\(recommended\)/);
  assert.match(placement, /announce\(`Start level set to \$\{recommended\}\.`\)/);
  assert.match(placement, /navigate\(\{ to: "\/" \}\)/);
  assert.doesNotMatch(placement, /Go to Today/);
});

test("bands 1–4 end on Next band and the last band on See results", () => {
  const placement = read("src/routes/placement.tsx");
  const quiz = read("src/components/quiz-block.tsx");
  assert.match(
    placement,
    /lastLabel=\{bandIndex === placementBands\.length - 1 \? "See results" : "Next band"\}/,
  );
  assert.match(quiz, /lastLabel = "See results"/);
  assert.match(quiz, /index === questions\.length - 1 \? lastLabel : "Next"/);
});

test("level buttons expose aria-pressed", () => {
  assert.match(read("src/components/start-level.tsx"), /aria-pressed=\{on\}/);
});

test("Today's level toggle exposes aria-expanded and aria-controls", () => {
  const home = read("src/routes/index.tsx");
  assert.match(home, /aria-expanded=\{showPicker\}/);
  assert.match(home, /aria-controls="today-level-picker"/);
  assert.match(home, /id="today-level-picker"/);
  assert.match(home, /flushSync\(\(\) => setShowPicker\(open\)\)/);
  assert.doesNotMatch(home, /pickerMounted/);
});

test("a2-q2 uses a, not à, before Belém", () => {
  const src = read("src/data/placement.ts");
  assert.match(src, /Ontem fui a Belém/);
  assert.doesNotMatch(src, /fui à Belém/);
});
