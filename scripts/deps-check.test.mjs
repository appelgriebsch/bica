import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
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
function fixture({ lockEntry = {}, bomVersion = "1.0.0", workflow } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "deps-check-"));
  const pkg = { name: "fx", version: "1.0.0" };
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
      packages: { "": { name: "fx", version: "1.0.0" }, "node_modules/dep": entry },
    }),
  );
  writeFileSync(
    join(dir, "THIRD-PARTY.md"),
    `| Name | Version |\n| --- | --- |\n| dep | ${bomVersion} |\n\n## Notes\n| dep | 9.9.9 |\n`,
  );
  if (workflow) {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), workflow);
  }
  return dir;
}

function check(dir) {
  try {
    return { code: 0, out: execFileSync("node", [script], { cwd: dir, encoding: "utf8" }) };
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
