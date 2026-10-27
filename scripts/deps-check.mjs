#!/usr/bin/env bun
/**
 * Third-party component check. Bun-only (`bun scripts/deps-check.mjs`).
 *   bun run deps:check
 *   bun run deps:check -- --strict   also fail on an in-range patch/minor
 * Fails closed: a tool, registry or lock problem exits 1 and never prints
 * "all up to date" or "deps check passed".
 * Test-only: DEPS_CHECK_REGISTRY, DEPS_CHECK_TIMEOUT_MS, DEPS_CHECK_BUN.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function bumpKind(current, latest) {
  if (!current || !latest || current === latest) return "none";
  if (/-/.test(latest) || /-/.test(current)) return "prerelease";
  const [a, b] = [current, latest].map((v) => v.split(".").map(Number));
  if (b[0] !== a[0]) return "major";
  if (a[0] === 0) return b[1] !== a[1] ? "major" : "patch"; // 0.x: minor is breaking
  return b[1] !== a[1] ? "minor" : "patch";
}

const root = process.cwd();
const strict = process.argv.includes("--strict");
const problems = [];
const fail = (m) => (problems.push(m), console.log("  FAIL  " + m));
const warn = (m) => console.log("  warn  " + m);
let outdatedRows = 0;

function finish() {
  if (!problems.length && !outdatedRows) console.log("  all up to date");
  console.log(problems.length ? `\n${problems.length} problem(s)` : "\ndeps check passed");
  return problems.length ? 1 : 0;
}

function versionOf(ident) {
  const at = String(ident ?? "").lastIndexOf("@");
  return at > 0 ? ident.slice(at + 1) : undefined;
}

/** Lock key `parent/pkg` or `parent/@scope/pkg`; a scoped top-level key stays whole. */
function packageName(key) {
  const scoped = key.lastIndexOf("/@");
  if (scoped !== -1) return key.slice(scoped + 1);
  const slash = key.lastIndexOf("/");
  if (slash === -1 || (key.startsWith("@") && key.indexOf("/") === slash)) return key;
  return key.slice(slash + 1);
}

function sameMap(a, b) {
  const canon = (o) => JSON.stringify(Object.fromEntries(Object.entries(o ?? {}).sort()));
  return canon(a) === canon(b);
}

// ponytail: "allows Node 22" is three sample versions, not a range intersection.
function allowsNode22(range) {
  if (!range || typeof range !== "string") return true;
  return ["22.0.0", "22.23.4", "22.99.99"].some((v) => {
    try {
      return globalThis.Bun.semver.satisfies(v, range);
    } catch {
      return false;
    }
  });
}

function highest(range, versions) {
  const semver = globalThis.Bun.semver;
  const allowPre = String(range).includes("-");
  const keys = Object.keys(versions ?? {}).filter((v) => {
    if (!allowPre && v.includes("-")) return false;
    try {
      return semver.satisfies(v, range);
    } catch {
      return false;
    }
  });
  keys.sort((a, b) => semver.order(a, b));
  return keys.at(-1);
}

function frozenInstall() {
  const cmd = process.env.DEPS_CHECK_BUN || process.execPath;
  const res = spawnSync(cmd, ["install", "--frozen-lockfile", "--dry-run"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "ignore", "pipe"],
    maxBuffer: 10 * 1024 * 1024,
  });
  if (res.error)
    return fail(`bun install --frozen-lockfile --dry-run failed to run: ${res.error.code}`);
  if (res.signal)
    return fail(`bun install --frozen-lockfile --dry-run killed by signal ${res.signal}`);
  if (res.status !== 0)
    fail(
      `bun install --frozen-lockfile --dry-run exited ${res.status}: ${(res.stderr || "").trim().split("\n").pop()}`,
    );
}

function lockfile(pkg, lock) {
  console.log("\n## Lockfile integrity and consistency");
  const entries = Object.entries(lock.packages ?? {});
  if (!entries.length) fail("no package entries");
  for (const [key, e] of entries) {
    const hash = Array.isArray(e) ? e[3] : undefined;
    if (typeof hash !== "string" || !hash.startsWith("sha512-")) fail(`${key}: no integrity hash`);
    if (!Array.isArray(e) || e[1] !== "") fail(`${key}: registry is not the default (${e?.[1]})`);
  }
  const ws = lock.workspaces?.[""];
  if (!ws) fail("no root workspace");
  else {
    for (const field of ["dependencies", "devDependencies"]) {
      if (!sameMap(pkg[field], ws[field])) fail(`root ${field} differ from package.json`);
    }
  }
  for (const [name, pin] of Object.entries(pkg.overrides ?? {})) {
    if ((lock.overrides ?? {})[name] !== pin) fail(`override ${name} missing from bun.lock`);
    const keys = entries.filter(([key]) => packageName(key) === name);
    if (!keys.length) fail(`override ${name} not applied (no lock entry)`);
    for (const [key, e] of keys) {
      const got = versionOf(e?.[0]);
      if (got !== pin) fail(`override ${name} not applied: ${key} is ${got}, pin is ${pin}`);
    }
  }
  frozenInstall();
  console.log(`  ${entries.length} locked packages checked`);
}

async function outdated(pkg, lock) {
  console.log("\n## Outdated dependencies");
  const direct = { ...pkg.dependencies, ...pkg.devDependencies };
  const names = Object.keys(direct);
  if (!names.length) return;
  const base = (process.env.DEPS_CHECK_REGISTRY || "https://registry.npmjs.org").replace(/\/$/, "");
  const timeoutMs = Number(process.env.DEPS_CHECK_TIMEOUT_MS || 15000);
  const results = await Promise.all(
    names.map(async (name) => {
      try {
        const res = await fetch(`${base}/${name.replace("/", "%2f")}`, {
          headers: { accept: "application/vnd.npm.install-v1+json" },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (!res.ok) return { name, error: `registry HTTP ${res.status} for ${name}` };
        const text = await res.text();
        if (!text.trim()) return { name, empty: true };
        try {
          return { name, doc: JSON.parse(text) };
        } catch {
          return { name, error: `registry error for ${name}: invalid JSON` };
        }
      } catch (e) {
        const timeout = e?.name === "TimeoutError" || e?.name === "AbortError";
        return {
          name,
          error: timeout
            ? `registry timeout for ${name}`
            : `registry error for ${name}: ${e.message}`,
        };
      }
    }),
  );
  const errors = results.filter((r) => r.error);
  const empties = results.filter((r) => r.empty);
  const docs = results.filter((r) => r.doc);
  for (const r of errors) fail(r.error);
  if (names.length && !docs.length && !errors.length) fail("zero registry answers");
  else for (const r of empties) fail(`${r.name}: no registry answer`);

  const rows = [];
  for (const { name, doc } of docs) {
    const current = versionOf(lock.packages?.[name]?.[0]);
    if (!current) {
      fail(`${name}: not in bun.lock`);
      continue;
    }
    const latest = doc?.["dist-tags"]?.latest;
    if (!latest) {
      fail(`${name}: no dist-tags.latest`);
      continue;
    }
    let latestShown = latest;
    if (!allowsNode22(doc.versions?.[latest]?.engines?.node)) {
      const ok = Object.keys(doc.versions ?? {}).filter(
        (v) => !v.includes("-") && allowsNode22(doc.versions[v]?.engines?.node),
      );
      ok.sort((a, b) => globalThis.Bun.semver.order(a, b));
      latestShown = ok.at(-1);
    }
    const wanted = highest(direct[name], doc.versions) ?? current;
    const showLatest = latestShown || current;
    if (wanted === current && showLatest === current) continue;
    rows.push({
      name,
      current,
      wanted,
      latest: showLatest,
      inRange: bumpKind(current, wanted),
      latestKind: bumpKind(current, showLatest),
    });
  }
  outdatedRows = rows.length;
  if (!rows.length) return;
  console.log("| package | current | wanted (in range) | latest | latest is |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const r of rows)
    console.log(`| ${r.name} | ${r.current} | ${r.wanted} | ${r.latest} | ${r.latestKind} |`);
  const pending = rows.filter((r) => r.inRange === "patch" || r.inRange === "minor");
  if (pending.length)
    (strict ? fail : warn)(`${pending.length} in-range patch/minor updates: bun update`);
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

function bom(pkg, lock) {
  console.log("\n## THIRD-PARTY.md vs lockfile");
  const direct = { ...pkg.dependencies, ...pkg.devDependencies };
  const md = readFileSync(join(root, "THIRD-PARTY.md"), "utf8").split("\n## ")[0];
  const rows = new Map(
    [...md.matchAll(/^\|\s*(\S+)\s*\|\s*(\S+)\s*\|/gm)]
      .filter((m) => !["Name", "Package"].includes(m[1]) && !m[1].startsWith("-"))
      .map((m) => [m[1], m[2]]),
  );
  const locked = (name) => versionOf(lock.packages?.[name]?.[0]);
  for (const name of Object.keys(direct)) {
    const v = locked(name);
    if (!rows.has(name)) fail(`${name} missing from THIRD-PARTY.md`);
    else if (rows.get(name) !== v)
      fail(`${name}: THIRD-PARTY.md says ${rows.get(name)}, lockfile has ${v}`);
  }
  for (const [name, v] of rows) {
    if (name in direct) continue;
    const got = locked(name);
    if (!got && v !== "unknown") fail(`${name}: in THIRD-PARTY.md but not in the lockfile`);
    else if (got && got !== v)
      fail(`${name} (transitive): THIRD-PARTY.md says ${v}, lockfile has ${got}`);
  }
  console.log(`  ${rows.size} BOM rows checked`);
}

async function main() {
  if (!globalThis.Bun?.JSONC) {
    fail("deps-check requires Bun");
    return finish();
  }
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  } catch {
    fail("package.json missing or unparsable");
    return finish();
  }
  let raw;
  try {
    raw = readFileSync(join(root, "bun.lock"), "utf8");
  } catch {
    fail("bun.lock missing");
    return finish();
  }
  let lock;
  try {
    lock = globalThis.Bun.JSONC.parse(raw);
  } catch {
    fail("bun.lock is unparsable");
    return finish();
  }
  if (lock.lockfileVersion !== 2) {
    fail(`lockfileVersion ${lock.lockfileVersion} !== 2`);
    return finish();
  }
  lockfile(pkg, lock);
  await outdated(pkg, lock);
  actions();
  bom(pkg, lock);
  return finish();
}

// ponytail: `!== false`, not truthy: Node 20 has no import.meta.main (undefined), and a
// truthy guard there exits 0 with no output. Under Node, main() then fails "requires Bun".
if (import.meta.main !== false) {
  main()
    .then((code) => process.exit(code))
    .catch((e) => {
      console.log("  FAIL  " + (e?.message || e));
      process.exit(1);
    });
}
