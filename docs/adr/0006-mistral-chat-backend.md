# 0006. Conversas chat backend: Mistral AI (global endpoint, EU optional) replaces xAI

- **Status**: Accepted
- **Date**: 2026-11-15
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: epic "Remove xAI/Grok from Bica; Conversas chat moves to Mistral AI" (M1/M4 tickets)

## Context

The only runtime xAI dependency in Bica is the Conversas practice chat:
`src/lib/chat-core.ts:100` POSTs to `https://api.x.ai/v1/chat/completions`
(model `grok-4.5`, max_tokens 280, temperature 0.7, 20 s `AbortSignal.timeout`,
fail-closed mapping) with `Authorization: Bearer $XAI_API_KEY`. The Turnstile
gate, per-IP burst (`CHAT_RATE`) and daily caps (`ChatBudget` DO) sit in front
of it and stay unchanged. The hiato project already standardized on Mistral
(`scripts/mistral-chat.ts`, ADR 0048) — on the **global** endpoint with a
retry loop; the retry loop does not carry over here.

Mistral facts (verified 2026-11-15 against docs.mistral.ai and pricing pages):
`POST https://api.mistral.ai/v1/chat/completions` is OpenAI-compatible with
`Bearer $MISTRAL_API_KEY`; the regional EU endpoint `https://api.eu.mistral.ai/v1`
uses the same key and costs +10%; `choices[0].message.content` may be a string
**or** an array of `{type:"text",text}` blocks (hiato run 43104173938 crashed on
blocks); prompt caching is automatic (cached input billed at 10% — relevant
because the system prompt repeats every turn); `mistral-small-latest` is
~$0.15/$0.60 per 1M tokens (worst case at the daily caps, 2000 turns × ~2.5k
tokens, ≈ $1/day, +10% on EU); Mistral imposes no attribution phrase on chat
output. Bica's learners are anonymous EU users typing free Portuguese text —
personal data under GDPR — so the EU regional endpoint (+10%) stays one
`MISTRAL_API_BASE` var away. An `XRequestDPA`
request header appears only in third-party blogs, not in official docs; the
official controls are the regional endpoint plus a console-signed DPA/ZDR.

## Decision

1. **Swap the chat call** in `chatTurn` to
   `https://api.mistral.ai/v1/chat/completions` (the **global** endpoint is the
   default), model `mistral-small-latest` (optional plain var `MISTRAL_MODEL`
   overrides), endpoint overridable via optional plain var `MISTRAL_API_BASE` —
   e.g. `https://api.eu.mistral.ai/v1` for EU-only processing (+10%, same key).
   `chatTurn` accepts only `mistral.ai`/`*.mistral.ai` hosts and fails closed
   before the gate, limiter and upstream call otherwise, so the Bearer key
   never leaves Mistral hosts (PR #98 review). Key read from
   `env.MISTRAL_API_KEY` (renamed Worker secret; fails closed when absent,
   exactly as `XAI_API_KEY` did).
2. **Vendor hiato's `messageContentToString`** and use it when reading
   `choices[0].message.content`; add one success test with blocks-shaped
   content.
3. **Keep the existing contract unchanged**: 20 s deadline, max_tokens 280,
   temperature 0.7 (no `top_p` needed), single-shot with no retry loop — the
   limiter deliberately takes the turn before the call, and retries cannot fit
   the interactive deadline. `!res.ok → BUSY` stays; Mistral's `retry-after` is
   irrelevant to the client contract (client-facing retry-after comes only from
   `CHAT_RATE`/`ChatBudget`).
4. **Plain `fetch`, no SDK** (`@mistralai/mistralai` adds bundle weight for zero
   benefit; the repo pattern is plain fetch).
5. **Rename `XAI_TIMEOUT_MS` → `CHAT_TIMEOUT_MS`** and sweep every xAI comment,
   test and doc reference (grep-driven: `scripts/chat.test.mjs`,
   `scripts/hardening-built.test.mjs`, `scripts/cloudflare-config.test.mjs`,
   `scripts/tts.test.mjs` tree scan broadened to `api\.x\.ai|XAI_API_KEY|…`
   with a `docs/adr/` allowlist, `docs/cloudflare-workers.md`, `README.md`).
6. **Regenerate `scripts/chat-smoke.mjs` `SEND_CHAT`** (content hash of the
   `sendChat` server fn) from the built bundle after the edit; the
   `BICA_BUILT=1` suite and the staging smoke fail loudly on drift.
7. **Rollout ordering per environment**: `wrangler secret put MISTRAL_API_KEY`
   → deploy → smoke → one manual real turn → approve production → only then
   `wrangler secret delete XAI_API_KEY`. With new code and a missing key the
   no-token probe returns 200 `UNAVAILABLE` instead of 403, so the staging
   chat-gate smoke itself proves the secret landed. Rollback to pre-rename code
   requires re-putting `XAI_API_KEY` (documented in the rollback section).
8. Compliance basis: **global endpoint by default + console-signed DPA**, with
   the EU regional endpoint available via `MISTRAL_API_BASE` when EU-only
   processing is required; verify during staging whether an `XRequestDPA` header
   exists (Mistral support/docs) and treat it as optional. The +10% regional
   upcharge applies only when the EU endpoint is selected.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Keep xAI `grok-4.5` | no change | rejected: the task is removing xAI |
| `mistral-small-latest` on the global endpoint (chosen) | hiato-proven, ~$1/day worst case, fast inside 20 s, simplest | data may be processed outside the EU; mitigated by the console-signed DPA, and the EU endpoint (+10%) is one `MISTRAL_API_BASE` var away; small-model quality at CEFR roleplay needs the strong system prompt (already in place) |
| `mistral-large-latest` | highest quality | ~$8-9/day worst case, slower, hiato saw preview large models hang/502 |
| Official `@mistralai/mistralai` SDK | typed client | unnecessary dependency; repo pattern is plain fetch |
| EU `api.eu.mistral.ai` via `MISTRAL_API_BASE` + console DPA | EU-only processing for GDPR | +10% regional upcharge; not the default |
| Retry loop (hiato batch style) | resilience | incompatible with limiter-takes-turn-first design and the 20 s deadline |

## Consequences

- Worker secret rename on staging and production (ops checklist in
  `docs/cloudflare-workers.md` updated; `MISTRAL_MODEL`/`MISTRAL_API_BASE` are
  plain `wrangler vars`, not secrets).
- `SEND_CHAT` hash regeneration is mandatory in the same change.
- New guard test: tree scan fails on any `api.x.ai` / `XAI_API_KEY` /
  `og.grok.me` / `__grok` / `grokPwa` / `extensions.js` / `grok.com` hit outside
  the `docs/adr/` history allowlist.
- Cost ceiling at the existing daily caps stays ≈ $1/day on the global endpoint (+10% only if the EU endpoint is selected via `MISTRAL_API_BASE`).
- Revisit if: Mistral retires `mistral-small-latest`, EU endpoint proves
  unreliable in staging, or roleplay quality needs a larger model.
