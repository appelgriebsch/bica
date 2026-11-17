# 0015. Travel Phrasebook: trip phrases by situation on You before any Lesson, saveable to Palavras

- **Status**: Accepted
- **Date**: 2026-11-17
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill, architecture pressure-tested and UI reviewed via the ask-the-expert and ui-ux-expert skills)
- **Supersedes**: none
- **Related issues**: #77; tracer tickets #125 (T1 walking skeleton), #126 (T2 staples), #127 (T3 docs/verification); ADR 0016 (Travel Scenes, scenes record no progress), ADR 0012/0013 (slow replay rates)

## Context

Issue #77: the Phrasebook on You (`src/routes/me.tsx`) only fills from finished Lessons (`vocabFromCompleted`), so a traveller who has not done the Path has nothing to look up mid-trip. Required: a travel section by situation, playable aloud with Speak and Slow replay, fully offline, and saveable to Palavras.

Forces in play: Bica is an offline-first PWA — the service worker precaches the whole build (`scripts/precache.mjs`), so any static data in the bundle is offline by construction; TTS is on-device Web Speech with a strictly pt-PT voice (`src/lib/tts.ts`, local voices preferred offline); the shared `SpeakButton` already renders the Speak + Snail pair (ADR 0012/0013). The six trip situations exist as Travel Scenes (#76, ADR 0016) with reviewed pt/en "You" lines. Palavras is an SRS pile keyed by card ids in the persisted `cards` record (`src/lib/progress-store.ts`); card ids match `<prefix>:<normalised pt>` and that shape is exactly what the encrypted QR transfer accepts (`CARD_ID` in `src/lib/transfer-schema.ts`).

## Decision

- **Phrase source**: derive the 26 "You" lines of the six Travel Scenes (deduped by `normalizePt`, level inherited from the scene) plus 8 authored "Anywhere" staples (≈5 lifted from existing A1 lesson entries, 3 authored with `en`) — 34 phrases in a new `src/data/phrasebook.ts`, exported via `src/data/curriculum.ts`. Phrase id: `travel:<situation>:<normalizePt(pt)>`.
- **Surface and layout**: inside the Phrasebook on `/me` only — "On the trip" (travel groups, always rendered even with zero finished lessons; "Anywhere" first, then the six situations in `TRAVEL_SITUATIONS` order; stacked, always expanded, group heading = scene `titlePt`/`title`) above "From your lessons" (existing list). Each row: pt/en (truncate) + the existing `SpeakButton` (Speak + Snail, zero call-site changes) + an add button (`BookmarkPlus` → `Check` in `text-success`, `toast` + live-region `announce` on save). Semantic tokens only; no accordion, no new route, no new dependency.
- **Save to Palavras**: card-only. `saveToPalabras(id)` in `src/lib/progress-store.ts` creates `{ interval: 0, ease: 0, due: today, reps: 0, lapses: 0 }` only when no card exists (idempotent, never resets a graded card). No XP, no streak change (ADR 0016: scenes and their phrases record no progress). `reviewPool(completedIds, cards)` = `vocabFromCompleted(completedIds)` + travel phrases that have a card; `dueVocab()` filters that pool with an unchanged signature, so Today/Practice due counts include saved phrases with no call-site edits. The action is generic so #80 (save from Conversas) can reuse it.
- **Transfer**: phrase ids match the QR transfer `CARD_ID` pattern, so saved phrases move between devices through the existing `cards` merge with zero schema changes — pinned by test.
- **Tests**: `scripts/phrasebook.test.mjs` pins the derivation (26 unique ids, valid situations, scene-matching levels), the staples (8, deduped across all 34), `transferSchema` acceptance of phrase card ids, pool/due behavior (saved → due, unsaved → absent, level filter), and `saveToPalabras` semantics (due today, idempotent, `xp`/`streak` untouched).

## Options Considered

| Option                                                     | Pros                                                                                        | Cons                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Derive phrases from scene "You" lines + 8 staples (chosen) | Zero new copy for 26 phrases; pt/en already reviewed (#76); consistent with Cenas de viagem | A few derived lines are two sentences long                                 |
| New curated phrase file (~30 authored phrases)             | Short punchy lines                                                                          | ~30 new pt/en strings to author and review                                 |
| Card-only save in existing `cards` (chosen)                | No new persisted field; QR transfer and merge unchanged; reusable by #80                    | Saved state lives only as card presence (phrase text stays in static data) |
| New `savedPhrases` record in the store                     | Explicit list of saved phrases                                                              | Duplicates static data; needs transfer-schema + merge changes for no gain  |
| Section on `/me` (chosen)                                  | The issue names the Phrasebook, which lives on You                                          | None                                                                       |
| New `/phrasebook` route                                    | Own page                                                                                    | New navigation for a list; issue asks for a Phrasebook section             |
| Accordion/tabs per situation                               | Compact                                                                                     | Hides mid-trip content behind a tap; adds a component                      |
| Phrasebook records completion or XP                        | Visible progress                                                                            | Contradicts ADR 0016 (scenes record no progress)                           |
| Remove-from-Palavras                                       | Reversible save                                                                             | Palavras has no remove anywhere; deferred, out of scope                    |

## Consequences

- The offline criterion holds with zero new infrastructure: phrase data ships in the precached bundle, audio is on-device pt-PT; only the `/me` chunk hash rotates in `sw.js`. No new asset, route, or dependency.
- Saved phrases appear as due on `/review`, Today and Practice — intended; the due counts rise when a traveller saves phrases.
- QR progress transfer carries phrase cards unchanged; pinned by `phrasebook.test.mjs` so a future id change fails CI.
- `/review` cards for phrases render without `hint`/`examplePt` (guarded); speak falls back to `examplePt || pt`.
- Risk accepted: saved phrases raise the due counts on Today/Practice until reviewed.
- Revisit when: #80 (save from Conversas) reuses `saveToPalabras`; a phrase list without scenes is wanted (then the derivation step becomes optional); removing a saved phrase becomes a real need.
