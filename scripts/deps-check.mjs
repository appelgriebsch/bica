#!/usr/bin/env node
/**
 * Third-party component check (THIRD-PARTY.md is the bill of materials).
 *   npm run deps:check            report; exit 1 on lockfile, actions or BOM problems
 *   npm run deps:check -- --strict   also exit 1 when a patch/minor update is available
 * 1. Outdated npm deps (npm outdated), classified patch / minor / major / prerelease.
 * 2. Lockfile integrity + consistency: every entry has an npm-registry `resolved` and an
 *    `integrity` hash; the lock root matches package.json; `npm ls --all` is clean.
 * 3. GitHub Actions: every `uses:` pinned to a 40-char commit SHA with a `# vX` comment.
 * 4. BOM: every direct dependency is in THIRD-PARTY.md at its locked version.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const strict = process.argv.includes("--strict");
const problems = [];
const warn = (m) => console.log("  warn  " + m);
const fail = (m) => (problems.push(m), console.log("  FAIL  " + m));

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const direct = { ...pkg.dependencies, ...pkg.devDependencies };

export function bumpKind(current, latest) {
  if (!current || !latest || current === latest) return "none";
  if (/-/.test(latest) || /-/.test(current)) return "prerelease";
  const [a, b] = [current, latest].map((v) => v.split(".").map(Number));
  if (b[0] !== a[0]) return a[0] === 0 && b[0] === 0 ? "minor" : "major";
  if (a[0] === 0) return b[1] !== a[1] ? "major" : "patch"; // 0.x: minor is breaking
  return b[1] !== a[1] ? "minor" : "patch";
}

function run(cmd, args) {
  try {
    return {
      code: 0,
      out: execFileSync(cmd, args, {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      }),
    };
  } catch (err) {
    return { code: err.status ?? 1, out: String(err.stdout ?? ""), err: String(err.stderr ?? "") };
  }
}

function outdated() {
  console.log("\n## Outdated npm dependencies");
  const res = run("npm", ["outdated", "--json"]); // exits 1 when anything is outdated
  let data = {};
  try {
    data = JSON.parse(res.out || "{}");
  } catch {
    return fail("npm outdated returned no JSON (offline?): " + (res.err || "").trim());
  }
  const rows = Object.entries(data).map(([name, v]) => ({
    name,
    current: v.current,
    wanted: v.wanted,
    latest: v.latest,
    inRange: bumpKind(v.current, v.wanted),
    latestKind: bumpKind(v.current, v.latest),
  }));
  if (!rows.length) return console.log("  all up to date");
  console.log("| package | current | wanted (in range) | latest | latest is |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of rows)
    console.log(`| ${r.name} | ${r.current} | ${r.wanted} | ${r.latest} | ${r.latestKind} |`);
  const pending = rows.filter((r) => r.inRange === "patch" || r.inRange === "minor");
  if (pending.length)
    (strict ? fail : warn)(`${pending.length} in-range patch/minor updates: npm update`);
}

function lockfile() {
  console.log("\n## Lockfile integrity and consistency");
  if (lock.lockfileVersion < 2) fail(`lockfileVersion ${lock.lockfileVersion} (< 2)`);
  let n = 0;
  for (const [path, e] of Object.entries(lock.packages ?? {})) {
    if (!path || e.link) continue;
    n++;
    if (!e.integrity) fail(`${path}: no integrity hash`);
    if (!/^https:\/\/registry\.npmjs\.org\//.test(e.resolved ?? ""))
      fail(`${path}: resolved outside the npm registry (${e.resolved})`);
  }
  const lroot = lock.packages?.[""] ?? {};
  for (const field of ["dependencies", "devDependencies"]) {
    const a = JSON.stringify(pkg[field] ?? {});
    const b = JSON.stringify(lroot[field] ?? {});
    if (a !== b) fail(`package-lock root ${field} differ from package.json (run npm install)`);
  }
  const ls = run("npm", ["ls", "--all", "--json"]);
  const tree = JSON.parse(ls.out || "{}");
  for (const p of tree.problems ?? []) fail("npm ls: " + p);
  console.log(`  ${n} locked packages checked`);
}

function actions() {
  console.log("\n## GitHub Actions pins");
  const dir = join(root, ".github/workflows");
  if (!existsSync(dir)) return console.log("  no .github/workflows: nothing to pin");
  for (const f of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
    readFileSync(join(dir, f), "utf8")
      .split("\n")
      .forEach((line, i) => {
        const m = line.match(/uses:\s*([^\s#]+)(?:\s*#\s*(\S+))?/);
        if (!m || m[1].startsWith("./") || m[1].startsWith("docker://")) return;
        const [action, ref = ""] = m[1].split("@");
        if (!/^[0-9a-f]{40}$/.test(ref))
          fail(`${f}:${i + 1} ${action}@${ref || "?"} is not pinned to a commit SHA`);
        else if (!m[2]) fail(`${f}:${i + 1} ${action} pinned without a "# vX" version comment`);
        else console.log(`  ok    ${action} ${m[2]} (${ref.slice(0, 7)})`);
      });
  }
}

function bom() {
  console.log("\n## THIRD-PARTY.md vs lockfile");
  const md = readFileSync(join(root, "THIRD-PARTY.md"), "utf8").split("\n## ")[0];
  const rows = new Map(
    [...md.matchAll(/^\|\s*(\S+)\s*\|\s*(\S+)\s*\|/gm)]
      .filter((m) => !["Name", "Package"].includes(m[1]) && !m[1].startsWith("-"))
      .map((m) => [m[1], m[2]]),
  );
  for (const name of Object.keys(direct)) {
    const locked = lock.packages?.[`node_modules/${name}`]?.version;
    if (!rows.has(name)) fail(`${name} missing from THIRD-PARTY.md`);
    else if (rows.get(name) !== locked)
      fail(`${name}: THIRD-PARTY.md says ${rows.get(name)}, lockfile has ${locked}`);
  }
  for (const [name, v] of rows) {
    if (name in direct) continue;
    const locked = lock.packages?.[`node_modules/${name}`]?.version;
    if (locked && locked !== v)
      fail(`${name} (transitive): THIRD-PARTY.md says ${v}, lockfile has ${locked}`);
  }
  console.log(`  ${rows.size} BOM rows checked`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  outdated();
  lockfile();
  actions();
  bom();
  console.log(problems.length ? `\n${problems.length} problem(s)` : "\ndeps check passed");
  process.exit(problems.length ? 1 : 0);
}
