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

- `BICA_STAGE=staging` → `200` `{ "ok": true, "stage": "staging" }` and `cache-control: no-store`
- `BICA_STAGE=production` → `200` `{ "ok": true, "stage": "production" }` (#8)
- missing, blank, or any other value → `503` `{ "ok": false }`

The handler touches no secrets.

## Secrets and what works without them

Set Worker secrets with `wrangler secret put <NAME> --env staging` (never in `wrangler.toml`). The server reads them from `process.env`: `nodejs_compat` with this compatibility date populates it from vars and secrets, which is the same path the Vercel build uses. There is no sign-in and no database since #33 ([ADR 0002 addendum](adr/0002-d1-database.md)): progress stays in the browser.

| Name                                            | Where                                | Needed for                                                                                                               |
| ----------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| `XAI_API_KEY`                                   | Worker secret                        | Conversas (speak practice chat). Without it `sendChat` answers "Practice chat is unavailable right now." |
| `TURNSTILE_SECRET_KEY`                          | Worker secret                        | Conversas (#35): `siteverify` for the Turnstile token. Without it chat fails closed ("unavailable"). |
| `CHAT_SESSION_SECRET`                           | Worker secret                        | Conversas (#35): HMAC key of the `bica_chat` session cookie. Must be at least 32 bytes; generate it with `openssl rand -base64 32`. Missing or shorter → chat is unavailable (fails closed). |
| `TURNSTILE_SITE_KEY`                            | Committed, public (`src/lib/turnstile-keys.mjs`) | Conversas (#35): the staging widget key `0x4AAAAAAFWlhnYXXvgEtMvS`, baked into the client by `build:cf`. Dev and other builds use Cloudflare's test site key. Nothing to set. |
| `TURNSTILE_HOSTNAMES`                           | Plain var, `[env.staging.vars]` (committed) | Conversas (#35): comma-separated hostnames siteverify may report. Staging: `bica-staging.appelgriebsch.workers.dev` only, never localhost. Empty → every token fails. |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub `staging` environment secrets | Required. `wrangler deploy` in CI. Token scopes: below.                                                                  |

`BICA_STAGE=staging` is a plain var in `[env.staging.vars]`. `VITE_*` values (`VITE_PUBLIC_HOSTNAME`, `VITE_STUN_URLS`) are build-time: set them in the build environment, not as Worker secrets.

## Conversas protection (#35)

Chat has no identity, so `sendChat` is protected anonymously. Order per turn: key/secret present → Turnstile gate → per-IP burst → daily caps → xAI. Nothing before xAI is skipped, and a refused turn never reaches xAI.

- **Turnstile.** The first line of a conversation carries a token from the explicitly rendered widget (action `chat`, reset after every request so tokens are single-use). `sendChat` follows Cloudflare's canonical siteverify: an empty or >2048-char token never reaches siteverify; it POSTs form-encoded `secret`, `response` and `remoteip` (CF-Connecting-IP) with a 10 s timeout; a fetch error or non-OK response fails; it requires `success === true`, `action === "chat"` and a `hostname` in `TURNSTILE_HOSTNAMES`. A replayed token (`timeout-or-duplicate`) is refused. A pass sets `bica_chat`, an HttpOnly, Secure, SameSite=Strict cookie signed with `CHAT_SESSION_SECRET`, valid 30 min and for 10 turns, and bound to the client's IP (a hash of its IPv4 address or IPv6 /64 is inside the signed payload; from another IP it's refused and a new solve is needed). A turn refused by the burst or daily limit neither renews the cookie nor spends one of its turns. Remaining replay bound: from the same IP an older cookie can be replayed until it expires (≤ 30 min), still subject to the limits. Then the server asks for a new token. No token and no valid cookie → **403** `challenge_required`.
- **Per-IP burst.** The Rate Limiting binding `CHAT_RATE` (6 turns per 60 s), keyed by `CF-Connecting-IP` (IPv6 truncated to /64; `x-real-ip` only when CF's header is missing, `X-Forwarded-For` is never read, missing → `unknown`) → **429** `retry-after: 60`. Without the binding (dev, Vercel) the same limit runs per isolate in memory.
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

The workflow passes the token and account id only to the deploy step, never at job level. A token made before #33 may still carry D1 › Edit; it is no longer needed.

Remove what the template adds that bica doesn't use (KV, R2, Pages, and the zone permissions). Staging has no routes, so it needs no zone access. Only a production Worker with routes or a custom domain (#8) would need Zone › **Workers Routes › Edit** and Zone › **Zone › Read** (plus Zone › **DNS › Edit** for custom domains), and that belongs on its own prod token.

The repo pins Node 22 (`.nvmrc`, `engines` with `engine-strict=true`, so `npm ci` refuses another major). The wrangler CLI needs it too. With an older Node on the PATH, run `npx -y node@22 node_modules/wrangler/bin/wrangler.js …`.

## Deploy

Only these two paths publish, and both pass `--env staging`:

- locally: `npm run deploy:staging` (`build:cf`, then `wrangler deploy --env staging --config wrangler.toml`), with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exported
- CI: after the `CI` workflow succeeds for a push to `main` (`workflow_run`), or by hand (`workflow_dispatch`), in `.github/workflows/deploy-staging.yml`

`.github/workflows/ci.yml` (job **`CI`**, the required check) runs on every pull request to `main` and every push to `main`, on the Node version in `.nvmrc` (22) with the npm cache. It runs `npm ci`, typecheck, lint, `npm test`, `npm run deps:check`, `npm run build`, `npm run build:cf`, the built-output tests on the Worker bundle (`BICA_BUILT=1 DEPLOY_TARGET=cloudflare npm test`), then `wrangler deploy --dry-run --env staging --config wrangler.toml` (bundling, bindings and assets; no token). It has no secrets and `contents: read`, and a newer push cancels the older run of the same ref.

The staging deploy (GitHub environment `staging`, 15 minute timeout) starts from `workflow_run` when `CI` completes on `main`, and runs only if that run concluded `success`, was a `push` (not a PR), and came from `main` of this repository (not a fork). A manual run is accepted only from `main`. It checks out exactly the CI-tested `head_sha`. A manual `workflow_dispatch` run first checks that the `CI` check run of its sha succeeded and stops otherwise. Then: `npm ci`, `npm run build:cf` (the release build, with the committed staging Turnstile site key; no test, lint or deps steps, since CI ran them for this sha), `wrangler deploy`, `GET /api/health` on the deployed URL (200, `stage: "staging"`), then the security-header smoke (HEAD and GET on `/` and `/me`, including the CSP's Turnstile `frame-src`). Every step runs under `bash -euo pipefail`, so any failure stops the job before deploy. `workflow_run` always uses the workflow file from the default branch, which keeps the deploy secrets out of anything a pull request can change. A failed deploy doesn't turn the required `CI` check red. Deploys share the fixed concurrency group `deploy-staging` with `cancel-in-progress: false`: two quick merges deploy one after the other, and neither is cancelled mid-deploy.

### Branch ruleset on `main` (repo admin, not in the repo)

Settings → Rules → Rulesets → New branch ruleset: target the default branch, enforcement Active. Require a pull request (0 approvals), and require the status check **`CI`** (GitHub Actions) with "require branches to be up to date". Block force pushes, restrict deletions, and leave the bypass list empty (adding "Repository admin" is the optional escape hatch).

`npm run build` is Nitro preset `vercel` plus precache. `DEPLOY_TARGET=cloudflare` selects Nitro’s `cloudflare-module` preset (module syntax, `nodejs_compat`). Dev stays on `0.0.0.0:8080` with Nitro off.

There is no `deploy` script. Top-level `wrangler deploy` (no `--env`) is not wired. The top-level Wrangler config sets `workers_dev = false`, has no routes, and does not set `BICA_STAGE`, so an accidental publish has no public hostname and health fails closed.

Nitro may write `.output/server/wrangler.json` and warn that `main` / `assets` in that generated file are overridden. Deploy with `--config wrangler.toml` so `[env.staging]` from the root file is the config that ships. Do not let a generated file replace the root config.

`build:cf` runs `scripts/precache.mjs` on `.output/public` (so `sw.js` gets the build's `VERSION`, the full `PRECACHE` list and `/_shell`), then writes `.output/server/staging-entry.mjs`, which re-exports only the default fetch handler from `.output/server/index.mjs` plus the `ChatBudget` Durable Object class (#35, from a copy of `src/lib/chat-budget.mjs` as `chat-budget-do.mjs`). The Nitro bundle also has named exports; Workers would treat those as handlers and refuse to start. Wrangler `main` points at that generated entry. All of these paths come from the `cloudflare-module` entry in `scripts/build-output.mjs`.

`public/_headers` serves `/_shell` as `text/html` and both `/_shell` and `/sw.js` with `cache-control: no-cache`; Nitro appends the immutable `/assets/*` rule. `wrangler.toml` sets `html_handling = "none"` and `not_found_handling = "none"`, so files are served at their exact paths and unknown paths reach the Worker.

`DEPLOY_TARGET=cloudflare node scripts/offline-smoke.mjs` runs the offline smoke on the Cloudflare output (served by Node, not workerd).

## Security headers (#28)

- Every Worker response gets HSTS (no `preload` yet), `X-Frame-Options: DENY`, `Referrer-Policy`, `nosniff`, `Permissions-Policy` and `COOP: same-origin` (no sign-in popup since #33; `server/middleware/00-security-headers.ts`). Static assets get the same set from `public/_headers` (`/*`).
- HTML gets a per-request nonce CSP, set by the router (`src/lib/csp-nonce.ts`, policy in `src/lib/security-headers.mjs`). It is `Content-Security-Policy-Report-Only` until the Worker var `CSP_ENFORCE=1` is set; reports go to `/api/csp-report` (logged, not stored). Switch to enforce after a staging pass with no unexpected reports.
- `/_shell` is a static file, so it has the static headers but no CSP (a nonce can't be baked into it).

## Production (#8)

[ADR 0003](adr/0003-production-workers.md). `[env.production]` in `wrangler.toml`: script `bica-production`, `workers_dev = false`, custom domain `bica.appelgriebsch.org`, `BICA_STAGE=production`, `TURNSTILE_HOSTNAMES=bica.appelgriebsch.org`, plus

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

Only `.github/workflows/deploy-production.yml`, run by hand (`workflow_dispatch`) from `main`. The `gate` job (no secrets) requires the sha's newest `CI` check run to be `success`; the `deploy` job runs in the `production` GitHub environment (required reviewers, so approval comes before any Cloudflare call), checks out exactly that sha, runs `npm ci`, `build:cf` (with `VITE_PUBLIC_HOSTNAME=bica.appelgriebsch.org`), `wrangler deploy --env production`, then smoke-tests `/api/health` (`stage: "production"`) and `/`. Concurrency group `deploy-production`, never cancelled. CI runs `wrangler deploy --dry-run --env production` (no token).

### Settings Andreas sets (never in the repo, never logged)

| Name | Where | Notes |
| --- | --- | --- |
| `XAI_API_KEY` | Worker secret | `npx wrangler secret put XAI_API_KEY --env production` |
| `TURNSTILE_SECRET_KEY` | Worker secret | The (shared staging) widget's secret. `npx wrangler secret put TURNSTILE_SECRET_KEY --env production` |
| `CHAT_SESSION_SECRET` | Worker secret | ≥ 32 bytes, its own value (not staging's): `openssl rand -base64 32`, then `npx wrangler secret put CHAT_SESSION_SECRET --env production` |
| Turnstile widget hostnames | Cloudflare dashboard | Add `bica.appelgriebsch.org` to the widget whose site key is committed |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` | GitHub `production` environment secrets | Prod-only token, below |
| Required reviewers | GitHub `production` environment | Andreas; deployment branches: `main` only |
| `CHAT_DAILY_GLOBAL`, `CHAT_DAILY_PER_IP`, `CSP_ENFORCE` | Optional plain vars | Defaults 2000 / 60; CSP stays Report-Only unless `CSP_ENFORCE=1` |

`wrangler secret put` against a script that doesn't exist yet creates it; run the secrets right after the first deploy (chat fails closed until then) or before it.

Prod token: Account › **Workers Scripts › Edit**; Zone › **Workers Routes › Edit**, **Zone › Read** and **DNS › Edit**, on the `appelgriebsch.org` zone only (custom domains create the DNS record). No D1, no Account Settings Read (the account id is set). The zone must be on this Cloudflare account.

### Cutover

1. Freeze. Rehearse on staging (or a second temporary hostname): lessons, offline/PWA, export/import, Conversas.
2. Lower the DNS TTL of `bica.appelgriebsch.org`. A Workers custom domain can't attach while another DNS record (Vercel's CNAME) holds the name: remove it, then run the workflow; the deploy creates the record. Monitor for 24 h.
3. Keep Vercel idle for 14 days, then decommission it (and its old Postgres database).
4. Bump the service worker cache version with the deploy.

Progress lives on the device under the origin. The hostname stays the same, so localStorage is kept. **If the prod hostname ever changes, users must export on the old origin and import on the new one (#34).**

### Rollback

`npx wrangler rollback --env production`, or restore Vercel's DNS record. Both are lossless for progress (it lives on devices). Vercel still shows its old sign-in UI until decommissioned.

## Deferred

Prod deploy-on-push and redirects onto or off `*.workers.dev` are out of scope. No production database (ADR 0002 addendum). No `_redirects`.
