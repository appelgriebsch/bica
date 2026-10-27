#!/usr/bin/env node
/**
 * Fail closed unless this process is Node 22 at or above `.nvmrc`.
 * `--exact` (CI) requires an equal version. A newer 22.x patch prints a note.
 * Runs under Node: inside Bun, process.version is Bun's compat version.
 */
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const VER = /^v(\d+)\.(\d+)\.(\d+)$/;
const PIN = /^(\d+)\.(\d+)\.(\d+)$/;
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

export function checkNode({ version, bun, nvmrc, engines, exact }) {
  const problems = [];
  const notes = [];
  const m = typeof version === "string" ? version.match(VER) : null;
  if (!m) problems.push(`process.version is missing or not vX.Y.Z (${version})`);
  if (bun) problems.push("process.versions.bun is set (Bun stood in for node)");
  const pinText = typeof nvmrc === "string" ? nvmrc.trim() : "";
  const pin = pinText.match(PIN);
  if (!pin) problems.push(`.nvmrc is missing or not X.Y.Z (${pinText || nvmrc})`);
  else if (engines !== `>=${pin[0]} <23`)
    problems.push(`engines.node ${engines} is not >=${pin[0]} <23`);
  if (m && Number(m[1]) !== 22) problems.push(`major is ${m[1]}, not 22`);
  if (m && pin) {
    const c = cmp([m[1], m[2], m[3]].map(Number), [pin[1], pin[2], pin[3]].map(Number));
    const got = `v${m[1]}.${m[2]}.${m[3]}`;
    if (c < 0) problems.push(`${got} is below .nvmrc ${pin[0]}`);
    else if (exact && c !== 0) problems.push(`${got} is not exactly .nvmrc ${pin[0]}`);
    else if (!exact && c > 0) notes.push(`Node ${got} is newer than .nvmrc ${pin[0]}`);
  }
  return { ok: problems.length === 0, problems, notes };
}

// ponytail: not import.meta.main, which Node 20 lacks: the CLI would then skip the check
// and exit 0. Both sides realpath'd, because Node resolves symlinks for the main module.
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const i = process.argv.indexOf("--root");
  const root = i >= 0 ? process.argv[i + 1] : process.cwd();
  let nvmrc;
  let engines;
  try {
    nvmrc = readFileSync(join(root, ".nvmrc"), "utf8");
  } catch {
    nvmrc = undefined;
  }
  try {
    engines = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).engines?.node;
  } catch {
    engines = undefined;
  }
  const r = checkNode({
    version: process.version,
    bun: process.versions.bun,
    nvmrc,
    engines,
    exact: process.argv.includes("--exact"),
  });
  for (const n of r.notes) console.log("  note  " + n);
  for (const p of r.problems) console.log("  FAIL  " + p);
  if (!r.ok) process.exit(1);
}
