import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
const wrangler = readFileSync(join(root, "wrangler.toml"), "utf8");
const workflow = readFileSync(join(root, ".github/workflows/deploy-staging.yml"), "utf8");

test("default build stays the Vercel Nitro build", () => {
  assert.equal(pkg.scripts.build, "vite build && node scripts/precache.mjs && npm run db:migrate");
  assert.match(viteConfig, /DEPLOY_TARGET === "cloudflare" \? "cloudflare-module" : NITRO_PRESET/);
  assert.match(
    readFileSync(join(root, "scripts/build-output.mjs"), "utf8"),
    /export const NITRO_PRESET = "vercel";/,
  );
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);
  assert.match(viteConfig, /command === "build"/);
  assert.match(pkg.scripts["build:cf"], /^DEPLOY_TARGET=cloudflare vite build\b/);
});

test("deploy scripts always target the staging environment", () => {
  assert.match(pkg.scripts["deploy:staging"], /wrangler deploy --env staging --config wrangler\.toml/);
  assert.equal(pkg.scripts.deploy, undefined);
  assert.doesNotMatch(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /branches:\s*\[staging\]/);
  assert.match(workflow, /timeout-minutes:\s*60/);
  assert.match(
    workflow,
    /actions\/checkout@[0-9a-f]{40}/,
  );
  assert.match(
    workflow,
    /actions\/setup-node@[0-9a-f]{40}/,
  );
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
