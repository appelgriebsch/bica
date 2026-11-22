/** #178 (gap P1, plan #210 — no ADR, owner decision): written-task contract. `kind`
 * gains "task" on ReadingPiece with an optional `task` block; the A2 piece
 * `read-tarefa-mensagem` carries prompt + 60-80-word model + checklist + practice
 * label; the task block renders on /read/$id in the read phase before the quiz CTA;
 * and the page stays offline/server-free — no sendChat, no fetch, no chat imports
 * (AGENTS.md: the only AI call is Conversas). Run with `bun run test`. */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".reading-task-test-"));
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

const { readingPieces, getReading } = await load("src/data/curriculum.ts");

const wordCount = (s) => (s.trim() ? s.trim().split(/\s+/).length : 0);

test('"task" is a ReadingPiece kind and the A2 task piece exists with the right shape', () => {
  const typesSrc = readFileSync(join(root, "src/data/types.ts"), "utf8");
  assert.ok(/"task"/.test(typesSrc), 'kind union must include "task"');
  assert.ok(/task\?: ReadingTask/.test(typesSrc), "optional task field on ReadingPiece");

  const piece = getReading("read-tarefa-mensagem");
  assert.ok(piece, "read-tarefa-mensagem missing");
  assert.equal(piece.kind, "task");
  assert.equal(piece.level, "A2");
  assert.ok(/not an official/i.test(piece.source), "source must say it is not an official exam");
  assert.ok(existsSync(join(root, "public", piece.image)), "image must exist under public/");

  const task = piece.task;
  assert.ok(task, "task block required on kind task");
  assert.ok(task.prompt.pt.trim() && task.prompt.en.trim(), "prompt pt/en");
  assert.ok(task.model.pt.trim() && task.model.en.trim(), "model pt/en");
  const words = wordCount(task.model.pt);
  assert.ok(
    words >= task.minWords && words <= task.maxWords,
    `model answer must be ${task.minWords}-${task.maxWords} words, got ${words}`,
  );
  assert.equal(task.minWords, 60);
  assert.equal(task.maxWords, 80);
  assert.ok(task.checklist.length >= 3, "self-check checklist needs >=3 items");
  for (const c of task.checklist) assert.ok(c.pt.trim() && c.en.trim(), "checklist item pt/en");
  assert.ok(
    /practice/i.test(task.practiceLabel) && /not an official/i.test(task.practiceLabel),
    "practiceLabel must say practice, not an official exam",
  );
  assert.ok(/senhorio/i.test(task.prompt.pt), "the prompt is the message to the senhorio (ties to a2-casa/#199)");
});

test("read/$id.tsx renders the task block in the read phase, before the quiz CTA", () => {
  const src = readFileSync(new URL("../src/routes/read/$id.tsx", import.meta.url), "utf8");
  const site = src.indexOf("{piece.task && <TaskBlock task={piece.task} />}");
  assert.ok(site !== -1, "task render site missing");
  const cta = src.indexOf("Check what stuck");
  assert.ok(cta !== -1 && site < cta, "task block must sit above the quiz CTA");
  assert.ok(src.includes("function TaskBlock"), "TaskBlock component");
  assert.ok(/<textarea/.test(src), "draft textarea present");
  assert.ok(/type="checkbox"/.test(src), "self-check checkboxes present");
  assert.ok(/Show model answer/.test(src), "model reveal button present");
});

test("the task flow is offline and server-free: no sendChat, no fetch, no chat imports in read/$id.tsx", () => {
  const src = readFileSync(new URL("../src/routes/read/$id.tsx", import.meta.url), "utf8");
  assert.ok(!/sendChat|chat-core|chat-gate|chat-budget/i.test(src), "no chat imports/calls");
  assert.ok(!/\bfetch\s*\(/.test(src), "no fetch in read/$id.tsx");
  assert.ok(!/navigator\.sendBeacon|XMLHttpRequest|WebSocket/i.test(src), "no other network APIs");
});

test("the Pages list on /practice pills task items as escrita", () => {
  const src = readFileSync(new URL("../src/routes/practice.tsx", import.meta.url), "utf8");
  assert.ok(/p\.kind === "task"/.test(src), "task pill condition");
  assert.ok(/escrita/.test(src), "the pill label");
});

test("existing reading pieces are untouched: kinds stay within the union and quiz kinds stay within the four", () => {
  const kinds = new Set(["notice", "message", "news", "page", "column", "task"]);
  for (const p of readingPieces) {
    assert.ok(kinds.has(p.kind), `unknown kind ${p.kind} on ${p.id}`);
    for (const q of p.quiz) {
      assert.ok(["choice", "truefalse", "listen", "type"].includes(q.kind), `${p.id}/${q.id}: kind`);
      assert.ok(q.explain.trim(), `${p.id}/${q.id}: explain required`);
      if (q.kind === "listen") assert.ok(q.speak?.trim(), `${p.id}/${q.id}: listen needs speak`);
      if (q.kind === "type") assert.ok(q.accept?.length, `${p.id}/${q.id}: type needs accept`);
    }
  }
});
