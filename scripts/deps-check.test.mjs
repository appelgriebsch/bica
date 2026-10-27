import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { bumpKind } from "./deps-check.mjs";

const script = fileURLToPath(new URL("./deps-check.mjs", import.meta.url));
// Absolute path of the `bun` on PATH, so tests that narrow PATH still find it.
const bun = execFileSync("bun", ["-e", "console.log(process.execPath)"], {
  encoding: "utf8",
}).trim();
const SHA = "a".repeat(40);
const HASH = "sha512-" + "a".repeat(64);
const dirs = [];
const servers = [];
after(() => {
  dirs.forEach((d) => rmSync(d, { recursive: true, force: true }));
  for (const s of servers) {
    s.closeAllConnections();
    s.close();
  }
});

test("bumpKind classifies updates", () => {
  assert.equal(bumpKind("1.2.3", "1.2.3"), "none");
  assert.equal(bumpKind(undefined, "1.0.0"), "none");
  assert.equal(bumpKind("1.2.3", "1.2.4"), "patch");
  assert.equal(bumpKind("1.2.3", "1.3.0"), "minor");
  assert.equal(bumpKind("1.2.3", "2.0.0"), "major");
  assert.equal(bumpKind("0.4.26", "0.5.7"), "major");
  assert.equal(bumpKind("0.4.1", "0.4.2"), "patch");
  assert.equal(bumpKind("0.9.0", "1.0.0"), "major");
  assert.equal(bumpKind("3.0.1-beta", "3.0.2-beta"), "prerelease");
});

function fixture({
  deps,
  devDeps,
  lockDeps = deps,
  lockDev = devDeps,
  overrides,
  lockOverrides = overrides,
  lockfileVersion = 2,
  noPackages = false,
  noWorkspace = false,
  noLock = false,
  lockText,
  bomVersion = "1.0.0",
  bom,
  workflow,
  integrity = HASH,
  registry = "",
  ident = "dep@1.0.0",
} = {}) {
  const dir = mkdtempSync(join(tmpdir(), "deps-check-"));
  dirs.push(dir);
  const pkg = { name: "fx", version: "1.0.0" };
  if (deps) pkg.dependencies = deps;
  if (devDeps) pkg.devDependencies = devDeps;
  if (overrides) pkg.overrides = overrides;
  writeFileSync(join(dir, "package.json"), JSON.stringify(pkg));
  if (!noLock) {
    const lock = {
      lockfileVersion,
      workspaces: noWorkspace
        ? {}
        : {
            "": {
              name: "fx",
              ...(lockDeps ? { dependencies: lockDeps } : {}),
              ...(lockDev ? { devDependencies: lockDev } : {}),
            },
          },
      ...(lockOverrides ? { overrides: lockOverrides } : {}),
      packages: noPackages ? {} : { dep: [ident, registry, {}, integrity] },
    };
    writeFileSync(join(dir, "bun.lock"), lockText ?? JSON.stringify(lock, null, 2));
  }
  writeFileSync(
    join(dir, "THIRD-PARTY.md"),
    `| Name | Version |\n| --- | --- |\n${bom ?? `| dep | ${bomVersion} |\n`}\n## Notes\n| dep | 9.9.9 |\n`,
  );
  if (workflow) {
    mkdirSync(join(dir, ".github/workflows"), { recursive: true });
    writeFileSync(join(dir, ".github/workflows/ci.yml"), workflow);
  }
  return dir;
}

function check(dir, args = [], env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bun, [script, ...args], { cwd: dir, env: { ...process.env, ...env } });
    let out = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const done = (code) => resolve({ code: code === 0 ? 0 : 1, out });
    // A spawn error is a broken test setup, never a deps-check failure.
    child.on("error", reject);
    child.on("close", done);
  });
}

function assertFailed(r, re) {
  assert.equal(r.code, 1, r.out);
  assert.doesNotMatch(r.out, /all up to date/);
  assert.doesNotMatch(r.out, /deps check passed/);
  if (re) assert.match(r.out, re);
}

function serve(onRequest) {
  const server = createServer(onRequest);
  servers.push(server);
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve(`http://127.0.0.1:${server.address().port}`);
    });
  });
}

const sendJson = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

const upToDate = {
  "dist-tags": { latest: "1.0.0" },
  versions: { "1.0.0": { engines: { node: ">=18" } } },
};

const direct = { deps: { dep: "^1.0.0" } };
const pins = `steps:\n  - uses: actions/checkout@${SHA} # v4.2.2\n  - uses: ./local\n`;

test("passes a clean project and ignores tables after the BOM", async () => {
  let accept = "";
  const url = await serve((req, res) => {
    accept = req.headers.accept || "";
    sendJson(res, upToDate);
  });
  const r = await check(fixture({ ...direct, workflow: pins }), [], { DEPS_CHECK_REGISTRY: url });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /ok {4}actions\/checkout v4\.2\.2/);
  assert.match(r.out, /all up to date/);
  assert.match(r.out, /deps check passed/);
  assert.equal(accept, "application/vnd.npm.install-v1+json");
});

test("fails a BOM row that differs from the lockfile", async () => {
  assertFailed(
    await check(fixture({ bomVersion: "0.9.0" })),
    /dep \(transitive\): THIRD-PARTY.md says 0\.9\.0, lockfile has 1\.0\.0/,
  );
});

test("fails a pinned BOM row that is no longer locked, but not an unknown one", async () => {
  const r = await check(
    fixture({ bom: "| dep | 1.0.0 |\n| gone | 2.0.0 |\n| numpy | unknown |\n" }),
  );
  assertFailed(r, /gone: in THIRD-PARTY.md but not in the lockfile/);
  assert.doesNotMatch(r.out, /numpy/);
});

test("fails missing integrity", async () => {
  assertFailed(await check(fixture({ integrity: "" })), /dep: no integrity hash/);
});

test("fails a non-default registry", async () => {
  assertFailed(
    await check(fixture({ registry: "https://evil.example" })),
    /registry is not the default \(https:\/\/evil\.example\)/,
  );
});

// A clean project with one bad pin: that FAIL alone has to carry the exit code.
test("fails an action pinned to a tag", async () => {
  const r = await check(
    fixture({ ...direct, workflow: `- uses: actions/checkout@v4 # v4\n` }),
    [],
    {
      DEPS_CHECK_REGISTRY: await serve((_req, res) => sendJson(res, upToDate)),
    },
  );
  assertFailed(r, /FAIL {2}ci\.yml:1 actions\/checkout@v4 is not pinned to a commit SHA\n/);
  assert.match(r.out, /\n1 problem\(s\)/);
});

test("fails an action pinned without a version comment", async () => {
  const r = await check(
    fixture({ ...direct, workflow: `- uses: actions/setup-node@${SHA}\n` }),
    [],
    {
      DEPS_CHECK_REGISTRY: await serve((_req, res) => sendJson(res, upToDate)),
    },
  );
  assertFailed(
    r,
    /FAIL {2}ci\.yml:1 actions\/setup-node pinned without a "# vX" version comment\n/,
  );
  assert.match(r.out, /\n1 problem\(s\)/);
});

test("fails a direct dependency missing from THIRD-PARTY.md", async () => {
  const url = await serve((_req, res) => sendJson(res, upToDate));
  assertFailed(
    await check(fixture({ ...direct, bom: "" }), [], { DEPS_CHECK_REGISTRY: url }),
    /dep missing from THIRD-PARTY.md/,
  );
});

test("fails a direct dependency whose BOM version differs from the lockfile", async () => {
  const url = await serve((_req, res) => sendJson(res, upToDate));
  assertFailed(
    await check(fixture({ ...direct, bomVersion: "0.9.0" }), [], { DEPS_CHECK_REGISTRY: url }),
    /dep: THIRD-PARTY.md says 0\.9\.0, lockfile has 1\.0\.0/,
  );
});

test("fails when the lock root dependencies differ from package.json", async () => {
  const url = await serve((_req, res) => sendJson(res, upToDate));
  assertFailed(
    await check(fixture({ ...direct, lockDeps: { dep: "^0.9.0" } }), [], {
      DEPS_CHECK_REGISTRY: url,
    }),
    /root dependencies differ from package.json/,
  );
});

// npm parity (#56 step 3): a `latest` whose engines.node excludes Node 22 is skipped.
const enginesDoc = (latestEngines) => ({
  "dist-tags": { latest: "2.0.0" },
  versions: {
    "1.0.0": { engines: { node: ">=18" } },
    "1.1.0": { engines: { node: ">=18" } },
    "2.0.0": { engines: { node: latestEngines } },
  },
});

test("skips a latest that needs a newer Node and reports the newest Node 22 one", async () => {
  const url = await serve((_req, res) => sendJson(res, enginesDoc(">=24")));
  const env = { DEPS_CHECK_REGISTRY: url };
  const behind = await check(fixture(direct), [], env);
  assert.equal(behind.code, 0, behind.out);
  assert.match(behind.out, /\| dep \| 1\.0\.0 \| 1\.1\.0 \| 1\.1\.0 \| minor \|/);
  assert.doesNotMatch(behind.out, /2\.0\.0/);
  const current = await check(
    fixture({ ...direct, ident: "dep@1.1.0", bomVersion: "1.1.0" }),
    [],
    env,
  );
  assert.equal(current.code, 0, current.out);
  assert.doesNotMatch(current.out, /\| dep \|/);
  assert.match(current.out, /all up to date/);
});

test("reports a latest whose engines allow Node 22", async () => {
  const url = await serve((_req, res) => sendJson(res, enginesDoc(">=20")));
  const r = await check(fixture({ ...direct, ident: "dep@1.1.0", bomVersion: "1.1.0" }), [], {
    DEPS_CHECK_REGISTRY: url,
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /\| dep \| 1\.1\.0 \| 1\.1\.0 \| 2\.0\.0 \| major \|/);
});

test("in-range updates warn by default and fail with --strict", async () => {
  const url = await serve((_req, res) =>
    sendJson(res, {
      "dist-tags": { latest: "2.0.0" },
      versions: { "1.0.0": {}, "1.1.0": {}, "2.0.0": {} },
    }),
  );
  const dir = fixture(direct);
  const env = { DEPS_CHECK_REGISTRY: url };
  const loose = await check(dir, [], env);
  assert.equal(loose.code, 0, loose.out);
  assert.match(loose.out, /warn {2}1 in-range patch\/minor updates/);
  assert.match(loose.out, /\| dep \| 1\.0\.0 \| 1\.1\.0 \| 2\.0\.0 \| major \|/);
  assert.match(loose.out, /deps check passed/);
  const strict = await check(dir, ["--strict"], env);
  assertFailed(strict, /FAIL {2}1 in-range patch\/minor updates/);
});

test("fails when the install tool cannot run", async () => {
  const dir = fixture();
  assertFailed(
    await check(dir, [], { DEPS_CHECK_BUN: "/no/such/bun" }),
    /frozen-lockfile --dry-run failed to run: ENOENT/,
  );
  writeFileSync(join(dir, "die"), "#!/bin/sh\nkill -TERM $$\n");
  chmodSync(join(dir, "die"), 0o755);
  assertFailed(
    await check(dir, [], { DEPS_CHECK_BUN: join(dir, "die") }),
    /frozen-lockfile --dry-run killed by signal SIGTERM/,
  );
  writeFileSync(
    join(dir, "stale"),
    "#!/bin/sh\necho 'error: lockfile had changes, but lockfile is frozen' >&2\nexit 1\n",
  );
  chmodSync(join(dir, "stale"), 0o755);
  assertFailed(
    await check(dir, [], { DEPS_CHECK_BUN: join(dir, "stale") }),
    /frozen-lockfile --dry-run exited 1: error: lockfile had changes/,
  );
});

test("fails on a registry error", async () => {
  assertFailed(
    await check(fixture(direct), [], { DEPS_CHECK_REGISTRY: "http://127.0.0.1:9" }),
    /registry error for dep/,
  );
});

test("fails on a registry timeout", { timeout: 5000 }, async () => {
  const url = await serve(() => {});
  assertFailed(
    await check(fixture(direct), [], { DEPS_CHECK_REGISTRY: url, DEPS_CHECK_TIMEOUT_MS: "200" }),
    /registry timeout for dep/,
  );
});

test("fails on a non-200 registry response", async () => {
  const url = await serve((_req, res) => sendJson(res, "nope", 500));
  assertFailed(
    await check(fixture(direct), [], { DEPS_CHECK_REGISTRY: url }),
    /registry HTTP 500 for dep/,
  );
});

test("fails when dist-tags.latest is missing", async () => {
  const url = await serve((_req, res) => sendJson(res, { versions: { "1.0.0": {} } }));
  assertFailed(
    await check(fixture(direct), [], { DEPS_CHECK_REGISTRY: url }),
    /dep: no dist-tags\.latest/,
  );
});

test("fails when bun.lock is missing", async () => {
  assertFailed(await check(fixture({ noLock: true })), /bun\.lock missing/);
});

test("fails when bun.lock is unparsable", async () => {
  assertFailed(await check(fixture({ lockText: "not json" })), /bun\.lock is unparsable/);
});

test("fails when lockfileVersion is not 2", async () => {
  assertFailed(await check(fixture({ lockfileVersion: 1 })), /lockfileVersion 1 !== 2/);
});

test("fails when there are no package entries", async () => {
  const url = await serve((_req, res) => sendJson(res, upToDate));
  assertFailed(
    await check(fixture({ ...direct, noPackages: true }), [], { DEPS_CHECK_REGISTRY: url }),
    /no package entries/,
  );
});

test("fails when there is no root workspace", async () => {
  assertFailed(await check(fixture({ noWorkspace: true })), /no root workspace/);
});

test("fails when a non-empty dependency set gets zero registry answers", async () => {
  const url = await serve((_req, res) => {
    res.writeHead(200);
    res.end("");
  });
  assertFailed(
    await check(fixture(direct), [], { DEPS_CHECK_REGISTRY: url }),
    /zero registry answers/,
  );
});

test("fails an override that is not applied", async () => {
  const url = await serve((_req, res) => sendJson(res, upToDate));
  assertFailed(
    await check(
      fixture({
        ...direct,
        overrides: { dep: "1.0.0" },
        ident: "dep@9.9.9",
        bomVersion: "9.9.9",
      }),
      [],
      { DEPS_CHECK_REGISTRY: url },
    ),
    /override dep not applied: dep is 9\.9\.9, pin is 1\.0\.0/,
  );
});

test("fails an override missing from the lock", async () => {
  const url = await serve((_req, res) => sendJson(res, upToDate));
  assertFailed(
    await check(fixture({ ...direct, overrides: { dep: "1.0.0" }, lockOverrides: null }), [], {
      DEPS_CHECK_REGISTRY: url,
    }),
    /override dep missing from bun\.lock/,
  );
});

test("passes with no npm on PATH", async () => {
  const url = await serve((_req, res) => sendJson(res, upToDate));
  const path = "/usr/bin:/bin";
  const npm = spawnSync("npm", ["--version"], { env: { PATH: path }, encoding: "utf8" });
  assert.notEqual(npm.status, 0);
  const r = await check(fixture({ ...direct, workflow: pins }), [], {
    DEPS_CHECK_REGISTRY: url,
    PATH: path,
  });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /deps check passed/);
});
