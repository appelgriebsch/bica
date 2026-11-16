# 0011. Cookieless Cloudflare Web Analytics, production only

- **Status**: Accepted
- **Date**: 2026-11-16
- **Deciders**: Andreas Gerlach (port of the hiato integration, hiato ADR 0047 / hiato#224, approved 2026-11-16)
- **Supersedes**: none
- **Related issues**: none (small change, tracked here and implemented directly)

## Context

Bica has no usage data, so every Reach-style number is an estimate. We want daily visits and page views per route on production, without cookies, accounts, device storage, or anything that identifies a learner. Bica ships one stage-neutral artifact to both staging and production (#51/#52), so a build-time flag cannot separate the environments; the runtime stage reported by `/api/health` (`src/routes/api/health.ts`, `src/lib/health-stage.mjs`) is the only signal that differs. The same integration was designed, shipped, and run on hiato (hiato ADR 0047, hiato#224). Bica keeps no personal data in URLs: progress is device-local and cross-device transfer rides QR frames (#36), so counting page paths is safe.

## Decision

Load the cookieless Cloudflare Web Analytics beacon (`https://static.cloudflareinsights.com/beacon.min.js`) from the client, only when `/api/health` reports `stage: "production"` and a site token is configured:

- `src/lib/analytics.mjs` (with `analytics.d.mts`, the repo's testable `.mjs` + `.d.mts` pair) reads the token from the build-time define `__BICA_WEB_ANALYTICS_TOKEN__`, which `vite.config.ts` bakes from the `WEB_ANALYTICS_TOKEN` environment variable. The deploy workflow sets that variable from the GitHub Actions repository variable `vars.WEB_ANALYTICS_TOKEN` — a variable, not a secret, because the site token is public by design and ships in the page. Unset or empty keeps the beacon off on every environment. `initAnalytics()` runs once per load from the client entry: it fetches same-origin `/api/health`, and only on `production` with a non-empty token injects `<script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"..."}'>`. Any health failure (offline, staging 503) injects nothing, so offline play is never counted.
- The beacon's built-in SPA tracking (History API `pushState`/`popstate`) reports each client-side route as a page view. No custom events, no extra SDK.
- The CSP (`buildCsp` in `src/lib/security-headers.mjs`) gains exactly two hosts, following the file's existing rule that host allowlists are the fallback for browsers without `'strict-dynamic'`: `script-src` allows `https://static.cloudflareinsights.com` (the beacon script) and `connect-src` allows `https://cloudflareinsights.com` (the RUM post target — load-bearing in every browser). `public/_headers` carries no CSP and stays unchanged.
- The About page (`src/routes/about.tsx`, a "What we count" band) states what is counted: on the production site only, cookieless visits and page views per screen; no cookies, no device storage for tracking, nothing that identifies you; staging previews and offline play are not counted.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Client injects the beacon only when `/api/health` says production (chosen) | Reuses the existing stage signal and health route; offline naturally uncounted; direct port of hiato ADR 0047 | One extra same-origin fetch per load; the beacon loads a tick after page load |
| Cloudflare dashboard auto-injection (edge) | Zero code | Cannot distinguish staging from production: one artifact ships to both (#51/#52) |
| Build-time gating via env var | None | The same build artifact ships to staging and production, so the flag is identical in both |
| Worker runtime var exposed through an endpoint | Token never baked into the bundle | New endpoint to secure and test; the token is public by design anyway |
| Self-hosted copy of the beacon | Version pinning | Loses Cloudflare updates; hash-rot risk; extra bytes inside the SW scope |

## Consequences

- Andreas adds the bica site in the Cloudflare dashboard (Web Analytics, manual snippet) and sets `WEB_ANALYTICS_TOKEN` as an Actions repository variable (Settings → Secrets and variables → Actions → Variables); the release build bakes it into the bundle. Until it is set, the beacon stays off everywhere, so nothing is counted anywhere.
- The baked token is present in the staging bundle too. That is harmless: the runtime stage gate still prevents the beacon from loading there.
- Tests: `scripts/analytics.test.mjs` (production + token injects the beacon exactly once; staging / health error / empty token inject nothing; the shipped CSP contains both beacon hosts), `scripts/security-headers.test.mjs` locks the CSP additions, `scripts/cloudflare-config.test.mjs` locks `vars.WEB_ANALYTICS_TOKEN` in the release build env, `scripts/about.test.mjs` locks the About wording.
- No cookies are introduced; `Permissions-Policy`, HSTS, and the rest of the security set are unchanged. Production currently sends CSP Report-Only, so a CSP miss would surface only via `/api/csp-report` — the `connect-src` addition is still required and correct.
- Per-route numbers appear in the Cloudflare Web Analytics dashboard per page path. Verify in the dashboard that query strings are not collected (bica URLs carry no personal data regardless).
- Browser smoke baselines that capture the About page change because of the new band; regenerate when running them.
