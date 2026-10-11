# Cloudflare Workers (staging)

Bica’s staging host is a **Cloudflare Worker**, not Cloudflare Pages.

[hiato](https://github.com/appelgriebsch/hiato) is a static Vite PWA on Pages. Pages has no named non-production environment, so hiato calls that surface `preview` while the binding value is still `HIATO_STAGE=staging`. Bica is a TanStack Start server (Nitro). Pages cannot run it. The Worker environment is named `staging` on purpose — do not rename it back to `preview`.

| | |
| --- | --- |
| Worker name | `bica` |
| Wrangler environment | `staging` |
| Script name | `bica-staging` (Wrangler appends the environment name) |
| Public URL | `https://bica-staging.<account-subdomain>.workers.dev` |
| Stage binding | `BICA_STAGE=staging` |

Account id comes from `wrangler login` or `CLOUDFLARE_ACCOUNT_ID`. It is not committed.

## Health

`GET /api/health`

- `BICA_STAGE=staging` → `200` `{ "ok": true, "stage": "staging" }` and `cache-control: no-store`
- missing, blank, or any other value (including `production`) → `503` `{ "ok": false }`

The handler does not open auth or the database. Staging does not receive `DATABASE_URL`, Neon, Hyperdrive, or `GROK_AUTH_*`. When `BICA_STAGE` is set and there is no `DATABASE_URL`, the server skips PGLite so a Worker request that evaluates the auth module cannot hang on the preview database. Login, progress sync, and TTS stay on the Vercel / preview path until a later slice.

## Deploy

Only these two paths publish, and both pass `--env staging`:

- locally: `npm run deploy:staging` (`build:cf`, then `wrangler deploy --env staging --config wrangler.toml`)
- CI: push to the git branch `staging` (`.github/workflows/deploy-staging.yml`)

CI builds with `npm run build:cf`, runs `npm test`, then deploys. It does not run on `main` or on pull requests.

`npm run build` is unchanged: Nitro preset `vercel`, then `db:migrate`. `DEPLOY_TARGET=cloudflare` selects Nitro’s `cloudflare-module` preset (module syntax, `nodejs_compat`). Dev stays on `0.0.0.0:8080` with Nitro off.

There is no `deploy` script. Top-level `wrangler deploy` (no `--env`) is not wired. The top-level Wrangler config sets `workers_dev = false`, has no routes, and does not set `BICA_STAGE`, so an accidental publish has no public hostname and health fails closed.

Nitro may write `.output/server/wrangler.json` and warn that `main` / `assets` in that generated file are overridden. Deploy with `--config wrangler.toml` so `[env.staging]` in the root file is the config that ships. Do not let a generated file replace the root config.

`build:cf` writes `.output/server/staging-entry.mjs`, which re-exports only the default fetch handler from `.output/server/index.mjs`. The Nitro bundle also has named exports; Workers would treat those as handlers and refuse to start. Wrangler `main` points at that generated entry.

## Deferred

Production Worker, `[env.production]`, deploy-on-main, custom domains, DNS, and redirects onto or off `*.workers.dev` are out of scope. No `_redirects`. No D1.
