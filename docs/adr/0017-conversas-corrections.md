# 0017. Conversas corrections: a capped JSON-mode review call at scene end, shown as a session-only panel

- **Status**: Accepted
- **Date**: 2026-11-18
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; architecture pressure-tested via the domain-expert Consultant mode — bun, web-frontend, ui-ux-design lenses)
- **Supersedes**: none
- **Related issues**: #79; tracer tickets #131 (T1 walking skeleton), #132 (T2 polish)

## Context

Issue #79 asks that, at the end of a Conversas Scene, each learner sentence that needed a fix is shown with its European Portuguese form, Brazilian forms are flagged with the European form, a learner with no errors is told so, and the Conversas daily limits still apply with no account. Today `/speak/$id` is an open-ended chat: `sendChat` (`src/lib/chat-server.ts` → `sendChatHandler`/`chatTurn` in `src/lib/chat-core.ts`) gates every turn with Turnstile + a signed session cookie (`chat-gate.ts`), bills it to the per-IP burst `CHAT_RATE` and the daily `ChatBudget` Durable Object (global 2000 / per-IP 60), and calls Mistral (`mistral-small-latest`, ADR 0006). The partner system prompt already recasts errors in character, but nothing structured is captured and there is no end-of-scene moment. Constraints: no sign-in, no database, no identity keying (#33); the only AI call is server-side Mistral; the app is offline-first and Conversas is the only online feature.

## Decision

- **End of scene** is an explicit "Finish scene" button on `/speak/$id` (secondary action next to the input; disabled while busy, offline, or with zero learner turns).
- **Capture** is one extra Mistral call per finish: a new `reviewScene` server fn in `src/lib/chat-server.ts` → `sendReviewHandler`/`reviewTurn` in `src/lib/chat-core.ts`. The call reuses the exact chat preamble — fail-closed `apiKey`/Mistral-host check, scenario lookup, Turnstile `gate()`, and `limit()` taken **before** the upstream call — extracted into one helper shared with `chatTurn` so the gate and caps cannot drift. The request sets `response_format: {"type":"json_object"}` (supported by `mistral-small-latest`), `temperature: 0.2`, `max_tokens: 600`, a reviewer system prompt with the scenario context, and the transcript as messages.
- **Response handling**: `messageContentToString` → `JSON.parse` in try/catch → `reviewOutputSchema.safeParse` (`corrections[]` of `{ youSaid, pt, note, brazilian }` with per-field length caps, array capped at 12). Any failure returns a `BAD_REPLY`-style error and never throws. `ReviewResult` keeps the same discriminated shape as `ChatResult`, so `chatErrorMessage` works unchanged (403 challenge flow, 429 retry-after, daily-cap messages).
- **Budget**: the review call is billed exactly like a chat turn — same Turnstile gate, same `CHAT_RATE` burst, same `ChatBudget` daily caps. This satisfies "daily limits still apply" and closes the issue's cost-ceiling dependency: no new ceiling, no new env var, no new binding, no `wrangler.toml` change.
- **Presentation**: a corrections panel in the same `/speak/$id` frame below the chat (new `src/components/scene-review.tsx`), `aria-live="polite"`, each item "You said: …" → "In Portugal: …" with a short English note and a BR→PT badge when `brazilian` is true; empty list shows an explicit no-errors message; "Start again" resets the transcript. Session-only state on the page: nothing is stored, no account, nothing to sync. Model-provided strings render as text only.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Capped JSON-mode review call at scene end + panel (chosen) | Structured, reliable, flags Brazilian forms, reuses gate/caps, zod-validated, one bounded extra turn per finish | One extra Mistral call per finish (bounded by the same daily caps) |
| Parse the partner's in-character recasts from the transcript | No extra cost | Unstructured prose; cannot reliably flag Brazilian forms; fragile |
| Client-side BR→PT word map | No server call | Vocabulary only; misses grammar errors entirely |
| Separate smaller daily ceiling for reviews | Tighter cost control | New knob nobody asked for; the issue says the existing limits apply |
| Persist corrections to the device progress store | Visible later on Me/review, QR-transferable | Not asked for; adds storage and sync surface for a session summary |
| Auto-end after N turns or goodbye detection | No button | False triggers; heuristic goodbye detection is unreliable |

## Consequences

- End-to-end slice is thin: one new server fn plus one page/panel change; tests extend the existing rolldown-bundled `scripts/chat.test.mjs`, and `scripts/chat-smoke.mjs` gets a no-token 403 probe for `reviewScene` (T2, #132).
- Cost stays bounded: at most one review call per finish, inside the existing per-IP 60/day and global 2000/day caps; ~600 max output tokens; `mistral-small-latest` pricing unchanged (ADR 0006).
- Security posture unchanged: the transcript is untrusted input validated by the same zod caps as chat; the API key is only ever sent to a `mistral.ai` host; model output is schema-validated server-side and rendered as text on the client. JSON mode guarantees valid JSON, not schema adherence — hence `safeParse` plus the empty-list case.
- No new dependency, no new binding, no config change; deploy is the existing Cloudflare Workers workflow.
- Revisit when: per-IP review usage shows abuse patterns within the shared caps, the review prompt needs per-scenario tuning, or learners ask for corrections to persist across devices (would revisit the progress-store option).
