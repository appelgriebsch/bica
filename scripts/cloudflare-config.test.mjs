import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { activePreset, buildOutput } from "./build-output.mjs";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
const wrangler = readFileSync(join(root, "wrangler.toml"), "utf8");
const workflow = readFileSync(join(root, ".github/workflows/deploy-staging.yml"), "utf8");

test("default build stays the Vercel Nitro build", () => {
  assert.equal(pkg.scripts.build, "vite build && node scripts/precache.mjs");
  assert.equal(activePreset({}), "vercel");
  assert.equal(activePreset({ DEPLOY_TARGET: "cloudflare" }), "cloudflare-module");
  assert.match(viteConfig, /const nitroPreset = activePreset\(\);/);
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);
  assert.match(viteConfig, /command === "build"/);
  assert.match(pkg.scripts["build:cf"], /^DEPLOY_TARGET=cloudflare vite build\b/);
});

test("deploy scripts always target the staging environment", () => {
  assert.match(
    pkg.scripts["deploy:staging"],
    /wrangler deploy --env staging --config wrangler\.toml/,
  );
  assert.equal(pkg.scripts.deploy, undefined);
  assert.doesNotMatch(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /branches:\s*\[staging\]/);
  assert.match(workflow, /timeout-minutes:\s*15\b/);
  assert.match(workflow, /environment:\s*staging/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /uses:\s*actions\/(?:checkout|setup-node)@v4\b/);
  assert.match(workflow, /wrangler deploy --env staging --config wrangler\.toml/);
  assert.doesNotMatch(workflow, /pull_request/);
});

test("root wrangler config is staging-only and fail-closed", () => {
  assert.match(wrangler, /name = "bica"/);
  assert.match(wrangler, /compatibility_date = "2026-10-05"/);
  assert.match(wrangler, /nodejs_compat/);
  assert.match(wrangler, /workers_dev = false/);
  assert.match(wrangler, /\[env\.staging\]/);
  assert.match(wrangler, /workers_dev = true/);
  assert.match(wrangler, /BICA_STAGE = "staging"/);
  assert.doesNotMatch(wrangler, /\[env\.production\]/);
  assert.doesNotMatch(wrangler, /routes?\s*=/);
  assert.match(wrangler, /\.output\/server\/staging-entry\.mjs/);
  assert.match(pkg.scripts["build:cf"], /write-cf-entry\.mjs/);
  assert.match(wrangler, /\.output\/public/);
});

test("build:cf precaches the Cloudflare output and never migrates", () => {
  const steps = pkg.scripts["build:cf"].split(" && ");
  const vite = steps.indexOf("DEPLOY_TARGET=cloudflare vite build");
  const precache = steps.indexOf("DEPLOY_TARGET=cloudflare node scripts/precache.mjs");
  const entry = steps.indexOf("node scripts/write-cf-entry.mjs");
  assert.ok(vite === 0 && precache > vite && entry > precache, pkg.scripts["build:cf"]);
  assert.doesNotMatch(pkg.scripts["build:cf"], /migrate/);
  const cf = buildOutput("cloudflare-module");
  assert.equal(cf.publicDir, ".output/public");
  assert.equal(cf.serverEntry, ".output/server/index.mjs");
  assert.match(wrangler, new RegExp(`main = "${cf.workerEntry}"`));
  assert.match(wrangler, new RegExp(`directory = "${cf.publicDir}"`));
});

test("workflow checks, builds, migrates, then deploys", () => {
  const at = (re) => workflow.search(re);
  const order = [
    /run: npm ci/,
    /run: npm test/,
    /run: npm run deps:check/,
    /run: npm run build:cf/,
    /run: npx wrangler d1 migrations apply DB --env staging --remote --config wrangler\.toml/,
    /run: npx wrangler deploy/,
  ].map(at);
  assert.ok(
    order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])),
    String(order),
  );
  assert.doesNotMatch(workflow, /DATABASE_URL/);
  const migrate = pkg.scripts["deploy:staging"].indexOf(
    "wrangler d1 migrations apply DB --env staging --remote",
  );
  assert.ok(migrate > 0 && migrate < pkg.scripts["deploy:staging"].indexOf("wrangler deploy"));
});

test("D1: local and staging bindings named DB read migrations/", () => {
  const blocks = wrangler.split(/^(?=\[)/m);
  const d1 = (header) => blocks.find((b) => b.startsWith(header));
  for (const header of ["[[d1_databases]]", "[[env.staging.d1_databases]]"]) {
    const b = d1(header);
    assert.ok(b, `${header} missing`);
    assert.match(b, /^binding = "DB"$/m);
    assert.match(b, /^migrations_dir = "migrations"$/m);
  }
  assert.match(d1("[[env.staging.d1_databases]]"), /^database_name = "bica-staging"$/m);
  assert.doesNotMatch(wrangler, /^\[+env\.production/m);
});

test("no Postgres, Neon, Hyperdrive or DATABASE_URL left outside the ADRs", () => {
  const r = spawnSync(
    "git",
    [
      "grep",
      "-nIiE",
      'DATABASE_URL|(^|[^a-z])neon([^a-z]|$)|hyperdrive|pglite|from "pg"',
      "--",
      "src",
      "scripts",
      ".github",
      "package.json",
      "wrangler.toml",
      "docs",
      "AGENTS*.md",
      ":!docs/adr/0001-*",
      ":!docs/adr/0002-*",
      ":!scripts/cloudflare-config.test.mjs",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(r.stdout, "", r.stdout);
});

test("assets: explicit html and not-found handling, shell and worker headers", () => {
  assert.match(wrangler, /html_handling = "none"/);
  assert.match(wrangler, /not_found_handling = "none"/);
  const headers = readFileSync(join(root, "public/_headers"), "utf8");
  assert.match(
    headers,
    /^\/_shell\n {2}content-type: text\/html; charset=utf-8\n {2}cache-control: no-cache$/m,
  );
  assert.match(headers, /^\/sw\.js\n {2}cache-control: no-cache$/m);
});
