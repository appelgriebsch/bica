/** #134 (ADR 0018): Social Scenes data contract — every `group: "social"` Conversas
 * scene declares a register (tu/você), sits at A2 or above, and has a precached
 * image under public/scenes/. T2 (#135) extends this file with the offline
 * SocialScene contract. Run with `bun run test` (node --test scripts/*.test.mjs). */
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";

const root = fileURLToPath(new URL("..", import.meta.url));
const tmp = mkdtempSync(join(root, ".social-scenes-test-"));
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

const { speakScenarios, cefrRank } = await load("src/data/curriculum.ts");

test("social scenarios (#134, ADR 0018): unique ids, register declared, level >= A2, precached image", () => {
  const ids = speakScenarios.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, "duplicate scenario ids");
  const social = speakScenarios.filter((s) => s.group === "social");
  assert.ok(
    social.length >= 5,
    `expected at least the 5 tagged social scenes, got ${social.length}`,
  );
  for (const s of social) {
    assert.ok(
      s.register === "tu" || s.register === "você",
      `register missing on social scene ${s.id}`,
    );
    assert.ok(cefrRank[s.level] >= cefrRank.A2, `social scene below A2: ${s.id} (${s.level})`);
    assert.ok(existsSync(join(root, "public", s.image)), `image not in public/: ${s.image}`);
  }
});
