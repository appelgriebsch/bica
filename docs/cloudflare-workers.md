# Cloudflare Workers (staging)

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
- missing, blank, or any other value (including `production`) → `503` `{ "ok": false }`

The handler does not open auth or the database.

## Secrets and what works without them

Set Worker secrets with `wrangler secret put <NAME> --env staging` (never in `wrangler.toml`). The server reads them from `process.env`: `nodejs_compat` with this compatibility date populates it from vars and secrets, which is the same path the Vercel build uses. The database is the D1 binding `DB` (below), not a secret.

| Name                                             | Where                                | Needed for                                                                                                                                                                                                                            |
| ------------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                             | Worker secret                        | Signing sessions. Without it Better Auth falls back to a per-isolate preview secret, so sessions don't survive isolate restarts.                                                                                                      |
| `BETTER_AUTH_URL`                                | Worker secret or var                 | The public staging URL (`https://bica-staging.<account-subdomain>.workers.dev`). Without it the OAuth callback and the CSRF allowlist only know the preview and local hosts, so sign-in from workers.dev fails with "Invalid origin". |
| `BETTER_AUTH_TRUSTED_ORIGINS`                    | Worker var (optional)                | Extra hosts for the same allowlist, comma or space separated.                                                                                                                                                                         |
| `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET` | Worker secrets                       | Federated sign-in. Without them the app uses the shared live-preview client, and the broker only accepts `*.grok-sandbox.com` callbacks, so sign-in from workers.dev fails.                                                           |
| `GROK_AUTH_ISSUER`                               | Worker var (optional)                | Broker URL; defaults to the production broker.                                                                                                                                                                                        |
| `XAI_API_KEY`                                    | Worker secret                        | Speak practice chat. Without it chat answers "Practice chat is unavailable right now."                                                                                                                                                |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`  | GitHub `staging` environment secrets | Required. D1 provisioning, `wrangler d1 migrations apply` and `wrangler deploy` in CI; the provision step fails fast when either is empty. Token scopes: below.                                                                       |

`BICA_STAGE=staging` is a plain var in `[env.staging.vars]`. `VITE_*` values (`VITE_AUTH_ENABLED`, `VITE_PUBLIC_HOSTNAME`, `VITE_STUN_URLS`) are build-time: set them in the build environment, not as Worker secrets.

Without any secrets, staging serves `/api/health`, the app pages (checked locally with `wrangler dev`: `/`, `/practice`), the precached offline shell, and text-to-speech (Web Speech runs in the browser). With the D1 database created and migrated, plus `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `GROK_AUTH_CLIENT_*`, sign-in and progress sync should work; with `XAI_API_KEY`, chat too. Locally that path is checked with `wrangler dev --env staging` on a local D1; it has not run against a real staging D1 yet.

## D1 database (provisioned by CI)

The Worker's database is D1, bound as `DB` ([ADR 0002](adr/0002-d1-database.md)). There is no manual `d1 create` and no committed id: `wrangler.toml` keeps the marker `database_id = "${BICA_STAGING_D1_ID}"` for staging, and no real id is ever committed.

`scripts/ci-d1-provision.mjs` runs before every migrate and deploy (in CI and in `npm run deploy:staging`):

1. Fails fast if `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is empty.
2. `wrangler d1 list --json`, then looks for `bica-staging`. If found, it logs `exists, reusing <uuid>`.
3. If missing, `wrangler d1 create bica-staging --location weur` and lists again. It never creates a second one, and it stops if two databases share the name.
4. Checks the id is a UUID, then writes `wrangler.ci.toml` (gitignored): `wrangler.toml` with the marker in `[[env.staging.d1_databases]]` replaced, checked to contain the id and no marker. In CI the id is also the step output `d1_id`.

Migrate and deploy then use `--config wrangler.ci.toml`. Re-running is a no-op for provisioning, and `migrations apply` reports nothing to apply.

Check it: `npx wrangler d1 execute DB --env staging --remote --config wrangler.ci.toml --command "select name from sqlite_master where type = 'table'"` lists `user`, `session`, `account`, `verification`, `lesson_progress`, `user_stats` and `d1_migrations`.

### API token scopes

Create the token from the **Edit Cloudflare Workers** template, scoped to the one account, then make sure it has:

- Account › **D1 › Edit** (list, create, migrate). The template doesn't include it; add it.
- Account › **Workers Scripts › Edit** (deploy, secrets, the workers.dev subdomain toggle).
- Account › **Account Settings › Read** (wrangler's account lookup).

Remove what the template adds that bica doesn't use (KV, R2, Pages, and the zone permissions). Staging has no routes, so it needs no zone access. Only a production Worker with routes or a custom domain (#8) would need Zone › **Workers Routes › Edit** and Zone › **Zone › Read** (plus Zone › **DNS › Edit** for custom domains), and that belongs on its own prod token.

The database starts empty. There is no user import: everyone signs in again, and each device re-uploads its offline progress through the sync queue.

The wrangler CLI needs Node 22+. With an older Node, run it as `npx -y node@22 node_modules/wrangler/bin/wrangler.js …`.

## Migrations

`migrations/*.sql` is the `wrangler d1 migrations` directory (`migrations_dir` in `wrangler.toml`). Applied files are recorded in the database's `d1_migrations` table. Add a schema change as the next numbered file; never edit an applied one. `0001_auth.sql` is Better Auth's SQLite schema, generated by its migration compiler for the installed version.

`build` and `build:cf` never touch a database. The staging workflow runs `wrangler d1 migrations apply DB --env staging --remote --config wrangler.ci.toml` as its own step after provisioning and before `wrangler deploy`, with the same Cloudflare token. `npm run deploy:staging` does the same locally.

Local: `npm run dev` opens wrangler's local D1 under `.wrangler/state` and applies pending migrations on first use. `npx wrangler d1 migrations apply DB --local --env staging` prepares the same state for `wrangler dev --env staging`.

## Deploy

Only these two paths publish, and both pass `--env staging`:

- locally: `npm run deploy:staging` (`build:cf`, D1 provisioning, the remote D1 migrations, then `wrangler deploy --env staging --config wrangler.ci.toml`), with `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` exported
- CI: push to `main`, or run the workflow by hand (`workflow_dispatch`) (`.github/workflows/deploy-staging.yml`)

CI (GitHub environment `staging`, 15 minute timeout) runs `npm ci`, `npm test`, `npm run deps:check`, `npm run build:cf`, the built-output tests on the Worker bundle, D1 provisioning, the D1 migrations, `wrangler deploy`, then checks `GET /api/health` on the deployed URL (200, `stage: "staging"`). Every step runs under `bash -euo pipefail`, so any failure stops the job before deploy. It does not run on pull requests. Runs share the fixed concurrency group `deploy-staging` with `cancel-in-progress: false`: two quick pushes run one after the other, and neither is cancelled mid-migration.

`npm run build` is Nitro preset `vercel` plus precache. It has no database: no D1 binding exists outside a Worker, so sign-in and sync need the Worker build. `DEPLOY_TARGET=cloudflare` selects Nitro’s `cloudflare-module` preset (module syntax, `nodejs_compat`). Dev stays on `0.0.0.0:8080` with Nitro off.

There is no `deploy` script. Top-level `wrangler deploy` (no `--env`) is not wired. The top-level Wrangler config sets `workers_dev = false`, has no routes, and does not set `BICA_STAGE`, so an accidental publish has no public hostname and health fails closed.

Nitro may write `.output/server/wrangler.json` and warn that `main` / `assets` in that generated file are overridden. Deploy with `--config wrangler.ci.toml` (generated from the root `wrangler.toml`) so `[env.staging]` from the root file is the config that ships. Do not let a generated file replace the root config.

`build:cf` runs `scripts/precache.mjs` on `.output/public` (so `sw.js` gets the build's `VERSION`, the full `PRECACHE` list and `/_shell`), then writes `.output/server/staging-entry.mjs`, which re-exports only the default fetch handler from `.output/server/index.mjs`. The Nitro bundle also has named exports; Workers would treat those as handlers and refuse to start. Wrangler `main` points at that generated entry. All of these paths come from the `cloudflare-module` entry in `scripts/build-output.mjs`.

`public/_headers` serves `/_shell` as `text/html` and both `/_shell` and `/sw.js` with `cache-control: no-cache`; Nitro appends the immutable `/assets/*` rule. `wrangler.toml` sets `html_handling = "none"` and `not_found_handling = "none"`, so files are served at their exact paths and unknown paths reach the Worker.

`DEPLOY_TARGET=cloudflare node scripts/offline-smoke.mjs` runs the offline smoke on the Cloudflare output (served by Node, not workerd).

## Deferred

Production Worker, `[env.production]`, deploy-on-main, custom domains, DNS, and redirects onto or off `*.workers.dev` are out of scope (#8), including a production D1. No `_redirects`.
