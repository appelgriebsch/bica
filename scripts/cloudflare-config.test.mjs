import assert from "node:assert/strict";
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
  assert.equal(pkg.scripts.build, "vite build && node scripts/precache.mjs && npm run db:migrate");
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
  assert.ok(!cf.embeddedDb, "serve-build must not copy PGLite into the Worker bundle");
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
    /run: npm run db:migrate:staging/,
    /run: npx wrangler deploy/,
  ].map(at);
  assert.ok(
    order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])),
    String(order),
  );
  assert.match(workflow, /DATABASE_URL: \$\{\{ secrets\.DATABASE_URL \}\}/);
  assert.equal(pkg.scripts["db:migrate:staging"], "node scripts/migrate.mjs --staging");
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
