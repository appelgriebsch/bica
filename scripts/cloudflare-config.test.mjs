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
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");

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
    /wrangler deploy --env staging --config wrangler\.ci\.toml/,
  );
  assert.equal(pkg.scripts.deploy, undefined);
  assert.match(
    workflow,
    /^on:\n {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/m,
  );
  assert.doesNotMatch(workflow, /^ {2}push:/m);
  assert.match(workflow, /timeout-minutes:\s*15\b/);
  assert.match(workflow, /environment:\s*staging/);
  assert.match(workflow, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(workflow, /actions\/setup-node@[0-9a-f]{40}/);
  assert.doesNotMatch(workflow, /uses:\s*actions\/(?:checkout|setup-node)@v4\b/);
  assert.doesNotMatch(workflow, /--config wrangler\.toml/);
  assert.doesNotMatch(workflow, /cloudflare\/wrangler-action/);
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

test("one fixed concurrency group that never cancels a running deploy", () => {
  assert.match(
    workflow,
    /^concurrency:\n {2}group: deploy-staging\n {2}cancel-in-progress: false$/m,
  );
  assert.doesNotMatch(workflow, /cancel-in-progress: true/);
  assert.match(workflow, /shell: bash -euo pipefail \{0\}/);
});

test("workflow checks, builds, provisions, migrates, deploys, then smokes", () => {
  const at = (re) => workflow.search(re);
  const order = [
    /name: Require green CI \(manual runs\)/,
    /ref: \$\{\{ github\.event\.workflow_run\.head_sha \|\| github\.sha \}\}/,
    /run: npm ci/,
    /run: npm run build:cf/,
    /run: node scripts\/ci-d1-provision\.mjs/,
    /run: npx wrangler d1 migrations apply DB --env staging --remote --config wrangler\.ci\.toml/,
    /run: npx wrangler deploy --env staging --config wrangler\.ci\.toml/,
    /curl -fsS --max-time 10 "\$url\/api\/health"/,
  ].map(at);
  assert.ok(
    order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])),
    String(order),
  );
  assert.doesNotMatch(workflow, /DATABASE_URL/);
  const migrate = pkg.scripts["deploy:staging"].indexOf(
    "wrangler d1 migrations apply DB --env staging --remote",
  );
  const local = pkg.scripts["deploy:staging"];
  const provision = local.indexOf("node scripts/ci-d1-provision.mjs");
  assert.ok(provision > 0 && provision < migrate && migrate < local.indexOf("wrangler deploy"));
  assert.match(local, /migrations apply DB --env staging --remote --config wrangler\.ci\.toml/);
  assert.match(workflow, /test "\$\(jq -r \.stage <<<"\$body"\)" = staging/);
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

test("no real D1 id committed; the generated config is gitignored", () => {
  assert.doesNotMatch(wrangler, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
  assert.match(wrangler, /^database_id = "\$\{BICA_STAGING_D1_ID\}"$/m);
  const ignore = readFileSync(join(root, ".gitignore"), "utf8");
  assert.match(ignore, /^wrangler\.ci\.toml$/m);
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

test("#28: _headers /* carries every static security header, same values as the Worker", async () => {
  const { STATIC_SECURITY_HEADERS } = await import("../src/lib/security-headers.mjs");
  const headers = readFileSync(join(root, "public/_headers"), "utf8");
  const block = headers.slice(headers.indexOf("/*\n"), headers.indexOf("\n/sw.js"));
  const lines = Object.fromEntries(
    block
      .split("\n")
      .slice(1)
      .map((l) =>
        l
          .trim()
          .split(/:\s(.*)/s)
          .slice(0, 2),
      ),
  );
  assert.deepEqual(lines, { ...STATIC_SECURITY_HEADERS });
  for (const h of [
    "strict-transport-security",
    "x-frame-options",
    "referrer-policy",
    "x-content-type-options",
  ]) {
    assert.ok(lines[h], h);
  }
});

test("#28: staging smoke checks the security headers and a nonce CSP", () => {
  const step = workflow.slice(workflow.indexOf("- name: Smoke security headers"));
  assert.match(step, /for path in \/ \/login/);
  for (const h of [
    "strict-transport-security",
    "x-frame-options",
    "referrer-policy",
    "x-content-type-options",
  ]) {
    assert.ok(step.includes(h), h);
  }
  assert.match(step, /'nonce-/);
});

test("#31: header smoke retries HEAD+GET on / and /login, then fails loudly", () => {
  const start = workflow.indexOf("- name: Smoke security headers");
  const end = workflow.indexOf("\n      - ", start + 1);
  const step = workflow.slice(start, end === -1 ? undefined : end);
  assert.match(step, /\n {8}timeout-minutes: 3\n/);
  assert.match(step, /for path in \/ \/login; do/);
  assert.match(step, /for method in HEAD GET; do/);
  assert.match(step, /for h in strict-transport-security x-frame-options referrer-policy x-content-type-options permissions-policy cross-origin-opener-policy; do/);
  assert.match(step, /for i in \$\(seq 1 12\); do/);
  assert.match(step, /\[ "\$i" -lt 12 \] && sleep 5\n/);
  assert.match(step, /\n {10}echo "::error::\$out"\n {10}exit 1\s*$/);
});

test("#31: /api/health smoke fails with ::error:: when health never answers", () => {
  const start = workflow.indexOf("- name: Smoke /api/health");
  const step = workflow.slice(start, workflow.indexOf("- name: Smoke security headers"));
  assert.match(step, /\[ -n "\$\{body:-\}" \] \|\| \{ echo "::error::[^"]*"; exit 1; \}\n {10}echo "\$body"/);
});

test("deploy runs only after green CI for a push to main, on exactly that sha", () => {
  const guard = workflow.slice(
    workflow.indexOf("    if: >-"),
    workflow.indexOf("    environment: staging"),
  );
  for (const cond of [
    "github.event_name == 'workflow_dispatch' &&\n       github.ref == 'refs/heads/main'",
    "github.event_name == 'workflow_run' &&",
    "github.event.workflow_run.conclusion == 'success' &&",
    "github.event.workflow_run.event == 'push' &&",
    "github.event.workflow_run.head_branch == 'main' &&",
    "github.event.workflow_run.head_repository.full_name == github.repository)",
  ]) {
    assert.ok(guard.includes(cond), `job guard lacks: ${cond}`);
  }
  // A manual run checks the CI check run of its sha before anything else.
  const manual = workflow.slice(workflow.indexOf("name: Require green CI"));
  assert.match(manual, /^ {8}if: github\.event_name == 'workflow_dispatch'$/m);
  assert.match(manual, /check-runs\?check_name=CI/);
  assert.match(manual, /test "\$conclusion" = success/);
  assert.ok(workflow.indexOf("name: Require green CI") < workflow.indexOf("actions/checkout@"));
  assert.match(workflow, /^ {2}checks: read/m);
  assert.doesNotMatch(
    workflow,
    /run: .*(?:npm test|npm run lint|npm run typecheck|deps:check|BICA_BUILT)/,
  );
});

test("CI: PRs and pushes to main, job CI, no secrets, cancels superseded runs", () => {
  assert.match(
    ci,
    /^on:\n {2}pull_request:\n {4}branches: \[main\]\n {2}push:\n {4}branches: \[main\]\n/m,
  );
  assert.match(
    ci,
    /^concurrency:\n {2}group: ci-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true$/m,
  );
  assert.match(ci, /^permissions:\n {2}contents: read\n/m);
  assert.match(ci, /^jobs:\n {2}ci:\n(?: {4}#.*\n)* {4}name: CI$/m);
  assert.doesNotMatch(ci, /secrets\.|environment:|CLOUDFLARE_/);
  assert.match(ci, /shell: bash -euo pipefail \{0\}/);
  assert.match(ci, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(ci, /actions\/setup-node@[0-9a-f]{40}/);
  const at = (re) => ci.search(re);
  const order = [
    /run: npm ci$/m,
    /run: npm run typecheck$/m,
    /run: npm run lint$/m,
    /run: npm test$/m,
    /run: npm run deps:check$/m,
    /run: npm run build$/m,
    /run: npm run build:cf$/m,
    /run: BICA_BUILT=1 DEPLOY_TARGET=cloudflare npm test$/m,
    /run: npx wrangler deploy --dry-run --env staging --config wrangler\.toml$/m,
  ].map(at);
  assert.ok(
    order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])),
    String(order),
  );
});

test("Node 22 is pinned: .nvmrc, engines, engine-strict, both workflows", () => {
  assert.equal(readFileSync(join(root, ".nvmrc"), "utf8").trim(), "22");
  assert.equal(pkg.engines?.node, ">=22 <23");
  const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
  assert.equal(lock.packages[""].engines?.node, pkg.engines.node);
  assert.match(readFileSync(join(root, ".npmrc"), "utf8"), /^engine-strict=true$/m);
  for (const wf of [ci, workflow]) {
    assert.match(wf, /node-version-file: \.nvmrc/);
    assert.doesNotMatch(wf, /node-version: /);
  }
});

test("tests never assign globalThis.navigator directly (getter-only since Node 21)", () => {
  const r = spawnSync("git", ["grep", "-n", "globalThis.navigator" + " =", "--", "scripts"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(r.stdout, "", r.stdout);
});

test("Cloudflare secrets only in the provision, migrate and deploy steps", () => {
  const job = workflow.slice(workflow.indexOf("\njobs:"));
  assert.doesNotMatch(job.slice(0, job.indexOf("    steps:")), /CLOUDFLARE_/, "job-level env");
  assert.doesNotMatch(workflow.slice(0, workflow.indexOf("\njobs:")), /CLOUDFLARE_/);
  const steps = job
    .slice(job.indexOf("    steps:"))
    .split(/\n {6}- /)
    .slice(1);
  const withSecrets = steps
    .filter((st) => /CLOUDFLARE_/.test(st))
    .map((st) => st.match(/name: (.*)/)?.[1]);
  assert.deepEqual(withSecrets, [
    "Provision staging D1",
    "Migrate staging D1",
    "Deploy bica-staging",
  ]);
  for (const st of steps.filter((st) => /CLOUDFLARE_/.test(st))) {
    assert.match(st, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
    assert.match(st, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
  }
});

test("health check curl has a per-request timeout", () => {
  const curls = workflow.match(/curl [^\n]*/g) ?? [];
  assert.ok(curls.length > 0);
  for (const c of curls) assert.match(c, /--max-time 10\b/, c);
});

test("manual-run guard takes the newest CI check run, and a pending one blocks", () => {
  const filter = workflow.match(/--jq '([^']+)'/)?.[1];
  assert.ok(filter, "no --jq filter in the manual-run guard");
  const jq = (runs) =>
    spawnSync("jq", ["-r", filter], {
      input: JSON.stringify({ check_runs: runs }),
      encoding: "utf8",
    }).stdout.trim();
  const at = (h) => `2026-10-14T0${h}:00:00Z`;
  const done = (conclusion, h, slug = "github-actions") => ({
    id: h,
    status: "completed",
    conclusion,
    started_at: at(h),
    completed_at: at(h + 1),
    app: { slug },
  });
  const pending = (h) => ({
    id: h,
    status: "in_progress",
    conclusion: null,
    started_at: at(h),
    completed_at: null,
    app: { slug: "github-actions" },
  });
  // listed in either order: only the newest run counts
  assert.equal(jq([done("failure", 1), done("success", 3)]), "success");
  assert.equal(jq([done("success", 3), done("failure", 1)]), "success");
  assert.equal(jq([done("success", 1), done("failure", 3)]), "failure");
  assert.equal(jq([done("failure", 3), done("success", 1)]), "failure");
  // #24 S5: a newer pending re-run (completed_at null) is not passed over for an older green run
  assert.equal(jq([done("success", 1), pending(3)]), "pending");
  assert.equal(jq([pending(3), done("success", 1)]), "pending");
  // #25 S4: a queued re-run has no started_at yet; the newest id still decides
  assert.equal(
    jq([done("success", 1), { ...pending(3), status: "queued", started_at: null }]),
    "pending",
  );
  assert.equal(
    jq([{ ...pending(3), status: "queued", started_at: null }, done("success", 1)]),
    "pending",
  );
  // another app's check named CI doesn't count; no run at all is "missing"
  assert.equal(jq([done("failure", 1), done("success", 3, "someone-else")]), "failure");
  assert.equal(jq([]), "missing");
});
