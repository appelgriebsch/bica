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

Requires Node 22 (≥ 22.23.4, `.nvmrc`, `engines` in `package.json`). Check with `bun run node:check`.

```sh
bun install --frozen-lockfile
bun run dev   # http://localhost:8080
```

Conversas needs the local secrets `XAI_API_KEY`, `TURNSTILE_SECRET_KEY` and `CHAT_SESSION_SECRET`, plus a `TURNSTILE_HOSTNAMES` var for your local host (committed per env in `wrangler.toml`), in your shell or a git-ignored `.dev.vars`. Use Cloudflare's Turnstile test keys locally; see [docs/cloudflare-workers.md](docs/cloudflare-workers.md). Never commit real values.

## Tests and CI

```sh
bun run typecheck
bun run lint
bun run test            # node --test scripts/*.test.mjs
bun run deps:check
bun run licenses:check
bun run build
bun run build:cf
```

`.github/workflows/ci.yml` runs these on every PR and push to `main`, then the built-output tests (`BICA_BUILT=1 DEPLOY_TARGET=cloudflare bun run test`) and `bunx wrangler deploy --dry-run` for both the `staging` and `production` envs. Formatting: Prettier (`.prettierrc`); linting: ESLint (`eslint.config.mjs`).

## Hosting on Cloudflare Workers

`wrangler.toml` defines two environments:

- `staging`: workers.dev, `BICA_STAGE=staging`.
- `production`: custom domain `bica.appelgriebsch.org`, `BICA_STAGE=production`.

The top level is inert: without `--env` there is no route and no stage, so `/api/health` (`src/routes/api/health.ts`) answers 503.

### Deploy

`.github/workflows/deploy.yml` builds once after green CI on `main`, deploys that artifact to staging, smoke-checks `/api/health` and the security headers, then after approval in the `production` environment promotes the same artifact.

- **Rollback:** `bunx wrangler rollback --env production` re-activates an earlier version (code, assets, vars, bindings and compatibility settings; Durable Object data stays). Or re-run Deploy on `main` with `artifact_run_id` (that commit's `wrangler.toml` too; secrets stay). See [docs/cloudflare-workers.md](docs/cloudflare-workers.md) § Rollback.

More: [docs/cloudflare-workers.md](docs/cloudflare-workers.md) and the ADRs in [docs/adr/](docs/adr/).

## License

[MIT](LICENSE). Third-party notices: [THIRD-PARTY.md](THIRD-PARTY.md).
