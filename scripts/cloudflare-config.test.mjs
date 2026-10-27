import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { activePreset, buildOutput } from "./build-output.mjs";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const viteConfig = readFileSync(join(root, "vite.config.ts"), "utf8");
const wrangler = readFileSync(join(root, "wrangler.toml"), "utf8");
const deploy = readFileSync(join(root, ".github/workflows/deploy.yml"), "utf8");
const ci = readFileSync(join(root, ".github/workflows/ci.yml"), "utf8");
const smokeHealth = readFileSync(join(root, "scripts/smoke-health.sh"), "utf8");

function job(name) {
  const start = deploy.search(new RegExp(`^  ${name}:$`, "m"));
  assert.ok(start >= 0, name);
  const from = start + 1;
  const rel = deploy.slice(from).search(/^ {2}\S/m);
  return deploy.slice(start, rel < 0 ? undefined : from + rel);
}

function step(jobName, stepName) {
  const text = job(jobName);
  const marker = `- name: ${stepName}\n`;
  const start = text.indexOf(marker);
  assert.ok(start >= 0, `${jobName} / ${stepName}`);
  const rest = text.slice(start + marker.length);
  const rel = rest.search(/\n {6}- /);
  return text.slice(start, rel < 0 ? undefined : start + marker.length + rel);
}

test("#17: default build is the Cloudflare Nitro build", () => {
  const cf =
    "DEPLOY_TARGET=cloudflare vite build && DEPLOY_TARGET=cloudflare node scripts/precache.mjs && node scripts/write-cf-entry.mjs";
  assert.equal(pkg.scripts.build, cf);
  assert.equal(pkg.scripts["build:cf"], cf);
  assert.equal(activePreset({}), "cloudflare-module");
  assert.equal(activePreset({ DEPLOY_TARGET: "cloudflare" }), "cloudflare-module");
  assert.match(viteConfig, /const nitroPreset = activePreset\(\);/);
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);
  assert.match(viteConfig, /command === "build"/);
  assert.doesNotMatch(viteConfig, /vercel/i);
  assert.doesNotMatch(readFileSync(join(root, "scripts/build-output.mjs"), "utf8"), /vercel/i);
});

test("deploy scripts always target the staging environment", () => {
  assert.match(
    pkg.scripts["deploy:staging"],
    /wrangler deploy --env staging --config wrangler\.toml$/,
  );
  assert.equal(pkg.scripts.deploy, undefined);
  assert.match(
    deploy,
    /^on:\n {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]\n {4}branches: \[main\]\n {2}workflow_dispatch:\n/m,
  );
  assert.doesNotMatch(deploy, /^ {2}push:/m);
  assert.match(deploy, /timeout-minutes:\s*15\b/);
  assert.match(job("staging"), /name: staging/);
  assert.match(deploy, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(deploy, /actions\/setup-node@[0-9a-f]{40}/);
  assert.doesNotMatch(deploy, /uses:\s*actions\/(?:checkout|setup-node)@v4\b/);
  // #33: no generated wrangler.ci.toml any more; the root config ships as is.
  assert.doesNotMatch(deploy, /wrangler\.ci\.toml/);
  assert.doesNotMatch(deploy, /cloudflare\/wrangler-action/);
  assert.doesNotMatch(deploy, /pull_request/);
});

test("root wrangler config: top level inert, staging and production envs", () => {
  assert.match(wrangler, /name = "bica"/);
  assert.match(wrangler, /compatibility_date = "2026-10-05"/);
  assert.match(wrangler, /nodejs_compat/);
  assert.match(wrangler, /workers_dev = false/);
  assert.match(wrangler, /\[env\.staging\]/);
  assert.match(wrangler, /workers_dev = true/);
  assert.match(wrangler, /BICA_STAGE = "staging"/);
  // routes only inside [env.production]
  const top = wrangler.slice(0, wrangler.indexOf("[env.staging]")).replace(/^#.*$/gm, "");
  assert.doesNotMatch(top, /routes?\s*=|BICA_STAGE/);
  assert.equal(wrangler.match(/routes?\s*=/g).length, 1);
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

test("#52: job-level concurrency never cancels staging or production", () => {
  for (const [name, group] of [
    ["staging", "deploy-staging"],
    ["production", "deploy-production"],
  ]) {
    assert.match(
      job(name),
      new RegExp(`concurrency:\\n {6}group: ${group}\\n {6}cancel-in-progress: false`),
    );
  }
  assert.doesNotMatch(deploy, /cancel-in-progress: true/);
  assert.match(deploy, /shell: bash -euo pipefail \{0\}/);
});

test("#52: release build, then staging smoke, then production", () => {
  const at = (re) => deploy.search(re);
  const order = [
    /id: resolve/,
    /check-runs\?check_name=CI/,
    /run: bun install --frozen-lockfile$/m,
    /run: bun run build:cf/,
    /retention-days: 30/,
    /name: Deploy bica-staging/,
    /bash scripts\/smoke-health\.sh "\$url" staging "\$SHA"/,
    /name: Deploy bica-production/,
    /bash scripts\/smoke-health\.sh "\$url" production "\$SHA"/,
  ].map(at);
  assert.ok(
    order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])),
    String(order),
  );
  assert.doesNotMatch(deploy, /DATABASE_URL/);
  assert.equal(
    pkg.scripts["deploy:staging"],
    "bun run build:cf && wrangler deploy --env staging --config wrangler.toml",
  );
  assert.match(smokeHealth, /test "\$\(jq -r \.stage <<<"\$body"\)" = "\$stage"/);
});

test("#33: no D1 anywhere: no binding, no D1 steps, no provisioning", () => {
  assert.doesNotMatch(wrangler, /d1_databases/);
  assert.doesNotMatch(wrangler, /^binding = "DB"$/m);
  assert.doesNotMatch(wrangler, /BICA_STAGING_D1_ID|migrations_dir/);
  assert.doesNotMatch(deploy, /\bd1\b|ci-d1-provision|migrations apply|wrangler\.ci\.toml/i);
  assert.doesNotMatch(pkg.scripts["deploy:staging"], /d1|migrations|ci-d1-provision/);
  assert.doesNotMatch(ci, /\bd1\b/i);
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
  const step = job("staging").slice(job("staging").indexOf("- name: Smoke security headers"));
  assert.match(step, /for path in \/ \/me/);
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

test("#31: header smoke retries HEAD+GET on / and /me, then fails loudly", () => {
  const staging = job("staging");
  const start = staging.indexOf("- name: Smoke security headers");
  const end = staging.indexOf("\n      - ", start + 1);
  const step = staging.slice(start, end === -1 ? undefined : end);
  assert.match(step, /\n {8}timeout-minutes: 3\n/);
  assert.match(step, /for path in \/ \/me; do/);
  assert.doesNotMatch(step, /\/login|\/api\/auth/); // #33: both 404 now
  assert.match(step, /for method in HEAD GET; do/);
  assert.match(
    step,
    /for h in strict-transport-security x-frame-options referrer-policy x-content-type-options permissions-policy cross-origin-opener-policy; do/,
  );
  assert.match(step, /for i in \$\(seq 1 12\); do/);
  assert.match(step, /\[ "\$i" -lt 12 \] && sleep 5\n/);
  assert.match(step, /\n {10}echo "::error::\$out"\n {10}exit 1\s*$/);
});

test("#31: /api/health smoke fails with ::error:: when health never answers", () => {
  assert.match(smokeHealth, /echo "::error::\/api\/health never answered[^"]*"\n {2}exit 1/);
  assert.match(smokeHealth, /\necho "\$body"\n/);
});

test("deploy runs only after green CI for a push to main, on exactly that sha", () => {
  const build = job("build");
  const guard = build.slice(build.indexOf("    if: >-"), build.indexOf("    permissions:"));
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
  assert.match(build, /\[ "\$EVENT_NAME" = workflow_dispatch \]/);
  assert.match(build, /check-runs\?check_name=CI/);
  assert.match(build, /test "\$conclusion" = success/);
  assert.ok(
    build.indexOf("check-runs?check_name=CI") <
      build.indexOf("ref: ${{ steps.resolve.outputs.sha }}"),
  );
  assert.match(build, /checks: read/);
  assert.doesNotMatch(
    deploy,
    /run: .*(?:npm test|bun run test|npm run lint|bun run lint|npm run typecheck|bun run typecheck|deps:check|BICA_BUILT)/,
  );
});

test("CI: PRs and pushes to main, job CI, no secrets, cancels superseded PR runs, never main", () => {
  assert.match(
    ci,
    /^on:\n {2}pull_request:\n {4}branches: \[main\]\n {2}push:\n {4}branches: \[main\]\n/m,
  );
  assert.match(
    ci,
    /^concurrency:\n {2}group: ci-\$\{\{ github\.event\.pull_request\.number \|\| github\.sha \}\}\n {2}cancel-in-progress: \$\{\{ github\.event_name == 'pull_request' \}\}$/m,
  );
  assert.doesNotMatch(ci, /cancel-in-progress: true/);
  assert.match(ci, /^permissions:\n {2}contents: read\n/m);
  assert.match(ci, /^jobs:\n {2}ci:\n(?: {4}#.*\n)* {4}name: CI$/m);
  assert.doesNotMatch(ci, /secrets\.|environment:|CLOUDFLARE_/);
  assert.match(ci, /shell: bash -euo pipefail \{0\}/);
  assert.match(ci, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(ci, /actions\/setup-node@[0-9a-f]{40}/);
  const at = (re) => ci.search(re);
  const order = [
    /run: bun install --frozen-lockfile$/m,
    /run: bun audit --prod --audit-level=high$/m,
    /run: bun run typecheck$/m,
    /run: bun run lint$/m,
    /run: bun run test$/m,
    /run: bun run deps:check$/m,
    /run: bun run licenses:check$/m,
    /run: bun run build$/m,
    /run: bun run build:cf$/m,
    /run: BICA_BUILT=1 DEPLOY_TARGET=cloudflare bun run test$/m,
    /run: bunx wrangler deploy --dry-run --env staging --config wrangler\.toml$/m,
    /run: bunx wrangler deploy --dry-run --env production --config wrangler\.toml$/m,
  ].map(at);
  assert.ok(
    order.every((i, n) => i > -1 && (n === 0 || i > order[n - 1])),
    String(order),
  );
});

test("CI audits production dependencies immediately after bun install", () => {
  assert.match(ci, /^jobs:\n {2}ci:\n(?: {4}#.*\n)* {4}name: CI$/m);
  assert.match(
    ci,
    / {6}- run: bun install --frozen-lockfile\n {6}- run: bun audit --prod --audit-level=high\n {6}- name: Full audit \(report only, #65 optional-peer findings\)\n {8}continue-on-error: true\n {8}run: bun audit\n/,
  );
});

function assertNodeCheckFollowsSetup(text) {
  const parts = text.split(/\n {6}- /);
  let setups = 0;
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].includes("uses: actions/setup-node@")) continue;
    setups++;
    const next = parts[i + 1] ?? "";
    assert.match(next, /run: node scripts\/node-check\.mjs --exact/);
    const iff = parts[i].match(/^if: [^\n]+/);
    if (iff) assert.ok(next.startsWith(iff[0] + "\n"), next.slice(0, 120));
    else assert.equal(next.startsWith("if:"), false, next.slice(0, 80));
  }
  assert.ok(setups > 0);
  return setups;
}

test("Node 22.23.4 is pinned: .nvmrc, engines, packageManager, both workflows", () => {
  assert.equal(readFileSync(join(root, ".nvmrc"), "utf8").trim(), "22.23.4");
  assert.equal(pkg.engines?.node, ">=22.23.4 <23");
  assert.equal(pkg.packageManager, "bun@1.4.4");
  assert.equal(pkg.scripts["node:check"], "node scripts/node-check.mjs");
  assert.equal(pkg.scripts.pretest, "node scripts/node-check.mjs");
  assert.equal(pkg.scripts["deps:check"], "bun scripts/deps-check.mjs");
  for (const wf of [ci, deploy]) {
    assert.match(wf, /node-version-file: \.nvmrc/);
    assert.doesNotMatch(wf, /node-version: /);
    assert.doesNotMatch(wf, /cache: npm/);
    assert.doesNotMatch(wf, /\bnpm /);
    assert.doesNotMatch(wf, /\bnpx /);
    assert.doesNotMatch(wf, /--bun\b/);
    assert.doesNotMatch(wf, /\bbun test\b/);
  }
  assert.equal(assertNodeCheckFollowsSetup(ci), 1);
  assert.equal(assertNodeCheckFollowsSetup(deploy), 3);
  const uses = `${ci}\n${deploy}`.match(/^.*oven-sh\/setup-bun.*$/gm) ?? [];
  assert.equal(uses.length, 4);
  for (const line of uses)
    assert.match(line, /oven-sh\/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2\.2\.0$/);
  assert.equal(`${ci}\n${deploy}`.match(/bun-version-file: package\.json/g).length, uses.length);
});

test("tests never assign globalThis.navigator directly (getter-only since Node 21)", () => {
  const r = spawnSync("git", ["grep", "-n", "globalThis.navigator" + " =", "--", "scripts"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(r.stdout, "", r.stdout);
});

test("#52: Cloudflare secrets only in wrangler steps of staging and production", () => {
  assert.match(deploy, /^permissions: \{\}$/m);
  assert.doesNotMatch(deploy.slice(0, deploy.indexOf("\njobs:")), /secrets\.|CLOUDFLARE_/);
  assert.doesNotMatch(job("build"), /secrets\./);
  assert.doesNotMatch(deploy, /BETTER_AUT[H]|GROK_AUT[H]|VITE_AUTH_ENABLED/);
  const names = [];
  for (const name of ["staging", "production"]) {
    const steps = job(name)
      .split(/\n {6}- /)
      .slice(1);
    for (const st of steps.filter((s) => /secrets\./.test(s))) {
      names.push(st.match(/name: (.*)/)?.[1]);
      assert.match(st, /wrangler\.js"/);
      assert.match(st, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
      assert.match(st, /CLOUDFLARE_ACCOUNT_ID: \$\{\{ secrets\.CLOUDFLARE_ACCOUNT_ID \}\}/);
      for (const ref of st.match(/secrets\.\w+/g)) {
        assert.match(ref, /^secrets\.CLOUDFLARE_(API_TOKEN|ACCOUNT_ID)$/);
      }
    }
  }
  assert.deepEqual(names, ["Deploy bica-staging", "Record live version", "Deploy bica-production"]);
  assert.doesNotMatch(deploy, /^ {4}env:/m);
  const secretLines = deploy.split("\n").filter((l) => l.includes("secrets."));
  assert.ok(secretLines.length > 0);
  for (const line of secretLines) assert.match(line, /^ {10}CLOUDFLARE_/, line);
});

test("health check curl has a per-request timeout", () => {
  const curls = deploy.match(/curl [^\n]*/g) ?? [];
  assert.ok(curls.length > 0);
  for (const c of curls) assert.match(c, /--max-time 10\b/, c);
});

test("manual-run guard takes the newest CI check run, and a pending one blocks", () => {
  const filter = job("build").match(/--jq '([^']+)'/)?.[1];
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

test("#35: CHAT_RATE and the ChatBudget DO binding for staging, one sqlite migration", () => {
  const staging = wrangler.slice(wrangler.indexOf("[env.staging]"));
  assert.match(
    staging,
    /\[\[env\.staging\.ratelimits\]\]\nname = "CHAT_RATE"\nnamespace_id = "\d+"\nsimple = \{ limit = 6, period = 60 \}/,
  );
  assert.match(
    staging,
    /\[\[env\.staging\.durable_objects\.bindings\]\]\nname = "CHAT_BUDGET"\nclass_name = "ChatBudget"/,
  );
  const top = wrangler.slice(0, wrangler.indexOf("[env.staging]"));
  assert.match(
    top,
    /\[\[durable_objects\.bindings\]\]\nname = "CHAT_BUDGET"\nclass_name = "ChatBudget"/,
  );
  assert.match(
    top,
    /\[\[migrations\]\]\ntag = "v1-chat-budget"\nnew_sqlite_classes = \["ChatBudget"\]/,
  );
  assert.equal(wrangler.match(/\[\[migrations\]\]/g).length, 1);
  assert.doesNotMatch(wrangler, /new_classes|script_name/);
  const docs = readFileSync(join(root, "docs/cloudflare-workers.md"), "utf8");
  assert.match(docs, /\[\[env\.production\.ratelimits\]\]\nname = "CHAT_RATE"/);
  assert.match(
    docs,
    /\[\[env\.production\.durable_objects\.bindings\]\]\nname = "CHAT_BUDGET"\nclass_name = "ChatBudget"/,
  );
  for (const name of [
    "TURNSTILE_SECRET_KEY",
    "CHAT_SESSION_SECRET",
    "TURNSTILE_SITE_KEY",
    "XAI_API_KEY",
    "CHAT_DAILY_GLOBAL",
    "CHAT_DAILY_PER_IP",
  ]) {
    assert.ok(docs.includes(name), name);
  }
});

test("#35: the Worker entry exports ChatBudget from a copy of chat-budget.mjs", async () => {
  const { entrySource, BUDGET_MODULE } = await import("./write-cf-entry.mjs");
  const src = entrySource(".output/server/index.mjs");
  assert.match(src, /^import \{ DurableObject \} from "cloudflare:workers";$/m);
  assert.match(
    src,
    new RegExp(`^import \\{ makeChatBudget \\} from "\\./${BUDGET_MODULE}";$`, "m"),
  );
  assert.match(src, /^export \{ default \} from "\.\/index\.mjs";$/m);
  assert.match(src, /^export const ChatBudget = makeChatBudget\(DurableObject\);$/m);
  // only the handler and the DO class are exported
  assert.deepEqual(src.match(/^export .*$/gm).length, 2);
  const script = readFileSync(join(root, "scripts/write-cf-entry.mjs"), "utf8");
  assert.match(
    script.replace(/\s+/g, " "),
    /copyFileSync\( ?join\(process\.cwd\(\), "src\/lib\/chat-budget\.mjs"\), join\(dirname\(entry\), BUDGET_MODULE\),? ?\)/,
  );
});

test("#35: the site key is committed (staging for build:cf, test key otherwise); no GitHub var", async () => {
  const k = await import("../src/lib/turnstile-keys.mjs");
  assert.equal(k.STAGING_TURNSTILE_SITE_KEY, "0x4AAAAAAFWlhnYXXvgEtMvS");
  assert.equal(k.siteKeyForBuild({ DEPLOY_TARGET: "cloudflare" }), "0x4AAAAAAFWlhnYXXvgEtMvS");
  assert.equal(k.siteKeyForBuild({}), "1x00000000000000000000AA");
  assert.equal(k.siteKeyForBuild(), "1x00000000000000000000AA");
  assert.equal(k.TURNSTILE_ACTION, "chat");
  assert.match(
    viteConfig,
    /"import\.meta\.env\.TURNSTILE_SITE_KEY": JSON\.stringify\(siteKeyForBuild\(process\.env\)\)/,
  );
  assert.doesNotMatch(deploy, /TURNSTILE/);
  assert.doesNotMatch(deploy, /vars\./);
  const step = job("staging").slice(job("staging").indexOf("- name: Smoke security headers"));
  assert.match(step, /frame-src https:\/\/challenges\\\.cloudflare\\\.com/);
});

test("#35: TURNSTILE_HOSTNAMES for staging is the workers.dev host only, never localhost", () => {
  const vars = wrangler.slice(
    wrangler.indexOf("[env.staging.vars]"),
    wrangler.indexOf("[[env.staging.ratelimits]]"),
  );
  assert.match(vars, /^TURNSTILE_HOSTNAMES = "bica-staging\.appelgriebsch\.workers\.dev"$/m);
  assert.doesNotMatch(wrangler, /TURNSTILE_HOSTNAMES = "[^"]*(localhost|127\.0\.0\.1|,)/);
  assert.equal(wrangler.match(/TURNSTILE_HOSTNAMES/g).length, 2); // staging + production, not top level
  // never a secret in the repo
  const r = spawnSync(
    "git",
    ["grep", "-nE", 'TURNSTILE_SECRET_KEY *[=:] *"?[0-9A-Za-z]', "--", ".", ":!scripts/*.test.mjs"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(
    r.stdout
      .split("\n")
      .filter((l) => l && !/1x0000|2x0000/.test(l))
      .join("\n"),
    "",
  );
});

const prod = wrangler.slice(wrangler.indexOf("[env.production]"));

test("#8: [env.production] custom domain, stage, CHAT_RATE and DO; no D1, no auth", () => {
  assert.ok(wrangler.indexOf("[env.production]") > wrangler.indexOf("[env.staging]"));
  assert.match(prod, /^\[env\.production\]\nworkers_dev = false\n/);
  assert.match(
    prod,
    /^routes = \[\{ pattern = "bica\.appelgriebsch\.org", custom_domain = true \}\]$/m,
  );
  assert.match(prod, /\[env\.production\.vars\]\nBICA_STAGE = "production"\n/);
  assert.match(prod, /^TURNSTILE_HOSTNAMES = "bica\.appelgriebsch\.org"$/m);
  const rate = prod.match(
    /\[\[env\.production\.ratelimits\]\]\nname = "CHAT_RATE"\nnamespace_id = "(\d+)"\nsimple = \{ limit = 6, period = 60 \}/,
  );
  assert.ok(rate);
  const stagingNs = wrangler.match(
    /\[\[env\.staging\.ratelimits\]\]\nname = "CHAT_RATE"\nnamespace_id = "(\d+)"/,
  )[1];
  assert.notEqual(rate[1], stagingNs);
  assert.match(
    prod,
    /\[\[env\.production\.durable_objects\.bindings\]\]\nname = "CHAT_BUDGET"\nclass_name = "ChatBudget"/,
  );
  assert.doesNotMatch(wrangler, /d1_databases|hyperdrive|DATABASE_URL|BETTER_AUT[H]|GROK_AUT[H]/);
});

test("#52: triggers, build guard, and no push or pull_request", () => {
  assert.match(
    deploy,
    /^on:\n {2}workflow_run:\n {4}workflows: \[CI\]\n {4}types: \[completed\]\n {4}branches: \[main\]\n {2}workflow_dispatch:\n {4}inputs:\n {6}artifact_run_id:/m,
  );
  assert.doesNotMatch(deploy, /^ {2}(push|pull_request|schedule):/m);
  assert.doesNotMatch(deploy, /pull_request/);
  const guard = job("build").slice(
    job("build").indexOf("    if: >-"),
    job("build").indexOf("    permissions:"),
  );
  for (const cond of [
    "github.event_name == 'workflow_dispatch' &&",
    "github.ref == 'refs/heads/main'",
    "github.event.workflow_run.conclusion == 'success'",
    "github.event.workflow_run.event == 'push'",
    "github.event.workflow_run.head_branch == 'main'",
    "github.event.workflow_run.head_repository.full_name == github.repository",
  ]) {
    assert.ok(guard.includes(cond), cond);
  }
});

test("#52: every action is pinned to a 40-hex SHA", () => {
  const uses = deploy.match(/^ *uses:.*$/gm);
  assert.ok(uses?.length);
  for (const line of uses) assert.match(line, /@[0-9a-f]{40}\b/);
});

test("#52: environments are staging, production, and none on build", () => {
  assert.match(job("staging"), /environment:\n {6}name: staging\n/);
  assert.match(job("production"), /environment:\n {6}name: production\n/);
  assert.doesNotMatch(job("build"), /environment:/);
  assert.doesNotMatch(job("staging"), /--env production/);
  assert.doesNotMatch(deploy, /: write\b|id-token/);
  assert.equal(deploy.match(/^\s*permissions:/gm).length, 4);
});

test("#52: staging needs build; production needs staging and build", () => {
  assert.match(job("staging"), /\n {4}needs: build\n/);
  assert.match(job("production"), /\n {4}needs: \[build, staging\]\n/);
});

test("#52: build:cf only in the release build, with BICA_BUILD_SHA", () => {
  assert.match(job("build"), /run: bun run build:cf\n/);
  assert.match(job("build"), /BICA_BUILD_SHA: \$\{\{ steps\.resolve\.outputs\.sha \}\}/);
  assert.doesNotMatch(job("staging") + job("production"), /(?:npm|bun) run build/);
  assert.doesNotMatch(deploy, /PUBLIC_HOSTNAME|VITE_PUBLIC_HOSTNAME/);
});

test("#52: tip of main is checked before each deploy and again after wrangler install", () => {
  for (const name of ["staging", "production"]) {
    const text = job(name);
    const at = text.indexOf('wrangler.js" deploy --env');
    assert.ok(at > 0, name);
    assert.ok(
      text.indexOf("git fetch --no-tags origin main") <
        text.indexOf("Install wrangler from the lockfile"),
    );
    const stepAt = text.indexOf("- name: Deploy bica-");
    assert.ok(text.indexOf("Install wrangler from the lockfile") < stepAt && stepAt < at, name);
    assert.match(text.slice(stepAt, at), /git fetch --no-tags origin main/);
    assert.match(text.slice(stepAt, at), /git rev-parse origin\/main/);
  }
});

test("#52: one bica-worker artifact, 30 days, digest checked in every job", () => {
  assert.match(job("build"), /artifact=bica-worker-\$sha/);
  assert.match(job("build"), /name: \$\{\{ steps\.resolve\.outputs\.artifact \}\}/);
  assert.match(job("staging"), /name: \$\{\{ needs\.build\.outputs\.artifact \}\}/);
  assert.match(job("production"), /name: \$\{\{ needs\.build\.outputs\.artifact \}\}/);
  assert.match(job("build"), /retention-days: 30/);
  for (const name of ["build", "staging", "production"]) {
    assert.match(job(name), /run-id: \$\{\{[^}]+outputs\.run_id \}\}/);
    assert.match(job(name), /github-token: \$\{\{ github\.token \}\}/);
    assert.match(job(name), /artifact sha256:/);
  }
  assert.match(job("staging"), /DIGEST: \$\{\{ needs\.build\.outputs\.digest \}\}/);
  assert.match(job("production"), /DIGEST: \$\{\{ needs\.build\.outputs\.digest \}\}/);
  assert.match(job("staging"), /\[ "\$digest" != "\$DIGEST" \]/);
  assert.match(job("production"), /\[ "\$digest" != "\$DIGEST" \]/);
});

test("#52: wrangler comes from the lockfile; no npx or bunx wrangler deploy", () => {
  for (const name of ["staging", "production"]) {
    const text = job(name);
    assert.match(text, /bun install --frozen-lockfile --ignore-scripts/);
    assert.match(text, /Bun\.JSONC\.parse/);
    assert.match(text, /packages\.wrangler/);
    assert.match(text, /node "\$GITHUB_WORKSPACE\/node_modules\/wrangler\/bin\/wrangler\.js"/);
  }
  assert.doesNotMatch(deploy, /wrangler@/);
  assert.doesNotMatch(deploy, /npm install --prefix/);
  assert.doesNotMatch(deploy, /\$RUNNER_TEMP\/wrangler/);
  assert.doesNotMatch(deploy, /npx wrangler deploy\b/);
  assert.doesNotMatch(deploy, /bunx wrangler deploy\b/);
});

// #56 W-2: the wrangler install + version check runs in the jobs holding the
// Cloudflare token, so each guard must stay fail-closed, not just present.
function wranglerInstall(name) {
  const m = job(name).match(
    /\n {6}- name: Install wrangler from the lockfile\n((?: {8}(?!run: ).*\n)*) {8}run: \|\n((?: {10}.*\n)+)/,
  );
  assert.ok(m, `${name}: Install wrangler from the lockfile step`);
  return { keys: m[1], script: m[2] };
}

test("#56 W-2: the lockfile wrangler install and version check fail closed", () => {
  for (const name of ["staging", "production"]) {
    const { keys, script } = wranglerInstall(name);
    assert.equal(keys, "", `${name}: no extra keys (continue-on-error, if) on the install step`);
    assert.match(script, /^ {10}bun install --frozen-lockfile --ignore-scripts$/m, name);
    assert.equal(script.match(/bun install/g).length, 1, name);
    assert.match(script, /^ {10}version=\$\(bun -e '[^'\n]+'\)$/m, `${name}: version read`);
    assert.ok(
      script.includes(
        [
          '          if ! [[ "$version" =~ ^[0-9]+\\.[0-9]+\\.[0-9]+$ ]]; then',
          `            echo "::error::no wrangler version in bun.lock ('$version')"; exit 1`,
          "          fi",
        ].join("\n"),
      ),
      `${name}: empty or unparseable locked version fails`,
    );
    assert.ok(
      script.includes(
        [
          '          case "$got" in',
          '            *"$version"*) ;;',
          '            *) echo "::error::wrangler $got does not contain $version"; exit 1 ;;',
          "          esac",
        ].join("\n"),
      ),
      `${name}: version mismatch fails`,
    );
    assert.doesNotMatch(script, /\|\| true|\|\| :|set \+e/, name);
  }
  assert.doesNotMatch(deploy, /continue-on-error/);
  const coe = [...ci.matchAll(/continue-on-error/g)];
  assert.equal(coe.length, 1, "ci.yml: only the full-audit report step");
  assert.match(
    ci,
    /- name: Full audit \(report only, #65 optional-peer findings\)\n {8}continue-on-error: true\n {8}run: bun audit\n/,
  );
});

test("#56 W-2: the bun.lock wrangler read returns the installed version; the guard rejects empty", () => {
  const { script } = wranglerInstall("staging");
  const snippet = script.match(/^ {10}version=\$\(bun -e '([^'\n]+)'\)$/m)[1];
  const r = spawnSync("bun", ["-e", snippet], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const installed = JSON.parse(
    readFileSync(join(root, "node_modules/wrangler/package.json"), "utf8"),
  ).version;
  assert.equal(r.stdout.trim(), installed);
  const guard = script.match(/^ {10}if ! \[\[ "\$version" =~ [\s\S]*?^ {10}fi$/m)[0];
  for (const [version, status] of [
    ["", 1],
    ["undefined", 1],
    ["4x.1y.0z", 1],
    ["4.150", 1],
    ["4.150.0\n", 1],
    [installed, 0],
  ]) {
    const g = spawnSync("bash", ["-euo", "pipefail", "-c", guard], {
      env: { ...process.env, version },
      encoding: "utf8",
    });
    assert.equal(g.status, status, `version=${JSON.stringify(version)}: ${g.stdout}`);
  }
});

test("#56 W-1: no dependency install scripts run (bunfig ignoreScripts, empty trustedDependencies)", () => {
  assert.deepEqual(pkg.trustedDependencies, []);
  assert.match(
    readFileSync(join(root, "bunfig.toml"), "utf8"),
    /^\[install\]\nignoreScripts = true$/m,
  );
});

test("#52: artifact_run_id is an env var and never interpolated into a script", () => {
  assert.match(job("build"), /ARTIFACT_RUN_ID: \$\{\{ inputs\.artifact_run_id \}\}/);
  assert.match(job("build"), /bash scripts\/resolve-redeploy\.sh/);
  assert.match(
    readFileSync(join(root, "scripts/resolve-redeploy.sh"), "utf8"),
    /\^\[0-9\]\{1,20\}\$/,
  );
  const runs = deploy.split(/\n {6}run: \|\n/).slice(1);
  for (const block of runs) assert.doesNotMatch(block.split(/\n {6}\S/)[0], /\$\{\{ inputs\./);
  for (const line of deploy.split("\n")) {
    if (!line.includes("${{ inputs.")) continue;
    assert.ok(/run-name:/.test(line) || /ARTIFACT_RUN_ID:/.test(line), line);
  }
});

test("#52/#60: both jobs smoke health for their stage and the expected sha", () => {
  assert.match(job("staging"), /bash scripts\/smoke-health\.sh "\$url" staging "\$SHA"/);
  assert.match(job("production"), /bash scripts\/smoke-health\.sh "\$url" production "\$SHA"/);
});

test("#60: smoke-health.sh keeps the last body and reports it", () => {
  assert.match(smokeHealth, /last=\$body/);
  assert.match(smokeHealth, /::error::.*sha=\$sha.*\(last: \$seen\)/);
  assert.match(smokeHealth, /stage=\$\(jq -r \.stage <<<"\$last"/);
  assert.match(smokeHealth, /no response/);
  assert.match(smokeHealth, /attempts=\$\{SMOKE_ATTEMPTS:-12\}/);
  assert.match(smokeHealth, /pause=\$\{SMOKE_SLEEP:-5\}/);
  assert.match(smokeHealth, /curl --fail-with-body -sS --max-time 10/);
  assert.match(smokeHealth, /^set -euo pipefail$/m);
  assert.match(smokeHealth, /test "\$\(jq -r \.ok <<<"\$body"\)" = true$/m);
});

test(
  "#60: smoke-health.sh behaviour",
  {
    skip:
      spawnSync("bash", ["-c", "command -v jq >/dev/null && command -v curl >/dev/null"]).status !==
      0,
  },
  async () => {
    const A = "a".repeat(40);
    const B = "b".repeat(40);
    const env = { ...process.env, SMOKE_ATTEMPTS: "2", SMOKE_SLEEP: "0" };
    const server = createServer((req, res) => {
      // /down/api/health answers like a Worker without a stage: 503 {"ok":false}.
      const down = req.url.startsWith("/down/");
      const body = JSON.stringify(down ? { ok: false } : { ok: true, stage: "staging", sha: A });
      res.writeHead(down ? 503 : 200, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = server.address().port;
    // execFile, not spawnSync: a sync child blocks this event loop, so the stub never answers.
    const run = (url, sha) =>
      new Promise((resolve) => {
        execFile(
          "bash",
          ["scripts/smoke-health.sh", url, "staging", sha],
          { cwd: root, env, encoding: "utf8" },
          (err, stdout, stderr) => resolve({ status: err ? (err.code ?? 1) : 0, stdout, stderr }),
        );
      });
    try {
      const ok = await run(`http://127.0.0.1:${port}`, A);
      assert.equal(ok.status, 0, ok.stdout + ok.stderr);
      const bad = await run(`http://127.0.0.1:${port}`, B);
      assert.equal(bad.status, 1);
      assert.match(bad.stdout, new RegExp(`sha=${B}`));
      assert.match(bad.stdout, new RegExp(`last: stage=staging sha=${A}`));
      // S-2: a 503 body is kept, so the error shows it instead of "no response".
      const down = await run(`http://127.0.0.1:${port}/down`, A);
      assert.equal(down.status, 1);
      assert.match(down.stdout, /last: stage=null sha=null/);
      assert.doesNotMatch(down.stdout, /last: no response/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
    const closed = createServer();
    await new Promise((resolve) => closed.listen(0, "127.0.0.1", resolve));
    const closedPort = closed.address().port;
    await new Promise((resolve) => closed.close(resolve));
    const none = await run(`http://127.0.0.1:${closedPort}`, A);
    assert.equal(none.status, 1);
    assert.match(none.stdout, /last: no response/);
  },
);

test("#67 S-3: staging and production have no job-level if; the manual-run CI guard is fatal", () => {
  // A job-level `if: always()` would let production run after staging failed.
  assert.doesNotMatch(job("staging"), /^ {4}if:/m);
  assert.doesNotMatch(job("production"), /^ {4}if:/m);
  assert.match(job("build"), /^\s+test "\$conclusion" = success$/m);
  assert.doesNotMatch(job("build"), /test "\$conclusion" = success\s*\|\|/);
});

test("#52: production failure summary says do not re-run and names the rollback", () => {
  const text = job("production");
  const summary = text.slice(text.indexOf("- name: Summary"));
  assert.match(summary, /Do not re-run; roll back/);
  assert.match(summary, /wrangler rollback --env production/);
  assert.match(summary, /steps\.deploy\.outputs\.attempted/);
  const deployCall = text.indexOf('wrangler.js" deploy --env');
  const attempted = text.indexOf('echo "attempted=true" >> "$GITHUB_OUTPUT"');
  assert.ok(attempted > -1 && attempted < deployCall);
  const live = text.indexOf('wrangler.js" deployments list --env production --json');
  assert.ok(live > -1 && live < text.indexOf('wrangler.js" deploy --env'));
});

test("#52: the old deploy workflows are gone", () => {
  assert.equal(existsSync(join(root, ".github/workflows/deploy-staging.yml")), false);
  assert.equal(existsSync(join(root, ".github/workflows/deploy-production.yml")), false);
  const r = spawnSync(
    "git",
    [
      "grep",
      "-n",
      "deploy-staging.yml\\|deploy-production.yml",
      "--",
      ".",
      ":!scripts/cloudflare-config.test.mjs",
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(r.stdout, "");
});

test("#17: docs: wrangler-only rollback, no Vercel fallback; env protection and token", () => {
  const docs = readFileSync(join(root, "docs/cloudflare-workers.md"), "utf8");
  const sec = (h) => docs.slice(docs.indexOf(h), docs.indexOf("\n### ", docs.indexOf(h) + 1) >>> 0);
  const rb = sec("### Rollback");
  assert.match(rb, /wrangler rollback --env production/);
  assert.match(rb, /not only code/);
  assert.match(rb, /Data in Durable Objects is not rolled back/);
  assert.match(rb, /v1-chat-budget/);
  assert.match(rb, /versions view <id> --env production/);
  assert.match(rb, /git diff <sha> main -- wrangler\.toml/);
  assert.match(rb, /Only Worker secrets stay as they are now/);
  assert.doesNotMatch(rb, /code only/);
  assert.match(rb, /no Vercel fallback/i);
  const adr = readFileSync(join(root, "docs/adr/0003-production-workers.md"), "utf8");
  assert.match(adr, /not only code/);
  assert.match(adr, /30 days/);
  assert.doesNotMatch(adr, /code only/);
  assert.doesNotMatch(readFileSync(join(root, "README.md"), "utf8"), /code only/);
  assert.doesNotMatch(rb, /CNAME|Detach|Recreate/);
  assert.match(docs, /must have \*\*both\*\*/);
  assert.match(docs, /\*\*`main` only\*\*/);
  assert.match(docs, /Required reviewers: Andreas/);
  const tok = sec("### Prod API token");
  assert.match(tok, /developers\.cloudflare\.com\/api\/resources\/workers\/subresources\/domains/);
  assert.match(tok, /no DNS Edit and no SSL and Certificates/);
});

// Allowed only in docs/cloudflare-workers.md: the explicit "no Vercel" notes.
function vercelLeftovers(out) {
  return out
    .split("\n")
    .filter(
      (l) =>
        l &&
        !(
          l.startsWith("docs/cloudflare-workers.md:") &&
          (l.includes("There is no Vercel build (#17).") ||
            l.includes("There is no Vercel fallback (#17):"))
        ),
    );
}

test("#17: no Vercel leftovers in src, scripts, package.json, workflows or config", () => {
  const r = spawnSync(
    "git",
    [
      "grep",
      "-nIi",
      "vercel",
      "--",
      "src",
      "scripts",
      "server",
      ".github",
      "package.json",
      "vite.config.ts",
      "eslint.config.mjs",
      "wrangler.toml",
      ".gitignore",
      "docs/cloudflare-workers.md",
      ":!scripts/cloudflare-config.test.mjs",
      ":!scripts/chat.test.mjs",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const leftovers = vercelLeftovers(r.stdout || "");
  assert.equal(leftovers.join("\n"), "", leftovers.join("\n"));
  // mutants: the allowlist applies only to the Workers docs
  assert.deepEqual(vercelLeftovers("src/lib/x.ts:1:// Vercel fallback path (#17)"), [
    "src/lib/x.ts:1:// Vercel fallback path (#17)",
  ]);
  assert.deepEqual(vercelLeftovers("scripts/a.mjs:2:// There is no Vercel build"), [
    "scripts/a.mjs:2:// There is no Vercel build",
  ]);
  assert.deepEqual(
    vercelLeftovers("docs/cloudflare-workers.md:9:There is no Vercel fallback (#17): x"),
    [],
  );
  assert.deepEqual(vercelLeftovers("docs/cloudflare-workers.md:9:Deploy to Vercel"), [
    "docs/cloudflare-workers.md:9:Deploy to Vercel",
  ]);
  // only the two exact phrases: a looser docs mention still fails
  assert.deepEqual(vercelLeftovers("docs/cloudflare-workers.md:9:Vercel fallback is fine (#17)"), [
    "docs/cloudflare-workers.md:9:Vercel fallback is fine (#17)",
  ]);
  assert.deepEqual(
    vercelLeftovers("docs/cloudflare-workers.md:9:There is no Vercel build (#17)."),
    [],
  );
  assert.doesNotMatch(pkg.scripts.build, /vercel/i);
  assert.ok(
    !Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).some((n) => /vercel/i.test(n)),
  );
});

test("prod smoke retries health and GET / ~60 s, tolerates DNS lag, then fails loudly", () => {
  const prodJob = job("production");
  const step = prodJob.slice(prodJob.indexOf("- name: Smoke /api/health and /"));
  assert.match(step, /bash scripts\/smoke-health\.sh "\$url" production "\$SHA"/);
  assert.match(
    smokeHealth,
    /body=\$\(curl --fail-with-body -sS --max-time 10 "\$url\/api\/health" \|\| true\)/,
  );
  assert.match(smokeHealth, /SMOKE_ATTEMPTS:-12/);
  assert.match(smokeHealth, /SMOKE_SLEEP:-5/);
  const loops = step.match(/for i in \$\(seq 1 12\); do/g) ?? [];
  assert.equal(loops.length, 1);
  assert.equal((step.match(/\[ "\$i" -lt 12 \] && sleep 5/g) ?? []).length, 1);
  // GET /: tolerated per attempt, 200 ends the step
  assert.match(
    step,
    /code=\$\(curl -sS -o \/dev\/null -w '%\{http_code\}' --max-time 10 "\$url\/" \|\| true\)/,
  );
  assert.match(step, /\[ "\$code" = 200 \] && \{ echo "GET \/ 200 \(attempt \$i\)"; exit 0; \}/);
  // diagnostics: headers and a truncated body, then fail
  assert.match(step, /curl -sS -D \/tmp\/headers -o \/tmp\/body --max-time 10/);
  assert.match(step, /head -c 2048 \/tmp\/body/);
  assert.match(step, /::error::GET \/ never returned 200[^\n]*\n\s+exit 1/);
  for (const c of step.match(/curl [^\n]*/g)) assert.match(c, /--max-time 10\b/, c);
  for (const c of smokeHealth.match(/curl [^\n]*/g)) assert.match(c, /--max-time 10\b/, c);
  // health (~60 s) plus GET / (~60 s) fits the step and job timeouts
  assert.match(step, /timeout-minutes: 6\b/);
  assert.match(prodJob, /\n {4}timeout-minutes: 20\n/);
  assert.doesNotMatch(step, /secrets\.|TOKEN/);
});

test("#42 W1: PUBLIC_HOSTNAME equals TURNSTILE_HOSTNAMES; the build takes no public host", () => {
  const block = (env) => {
    const start = wrangler.indexOf(`[env.${env}.vars]`);
    const rest = wrangler.slice(start + 1);
    const next = rest.search(/\n\[/);
    return wrangler.slice(start, next === -1 ? undefined : start + 1 + next);
  };
  const pub = (env) => block(env).match(/PUBLIC_HOSTNAME = "([^"]+)"/)[1];
  const tsHost = (env) => block(env).match(/TURNSTILE_HOSTNAMES = "([^"]+)"/)[1];
  assert.equal(pub("staging"), "bica-staging.appelgriebsch.workers.dev");
  assert.equal(pub("production"), "bica.appelgriebsch.org");
  assert.equal(pub("staging"), tsHost("staging"));
  assert.equal(pub("production"), tsHost("production"));
  assert.doesNotMatch(wrangler.slice(0, wrangler.indexOf("[env.staging]")), /PUBLIC_HOSTNAME/);
  // Removed build-time var. This assertion is the only place that name remains.
  assert.doesNotMatch(deploy + ci, /VITE_PUBLIC_HOSTNAME/);
  assert.doesNotMatch(deploy, /PUBLIC_HOSTNAME/);
  assert.match(deploy, /BICA_BUILD_SHA: \$\{\{ steps\.resolve\.outputs\.sha \}\}/);
  assert.match(`https://${pub("staging")}`, /^https:\/\/bica-staging\.[a-z0-9-]+\.workers\.dev$/);
  assert.match(
    job("production"),
    new RegExp(`url=https://${pub("production").replace(/\./g, "\\.")}\n`),
  );
  const grep = spawnSync(
    "git",
    ["grep", "-n", "VITE_PUBLIC_HOSTNAME", "--", ".", ":!scripts/cloudflare-config.test.mjs"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(grep.stdout, "");
});

test("#61: CI build:cf sets PUBLIC_HOSTNAME in a step env, nowhere else in ci.yml", () => {
  const step = ci.match(
    /- run: bun run build:cf\n {8}env:\n(?: {10}#[^\n]*\n)* {10}PUBLIC_HOSTNAME: (\S+)\n/,
  );
  assert.ok(step, "step-level env directly under build:cf");
  assert.ok(
    ["bica.appelgriebsch.org", "bica-staging.appelgriebsch.workers.dev"].includes(step[1]),
    step[1],
  );
  assert.equal(ci.match(/PUBLIC_HOSTNAME/g).length, 1);
});

test("#8: CI dry-runs the production env without a token", () => {
  assert.match(ci, /run: bunx wrangler deploy --dry-run --env production --config wrangler\.toml/);
});

test("#67 W-2: tip and digest guards fail with ::error:: and exit 1", () => {
  const bodies = (text) =>
    [...text.matchAll(/if \[ "\$SHA" != "\$tip" \]; then\n([\s\S]*?)\n *fi/g)].map((m) => m[1]);
  for (const name of ["staging", "production"]) {
    const tip = step(name, "This SHA is still the tip of main");
    const dep = step(name, name === "staging" ? "Deploy bica-staging" : "Deploy bica-production");
    for (const block of [tip, dep]) {
      const found = bodies(block);
      assert.equal(found.length, 1, name);
      const body = found[0];
      assert.match(body, /echo "::error::[^\n]*"\n\s+exit 1/);
      assert.doesNotMatch(body, /\|\| true/);
      assert.doesNotMatch(body, /\btrue\b/);
    }
  }
  for (const name of ["staging", "production"]) {
    const st = step(name, "Verify artifact digest");
    assert.doesNotMatch(st, /\|\| true/);
    for (const cmp of ["DIGEST", "recorded"]) {
      assert.match(
        st,
        new RegExp(
          `if \\[ "\\$digest" != "\\$${cmp}" \\]; then\\n\\s+echo "::error::artifact digest[^\\n]*expected[^\\n]*got[^\\n]*"\\n\\s+exit 1`,
        ),
      );
    }
  }
  const fetched = step("build", "Verify downloaded artifact");
  assert.doesNotMatch(fetched, /\|\| true/);
  assert.match(
    fetched,
    /if \[ "\$digest" != "\$recorded" \]; then\n\s+echo "::error::artifact digest[^\n]*expected[^\n]*got[^\n]*"\n\s+exit 1/,
  );
});

test("#67 W-2: checkouts pin the ref and do not persist credentials", () => {
  const build = job("build");
  assert.match(build, /ref: \$\{\{ steps\.resolve\.outputs\.sha \}\}/);
  assert.match(build, /HEAD_SHA: \$\{\{ github\.event\.workflow_run\.head_sha \}\}/);
  assert.match(build, /sha=\$HEAD_SHA/);
  assert.match(job("staging"), /ref: \$\{\{ github\.sha \}\}/);
  assert.match(job("production"), /ref: \$\{\{ github\.sha \}\}/);
  const steps =
    deploy.match(
      /- (?:if:[^\n]*\n {8})?uses: actions\/checkout@[0-9a-f]{40}[\s\S]*?(?=\n {6}- )/g,
    ) ?? [];
  assert.equal(steps.length, (deploy.match(/uses: actions\/checkout@/g) ?? []).length);
  assert.equal(steps.length, 4);
  for (const s of steps) assert.match(s, /persist-credentials: false/);
});

test(
  "#67 W-2: resolve-redeploy.sh failure behaviour",
  { skip: spawnSync("bash", ["-c", "command -v jq >/dev/null"]).status !== 0 },
  () => {
    const dir = mkdtempSync(join(tmpdir(), "redeploy-"));
    const log = join(dir, "calls");
    const outFile = join(dir, "github_output");
    const gh = join(dir, "gh");
    writeFileSync(
      gh,
      `#!/bin/sh
printf '%s\\n' "$*" >> ${JSON.stringify(log)}
[ "\${1:-}" = api ] || exit 1
case "\${2:-}" in
  repos/o/r/actions/runs/*/artifacts) cat "\${STUB_ARTIFACTS}" ;;
  repos/o/r/actions/runs/*) cat "\${STUB_RUN}" ;;
  repos/o/r/compare/*...main) cat "\${STUB_COMPARE}" ;;
  *) exit 1 ;;
esac
`,
    );
    chmodSync(gh, 0o755);
    const sha = "a".repeat(40);
    const sha2 = "b".repeat(40);
    const baseRun = {
      path: ".github/workflows/deploy.yml",
      head_branch: "main",
      repository: { full_name: "o/r" },
    };
    const one = (name, expired = false) => ({ artifacts: [{ name, expired }] });
    const run = (id, files = {}) => {
      writeFileSync(log, "");
      writeFileSync(outFile, "");
      const paths = {};
      for (const [key, value] of Object.entries(files)) {
        const p = join(dir, `${key}.json`);
        writeFileSync(p, JSON.stringify(value));
        paths[key] = p;
      }
      const r = spawnSync("bash", ["scripts/resolve-redeploy.sh"], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          ARTIFACT_RUN_ID: id,
          REPOSITORY: "o/r",
          GITHUB_OUTPUT: outFile,
          GH_TOKEN: "test",
          STUB_RUN: paths.run ?? "",
          STUB_ARTIFACTS: paths.artifacts ?? "",
          STUB_COMPARE: paths.compare ?? "",
        },
      });
      return {
        status: r.status,
        stdout: r.stdout ?? "",
        stderr: r.stderr ?? "",
        output: readFileSync(outFile, "utf8"),
        calls: readFileSync(log, "utf8"),
      };
    };
    const fail = (id, files = {}) => {
      const r = run(id, files);
      assert.equal(r.status, 1, `${id}\n${r.stdout}${r.stderr}`);
      assert.match(r.stdout + r.stderr, /::error::/);
      return r;
    };
    try {
      const src = readFileSync(join(root, "scripts/resolve-redeploy.sh"), "utf8");
      assert.doesNotMatch(src, /--jq/);
      for (const id of ["12a", "$(id)"]) {
        const r = fail(id);
        assert.equal(r.calls, "", id);
      }
      fail("42", { run: { ...baseRun, path: "nope.yml" } });
      fail("42", { run: { ...baseRun, head_branch: "dev" } });
      fail("42", { run: { ...baseRun, repository: { full_name: "e/r" } } });
      const none = fail("42", { run: baseRun, artifacts: { artifacts: [] } });
      assert.match(none.stdout, /30 days/);
      fail("42", {
        run: baseRun,
        artifacts: {
          artifacts: [
            { name: `bica-worker-${sha}`, expired: false },
            { name: `bica-worker-${sha2}`, expired: false },
          ],
        },
      });
      fail("42", { run: baseRun, artifacts: one(`bica-worker-${sha}`, true) });
      fail("42", { run: baseRun, artifacts: one("not-a-worker") });
      const good = one(`bica-worker-${sha}`);
      for (const status of ["behind", "diverged"]) {
        fail("42", { run: baseRun, artifacts: good, compare: { status } });
      }
      for (const status of ["ahead", "identical"]) {
        const r = run("42", { run: baseRun, artifacts: good, compare: { status } });
        assert.equal(r.status, 0, r.stdout + r.stderr);
        assert.match(r.output, /^mode=redeploy$/m);
        assert.match(r.output, new RegExp(`^sha=${sha}$`, "m"));
        assert.match(r.output, new RegExp(`^artifact=bica-worker-${sha}$`, "m"));
        assert.match(r.output, /^run_id=42$/m);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
