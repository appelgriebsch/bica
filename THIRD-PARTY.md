# Third-party bill of materials

Review of `main` at `188691f` after the in-range `npm update` in this PR.
Direct dependencies are the lockfile resolution of `package.json`.
`better-call`, `h3`, `jose`, `nf3`, and `pg-connection-string` are transitives on the auth, Nitro, and `pg` paths.
`numpy` and `pillow` are imported by `.grok/skills/**/*.py` and are not pinned.
CVE cells marked `none found` are OSV lookups for that exact version on 2026-10-13 (all 76 pinned npm rows).
Cells marked `not checked` were not queried.

| Name                          | Version         | License      | Critical update | CVEs        |
| ----------------------------- | --------------- | ------------ | --------------- | ----------- |
| @electric-sql/pglite          | 0.5.9           | Apache-2.0   |                 | none found  |
| @eslint/js                    | 9.39.5          | MIT          | not checked     | none found  |
| @fontsource-variable/figtree  | 5.3.0           | OFL-1.1      | not checked     | none found  |
| @fontsource-variable/fraunces | 5.3.0           | OFL-1.1      | not checked     | none found  |
| @hookform/resolvers           | 5.9.1           | MIT          | not checked     | none found  |
| @radix-ui/react-accordion     | 1.3.1           | MIT          | not checked     | none found  |
| @radix-ui/react-alert-dialog  | 1.2.1           | MIT          | not checked     | none found  |
| @radix-ui/react-avatar        | 1.3.1           | MIT          | not checked     | none found  |
| @radix-ui/react-checkbox      | 1.4.1           | MIT          | not checked     | none found  |
| @radix-ui/react-collapsible   | 1.2.1           | MIT          | not checked     | none found  |
| @radix-ui/react-dialog        | 1.3.1           | MIT          | not checked     | none found  |
| @radix-ui/react-dropdown-menu | 2.2.1           | MIT          | not checked     | none found  |
| @radix-ui/react-label         | 2.1.17          | MIT          | not checked     | none found  |
| @radix-ui/react-popover       | 1.3.1           | MIT          | not checked     | none found  |
| @radix-ui/react-progress      | 1.2.1           | MIT          |                 | none found  |
| @radix-ui/react-radio-group   | 1.5.1           | MIT          | not checked     | none found  |
| @radix-ui/react-scroll-area   | 1.4.0           | MIT          | not checked     | none found  |
| @radix-ui/react-select        | 2.4.1           | MIT          | not checked     | none found  |
| @radix-ui/react-separator     | 1.2.0           | MIT          | not checked     | none found  |
| @radix-ui/react-slider        | 1.6.1           | MIT          | not checked     | none found  |
| @radix-ui/react-slot          | 1.5.0           | MIT          |                 | none found  |
| @radix-ui/react-switch        | 1.4.1           | MIT          | not checked     | none found  |
| @radix-ui/react-tabs          | 1.2.1           | MIT          | not checked     | none found  |
| @radix-ui/react-toggle        | 1.2.1           | MIT          | not checked     | none found  |
| @radix-ui/react-toggle-group  | 1.2.1           | MIT          | not checked     | none found  |
| @radix-ui/react-tooltip       | 1.4.1           | MIT          | not checked     | none found  |
| @tailwindcss/vite             | 4.3.3           | MIT          | not checked     | none found  |
| @tanstack/react-query         | 5.104.2         | MIT          |                 | none found  |
| @tanstack/react-router        | 1.170.44        | MIT          |                 | none found  |
| @tanstack/react-start         | 1.169.1         | MIT          |                 | none found  |
| @tanstack/react-table         | 8.21.3          | MIT          | not checked     | none found  |
| @tanstack/router-plugin       | 1.168.45        | MIT          | not checked     | none found  |
| @types/node                   | 22.20.5         | MIT          | not checked     | none found  |
| @types/pg                     | 8.23.1          | MIT          |                 | none found  |
| @types/react                  | 19.3.0          | MIT          | not checked     | none found  |
| @types/react-dom              | 19.3.0          | MIT          | not checked     | none found  |
| @vitejs/plugin-react          | 5.2.0           | MIT          | not checked     | none found  |
| better-auth                   | 1.6.33          | MIT          |                 | none found  |
| better-call                   | 1.4.0           | MIT          |                 | none found  |
| class-variance-authority      | 0.7.1           | Apache-2.0   | not checked     | none found  |
| clsx                          | 2.1.1           | MIT          | not checked     | none found  |
| cmdk                          | 1.1.1           | MIT          | not checked     | none found  |
| date-fns                      | 4.4.0           | MIT          | not checked     | none found  |
| eslint                        | 9.39.5          | MIT          | not checked     | none found  |
| eslint-config-prettier        | 10.1.8          | MIT          | not checked     | none found  |
| eslint-plugin-prettier        | 5.5.7           | MIT          | not checked     | none found  |
| eslint-plugin-react-hooks     | 5.2.0           | MIT          | not checked     | none found  |
| eslint-plugin-react-refresh   | 0.4.26          | MIT          | not checked     | none found  |
| globals                       | 15.15.0         | MIT          | not checked     | none found  |
| h3                            | 2.0.1-rc.22     | MIT          |                 | none found  |
| jose                          | 6.2.12          | MIT          |                 | none found  |
| kysely                        | 0.28.17         | MIT          |                 | none found  |
| lightningcss                  | 1.33.0          | MPL-2.0      | not checked     | none found  |
| lucide-react                  | 0.510.0         | ISC          |                 | none found  |
| nf3                           | 0.3.17          | MIT          |                 | none found  |
| nitro                         | 3.0.260610-beta | MIT          |                 | none found  |
| numpy                         | unknown         | BSD-3-Clause |                 | not checked |
| pg                            | 8.23.1          | MIT          |                 | none found  |
| pg-connection-string          | 2.14.1          | MIT          |                 | none found  |
| pillow                        | unknown         | MIT-CMU      |                 | not checked |
| playwright                    | 1.64.0          | Apache-2.0   | not checked     | none found  |
| prettier                      | 3.9.10          | MIT          | not checked     | none found  |
| react                         | 19.3.0          | MIT          |                 | none found  |
| react-day-picker              | 9.14.0          | MIT          | not checked     | none found  |
| react-dom                     | 19.3.0          | MIT          |                 | none found  |
| react-hook-form               | 7.90.0          | MIT          | not checked     | none found  |
| react-resizable-panels        | 4.14.5          | MIT          | not checked     | none found  |
| recharts                      | 2.15.4          | MIT          | not checked     | none found  |
| sonner                        | 2.0.8           | MIT          |                 | none found  |
| tailwind-merge                | 3.7.0           | MIT          | not checked     | none found  |
| tailwindcss                   | 4.3.3           | MIT          |                 | none found  |
| tw-animate-css                | 1.4.0           | MIT          | not checked     | none found  |
| typescript                    | 5.9.3           | Apache-2.0   | not checked     | none found  |
| typescript-eslint             | 8.71.2          | MIT          | not checked     | none found  |
| vaul                          | 1.1.2           | MIT          | not checked     | none found  |
| vite                          | 8.3.4           | MIT          |                 | none found  |
| zod                           | 4.6.7           | MIT          |                 | none found  |
| zustand                       | 5.0.15          | MIT          |                 | none found  |

## Keeping this current

There is no CI, so run `npm run deps:check` before a release or after touching dependencies.
It runs `scripts/deps-check.mjs` and exits non-zero on problems:

1. `npm outdated`: lists each update as patch, minor, major or prerelease. In-range patch and minor updates are a warning; `--strict` makes them a failure.
2. Lockfile: v2 or later, every entry has `integrity` and resolves from `registry.npmjs.org`, the root entry matches `package.json`, and `npm ls --all` is clean.
3. GitHub Actions: every `uses:` under `.github/workflows` must be pinned to a 40-character commit SHA with a `# vX.Y.Z` comment. There are no workflows yet.
4. This file: every direct dependency and listed transitive matches its locked version.

The outdated step needs network access.

### Deferred updates

| Package                     | Locked          | Latest          | Why deferred                                                                  |
| --------------------------- | --------------- | --------------- | ----------------------------------------------------------------------------- |
| nitro                       | 3.0.260610-beta | 3.0.260903-beta | beta to beta, pinned exact; deploy output needs its own check                 |
| better-auth                 | 1.6.33          | 1.7.7           | range is `~1.6.30` on purpose; a minor of the auth layer needs its own review |
| eslint, @eslint/js          | 9.39.5          | 10.12.0, 10.0.1 | major                                                                         |
| eslint-plugin-react-hooks   | 5.2.0           | 7.1.1           | major; adds rules                                                             |
| eslint-plugin-react-refresh | 0.4.26          | 0.5.7           | 0.x minor counts as major                                                     |
| globals                     | 15.15.0         | 17.13.0         | major                                                                         |
| @vitejs/plugin-react        | 5.2.0           | 6.1.2           | major                                                                         |
| @tanstack/react-table       | 8.21.3          | 9.3.1           | major                                                                         |
| @types/node                 | 22.20.5         | 26.6.5          | should follow the runtime's Node major                                        |
| kysely                      | 0.28.17         | 0.29.6          | 0.x minor counts as major; better-auth also depends on it                     |
| lucide-react                | 0.510.0         | 1.56.0          | major                                                                         |
| react-day-picker            | 9.14.0          | 10.0.2          | major                                                                         |
| recharts                    | 2.15.4          | 3.10.1          | major; 2.x is deprecated upstream, so this needs its own migration            |
| typescript                  | 5.9.3           | 7.0.2           | major                                                                         |
