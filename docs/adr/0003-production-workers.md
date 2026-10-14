# ADR 0003: Production on Cloudflare Workers

## Status

Accepted (#8). Supersedes ADR 0001's "production is deferred".

## Context

Prod runs on Vercel. Since #33 there are no accounts and no database: progress lives in the browser (export/import, #34). Conversas is protected anonymously (#35: Turnstile, `CHAT_RATE`, `ChatBudget`). Staging already runs the same build on a Worker.

## Decision

- `[env.production]` in `wrangler.toml`: script `bica-production`, `workers_dev = false`, the custom domain `bica.appelgriebsch.org`, `BICA_STAGE=production`, `TURNSTILE_HOSTNAMES=bica.appelgriebsch.org`, its own `CHAT_RATE` namespace and the `CHAT_BUDGET` Durable Object binding. No database binding, no auth secrets.
- `/api/health` returns 200 for exactly `staging` or `production`; anything else (including a missing stage) is 503.
- Deploys only via `.github/workflows/deploy-production.yml`: `workflow_dispatch` from `main`, a gate job that requires green `CI` for the sha, then a job in the `production` GitHub environment (required reviewers) that builds, deploys and smoke-tests exactly that sha. Fixed concurrency group, never cancelled. A push to `main` deploys only staging.
- Prod reuses the staging Turnstile widget (one public site key baked in by `build:cf`); the widget's hostname list gets the prod domain, and `TURNSTILE_HOSTNAMES` keeps each Worker to its own host.
- Separate `production` environment secrets: a prod-only API token that alone holds the zone scopes.

## Consequences

- Rollback is `wrangler rollback --env production`, or pointing DNS back at Vercel; both are lossless for progress.
- Changing the prod hostname moves users to a new origin: they must export and import (#34).
