import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";
import { injectId, MARKER } from "./ci-d1-provision.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const script = join(root, "scripts/ci-d1-provision.mjs");
const ID = "3f1c2a9e-8b7d-4c6e-9a5f-0123456789ab";
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

// Mock wrangler: `d1 list --json` prints state.dbs; `d1 create` appends state.createId.
const MOCK = `import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
const [, , ...args] = process.argv;
const state = JSON.parse(readFileSync("state.json", "utf8"));
appendFileSync("calls.log", args.join(" ") + "\\n");
if (args.join(" ") === "d1 list --json") { if (state.listPrefix) console.log(state.listPrefix); console.log(JSON.stringify(state.dbs, null, 2)); }
else if (args[0] === "d1" && args[1] === "create") {
  if (state.createFails) process.exit(1);
  state.dbs.push({ uuid: state.createId, name: args[2] });
  writeFileSync("state.json", JSON.stringify(state));
  console.log("Successfully created DB");
} else process.exit(2);
`;

function run(state, env = {}) {
  const dir = mkdtempSync(join(tmpdir(), "d1-provision-"));
  dirs.push(dir);
  copyFileSync(join(root, "wrangler.toml"), join(dir, "wrangler.toml"));
  writeFileSync(join(dir, "mock.mjs"), MOCK);
  writeFileSync(join(dir, "state.json"), JSON.stringify(state));
  writeFileSync(join(dir, "calls.log"), "");
  const r = spawnSync(process.execPath, [script], {
    cwd: dir,
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      WRANGLER: `${process.execPath} mock.mjs`,
      CLOUDFLARE_API_TOKEN: "secret-token-value",
      CLOUDFLARE_ACCOUNT_ID: "acct",
      GITHUB_OUTPUT: join(dir, "out.txt"),
      ...env,
    },
  });
  const read = (f) => (existsSync(join(dir, f)) ? readFileSync(join(dir, f), "utf8") : "");
  return {
    code: r.status,
    out: r.stdout + r.stderr,
    calls: read("calls.log").trim().split("\n").filter(Boolean),
    ci: read("wrangler.ci.toml"),
    output: read("out.txt"),
  };
}

const stagingId = (toml) =>
  toml
    .split(/^(?=\[)/m)
    .find((b) => b.startsWith("[[env.staging.d1_databases]]"))
    ?.match(/^database_id = "(.*)"$/m)?.[1];

test("database exists: reused, no create, id injected", () => {
  const r = run({
    dbs: [
      { uuid: "aaaaaaaa-0000-4000-8000-000000000000", name: "other" },
      { uuid: ID, name: "bica-staging" },
    ],
  });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.calls, ["d1 list --json"]);
  assert.match(r.out, new RegExp(`bica-staging exists, reusing ${ID}`));
  assert.equal(stagingId(r.ci), ID);
  assert.ok(!r.ci.includes(MARKER));
  assert.equal(r.output, `d1_id=${ID}\n`);
  assert.ok(!r.out.includes("secret-token-value"), "never prints the token");
});

test("database missing: created once (weur), listed again, id injected", () => {
  const r = run({ dbs: [], createId: ID });
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(r.calls, [
    "d1 list --json",
    "d1 create bica-staging --location weur",
    "d1 list --json",
  ]);
  assert.equal(stagingId(r.ci), ID);
  assert.ok(!r.out.includes("secret-token-value"));
});

test("only the staging block changes; the local block keeps its id", () => {
  const r = run({ dbs: [{ uuid: ID, name: "bica-staging" }] });
  const orig = readFileSync(join(root, "wrangler.toml"), "utf8");
  assert.equal(r.ci, orig.replace(`database_id = "${MARKER}"`, `database_id = "${ID}"`));
  assert.match(r.ci, /^database_id = "local"$/m);
});

test("tolerates text before the JSON list", () => {
  const r = run({
    dbs: [{ uuid: ID, name: "bica-staging" }],
    listPrefix: "[WARNING] something\n▲ [WARNING] other",
  });
  assert.equal(r.code, 0, r.out);
  assert.equal(stagingId(r.ci), ID);
});

for (const [name, state, env, re] of [
  [
    "empty token",
    { dbs: [{ uuid: ID, name: "bica-staging" }] },
    { CLOUDFLARE_API_TOKEN: " " },
    /CLOUDFLARE_API_TOKEN is empty/,
  ],
  [
    "missing account id",
    { dbs: [{ uuid: ID, name: "bica-staging" }] },
    { CLOUDFLARE_ACCOUNT_ID: "" },
    /CLOUDFLARE_ACCOUNT_ID is empty/,
  ],
  ["invalid id", { dbs: [{ uuid: "not-a-uuid", name: "bica-staging" }] }, {}, /not a D1 uuid/],
  ["empty id after create", { dbs: [], createId: "" }, {}, /not a D1 uuid/],
  ["create fails", { dbs: [], createFails: true }, {}, /Command failed|status 1/],
  ["no JSON from list", { dbs: null }, {}, /did not return a list/],
  [
    "two databases with the name",
    {
      dbs: [
        { uuid: ID, name: "bica-staging" },
        { uuid: ID.replace("3f", "4f"), name: "bica-staging" },
      ],
    },
    {},
    /more than one D1/,
  ],
]) {
  test(`fails with no config written: ${name}`, () => {
    const r = run(state, env);
    assert.notEqual(r.code, 0);
    assert.match(r.out, re);
    assert.equal(r.ci, "");
    assert.equal(r.output, "");
    if (/CLOUDFLARE/.test(name + JSON.stringify(env)))
      assert.deepEqual(r.calls, [], "no wrangler call");
  });
}

test("injectId refuses a config without the marker", () => {
  assert.throws(
    () => injectId('[[env.staging.d1_databases]]\ndatabase_id = "x"\n', "staging", ID),
    /has no database_id/,
  );
  assert.throws(() => injectId("[env.staging]\n", "staging", ID), /not found/);
});
