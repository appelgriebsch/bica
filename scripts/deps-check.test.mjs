import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bumpKind } from "./deps-check.mjs";

const script = fileURLToPath(new URL("./deps-check.mjs", import.meta.url));
const SHA = "a".repeat(40);

test("bumpKind classifies updates", () => {
  assert.equal(bumpKind("1.2.3", "1.2.3"), "none");
  assert.equal(bumpKind(undefined, "1.0.0"), "none");
  assert.equal(bumpKind("1.2.3", "1.2.4"), "patch");
  assert.equal(bumpKind("1.2.3", "1.3.0"), "minor");
  assert.equal(bumpKind("1.2.3", "2.0.0"), "major");
  assert.equal(bumpKind("0.4.26", "0.5.7"), "major"); // 0.x minor is breaking
  assert.equal(bumpKind("0.4.1", "0.4.2"), "patch");
  assert.equal(bumpKind("0.9.0", "1.0.0"), "major");
  assert.equal(bumpKind("3.0.1-beta", "3.0.2-beta"), "prerelease");
});

// A fixture project with no installed deps, so npm outdated / npm ls run offline.
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

function fixture({
  lockEntry = {},
  bomVersion = "1.0.0",
  workflow,
  deps,
  lockDeps = deps,
  bom = `| dep | ${bomVersion} |\n`,
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "deps-check-"));
  dirs.push(dir);
  const pkg = { name: "fx", version: "1.0.0", ...(deps && { dependencies: deps }) };
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  const entry = {
    version: "1.0.0",
    resolved: "https://registry.npmjs.org/dep/-/dep-1.0.0.tgz",
    integrity: "sha512-x",
    ...lockEntry,
  };
  writeFileSync(
    join(dir, "package-lock.json"),
    JSON.stringify({
      lockfileVersion: 3,
      packages: {
        "": { name: "fx", version: "1.0.0", ...(lockDeps && { dependencies: lockDeps }) },
        "node_modules/dep": entry,
      },
    }),
  );
  writeFileSync(
    join(dir, "THIRD-PARTY.md"),
    `| Name | Version |\n| --- | --- |\n${bom}\n## Notes\n| dep | 9.9.9 |\n`,
  );
  if (workflow) {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), workflow);
  }
  return dir;
}

// Fake `npm` first on PATH: `outdated` prints `outdated` and exits 1 (as npm does), `ls` is clean.
function fakeNpm(dir, outdated) {
  const bin = join(dir, "bin");
  mkdirSync(bin);
  writeFileSync(join(dir, "outdated.txt"), outdated);
  writeFileSync(
    join(bin, "npm"),
    `#!/bin/sh\nif [ "$1" = outdated ]; then cat "${join(dir, "outdated.txt")}"; exit 1; fi\necho '{}'\n`,
  );
  chmodSync(join(bin, "npm"), 0o755);
  return { PATH: `${bin}:${process.env.PATH}` };
}

function check(dir, args = [], env = {}) {
  try {
    const opts = { cwd: dir, encoding: "utf8", env: { ...process.env, ...env } };
    return { code: 0, out: execFileSync("node", [script, ...args], opts) };
  } catch (err) {
    return { code: err.status, out: String(err.stdout) };
  }
}

test("passes a clean project and ignores tables after the BOM", () => {
  const r = check(
    fixture({
      workflow: `steps:\n  - uses: actions/checkout@${SHA} # v4.2.2\n  - uses: ./local\n`,
    }),
  );
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ok {4}actions\/checkout v4\.2\.2/);
  assert.match(r.out, /deps check passed/);
});

test("fails a BOM row that differs from the lockfile", () => {
  const r = check(fixture({ bomVersion: "0.9.0" }));
  assert.equal(r.code, 1);
  assert.match(r.out, /dep \(transitive\): THIRD-PARTY.md says 0\.9\.0, lockfile has 1\.0\.0/);
});

test("fails missing integrity and non-registry sources", () => {
  const r = check(
    fixture({ lockEntry: { integrity: undefined, resolved: "https://evil.example/dep.tgz" } }),
  );
  assert.equal(r.code, 1);
  assert.match(r.out, /node_modules\/dep: no integrity hash/);
  assert.match(r.out, /resolved outside the npm registry/);
});

test("fails actions pinned to a tag or without a version comment", () => {
  const r = check(
    fixture({ workflow: `- uses: actions/checkout@v4\n- uses: actions/setup-node@${SHA}\n` }),
  );
  assert.equal(r.code, 1);
  assert.match(r.out, /actions\/checkout@v4 is not pinned to a commit SHA/);
  assert.match(r.out, /actions\/setup-node pinned without a "# vX" version comment/);
});

const direct = { deps: { dep: "^1.0.0" } };

test("passes a direct dependency listed at its locked version", () => {
  const dir = fixture(direct);
  const r = check(dir, [], fakeNpm(dir, "{}"));
  assert.equal(r.code, 0, r.out);
});

test("fails a direct dependency missing from THIRD-PARTY.md", () => {
  const dir = fixture({ ...direct, bom: "" });
  const r = check(dir, [], fakeNpm(dir, "{}"));
  assert.equal(r.code, 1);
  assert.match(r.out, /dep missing from THIRD-PARTY.md/);
});

test("fails a direct dependency whose BOM version differs from the lockfile", () => {
  const dir = fixture({ ...direct, bomVersion: "0.9.0" });
  const r = check(dir, [], fakeNpm(dir, "{}"));
  assert.equal(r.code, 1);
  assert.match(r.out, /dep: THIRD-PARTY.md says 0\.9\.0, lockfile has 1\.0\.0/);
});

test("fails when the lock root dependencies differ from package.json", () => {
  const dir = fixture({ ...direct, lockDeps: { dep: "^0.9.0" } });
  const r = check(dir, [], fakeNpm(dir, "{}"));
  assert.equal(r.code, 1);
  assert.match(r.out, /package-lock root dependencies differ from package.json/);
});

test("fails when npm outdated returns invalid JSON", () => {
  const dir = fixture();
  const r = check(dir, [], fakeNpm(dir, "npm ERR! network"));
  assert.equal(r.code, 1);
  assert.match(r.out, /npm outdated returned no JSON/);
});

const minorUpdate = JSON.stringify({
  dep: { current: "1.0.0", wanted: "1.1.0", latest: "2.0.0" },
});

test("in-range updates warn by default and fail with --strict", () => {
  const dir = fixture();
  const env = fakeNpm(dir, minorUpdate);
  const loose = check(dir, [], env);
  assert.equal(loose.code, 0, loose.out);
  assert.match(loose.out, /warn {2}1 in-range patch\/minor updates/);
  assert.match(loose.out, /\| dep \| 1\.0\.0 \| 1\.1\.0 \| 2\.0\.0 \| major \|/);
  const strict = check(dir, ["--strict"], env);
  assert.equal(strict.code, 1);
  assert.match(strict.out, /FAIL {2}1 in-range patch\/minor updates/);
});
