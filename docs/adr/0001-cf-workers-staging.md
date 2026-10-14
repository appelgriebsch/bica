# ADR 0001: Staging on Cloudflare Workers

## Status

Accepted. Staging only. Production is deferred.

## Context

Bica is a TanStack Start app built with Nitro. The default build targets Vercel (`preset: "vercel"`). Live preview stays on `0.0.0.0:8080` with Nitro disabled in dev.

Hiato’s hosting ceremony (ADR 0011, ADR 0021) uses one Cloudflare Pages project. Pages has no separate non-production environment, so hiato’s non-prod surface is Pages Preview and the Wrangler key is `[env.preview]`, while the binding value is `HIATO_STAGE=staging`. A Pages project cannot host this server.

## Decision

Ship a staging-only Worker:

- Base name `bica`, Wrangler environment `staging`, script `bica-staging`.
- Nitro preset `cloudflare-module` when `DEPLOY_TARGET=cloudflare` (`npm run build:cf`). The default `npm run build` stays `vercel`.
- `[env.staging]` sets `workers_dev = true` and `BICA_STAGE=staging`. There is no `[env.production]`, no route, and no custom domain.
- Top-level `workers_dev = false` and no `BICA_STAGE`, so a publish without `--env staging` is not a public production deploy and `GET /api/health` returns 503.
- Deploy only via `npm run deploy:staging`, or the staging workflow after the `CI` workflow succeeds for a push to `main` (or a manual `workflow_dispatch` run of a sha with green `CI`). Updated by #21 and #23; it first deployed from a separate branch.
- The environment is named `staging`, not `preview`. Hiato’s name was a Pages limit. Copying it here would hide a real Workers environment behind the wrong word.

`GET /api/health` returns 200 `{ "ok": true, "stage": "staging" }` only for that stage. This slice does not put Neon, Hyperdrive, or auth secrets on the Worker. PGLite is the preview database; the Worker skips it when `BICA_STAGE` is set (and on the Cloudflare build when `DATABASE_URL` is absent) so health and the app shell can answer.

## Consequences

- Vercel remains the production path until a later slice adds a production Worker.
- `*.workers.dev` is the only staging hostname. Domains and redirects are a separate change.
- Login and progress sync on `bica-staging` stay unwired until Neon and the sign-in secrets exist. (Sign-in was later removed altogether: ADR 0002 addendum, #33.)
- Operators must not rename `[env.staging]` to `[env.preview]` to “match hiato”.
- Follow-up (review W2): `DATABASE_URL`, the sign-in secrets (removed in #33) and `XAI_API_KEY` are documented as Worker secrets in `docs/cloudflare-workers.md`, and the staging workflow migrates `DATABASE_URL` in its own step before deploying. Nothing is set on an account by this change.
