# Third-party bill of materials

Review of `main` at `188691f` after the in-range dependency update in this PR.
Direct dependencies are the lockfile resolution of `package.json`.
`h3` and `nf3` are transitives of Nitro. `@electric-sql/pglite` left the lockfile with the Nitro bump (#48). `better-auth` and its transitives (`better-call`, `jose`, `kysely`, `pg`, `pg-connection-string`) left the lockfile with sign-in (#33).
The app no longer imports `pg`, `kysely`, or PGLite since the D1 move (#19), and `@types/pg` is gone from the lockfile.
`numpy` and `pillow` are imported by `.grok/skills/**/*.py` and are not pinned.
`package.json` overrides `undici` to 7.30.1, recorded in `bun.lock`; remove the override once miniflare ships undici >= 7.30.1.
CVE cells marked `none found` are OSV lookups for that exact version on 2026-10-13. `license-checker-rseidelsohn` 4.4.2 and its transitives were looked up on 2026-10-20. `h3` 2.0.7 and `nitro` 3.0.260903-beta were looked up on 2026-10-20. `wrangler` 4.150.0, miniflare 5.20261006.2-beta, undici 7.30.1 and sharp 0.35.5 were looked up on 2026-10-20.
Cells marked `not checked` were not queried.

| Name                          | Version         | License           | Critical update | CVEs                                                                                                                                                                                                                                                                                      |
| ----------------------------- | --------------- | ----------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| @eslint/js                    | 9.39.5          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @fontsource-variable/figtree  | 5.3.0           | OFL-1.1           | not checked     | none found                                                                                                                                                                                                                                                                                |
| @fontsource-variable/fraunces | 5.3.0           | OFL-1.1           | not checked     | none found                                                                                                                                                                                                                                                                                |
| @hookform/resolvers           | 5.9.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-accordion     | 1.3.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-alert-dialog  | 1.2.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-avatar        | 1.3.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-checkbox      | 1.4.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-collapsible   | 1.2.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-dialog        | 1.3.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-dropdown-menu | 2.2.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-label         | 2.1.17          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-popover       | 1.3.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-progress      | 1.2.1           | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-radio-group   | 1.5.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-scroll-area   | 1.4.0           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-select        | 2.4.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-separator     | 1.2.0           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-slider        | 1.6.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-slot          | 1.5.0           | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-switch        | 1.4.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-tabs          | 1.2.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-toggle        | 1.2.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-toggle-group  | 1.2.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @radix-ui/react-tooltip       | 1.4.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @tailwindcss/vite             | 4.3.3           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @tanstack/react-query         | 5.104.2         | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| @tanstack/react-router        | 1.170.44        | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| @tanstack/react-start         | 1.169.1         | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| @tanstack/react-table         | 8.21.3          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @tanstack/router-plugin       | 1.168.45        | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @types/node                   | 22.20.5         | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @types/react                  | 19.3.0          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @types/react-dom              | 19.3.0          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| @vitejs/plugin-react          | 5.2.0           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| class-variance-authority      | 0.7.1           | Apache-2.0        | not checked     | none found                                                                                                                                                                                                                                                                                |
| clsx                          | 2.1.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| cmdk                          | 1.1.1           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| date-fns                      | 4.4.0           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| eslint                        | 9.39.5          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| eslint-config-prettier        | 10.1.8          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| eslint-plugin-prettier        | 5.5.7           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| eslint-plugin-react-hooks     | 5.2.0           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| eslint-plugin-react-refresh   | 0.4.26          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| globals                       | 15.15.0         | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| h3                            | 2.0.7           | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| license-checker-rseidelsohn   | 4.4.2           | BSD-3-Clause      |                 | none found                                                                                                                                                                                                                                                                                |
| lightningcss                  | 1.33.0          | MPL-2.0           | not checked     | none found                                                                                                                                                                                                                                                                                |
| lucide-react                  | 0.510.0         | ISC               |                 | none found                                                                                                                                                                                                                                                                                |
| nf3                           | 0.3.17          | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| nitro                         | 3.0.260903-beta | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| numpy                         | unknown         | BSD-3-Clause      |                 | not checked                                                                                                                                                                                                                                                                               |
| pillow                        | unknown         | MIT-CMU           |                 | not checked                                                                                                                                                                                                                                                                               |
| playwright                    | 1.64.0          | Apache-2.0        | not checked     | none found                                                                                                                                                                                                                                                                                |
| prettier                      | 3.9.10          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| react                         | 19.3.0          | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| react-day-picker              | 9.14.0          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| react-dom                     | 19.3.0          | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| react-hook-form               | 7.90.0          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| react-resizable-panels        | 4.14.5          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| recharts                      | 2.15.4          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| sonner                        | 2.0.8           | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| tailwind-merge                | 3.7.0           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| tailwindcss                   | 4.3.3           | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| tw-animate-css                | 1.4.0           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| typescript                    | 5.9.3           | Apache-2.0        | not checked     | none found                                                                                                                                                                                                                                                                                |
| typescript-eslint             | 8.71.2          | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| vaul                          | 1.1.2           | MIT               | not checked     | none found                                                                                                                                                                                                                                                                                |
| vite                          | 8.3.4           | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| wrangler                      | 4.150.0         | MIT OR Apache-2.0 |                 | wrangler 4.150.0 installs miniflare 5.20261006.2-beta and sharp 0.35.5; undici is overridden to 7.30.1 (CVE-2026-109383, CVE-2026-109829 fixed in 7.30.1; 7.29.1 pinned by miniflare 5) and checked 2026-10-20. |
| zod                           | 4.6.7           | MIT               |                 | none found                                                                                                                                                                                                                                                                                |
| zustand                       | 5.0.15          | MIT               |                 | none found                                                                                                                                                                                                                                                                                |

## Assets

Checked against the xAI legal pages on 2026-10-14. Credit the publisher as SpaceXAI LLC (xAI). Bica does not use xAI or Grok logos and does not claim endorsement.

### Images

These 21 files are AI-generated illustrations. **Created with Grok.**

The [Brand Guidelines](https://x.ai/legal/brand-guidelines) (dated 2025-02-14), Content Attribution, require one of these phrases, legible and noticeable, wherever Grok-generated material is published: "Written with Grok" / "Created with Grok". The [Consumer Terms of Service](https://x.ai/legal/terms-of-service) (updated 2026-10-12) §4 require that attribution, and an AI-generated disclosure when Output is published. Do not remove a Grok watermark where one exists.

- `public/og.jpg`
- `public/scenes/balcony.jpg`
- `public/scenes/books.jpg`
- `public/scenes/cafe.jpg`
- `public/scenes/dinner.jpg`
- `public/scenes/doorway.jpg`
- `public/scenes/farmacia.jpg`
- `public/scenes/kitchen-radio.jpg`
- `public/scenes/market.jpg`
- `public/scenes/miradouro.jpg`
- `public/scenes/office.jpg`
- `public/scenes/padaria.jpg`
- `public/scenes/pastelaria.jpg`
- `public/scenes/phone.jpg`
- `public/scenes/radio.jpg`
- `public/scenes/stairwell.jpg`
- `public/scenes/street.jpg`
- `public/scenes/tasca.jpg`
- `public/scenes/terrace.jpg`
- `public/scenes/ticket.jpg`
- `public/scenes/tram.jpg`

### App icon and mark

These files are **Created with Grok** (AI-generated). The mark is drawn as SVG code by Grok Build (the Grok app builder) and the PNGs are rasterizations of it. They are not claimed as human-made.

- `public/favicon.svg`
- `public/icon-180.png`
- `public/icon-192.png`
- `public/icon-512.png`
- `public/icon-maskable-512.png`
- `src/components/azulejo-mark.tsx`

### Fonts and icons

- Figtree and Fraunces (`@fontsource-variable/figtree`, `@fontsource-variable/fraunces`) are OFL-1.1, bundled and self-hosted.
- Icons are `lucide-react` (ISC).

### Course text, speech, and Conversas

- Lesson, verb, grammar, reading, and radio texts in `src/data/*.ts` are original course content under the repo MIT license. No corpus or third-party word list was copied. Station names in `src/data/radio.ts` (Antena 1, Antena 2, TSF, Rádio Municipal, Carris) are references only.
- `src/lib/tts.ts` ships no voices. Speech uses the Web Speech API and a European Portuguese voice provided by the device. No license row.
- Conversas calls the xAI API (`XAI_API_KEY`). That is a service, not an asset. Replies are AI-generated, written with Grok.
- `numpy` (BSD-3-Clause) and `pillow` (MIT-CMU) are imported only by `.grok/skills/**/*.py` and are listed in the table above. They are not pinned.

### Notable licenses

`lightningcss` is MPL-2.0 (file-level copyleft, build-time only). `class-variance-authority`, `typescript`, and `playwright` are Apache-2.0; keep each package's NOTICE with that package. `wrangler` is `MIT OR Apache-2.0`.

`bun run licenses:check` fails CI when a production dependency uses a license outside the allow-list. Two production licenses are allowed beyond the permissive SPDX set, each named here:

- `CC-BY-4.0`: `caniuse-lite` is build-time only (reaches the tree via `@tanstack/router-plugin` > `@babel/core` > `browserslist`; not in `.output`). caniuse data by Alexis Deveria, CC BY 4.0, https://creativecommons.org/licenses/by/4.0/
- `Unlicense`: `isbot` (via `@tanstack/react-router`). Public-domain dedication.

`victory-vendor` (via `recharts`) is `MIT AND ISC`. Both identifiers are already allowed, so the conjunction is not on the allow-list.

## Keeping this current

`.github/workflows/ci.yml` runs `bun run deps:check` and `bun run licenses:check` on every pull request and every push to `main`.
`bun run deps:check` runs `scripts/deps-check.mjs` on Bun (`bun scripts/deps-check.mjs`) and exits non-zero on problems. It fails closed: a tool, registry or lock problem never prints "all up to date" or "deps check passed".

1. Outdated: each direct dependency is patch, minor, major or prerelease. In-range patch and minor updates are a warning; `--strict` makes them a failure. A `latest` whose `engines.node` excludes Node 22 is skipped.
2. `bun.lock` must be lockfile version 2. Every package entry has a `sha512-` integrity and the default registry. The root workspace matches `package.json`. `bun install --frozen-lockfile --dry-run` must exit 0. Every `overrides` pin is recorded and applied.
3. GitHub Actions: every `uses:` under `.github/workflows` must be pinned to a 40-character commit SHA with a `# vX.Y.Z` comment.
4. This file: every direct dependency and listed transitive matches its locked version in `bun.lock`.

The outdated step needs network access.

### Adding a dependency

`bun add <pkg>`. No dependency install scripts run: `bunfig.toml` sets `[install] ignoreScripts = true` and `package.json` sets `"trustedDependencies": []`, so Bun's built-in default-trusted list (esbuild, sharp, workerd and others) does not apply. Bun 1.4.4 honours the empty list (it is recorded in `bun.lock`); `bunfig.toml` stays as defense in depth for older Bun versions (1.4.2 ignored an empty list and ran workerd's postinstall) and for `bun add`. `bun pm untrusted` therefore lists workerd's `postinstall` as blocked, which is expected. bica needs no install scripts (`build:cf`, the built tests and the wrangler dry-runs pass without them). A package that needs one takes a reviewed change to both settings. Never run `bun audit fix` unread: it rewrites exact `overrides` pins.

### Deferred updates

`nitro` is pinned at `3.0.260903-beta` (#48). The 3.0.260610-beta upgrade candidate is closed.

| Package                     | Locked          | Latest          | Why deferred                                                                  |
| --------------------------- | --------------- | --------------- | ----------------------------------------------------------------------------- |
| eslint, @eslint/js          | 9.39.5          | 10.12.0, 10.0.1 | major                                                                         |
| eslint-plugin-react-hooks   | 5.2.0           | 7.1.1           | major; adds rules                                                             |
| eslint-plugin-react-refresh | 0.4.26          | 0.5.7           | 0.x minor counts as major                                                     |
| globals                     | 15.15.0         | 17.13.0         | major                                                                         |
| @vitejs/plugin-react        | 5.2.0           | 6.1.2           | major                                                                         |
| @tanstack/react-table       | 8.21.3          | 9.3.1           | major                                                                         |
| @types/node                 | 22.20.5         | 26.6.5          | should follow the runtime's Node major                                        |
| lucide-react                | 0.510.0         | 1.56.0          | major                                                                         |
| react-day-picker            | 9.14.0          | 10.0.2          | major                                                                         |
| recharts                    | 2.15.4          | 3.10.1          | major; 2.x is deprecated upstream, so this needs its own migration            |
| typescript                  | 5.9.3           | 7.0.2           | major                                                                         |
