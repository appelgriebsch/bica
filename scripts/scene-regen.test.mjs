/** scene-regen contract: the SCENES keys in scripts/scene-regen/prompts.mjs, the
 * JPGs in public/scenes/, every /scenes/<name>.jpg referenced under src/, and the
 * NAMES list in qc.html must be the same set. regen-scenes.mjs copyFiles every
 * SCENES key from public/scenes/ (a key without a file crashes the run), and a
 * referenced image without a prompt can never be regenerated. Run with
 * `bun run test`. */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { SCENES, STYLES, promptFor } = await import(
  new URL("./scene-regen/prompts.mjs", import.meta.url)
);

const keys = Object.keys(SCENES).sort();
const files = readdirSync(join(root, "public", "scenes"))
  .filter((f) => f.endsWith(".jpg"))
  .map((f) => f.replace(/\.jpg$/, ""))
  .sort();

function srcFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...srcFiles(p));
    else if (/\.(ts|tsx|mts|mjs)$/.test(e.name)) out.push(p);
  }
  return out;
}
const referenced = new Set();
for (const f of srcFiles(join(root, "src"))) {
  for (const m of readFileSync(f, "utf8").matchAll(/\/scenes\/([\w-]+)\.jpg/g))
    referenced.add(m[1]);
}
const referencedSorted = [...referenced].sort();

const qcHtml = readFileSync(join(root, "scripts", "scene-regen", "qc.html"), "utf8");
const qcNames = JSON.parse(qcHtml.match(/const NAMES = (\[[^\]]*\]);/)[1])
  .map((n) => n)
  .sort();

test("SCENES keys == JPG files in public/scenes/", () => {
  assert.deepEqual(
    keys,
    files,
    `prompt keys without a file: ${keys.filter((k) => !files.includes(k))}; files without a prompt: ${files.filter((f) => !keys.includes(f))}`,
  );
});

test("every /scenes/*.jpg referenced in src/ exists as a file with a regen prompt", () => {
  assert.deepEqual(
    referencedSorted,
    files,
    `referenced but missing on disk: ${referencedSorted.filter((r) => !files.includes(r))}; on disk but never referenced: ${files.filter((f) => !referenced.has(f))}`,
  );
});

test("qc.html NAMES covers every SCENES key", () => {
  assert.deepEqual(
    qcNames,
    keys,
    `qc.html NAMES out of sync: ${qcNames.filter((n) => !keys.includes(n))} / ${keys.filter((k) => !qcNames.includes(k))}`,
  );
});

test("every scene file is a non-empty JPEG and promptFor resolves both styles", () => {
  for (const name of keys) {
    const p = join(root, "public", "scenes", `${name}.jpg`);
    assert.ok(
      statSync(p).size > 10_000,
      `${name}.jpg suspiciously small (${statSync(p).size}B) — placeholder or truncated?`,
    );
    assert.ok(
      readFileSync(p)
        .subarray(0, 3)
        .equals(Buffer.from([0xff, 0xd8, 0xff])),
      `${name}.jpg is not a JPEG`,
    );
    for (const style of Object.keys(STYLES)) {
      const prompt = promptFor(name, style);
      assert.ok(
        prompt.includes(SCENES[name]),
        `${name}/${style}: prompt must embed the scene description`,
      );
      assert.ok(
        prompt.length > STYLES[style].prefix.length,
        `${name}/${style}: prompt must add style + negative`,
      );
    }
  }
});
