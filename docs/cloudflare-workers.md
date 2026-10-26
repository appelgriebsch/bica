# Cloudflare Workers (staging and production)

Bica’s staging host is a **Cloudflare Worker**, not Cloudflare Pages.

[hiato](https://github.com/appelgriebsch/hiato) is a static Vite PWA on Pages. Pages has no named non-production environment, so hiato calls that surface `preview` while the binding value is still `HIATO_STAGE=staging`. Bica is a TanStack Start server (Nitro). Pages cannot run it. The Worker environment is named `staging` on purpose — do not rename it back to `preview`.

|                      |                                                        |
| -------------------- | ------------------------------------------------------ |
| Worker name          | `bica`                                                 |
| Wrangler environment | `staging`                                              |
| Script name          | `bica-staging` (Wrangler appends the environment name) |
| Public URL           | `https://bica-staging.<account-subdomain>.workers.dev` |
| Stage binding        | `BICA_STAGE=staging`                                   |

Account id comes from `wrangler login` or `CLOUDFLARE_ACCOUNT_ID`. It is not committed.

## Health

`GET /api/health`

- `BICA_STAGE=staging` → `200` `{ "ok": true, "stage": "staging", "sha": "<full sha>" }` and `cache-control: no-store`
- `BICA_STAGE=production` → `200` `{ "ok": true, "stage": "production", "sha": "<full sha>" }` (#8)
- missing, blank, or any other value → `503` `{ "ok": false }` (no sha)

The handler touches no secrets.

## Secrets and what works without them

Set Worker secrets with `wrangler secret put <NAME> --env staging` (never in `wrangler.toml`). The server reads them from `process.env`: `nodejs_compat` with this compatibility date populates it from vars and secrets. There is no sign-in and no database since #33 ([ADR 0002 addendum](adr/0002-d1-database.md)): progress stays in the browser.

| Name                                            | Where                                | Needed for                                                                                                               |
| ----------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `XAI_API_KEY`                                   | Worker secret                        | Conversas (speak practice chat). Without it `sendChat` answers "Practice chat is unavailable right now." |
| `TURNSTILE_SECRET_KEY`                          | Worker secret                        | Conversas (#35): `siteverify` for the Turnstile token. Without it chat fails closed ("unavailable"). |
| `CHAT_SESSION_SECRET`                           | Worker secret                        | Conversas (#35): HMAC key of the `bica_chat` session cookie. Must be at least 32 bytes; generate it with `openssl rand -base64 32`. Missing or shorter → chat is unavailable (fails closed). |
| `TURNSTILE_SITE_KEY`                            | Committed, public (`src/lib/turnstile-keys.mjs`) | Conversas (#35): the staging widget key `0x4AAAAAAFWlhnYXXvgEtMvS`, baked into the client by `build:cf`. Dev and other builds use Cloudflare's test site key. Nothing to set. |
| `TURNSTILE_HOSTNAMES`                           | Plain var, `[env.staging.vars]` (committed) | Conversas (#35): comma-separated hostnames siteverify may report. Staging: `bica-staging.appelgriebsch.workers.dev` only, never localhost. Empty → every token fails. |
| `PUBLIC_HOSTNAME`                               | Plain var, `[env.staging.vars]` and `[env.production.vars]` | og:image and the manifest id (#51). Staging: `bica-staging.appelgriebsch.workers.dev`. Production: `bica.appelgriebsch.org`. Unset at the top level, so local preview falls back to the request host. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub environment secrets (`staging` and `production`, #50), never repository secrets | Required. `wrangler deploy` in the Deploy workflow. Token scopes: below. |

`BICA_STAGE` and `PUBLIC_HOSTNAME` are plain vars in `[env.*.vars]`, read at runtime (Worker binding, then `process.env`). The build does not take a public host, so one `build:cf` artifact serves both stages. `BICA_BUILD_SHA`, when set, is stamped into that artifact (`__BICA_BUILD_SHA_FULL__`); otherwise the build uses git HEAD, then `GITHUB_SHA`, then `dev`. `VITE_STUN_URLS`, if set, is still build-time. There is no grok.me publish path (#17).

## Conversas protection (#35)

Chat has no identity, so `sendChat` is protected anonymously. Order per turn: key/secret present → Turnstile gate → per-IP burst → daily caps → xAI. Nothing before xAI is skipped, and a refused turn never reaches xAI.

- **Turnstile.** The first line of a conversation carries a token from the explicitly rendered widget (action `chat`, reset after every request so tokens are single-use). `sendChat` follows Cloudflare's canonical siteverify: an empty or >2048-char token never reaches siteverify; it POSTs form-encoded `secret`, `response` and `remoteip` (CF-Connecting-IP) with a 10 s timeout; a fetch error or non-OK response fails; it requires `success === true`, `action === "chat"` and a `hostname` in `TURNSTILE_HOSTNAMES`. A replayed token (`timeout-or-duplicate`) is refused. A pass sets `bica_chat`, an HttpOnly, Secure, SameSite=Strict cookie signed with `CHAT_SESSION_SECRET`, valid 30 min and for 10 turns, and bound to the client's IP (a hash of its IPv4 address or IPv6 /64 is inside the signed payload; from another IP it's refused and a new solve is needed). A turn refused by the burst or daily limit neither renews the cookie nor spends one of its turns. Remaining replay bound: from the same IP an older cookie can be replayed until it expires (≤ 30 min), still subject to the limits. Then the server asks for a new token. No token and no valid cookie → **403** `challenge_required`.
- **Per-IP burst.** The Rate Limiting binding `CHAT_RATE` (6 turns per 60 s), keyed by `CF-Connecting-IP` only (IPv6 truncated to /64; `X-Forwarded-For` and `x-real-ip` are never read, missing → `unknown`) → **429** `retry-after: 60`. Without the binding (local / tests) the same limit runs per isolate in memory.
- **Daily caps.** The Durable Object `ChatBudget` (binding `CHAT_BUDGET`, one global instance, SQLite-backed, migration tag `v1-chat-budget`) holds a global counter (`CHAT_DAILY_GLOBAL`, default 2000, the hard cost ceiling) and per-IP counters (`CHAT_DAILY_PER_IP`, default 60). Both reset at 00:00 UTC → **429** with `retry-after` to midnight. The DO serializes every take, so the global cap holds under concurrent requests. Without the binding the same logic runs per isolate in memory. Override the defaults with plain vars in `[env.<name>.vars]` (positive integers).
- The CSP allows exactly one third-party origin for this, `https://challenges.cloudflare.com`, in `script-src`, `frame-src` and `connect-src`.
- Keeps #13's 20 s xAI timeout and input caps (16 messages, 2000 chars each, 8000 total).

Local dev and tests use Cloudflare's [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/) (site key `1x00000000000000000000AA`; put `TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA`, any `CHAT_SESSION_SECRET` and your own `TURNSTILE_HOSTNAMES` in your shell or the git-ignored `.dev.vars`; never commit real ones). Note: test-key siteverify answers report `hostname: "example.com"` and no `action`, so the strict action check refuses them; unit tests mock siteverify instead.

### Ops checklist per environment

Staging: the widget exists and its site key is committed. Andreas sets exactly these Worker secrets (never in the repo, never logged):

1. `wrangler secret put TURNSTILE_SECRET_KEY --env staging` (the widget's secret)
2. `wrangler secret put CHAT_SESSION_SECRET --env staging` (32+ random bytes, e.g. `openssl rand -base64 32`)
3. `wrangler secret put XAI_API_KEY --env staging`, only if it isn't set yet

Nothing to do for the Durable Object: the first `wrangler deploy --env staging` applies migration `v1-chat-budget`. The widget's domain list must include `bica-staging.appelgriebsch.workers.dev`.

Production: see [Production (#8)](#production-8) below.

Without any secrets, staging serves `/api/health`, every app page, the precached offline shell, and text-to-speech (Web Speech runs in the browser). Lessons, review, streak and the level floor are stored in `localStorage` only.

## No database

The D1 binding and its CI provisioning were removed in #33. `migrations/` stays in the repo as history of what staging's old `bica-staging` D1 database got; nothing applies it any more. That database is no longer bound and can be deleted by hand (`wrangler d1 delete bica-staging`). #36 reintroduces a database only if it's built.

### API token scopes

Create the token from the **Edit Cloudflare Workers** template, scoped to the one account, then make sure it has:

- Account › **Workers Scripts › Edit** (deploy, secrets, the workers.dev subdomain toggle).
- Account › **Account Settings › Read** (wrangler's account lookup). This is probably unnecessary because `CLOUDFLARE_ACCOUNT_ID` is set, so wrangler doesn't need to look the account up. Untested: try dropping it once a real run has succeeded.

The workflow passes the token and account id only to steps that call wrangler, never at job level. A token made before #33 may still carry D1 › Edit; it is no longer needed.

Remove what the template adds that bica doesn't use (KV, R2, Pages, and the zone permissions). Staging has no routes, so it needs no zone access. Production's token is separate; see [Prod API token](#prod-api-token).

The repo pins Node 22 (`.nvmrc`, `engines` with `engine-strict=true`, so `npm ci` refuses another major). The wrangler CLI needs it too. With an older Node on the PATH, run `npx -y node@22 node_modules/wrangler/bin/wrangler.js …`.

## Deploy

Only these paths publish:

- locally, staging: `npm run deploy:staging` (`build:cf`, then `wrangler deploy --env staging --config wrangler.toml`), with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exported
- GitHub Actions: `.github/workflows/deploy.yml` (workflow name `Deploy`)

`.github/workflows/ci.yml` (job **`CI`**, the required check) runs on every pull request to `main` and every push to `main`, on the Node version in `.nvmrc` (22) with the npm cache. It runs `npm ci`, `npm audit --omit=dev --audit-level=high`, typecheck, lint, `npm test`, `npm run deps:check`, `npm run licenses:check`, `npm run build`, `npm run build:cf`, the built-output tests on the Worker bundle (`BICA_BUILT=1 DEPLOY_TARGET=cloudflare npm test`), then `wrangler deploy --dry-run --env staging --config wrangler.toml` (bundling, bindings and assets; no token). It has no secrets and `contents: read`. Concurrency is one group per PR number, or per commit SHA on main, with cancel-in-progress only for pull_request, so a newer push cancels an older run of the same PR and every main push gets its own CI run (which starts Deploy via `workflow_run`). CI also runs `wrangler deploy --dry-run --env production` (no token).

`deploy.yml` runs when `CI` completes on `main` (`workflow_run`), and only if that run concluded `success`, was a `push` (not a pull request), and came from `main` of this repository (not a fork). A manual `workflow_dispatch` is accepted only from `main`. `workflow_run` always uses this file from the default branch, so a pull request cannot change the deploy or see its secrets. A failed deploy does not turn the required `CI` check red. There is no `push` or `pull_request` trigger. `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` are GitHub **environment** secrets on `staging` and `production` (#50), never repository secrets, and are passed only to steps that call wrangler.

Jobs:

1. **build** (no environment, no secrets, 15 minute timeout). Release mode checks out the CI-tested sha (`workflow_run` head sha, or the dispatched sha). A manual run with no `artifact_run_id` requires the newest `CI` check run of that sha to be `success`. It runs `npm ci` and `npm run build:cf` with `BICA_BUILD_SHA`. The build is stage-neutral: the public host is a Worker var at runtime, not a build input. It packs `.output` and `wrangler.toml` as artifact `bica-worker-<sha>`, kept 30 days, and logs the tarball sha256. Redeploy mode (dispatch input `artifact_run_id`) does not build. It downloads that earlier run's artifact. The run must be Deploy, on `main`, of this repository; exactly one non-expired artifact must be named `bica-worker-<40 hex>`; and that sha must already be on `main`'s history (`compare` status `identical` or `ahead`).
2. **staging** (environment `staging`, concurrency group `deploy-staging`, `cancel-in-progress: false`, 20 minute timeout). Checks out this workflow's own revision, because `scripts/smoke-health.sh` and `package-lock.json` have to exist even when the artifact's commit is older. Before any Cloudflare call it refuses a release deploy unless the sha is still the tip of `origin/main`, checks again after installing wrangler from the lockfile (`npm ci --ignore-scripts` in this checkout; wrangler then runs on the unpacked artifact), and deploys `--env staging`. A rollback redeploy skips the tip check. It downloads the same artifact, checks the sha256 against the build job's digest and the `.sha256` file, smokes `/api/health` (`stage` and `sha`) and the security headers (HEAD and GET on `/` and `/me`, including the CSP's Turnstile `frame-src`). The step summary says whether to approve.
3. **production** (environment `production`, concurrency group `deploy-production`, `cancel-in-progress: false`, 20 minute timeout) runs only after staging succeeds and a required reviewer approves. It repeats the tip check after approval and again immediately before a release deploy. It downloads the same artifact, checks the same digest, records the live production version, deploys `--env production`, then smokes `/api/health` and `/`. The step summary says what was published, or how to roll back.

Every job logs `artifact sha256: <digest>`. Two deploys never cancel each other.

### Branch ruleset on `main` (repo admin, not in the repo)

Settings → Rules → Rulesets → New branch ruleset: target the default branch, enforcement Active. Require a pull request (0 approvals), and require the status check **`CI`** (GitHub Actions) with "require branches to be up to date". Block force pushes, restrict deletions, and leave the bypass list empty (adding "Repository admin" is the optional escape hatch).

`npm run build` / `build:cf` is Nitro preset `cloudflare-module` (module syntax, `nodejs_compat`) plus precache and the Worker entry. Dev stays on `0.0.0.0:8080` with Nitro off. There is no Vercel build (#17).

There is no `deploy` script. Top-level `wrangler deploy` (no `--env`) is not wired. The top-level Wrangler config sets `workers_dev = false`, has no routes, and does not set `BICA_STAGE` or `PUBLIC_HOSTNAME`, so an accidental publish has no public hostname and health fails closed.

Nitro may write `.output/server/wrangler.json` and warn that `main` / `assets` in that generated file are overridden. Deploy with `--config wrangler.toml` so `[env.staging]` from the root file is the config that ships. Do not let a generated file replace the root config.

`build:cf` runs `scripts/precache.mjs` on `.output/public` (so `sw.js` gets the build's `VERSION`, the full `PRECACHE` list and `/_shell`), then writes `.output/server/staging-entry.mjs`, which re-exports only the default fetch handler from `.output/server/index.mjs` plus the `ChatBudget` Durable Object class (#35, from a copy of `src/lib/chat-budget.mjs` as `chat-budget-do.mjs`). The Nitro bundle also has named exports; Workers would treat those as handlers and refuse to start. Wrangler `main` points at that generated entry. All of these paths come from the `cloudflare-module` entry in `scripts/build-output.mjs`.

`public/_headers` serves `/_shell` as `text/html` and both `/_shell` and `/sw.js` with `cache-control: no-cache`; Nitro appends the immutable `/assets/*` rule. `wrangler.toml` sets `html_handling = "none"` and `not_found_handling = "none"`, so files are served at their exact paths and unknown paths reach the Worker.

`DEPLOY_TARGET=cloudflare node scripts/offline-smoke.mjs` runs the offline smoke on the Cloudflare output (served by Node, not workerd).

## Security headers (#28)

- Every Worker response gets HSTS (no `preload` yet), `X-Frame-Options: DENY`, `Referrer-Policy`, `nosniff`, `Permissions-Policy` and `COOP: same-origin` (no sign-in popup since #33; `server/middleware/00-security-headers.ts`). Static assets get the same set from `public/_headers` (`/*`).
- HTML gets a per-request nonce CSP, set by the router (`src/lib/csp-nonce.ts`, policy in `src/lib/security-headers.mjs`). It is `Content-Security-Policy-Report-Only` until the Worker var `CSP_ENFORCE=1` is set; reports go to `/api/csp-report` (logged, not stored). Switch to enforce after a staging pass with no unexpected reports.
- `/_shell` is a static file, so it has the static headers but no CSP (a nonce can't be baked into it).

## Production (#8)

[ADR 0003](adr/0003-production-workers.md). `[env.production]` in `wrangler.toml`: script `bica-production`, `workers_dev = false`, custom domain `bica.appelgriebsch.org`, `BICA_STAGE=production`, `PUBLIC_HOSTNAME=bica.appelgriebsch.org`, `TURNSTILE_HOSTNAMES=bica.appelgriebsch.org`, plus

```toml
[[env.production.ratelimits]]
name = "CHAT_RATE"
namespace_id = "1302"
simple = { limit = 6, period = 60 }

[[env.production.durable_objects.bindings]]
name = "CHAT_BUDGET"
class_name = "ChatBudget"
```

The top-level `[[migrations]]` (`v1-chat-budget`) apply on the first prod deploy. No database binding and no sign-in secrets (#33).

### Deploy

Production is the `production` job of `.github/workflows/deploy.yml` (see [Deploy](#deploy) above). Approval is the `production` environment.

**The workflow's `main` check is not the protection.** A dispatch from another branch runs that branch's copy of the workflow, which can drop the check. What actually guards prod is the `production` environment, and it must have **both**:

1. Deployment branches and tags: **`main` only** (so no other ref can use the environment or its secrets), and
2. **Required reviewers: Andreas**, ideally with "Prevent self-review" enabled.

Without both, anyone with write access could deploy prod from a branch.

### Settings Andreas sets (never in the repo, never logged)

| Name | Where | Notes |
| --- | --- | --- |
| `XAI_API_KEY` | Worker secret | `npx wrangler secret put XAI_API_KEY --env production` |
| `TURNSTILE_SECRET_KEY` | Worker secret | The (shared staging) widget's secret. `npx wrangler secret put TURNSTILE_SECRET_KEY --env production` |
| `CHAT_SESSION_SECRET` | Worker secret | ≥ 32 bytes, its own value (not staging's): `openssl rand -base64 32`, then `npx wrangler secret put CHAT_SESSION_SECRET --env production` |
| Turnstile widget hostnames | Cloudflare dashboard | Add `bica.appelgriebsch.org` to the widget whose site key is committed |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub environment secrets (`production`, #50), never repository secrets | Prod-only token, below |
| Deployment branches `main` only + required reviewer Andreas | GitHub `production` environment | Both required (see Deploy) |
| `CHAT_DAILY_GLOBAL`, `CHAT_DAILY_PER_IP`, `CSP_ENFORCE` | Optional plain vars | Defaults 2000 / 60; CSP stays Report-Only unless `CSP_ENFORCE=1` |

`wrangler secret put` against a script that doesn't exist yet creates it, so the secrets can be set before the first deploy.

### Prod API token

Per Cloudflare's docs, the minimum is:

- Account › **Workers Scripts › Edit**. Wrangler attaches a custom domain through the account-level Worker domains API, whose only accepted permission is Workers Scripts Write ([Attach Worker Domain](https://developers.cloudflare.com/api/resources/workers/subresources/domains/methods/update/)). Cloudflare then creates the DNS record and issues the certificate itself ([Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)), so the token needs **no DNS Edit and no SSL and Certificates** permission.
- Zone › **Zone › Read**, on `appelgriebsch.org` only. Not listed for the domain API; a cheap read-only safety net for wrangler's zone lookups. Drop it if a real run succeeds without it.
- **No** Workers Routes Edit (there are no `/*` routes, only a custom domain), no D1, no Account Settings Read (the account id is set). Permission names: [API token permissions](https://developers.cloudflare.com/fundamentals/api/reference/permissions/).

Harden it: give it an expiry (TTL, e.g. 90 days, and rotate). Client IP filtering doesn't fit GitHub-hosted runners (their IPs change); use it only with a self-hosted runner. The zone must be on this Cloudflare account.

### Cutover

Done in #8 / #40: DNS for `bica.appelgriebsch.org` now points at the Workers custom domain. Progress stayed on the device under the same origin, so localStorage was kept. **If the prod hostname ever changes, users must export on the old origin and import on the new one (#34).**

### Rollback

A Worker version captures the bundled code, static assets, bindings and compatibility settings ([Versions & deployments](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/)). Storage state (KV, R2, Durable Objects, D1) is not part of a version. A rollback immediately creates a new deployment of the chosen version; connected resources are not changed ([Rollbacks](https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/)). A data-shape change can break older code. Only the 100 most recent versions can be targeted. Rollbacks are not allowed across a Durable Object class lifecycle change (`[[migrations]]`) or to a version bound to a deleted R2, KV or queue resource. `wrangler secret put` creates a new version. Progress on devices is unchanged.

(a) On a machine with a production token, list versions and re-activate one:

```
npx wrangler deployments list --env production
npx wrangler rollback --env production [version-id] --message "..."
```

`wrangler rollback` re-activates an earlier **version**: that version's code, assets, vars and other bindings and compatibility settings, not only code. Data in Durable Objects is not rolled back. Secrets are versioned too (each `secret put` creates a version), so after a rollback check `npx wrangler versions view <id> --env production` and re-put a secret if it was rotated since. Blocked to any version from before a DO migration (`v1-chat-budget` or any later tag).

(b) Redeploy a known-good artifact (kept 30 days). Actions → Deploy → Run workflow, branch `main`, `artifact_run_id` = the run id of the last good Deploy run. `artifact_run_id` must be a Deploy run that built the artifact (a release run), not an earlier redeploy run; artifacts expire after 30 days. That redeploys those bytes to staging, then waits for production approval. Reject the approval to stop at staging.

The redeploy is a new `wrangler deploy` of that run's `.output` **and that commit's `wrangler.toml`**, so its `[env.*.vars]`, routes/`workers_dev`, `compatibility_date`, ratelimit and DO bindings and `[[migrations]]` come back too. Only Worker secrets stay as they are now. Before redeploying, compare `git diff <sha> main -- wrangler.toml`. Never redeploy across a DO migration (an older config missing a newer migration tag can fail or misbehave); fix forward instead.

(c) Staging drill: deploy A, deploy B, redeploy A via (b) and reject production, check staging `/api/health` sha is A, then redeploy B.

| step          | run id                       |
| ------------- | ---------------------------- |
| deploy A      | TBD (filled after the drill) |
| deploy B      | TBD (filled after the drill) |
| rollback to A | TBD (filled after the drill) |
| re-deploy B   | TBD (filled after the drill) |

There is no Vercel fallback (#17): a DNS flip back to another platform is not a supported path.

## Deferred

Prod deploy-on-push and redirects onto or off `*.workers.dev` are out of scope. No production database (ADR 0002 addendum). No `_redirects`.
