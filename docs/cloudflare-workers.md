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

Set Worker secrets with `wrangler secret put <NAME> --env staging` (never in `wrangler.toml`). The server reads them from `process.env`: `nodejs_compat` with this compatibility date populates it from vars and secrets, which is the same path the Vercel build uses. No Hyperdrive binding.

| Name                                             | Where                                                     | Needed for                                                                                                                                                                                                                            |
| ------------------------------------------------ | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                   | Worker secret **and** GitHub `staging` environment secret | Postgres (Neon) over `pg`. Without it the Worker skips PGLite and every database call throws, so sign-in, sessions and progress sync fail. The workflow migrates with it before deploying.                                            |
| `BETTER_AUTH_SECRET`                             | Worker secret                                             | Signing sessions. Without it Better Auth falls back to a per-isolate preview secret, so sessions don't survive isolate restarts.                                                                                                      |
| `BETTER_AUTH_URL`                                | Worker secret or var                                      | The public staging URL (`https://bica-staging.<account-subdomain>.workers.dev`). Without it the OAuth callback and the CSRF allowlist only know the preview and local hosts, so sign-in from workers.dev fails with "Invalid origin". |
| `BETTER_AUTH_TRUSTED_ORIGINS`                    | Worker var (optional)                                     | Extra hosts for the same allowlist, comma or space separated.                                                                                                                                                                         |
| `GROK_AUTH_CLIENT_ID`, `GROK_AUTH_CLIENT_SECRET` | Worker secrets                                            | Federated sign-in. Without them the app uses the shared live-preview client, and the broker only accepts `*.grok-sandbox.com` callbacks, so sign-in from workers.dev fails.                                                           |
| `GROK_AUTH_ISSUER`                               | Worker var (optional)                                     | Broker URL; defaults to the production broker.                                                                                                                                                                                        |
| `XAI_API_KEY`                                    | Worker secret                                             | Speak practice chat. Without it chat answers "Practice chat is unavailable right now."                                                                                                                                                |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`  | GitHub `staging` environment secrets                      | `wrangler deploy` in CI.                                                                                                                                                                                                              |

`BICA_STAGE=staging` is a plain var in `[env.staging.vars]`. `VITE_*` values (`VITE_AUTH_ENABLED`, `VITE_PUBLIC_HOSTNAME`, `VITE_STUN_URLS`) are build-time: set them in the build environment, not as Worker secrets.

Without any secrets, staging serves `/api/health`, the app pages (checked locally with `wrangler dev`: `/`, `/practice`), the precached offline shell, and text-to-speech (Web Speech runs in the browser). Sign-in, progress sync, practice chat, and anything else that needs the database don't work.

With `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `GROK_AUTH_CLIENT_*` set (and the migration step run), sign-in and progress sync should work; with `XAI_API_KEY`, chat too. None of this has run on a real Worker yet: `pg` over the Workers socket API and connection reuse across requests are untested.

## Migrations

`build:cf` never touches a database. The staging workflow runs `npm run db:migrate:staging` as its own step after the build and before `wrangler deploy`, with `DATABASE_URL` from the GitHub `staging` environment. Without that secret the step prints a skip message and the Worker deploys without a database. Locally: `DATABASE_URL=... npm run db:migrate:staging`.

## Deploy

Only these two paths publish, and both pass `--env staging`:

- locally: `npm run deploy:staging` (`build:cf`, then `wrangler deploy --env staging --config wrangler.toml`)
- CI: push to the git branch `staging` (`.github/workflows/deploy-staging.yml`)

CI (GitHub environment `staging`, 15 minute timeout) runs `npm ci`, `npm test`, `npm run deps:check`, `npm run build:cf`, the migration step, then deploys. It does not run on `main` or on pull requests.

`npm run build` is unchanged: Nitro preset `vercel`, precache, then `db:migrate`. `DEPLOY_TARGET=cloudflare` selects Nitro’s `cloudflare-module` preset (module syntax, `nodejs_compat`). Dev stays on `0.0.0.0:8080` with Nitro off.

There is no `deploy` script. Top-level `wrangler deploy` (no `--env`) is not wired. The top-level Wrangler config sets `workers_dev = false`, has no routes, and does not set `BICA_STAGE`, so an accidental publish has no public hostname and health fails closed.

Nitro may write `.output/server/wrangler.json` and warn that `main` / `assets` in that generated file are overridden. Deploy with `--config wrangler.toml` so `[env.staging]` in the root file is the config that ships. Do not let a generated file replace the root config.

`build:cf` runs `scripts/precache.mjs` on `.output/public` (so `sw.js` gets the build's `VERSION`, the full `PRECACHE` list and `/_shell`), then writes `.output/server/staging-entry.mjs`, which re-exports only the default fetch handler from `.output/server/index.mjs`. The Nitro bundle also has named exports; Workers would treat those as handlers and refuse to start. Wrangler `main` points at that generated entry. All of these paths come from the `cloudflare-module` entry in `scripts/build-output.mjs`.

`public/_headers` serves `/_shell` as `text/html` and both `/_shell` and `/sw.js` with `cache-control: no-cache`; Nitro appends the immutable `/assets/*` rule. `wrangler.toml` sets `html_handling = "none"` and `not_found_handling = "none"`, so files are served at their exact paths and unknown paths reach the Worker.

`DEPLOY_TARGET=cloudflare node scripts/offline-smoke.mjs` runs the offline smoke on the Cloudflare output (served by Node, not workerd).

## Deferred

Production Worker, `[env.production]`, deploy-on-main, custom domains, DNS, and redirects onto or off `*.workers.dev` are out of scope. No `_redirects`. No D1.
