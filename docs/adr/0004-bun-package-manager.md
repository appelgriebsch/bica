# ADR 0004: Bun as package manager and script runner, Node 22 as runtime

## Status

Accepted. 2026-10-22. Implemented after #52, so the build-once deploy pipeline from ADR 0003 / #52 is already in place.

## Context

Bica installs with npm (`package-lock.json`, `npm ci`, `npm audit --omit=dev`, `npx wrangler`). Hiato uses Bun 1.4.2 for installs and scripts but runs wrangler on Node. We prototyped the switch on a throwaway copy of `main` @ `f6c8b88`, with Bun 1.4.2 and Node 22.23.3.

**Node floor.** The project's Node advisory review sets **22.23.4** as the minimum patched Node 22. nodejs.org lists v22.23.4 (2026-10-20, security release, LTS "Jod") as the latest Node 22. Today bica pins only the major: `.nvmrc` = `22`, `engines.node` `>=22 <23`, and the three workflows read `.nvmrc` through `node-version-file`. Bun does not enforce `engines`, even with `engine-strict=true`, and `bun run` uses whatever `node` is first on PATH. On a machine with an older default Node that means v20.19.2. With no `node` on PATH, Bun substitutes itself, so `process.version` reports `v26.3.0`. Removing `.npmrc` drops the only engines enforcement, and nothing checks the version scripts actually run on. At `main` @ `a3b7554`, Node 22.23.4 passes typecheck, lint, the tests (290 pass / 19 skip; built 309/309), licences, deps-check and `build:cf`. The build output matches 22.23.3 apart from the known per-build fields.

**Lockfile.** `bun install` with `package-lock.json` present migrates it to `bun.lock` and keeps the npm-resolved tree. The only difference is two optional sharp-wasm packages (`@emnapi/runtime`, `@img/sharp-wasm32`). A fresh resolve without the old lock would move 61 packages, including workerd, miniflare, wrangler and TanStack.

**Overrides.** The `package.json` `overrides` (undici 7.30.1, nf3 0.3.17) are honoured as written. Without them, Bun resolves undici 7.29.1 and nf3 0.3.24.

**Scripts.** Every script runs under `bun run` while Node 22 is on PATH:

- tests: 290 pass / 19 skip; the built Worker 309/309;
- typecheck, lint, the licence check and the dev server all work.

**Output.**

- Client assets are byte-identical to an npm build.
- The Worker bundle differs by 104 B. Bun hoists srvx 1.0.6, so `srvx.mjs` folds into the `h3+rou3+srvx` chunk.
- The Durable Object module, the entry and the runtime chunk are byte-identical, and so is the wrangler binding table.

**Bun as runtime (`--bun`)**:

- rewrites vite's emitted preload helper, so every client chunk hash changes;
- `bun test` fails 19 of bica's `node:test` files;
- wrangler on Bun is not what hiato does either.

**Audit.**

- On the pre-#48 tree, the full `bun audit` and the full `npm audit` find the same high findings, through the same nitro → env-runner → miniflare → undici/sharp path. With `--audit-level=high`, both prod-only modes (`bun audit --prod`, `npm audit --omit=dev`) pass.
- `bun audit --prod` is **not** the same as npm's production audit. Bun treats optional-peer paths as non-production, while npm counts them.
- Example (#65): fast-uri 3.1.8 via `@hookform/resolvers` → `ajv` (optional peer) has 4 advisories (2 moderate, 2 low; fixed in 3.1.9). The full `bun audit` reports them, and so does `npm audit --omit=dev`; `bun audit --prod` reports none.
- The package counts (Bun 284 checked vs npm 257 prod packages) don't make Bun's production scope wider for findings.

**Licences.** `license-checker-rseidelsohn` output is identical on a Bun-installed `node_modules`.

**deps-check.**

- It can run on Bun alone: `Bun.JSONC` for bun.lock, a registry `fetch`, and `bun install --frozen-lockfile --dry-run`. That reproduces today's results in 0.4–0.8 s, against 1.3–2.0 s with npm.
- `bun outdated` and `bun pm ls` can't replace it: there is no JSON, `bun outdated` exits 0 when packages are outdated, and `bun pm ls` reads the lock rather than `node_modules`.
- Today's script **fails open**: with npm missing it prints "all up to date" and exits 0.

## Decision

1. **Bun installs packages and runs scripts.**
   - `bun install --frozen-lockfile`, `bun run <script>`, and `bunx wrangler` from the local install.
   - Deploy jobs that hold `CLOUDFLARE_API_TOKEN` run the lockfile wrangler via `node node_modules/wrangler/bin/wrangler.js` (keeps #52/#67 W-1). CI uses `bunx`.
   - `"packageManager": "bun@1.4.2"` in `package.json`.
   - CI uses `oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2.2.0` with `bun-version-file: package.json`, and needs no dependency cache.
   - The audit gate is `bun audit --prod --audit-level=high`. It fails only on high and above, so the optional-peer difference (see Context) doesn't change what the gate blocks today. A prod-only Bun audit can still miss findings on optional-peer paths. Optionally, CI also runs a full `bun audit` as a non-blocking report line.
   - `overrides` stay as they are.
2. **Node 22 runs the build, the tests and wrangler, and stays pinned.**
   - `.nvmrc` = `22.23.4`, `engines.node` `>=22.23.4 <23`, `setup-node` with `node-version-file: .nvmrc` and no npm cache (see point 8).
   - Never use `bun --bun` or `bun test` for the build, the tests or deploys. A config test guards this.
3. **Order.** The switch lands after #52, in one PR against #52's single `deploy.yml`.
4. **Lockfile.**
   - `bun.lock` is created by migrating `package-lock.json`, never by a fresh resolve.
   - `package-lock.json` and `.npmrc` are deleted in the same PR. There is no dual-lockfile period.
5. **Agent contract.** `AGENTS.md` and `startup.sh` use Bun (`bun run dev`, `bun add`, `bun install`). The same goes for README, `docs/cloudflare-workers.md`, `THIRD-PARTY.md` and the ADR 0001 npm references.
6. **deps-check is Bun-only.** `"deps:check": "bun scripts/deps-check.mjs"` is the one script on the Bun runtime. It is a check, not build output. It:
   - reads `bun.lock` with `Bun.JSONC.parse` and **requires `lockfileVersion === 2`**, failing loudly on anything else;
   - checks that every package entry has a `sha512-` integrity and the default registry;
   - checks that `workspaces[""]` dependencies and devDependencies equal `package.json`;
   - runs `bun install --frozen-lockfile --dry-run` (via `process.execPath`), which must exit 0;
   - checks that every `package.json` override is recorded in `bun.lock` and that every lock key for that name resolves to the pinned version;
   - reports outdated packages from the npm registry (abbreviated packument, timeout), with the same patch/minor/major classification and `--strict` rule as today, and skips a `latest` whose `engines.node` excludes Node 22;
   - keeps the GitHub Actions SHA-pin check and the THIRD-PARTY.md BOM check.
7. **Fail closed (folded in).** deps-check fails, and never prints "all up to date" or passes, when:
   - a tool can't run (spawn ENOENT or a signal);
   - a registry request fails, times out, returns non-200, or returns no `dist-tags.latest`;
   - `bun.lock` is missing, unparsable, or not lockfile version 2;
   - a result is empty where data is required: no package entries, no root workspace, or zero registry answers for a non-empty dependency set.

   Each case has a test.

8. **Node floor.** Node 22 stays the runtime for the build, the tests and wrangler. There is no move to a newer major.
   - The floor is **22.23.4**, the minimum patched Node 22.
   - `.nvmrc` is the single source of truth and holds the exact patch `22.23.4`. CI reads it through `node-version-file`. `engines.node` is `>=22.23.4 <23`. No workflow has a literal `node-version:`.
   - `scripts/node-check.mjs` (`"node:check"`, also run as `pretest`) runs under **Node**, not Bun. Inside a Bun process, `process.version` is Bun's compat version. It fails closed when:
     - `process.version` is unreadable;
     - the process is Bun (`process.versions.bun` is set);
     - the major is not 22;
     - the version is below `.nvmrc`;
     - `.nvmrc` is missing or not `X.Y.Z`;
     - `engines.node` disagrees with `.nvmrc`.
   - With `--exact`, used in CI right after setup-node, the version must equal `.nvmrc`. Without it, on a dev or agent box, a newer 22.x patch passes with a note.

## Alternatives rejected

- **Full Bun (Bun runtime for the build, tests and wrangler).** It changes the emitted client code, needs 19 tests ported from `node:test`, gives up the byte-identical bundle check, and runs wrangler on a runtime that hiato doesn't use for it either.
- **Stay on npm.** Zero risk, but it keeps two package managers across bica and hiato and an install about 10× slower (CI `npm ci` 11.9 s; Bun cold under 1 s).
- **Bun before #52, or folded into #52.**
  - Before: the edits to the two deploy workflows that #52 deletes would be thrown away, and the swap would have no artifact-level rollback.
  - Folded: it would mix a pipeline redesign with a toolchain change in one L-sized PR.
- **Keeping `package-lock.json` alongside `bun.lock`.** Two lockfiles drift, and deps-check could only trust one.
- **deps-check on `npm outdated` / `npm ls` reading bun.lock (option A).** npm would judge a tree it didn't install. Its extraneous-optional rule needs package-lock data that bun.lock doesn't have, and npm would stay in the toolchain only for this.
- **deps-check on `bun outdated` / `bun pm ls`.** No JSON; `bun outdated` exits 0 when outdated; `bun pm ls` doesn't inspect `node_modules`.

## Consequences

- The shipped client is byte-identical. The Worker bundle changes once (the srvx dedupe), so the first Bun artifact digest differs from the last npm one. Bindings, compat flags and the Durable Object are unchanged.
- Installs drop from about 12 s to under 1 s per job, and deps-check runs in under a second.
- deps-check no longer checks the installed `node_modules` the way `npm ls` did. CI always installs fresh with `--frozen-lockfile`, so this only matters for hand-edited local trees.
- No dependency install scripts run: `bunfig.toml` sets `[install] ignoreScripts = true` and `package.json` sets `"trustedDependencies": []`, so Bun's built-in default-trusted list (esbuild, sharp, workerd and others) does not apply. The bunfig setting is what enforces it: in Bun 1.4.2 an empty `trustedDependencies` alone still ran workerd's postinstall. bica needs no install scripts (`build:cf`, the built tests and the wrangler dry-runs pass without them). A package that needs one takes a reviewed change to both settings. Never run `bun audit fix` unread: it rewrites exact `overrides` pins.
- The prod-only audit scope differs from npm's. `bun audit --prod` skips optional-peer paths that `npm audit --omit=dev` counts (#65: fast-uri via `@hookform/resolvers` → `ajv`). At the high gate this changes nothing today. Findings below the gate, or on such paths, show up only in a full `bun audit`.
- Every Node 22 security release that raises the floor is a small PR: `.nvmrc` plus `engines`, with node:check and its tests enforcing that the two agree. Node 22 reaches end of life on 2027-04-30, and moving to a newer major needs its own ADR.
- A dev or agent box whose `node` is older than the floor, or is Bun's shim, now fails `bun run test` and `bun run node:check` loudly instead of silently running on the wrong Node.
- Hiato and bica now share Bun 1.4.2 and the same setup-bun pin. Hiato keeps `bun test` (its tests are written for it); bica keeps `node --test`.

## Rollback

- **Code:** the switch is one PR, so `git revert` of its merge commit restores `package-lock.json`, `.npmrc`, the workflows, the tests, deps-check and the docs. Bun has no state outside the repo.
- **Deploy:** the runtime and bindings are unchanged, so a bad deploy rolls back through the normal ADR 0003 / #52 path: `wrangler rollback --env production [version-id]`, or redeploy the previous artifact. The fail-closed behaviour from point 7 survives a revert only if it is re-applied to the npm version (the npm-based patch exists). The same applies to the Node floor from point 8: a revert restores `.nvmrc` = `22`, so re-apply `22.23.4` (and `engines`) on its own.
