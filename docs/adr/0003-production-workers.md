# ADR 0003: Production on Cloudflare Workers

## Status

Accepted (#8). Supersedes ADR 0001's "production is deferred".

## Context

Prod runs on Cloudflare Workers (#8, #40). Since #33 there are no accounts and no database: progress lives in the browser (export/import, #34). Conversas is protected anonymously (#35: Turnstile, `CHAT_RATE`, `ChatBudget`). Staging already runs the same build on a Worker.

## Decision

- `[env.production]` in `wrangler.toml`: script `bica-production`, `workers_dev = false`, the custom domain `bica.appelgriebsch.org`, `BICA_STAGE=production`, `TURNSTILE_HOSTNAMES=bica.appelgriebsch.org`, its own `CHAT_RATE` namespace and the `CHAT_BUDGET` Durable Object binding. No database binding, no auth secrets.
- `/api/health` returns 200 for exactly `staging` or `production`; anything else (including a missing stage) is 503.
- Deploys only via `.github/workflows/deploy-production.yml`: `workflow_dispatch` from `main`, a gate job that requires green `CI` for the sha, then a job in the `production` GitHub environment (required reviewers) that builds, deploys and smoke-tests exactly that sha. Fixed concurrency group, never cancelled. A push to `main` deploys only staging.
- Prod reuses the staging Turnstile widget (one public site key baked in by `build:cf`); the widget's hostname list gets the prod domain, and `TURNSTILE_HOSTNAMES` keeps each Worker to its own host.
- Separate `production` environment secrets: a prod-only API token (Workers Scripts Edit, plus Zone Read on the prod zone only). The environment must restrict deployment branches to `main` and require Andreas as reviewer; the workflow's own `main` check is not a boundary, because a dispatch from another branch runs that branch's workflow file.

## Consequences

- Rollback: `wrangler rollback --env production` only (code only; vars and secrets are not rolled back). There is no Vercel fallback (#17). Lossless for progress.
- Changing the prod hostname moves users to a new origin: they must export and import (#34).
