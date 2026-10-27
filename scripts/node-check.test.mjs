import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkNode } from "./node-check.mjs";

const floor = { version: "v22.23.4", nvmrc: "22.23.4", engines: ">=22.23.4 <23" };
const script = fileURLToPath(new URL("./node-check.mjs", import.meta.url));

test("passes v22.23.4 with --exact", () => {
  const r = checkNode({ ...floor, exact: true });
  assert.equal(r.ok, true);
  assert.deepEqual(r.problems, []);
  assert.deepEqual(r.notes, []);
});

test("passes a newer 22.x patch without --exact and notes it", () => {
  const r = checkNode({ ...floor, version: "v22.23.5", exact: false });
  assert.equal(r.ok, true, r.problems.join("\n"));
  assert.match(r.notes.join("\n"), /newer than \.nvmrc 22\.23\.4/);
});

test("fails below the floor", () => {
  const r = checkNode({ ...floor, version: "v22.23.3" });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /below \.nvmrc/);
});

test("fails a wrong major", () => {
  const r = checkNode({ ...floor, version: "v20.19.2" });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /major is 20, not 22/);
});

test("fails when Bun stands in for node", () => {
  const r = checkNode({ ...floor, version: "v26.3.0", bun: "1.4.2" });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /process\.versions\.bun is set/);
});

test("fails an unreadable process.version", () => {
  for (const version of [undefined, "", "garbage"]) {
    const r = checkNode({ ...floor, version });
    assert.equal(r.ok, false, String(version));
    assert.match(r.problems.join("\n"), /not vX\.Y\.Z/);
  }
});

test("fails when .nvmrc is missing or not X.Y.Z", () => {
  for (const nvmrc of [undefined, "22"]) {
    const r = checkNode({ ...floor, nvmrc });
    assert.equal(r.ok, false, String(nvmrc));
    assert.match(r.problems.join("\n"), /\.nvmrc is missing or not X\.Y\.Z/);
  }
});

test("fails when engines.node disagrees with .nvmrc", () => {
  const r = checkNode({ ...floor, engines: ">=22 <23" });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /engines\.node .* is not >=22\.23\.4 <23/);
});

test("fails --exact when the patch is newer", () => {
  const r = checkNode({ ...floor, version: "v22.23.5", exact: true });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /not exactly \.nvmrc 22\.23\.4/);
  assert.deepEqual(r.notes, []);
});

test("CLI --root checks a temp tree whose .nvmrc equals this node", () => {
  const dir = mkdtempSync(join(tmpdir(), "node-check-"));
  try {
    const ver = process.versions.node;
    writeFileSync(join(dir, ".nvmrc"), `${ver}\n`);
    writeFileSync(join(dir, "package.json"), JSON.stringify({ engines: { node: `>=${ver} <23` } }));
    const out = execFileSync(process.execPath, [script, "--root", dir, "--exact"], {
      encoding: "utf8",
    });
    assert.equal(out, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("CLI exits 1 against a temp --root whose floor is above this node", () => {
  const dir = mkdtempSync(join(tmpdir(), "node-check-"));
  try {
    writeFileSync(join(dir, ".nvmrc"), "22.99.99\n");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ engines: { node: ">=22.99.99 <23" } }),
    );
    assert.throws(
      () => execFileSync(process.execPath, [script, "--root", dir], { encoding: "utf8" }),
      (e) => e.status === 1 && /FAIL {2}v\d+\.\d+\.\d+ is below \.nvmrc 22\.99\.99/.test(e.stdout),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ponytail: Node 20 has no import.meta.main, so a CLI guarded by it skipped the check
// and exited 0 on exactly the wrong Node.
test("CLI entry guard does not rely on import.meta.main", () => {
  assert.doesNotMatch(readFileSync(script, "utf8"), /^if \(import\.meta\.main\)/m);
});

// S-2: Node realpaths the main module, so a symlinked absolute path must still run the check.
test("CLI run through a symlinked path still checks and fails below the floor", () => {
  const dir = mkdtempSync(join(tmpdir(), "node-check-"));
  try {
    symlinkSync(dirname(script), join(dir, "link"));
    writeFileSync(join(dir, ".nvmrc"), "22.99.99\n");
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ engines: { node: ">=22.99.99 <23" } }),
    );
    const linked = join(dir, "link", "node-check.mjs");
    assert.throws(
      () => execFileSync(process.execPath, [linked, "--root", dir], { encoding: "utf8" }),
      (e) => e.status === 1 && /FAIL {2}v\d+\.\d+\.\d+ is below \.nvmrc 22\.99\.99/.test(e.stdout),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
