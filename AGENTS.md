# Bica — agent workspace guide

**This file is the single source of truth** for agent work in this repo: the
sandbox/preview contract, the Bica project rules, and the quality bar. It
absorbed the former `AGENTS.project.md` — there is no second file anymore.

You are an agent running **inside an isolated Linux sandbox**; `/workspace` is
the project root. The **user only talks to you through the web client** — they
have no shell, SSH, filesystem, or tool access — so verify everything here and
never ask them to run commands, open URLs, or paste logs. Not every message is
a change request: answer questions directly instead of building.

## Project rules (Bica)

- **No sign-in, no accounts, no database (#33, ADR 0002 addendum).** There is
  no Better Auth, no `/login`, no `/api/auth/*`, no `DB` binding and no
  `@/lib/db`. Don't add them back.
- Progress is device-only: `src/lib/progress-store.ts` (zustand persist,
  localStorage). Moving it between devices is encrypted QR transfer, no server
  (#36, ADR 0005).
- Conversas (`sendChat`) is anonymous (#35): Turnstile + signed session cookie
  (`src/lib/chat-gate.ts`), per-IP burst `CHAT_RATE`, and daily global/per-IP
  caps in the `ChatBudget` Durable Object (`src/lib/chat-budget.mjs`). Never key
  limits on identity; see `docs/cloudflare-workers.md` for the secrets.
- **Conversas uses Mistral** (`MISTRAL_API_KEY`, ADR 0006); **xAI is fully
  removed** (#91). The only remaining Grok reference is the "Created with
  Grok" attribution on `public/og.jpg` (ADR 0008) — the scene illustrations are
  Mistral AI (ADR 0009) and the app icon/mark is original hand-authored SVG
  since #104 (ADR 0010), so no Grok credit is owed for those.

## Preview & sandbox contract

- Serve the app on **`0.0.0.0:8080`** (`bun run dev` already binds it) — the
  preview proxy auto-discovers a server on all interfaces and streams it into
  the user's **live preview**, which updates as you edit and save. Don't bind
  loopback-only or pick another port.
- Check the app from **inside** the sandbox at `http://127.0.0.1:8080` (curl /
  Playwright). The user never sees `/workspace`; the preview is their entire
  view of your work.
- Success = app **running and verified by you on :8080**, with **processes
  left running** and `startup.sh` kept correct. The sandbox may hibernate,
  restart, or be replaced; `/workspace` is the app state for this run.
- Speak in **product terms** ("your app is running in the preview") — never
  ports, paths, `localhost`, container, or tool names.

## `startup.sh` (you maintain it)

- Fixed path `/workspace/startup.sh`; the platform re-runs it after
  hibernate/revive to bring the preview back.
- **Idempotent** (probe `http://127.0.0.1:8080/` and exit 0 if healthy),
  **non-blocking** (start long-running processes in the background), must end
  with the app on **`0.0.0.0:8080`**, contains **no secrets**, and is **never
  deleted**. Update it in the same turn whenever the start command changes.

```sh
#!/bin/sh
set -eu
cd /workspace
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
bun run dev >>/tmp/app-startup.log 2>&1 &
```

## Environment

- Linux container, **Node ≥ 22.23.4 < 23** (check with `bun run node:check`),
  package manager **Bun 1.4.4**: `bun run dev|build|typecheck|test|lint`.
- Run `bun install` if `node_modules/` is missing. `bun add` works for JS
  packages (registry reachable); prefer deps already in `package.json`.
  **No system package managers** (apt etc. don't work) and **no install
  scripts** run (`bunfig.toml` sets `ignoreScripts`, `trustedDependencies: []`)
  — prefer pure-JS alternatives; never run `bun audit fix` unread (it rewrites
  the `overrides` pins).
- **Playwright + Chromium** are installed for your own QA — use
  `node scripts/browser-smoke.mjs http://127.0.0.1:8080/` and write QA
  screenshots under `screenshots/`, never `/tmp`.

## Build & deploy

- The app deploys **only to Cloudflare Workers** via
  `.github/workflows/deploy.yml`; you never trigger deploys. `bun run build`
  must succeed and emit valid Worker output — code that works in `bun run dev`
  but breaks the production/SSR build is a bug (watch for dev-only deps,
  server-only Node APIs at import time, runtime filesystem writes, hard-coded
  ports/hosts/secrets).
- A green build is **not** enough: serve the built output (`.output`) and load
  it in a browser. The classic blank-deploy failure is
  `Failed to load module script … MIME type "text/html"` — built `index.html`
  requests JS assets that 404, and the HTML fallback answers with the wrong
  MIME. Fix asset resolution, then re-verify the served build renders.
- `vite.config.ts` / `tsconfig.json` are preconfigured — don't recreate them.
  Keep the `0.0.0.0:8080` preview port and the nitro `cloudflare-module` preset
  **gated to `command === "build"`** with `serverDir: "./server"` (in dev, nitro
  would open a second port and break the single-port preview; without
  `serverDir` the deployed app loses the `server/middleware/*` Worker
  middleware). Add your own server routes under `src/routes/`, never in
  `server/`.

## App conventions

- TanStack Start: `src/router.tsx` exports a **named `getRouter()`** and passes
  `defaultErrorComponent: AppErrorComponent` (`src/lib/error-component.tsx`) —
  without it a runtime crash shows the framework's raw error banner. Keep the
  real `error.message` visible.
- `src/routes/__root.tsx` is the document shell. Its `head` must keep:
  - `{ name: "twitter:card", content: "summary_large_image" }` (X returns
    `NoCard` without a layout type);
  - `{ rel: "manifest", href: "/manifest.webmanifest" }`;
  - `og:image` wired to `https://${host}/og.jpg` via `@/lib/public-host`
    (`PUBLIC_HOSTNAME` is the runtime wrangler var — don't invent a `.env`).
    `scripts/brand-check.mjs` fails the smoke when `public/og.jpg` exists but
    the head doesn't point at it.
- `src/styles.css` starts with `@import "tailwindcss";`. Keep a base rule so
  buttons show a pointer cursor (Tailwind v4 preflight defaults to `default`):
  `@layer base { button:not(:disabled), [role="button"]:not(:disabled) { cursor: pointer; } }`
- Stack: React 19, TypeScript, Vite 8, TanStack Start/Router/Query/Table,
  Tailwind v4, Radix primitives, zustand, zod, lucide, sonner, cmdk, vaul,
  recharts. Pages are file routes under `src/routes/`.
- **AI features:** the only AI call is the Conversas chat, server-side against
  **Mistral AI** (`MISTRAL_API_KEY`, ADR 0006). Keep AI calls user-initiated
  and capped; don't mock responses or use another provider.
- No sign-in / database — see *Project rules*.

## Verification loop & quality bar

- **Verify it renders — mandatory.** Load the page in a browser (Playwright /
  `scripts/browser-smoke.mjs`) and confirm BOTH visible content and a clean
  console (no uncaught errors, no failed module/asset loads). A 200 from curl
  is not enough. Do this on **dev and on the built output** before calling
  anything done.
- Check a mobile viewport (~390×844): no horizontal overflow, primary UI
  usable, touch-friendly targets.
- Gates before finishing a change: `bun run test`, `BICA_BUILT=1 bun run test`
  (after `bun run build`), `bun run typecheck`, `bun run lint`, and
  `bun run build` — plus the served-build render check above.
- On follow-ups, **edit in place** — Vite HMR pushes changes to the live
  preview. Don't kill the dev server; restart only for `vite.config` /
  dependency changes (and update `startup.sh` in the same turn).
- Cohesive UI: design tokens in `src/styles.css`, no-slop polish, Tailwind +
  Radix + lucide.

## Communication rules

**Do:** assume the live preview is the user's only view of the app; leave
servers running when you finish; describe the product and offer next steps;
iterate in place on follow-ups.

**Don't:** ask them to open `localhost`/ports/Docker/URLs, run
install/build commands, check a terminal, or paste logs or screenshots; explain
sandbox plumbing (container paths, ports, preview relay, tool names) unless
they ask; end with "let me know if it works" as a substitute for verifying
yourself.

---

## Quick reference

```text
you:       agent in a Linux sandbox, cwd /workspace, Node 22 + Bun 1.4.4
user:      web client only — live preview, no shell/terminal/filesystem
serve:     bun run dev → bind 0.0.0.0:8080; leave it running
startup:   OWN /workspace/startup.sh — idempotent, background, never deleted
verify:    browser render check (dev AND built .output) — visible content, clean console; curl 200 is not enough
mobile:    check ~390px — no overflow, touch-friendly
gates:     bun run test, BICA_BUILT=1 bun run test, typecheck, lint, build
shots:     QA PNGs under screenshots/ — never /tmp
deploy:    Cloudflare Workers only (.github/workflows/deploy.yml); you never deploy
head:      twitter:card=summary_large_image, manifest link, og:image → og.jpg
ai:        only Conversas → Mistral (MISTRAL_API_KEY, ADR 0006); xAI removed (#91)
say:       product terms only — never ports, paths, localhost, container, tool names
never:     add sign-in/accounts/database (#33); ask the user to run anything
```
