# ADR 0002: Use Cloudflare D1 instead of Postgres

## Status

Accepted. 2026-10-14. Supersedes the database half of ADR 0001. Superseded by the addendum below (#33): no accounts, no database.

## Context

Bica stored accounts and progress in Postgres: Neon over `pg` when `DATABASE_URL` was set, otherwise an embedded PGLite so the preview always rendered. Better Auth ran on the same pool (or a PGLite Kysely dialect). The Worker build skipped PGLite, so staging needed a Neon URL, `pg` over the Workers socket API, and a migrate step with that URL in CI. Hyperdrive in front of Neon was the next step on that path.

Staging now runs on Cloudflare Workers (ADR 0001). The schema is small: the four Better Auth tables plus `lesson_progress` and `user_stats`. A third app table, `conversations`, was never read. Progress also lives on the device (zustand persist), and the sync queue (#7) re-uploads it after sign-in.

## Decision

- **D1** is the only database. The Worker gets it as the `DB` binding (`[[d1_databases]]` in `wrangler.toml`; `migrations/` is the `wrangler d1 migrations` directory). `npm run dev` uses wrangler's local D1 (`getPlatformProxy`) and applies `migrations/` on first use. There is nothing to configure.
- **Better Auth** gets the D1 binding directly. Its Kysely adapter detects D1 and uses `batch()`. Auth is built once per isolate around a shim that resolves the binding on every call, so no request's binding is captured at module scope.
- **Batches, not transactions.** D1 has no interactive transactions. A progress snapshot is one `batch()` of three statements, independent of how many lessons or cards it carries. Each merge rule lives in a single SQL statement (`json_each` over one JSON parameter, `json_group_object`, and `json_patch` with only the winning cards).
- **Fresh database.** There is no user or session migration. Everyone signs in again, and the device store re-uploads through the sync queue, so the device is the source of truth for the first upload. The server merge never rolls a card or a best score back.
- **No Hyperdrive, no Neon, no `DATABASE_URL`.** `pg` and PGLite are no longer imported. They stay in the lockfile only as transitives of `better-auth` and Nitro.

## Consequences

- No interactive transactions. Every merge has to be expressible as single statements inside one batch, and a batch is all-or-nothing.
- Workers Free limits: 100k rows written/day, 50 queries per invocation, 500 MB per database; 10 GB per database on paid plans. One snapshot is 3 queries, and loading progress is 2.
- D1 allows 100 bound parameters per statement, so lists go in as one JSON parameter.
- All sessions are invalidated at cutover; users sign in again.
- Backups are D1 Time Travel (point-in-time restore, 30 days on paid, 7 on free), not Neon branches.
- `conversations` is dropped.
- The default Vercel build has no database. Its server functions report "Could not reach the account.", so sign-in and sync need a Worker. Production hosting is #8.
- CI finds or creates the `bica-staging` database on every staging deploy (`scripts/ci-d1-provision.mjs`, #21) and injects its id into a generated, gitignored `wrangler.ci.toml`, so no id is committed. The deploy workflow applies migrations with the Cloudflare token before `wrangler deploy`.

## Addendum 2026-10-14: no accounts (#33)

Bica has no sign-in. The decision (Andreas, 2026-10-14) removes the Grok broker blocker for staging and production (#8): progress is device-only, and #34 adds a JSON export/import for backups and moving between devices.

- Removed: Better Auth (the `better-auth` dependency, `/api/auth/*`, `/login`, the `/auth/popup` handler), the server sync (`progress-server`, `progress-merge`, `sync-progress`, `ProgressSync`) and the D1 binding `DB` with `db.ts`/`db.local.ts` and the CI provisioning (`scripts/ci-d1-provision.mjs`, `wrangler.ci.toml`). The staging workflow has no D1 steps.
- Removed config: `BETTER_AUTH_*`, `GROK_AUTH_*`, `VITE_AUTH_ENABLED`; `https://auth.grok.me` in the CSP `form-action`; the COOP popup allowance (now `same-origin`).
- `progress-store` stays the only source of truth (localStorage), including `mergeRemote` for #34's import.
- Applied migrations (`0001`–`0004`) stay in history. No drop migration: the staging database is simply unbound and can be deleted by hand. #36 brings a database back only if it's built.
- Conversas has no identity to limit, so `sendChat` is off behind the `CHAT_ENABLED` code flag (`src/lib/chat-availability.ts`) until #35 (Turnstile, per-IP and global caps) lands. The chat 10-min and day caps count in memory until then; the D1 `chat_usage` counter is gone.

Everything above this addendum describes the D1 period (#19 to #33) and is kept as history.
