# Bica

European Portuguese in short sips. Bica is a learning app with lessons (read, verbs, listen, grammar), spaced-repetition review, a learning path and Conversas, a speaking-practice chat (`src/routes/`).

Production: <https://bica.appelgriebsch.org>

## Offline PWA and text-to-speech

- Service worker `public/sw.js`, precached by `scripts/precache.mjs`; install and update UI in `src/components/pwa.tsx`; static headers in `public/_headers`.
- Text-to-speech runs in the browser (`src/lib/tts.ts`).
- Which features work offline and which need a connection: `src/lib/online-features.ts`.

## Progress stays on your device

There are no accounts. Progress is stored in the browser (`src/lib/progress-store.ts`, zustand `persist` in `localStorage`) and can be moved between devices with export/import (#34). Background: `AGENTS.project.md` and the [ADR 0002 addendum](docs/adr/0002-d1-database.md) (#33).

Conversas is anonymous and protected by Cloudflare Turnstile, the `CHAT_RATE` rate limit and the `ChatBudget` Durable Object (`src/lib/chat-gate.ts`, `src/lib/chat-budget.mjs`).

## Development

Requires Node 22 (`.nvmrc`, `engines` in `package.json`).

```sh
npm ci
npm run dev   # http://localhost:8080
```

Conversas needs the local secrets `XAI_API_KEY`, `TURNSTILE_SECRET_KEY` and `CHAT_SESSION_SECRET`, plus a `TURNSTILE_HOSTNAMES` var for your local host (committed per env in `wrangler.toml`), in your shell or a git-ignored `.dev.vars`. Use Cloudflare's Turnstile test keys locally; see [docs/cloudflare-workers.md](docs/cloudflare-workers.md). Never commit real values.

## Tests and CI

```sh
npm run typecheck
npm run lint
npm test            # node --test scripts/*.test.mjs
npm run deps:check
npm run build
npm run build:cf
```

`.github/workflows/ci.yml` runs these on every PR and push to `main`, then the built-output tests (`BICA_BUILT=1 DEPLOY_TARGET=cloudflare npm test`) and `wrangler deploy --dry-run` for both the `staging` and `production` envs. Formatting: Prettier (`.prettierrc`); linting: ESLint (`eslint.config.mjs`).

## Hosting on Cloudflare Workers

`wrangler.toml` defines two environments:

- `staging`: workers.dev, `BICA_STAGE=staging`.
- `production`: custom domain `bica.appelgriebsch.org`, `BICA_STAGE=production`.

The top level is inert: without `--env` there is no route and no stage, so `/api/health` (`src/routes/api/health.ts`) answers 503.

### Deploy

- **Staging:** `.github/workflows/deploy-staging.yml` runs via `workflow_run` after green CI on `main`, then smoke-checks `/api/health` and the security headers.
- **Production:** `.github/workflows/deploy-production.yml` runs only by hand (`workflow_dispatch`). It gates on green CI for the commit, waits for approval in the `production` environment (required reviewer), deploys, then smoke-checks the site.
- **Rollback:** `npx wrangler rollback --env production`. It rolls back code only, not vars or secrets. See [docs/cloudflare-workers.md](docs/cloudflare-workers.md) § Rollback.

More: [docs/cloudflare-workers.md](docs/cloudflare-workers.md) and the ADRs in [docs/adr/](docs/adr/).

## License

[MIT](LICENSE). Third-party notices: [THIRD-PARTY.md](THIRD-PARTY.md).
