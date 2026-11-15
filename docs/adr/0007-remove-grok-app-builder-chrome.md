# 0007. Remove Grok App Builder platform chrome from the repo

- **Status**: Accepted
- **Date**: 2026-11-15
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: epic "Remove xAI/Grok from Bica; Conversas chat moves to Mistral AI" (M2 ticket)

## Context

The workspace template (Grok App Builder) ships platform chrome that is a
leftover of the builder service, not of Bica: the `grokPwaPlugin()` Vite plugin
injecting `https://grok.com/grok-app-builder/extensions.js` ("Created with
Grok" pill) and the `?install=1` tutorial, the Nitro middleware
`server/middleware/grok-pwa.ts` serving `/__grok/*`, `scripts/grok-pwa-*.mjs`,
`public/__grok/`, `src/lib/og/site.json`, the preview postMessage bridge
(`src/components/preview-host-bridge.tsx`, `src/lib/preview-host-bridge.ts`,
`src/lib/preview-embedder-origin.ts`), the `og.grok.me` share-card banner in
`src/routes/__root.tsx`, the `/__grok/manifest.webmanifest` link, `__grok`
branches in `public/sw.js` and `scripts/precache.mjs`, and the `.grok/` skills
directory. The task is to remove these dependencies and references; the
"Built with Grok" pill visibility is controlled separately in the app's Grok
project settings (not code).

## Decision

1. Delete `scripts/grok-pwa-plugin.mjs`, `grok-pwa-shared.mjs`,
   `grok-pwa-shared.d.mts`, `grok-pwa-plugin.test.mjs`, `install-page.html`,
   `server/middleware/grok-pwa.ts`, `server/virtual-grok-og-identity.d.ts`,
   `public/__grok/`, `.grok/`, `artifacts/.grok/`, `src/lib/og/`.
2. `vite.config.ts`: drop `grokPwaPlugin`; **keep** the `0.0.0.0:8080`
   preview contract and the build-gated `nitro({ preset, serverDir: "./server" })`
   (still needed by `00-security-headers.ts` and `server-fn-errors.ts`).
3. Ship a **static `public/manifest.webmanifest`** (name from `APP_NAME`, theme
   colors from `scripts/bica-theme.mjs`, the same five icons, pinned `id` such as
   `"/"` — a static file cannot be per-host) and point the root link at it.
4. `src/routes/__root.tsx`: `og:image` → `https://${host}/og.jpg` (Bica ships a
   custom card); remove the `x:game:image` `og.grok.me` banner block; add the
   `apple-mobile-web-app-status-bar-style` meta the middleware used to inject;
   remove the `PreviewHostBridge` mount (delete the three bridge files).
5. `src/lib/public-host.ts`: inline the two small helpers
   (`resolvePublicHost`, `hostFromOgImage`) instead of importing
   `grok-pwa-shared.mjs`.
6. `scripts/precache.mjs`: drop `renderWebManifest` and all `/__grok` entries;
   `public/sw.js`: remove the `/__grok` branches; CSP `img-src` in
   `src/lib/security-headers.mjs` drops `https://og.grok.me`.
7. `scripts/brand-check.mjs` (+test), `browser-smoke.mjs`, `browser-guard.mjs`,
   `offline-smoke.mjs`: remove `og.grok.me` / `.grok` references (keep the
   custom-`/og.jpg` check).
8. Update every affected test (`sw.test.mjs`, `precache.test.mjs`,
   `security-headers.test.mjs`, `hardening-built.test.mjs` incl. the manifest-id
   assertions, `cloudflare-config.test.mjs`, `no-auth.test.mjs`,
   `tts.test.mjs`).
9. The **"Created with Grok" pill is disabled in the app's Grok project
   settings** by the owner — that is platform configuration, not a repo change.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Remove all builder chrome in code (chosen) | no Grok/xAI references remain in the repo | preview iframe loses address-bar/back-forward chrome; `?install=1` tutorial gone; per-host manifest `id` becomes static |
| Keep chrome, only swap the LLM | smallest diff | leaves the Grok App Builder leftovers the task says to remove |
| Remove via project settings only | no code change | leaves all code references and the injected script in the repo |

## Consequences

- The live preview inside the builder still renders the app, but without the
  bridge-driven address bar; accepted.
- PWA install still works via the static manifest + `sw.js`; the manifest `id`
  is no longer per-host (hardening tests updated accordingly).
- `wrangler.toml` `PUBLIC_HOSTNAME` stays (still used for `og:image`); its
  comments drop the manifest-id clause.
- Revisit if the app is ever re-embedded in the Grok builder preview and the
  bridge chrome is needed again.
