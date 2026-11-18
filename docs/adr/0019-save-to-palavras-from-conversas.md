# 0019. Save to Palavras from Conversas: `chat:` cards plus a persisted `savedWords` record that travels with Send progress

- **Status**: Accepted
- **Date**: 2026-11-18
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; architecture pressure-tested via the domain-expert Consultant mode — bun, web-frontend, ui-ux-design lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none
- **Related issues**: #80; tracer tickets #142 (T1 walking skeleton), #143 (T2 word/phrase selection + panel polish), #144 (T3 "From your conversas" on You + verification). Builds on ADR 0015 (`saveToPalabras`, card-id shape, phrase cards transfer unchanged), ADR 0016 (scenes record no progress), ADR 0005 (QR transfer and its strict bounded schema)

## Context

Issue #80: words met in Conversas are lost when the Scene ends; Palavras only fills from finished Lessons and saved Travel Phrasebook phrases. Required: a word or phrase from a Conversas reply can be saved to Palavras with an English meaning, it appears in the Phrasebook on You, and it stays on the device and travels with Send progress (the issue's F1 dependency).

Forces in play: Palavras is an SRS pile keyed by card ids in the persisted `cards` record (`src/lib/progress-store.ts`); card ids are `<prefix>:<normalizePt(pt)>` and that shape is exactly what the encrypted QR transfer accepts (`CARD_ID` in `src/lib/transfer-schema.ts`), so cards already travel with zero schema changes. `reviewPool()`/`dueVocab()` (`src/data/curriculum.ts`) resolve a card's pt/en from static data (lesson vocab, `src/data/phrasebook.ts`) and drive Palavras, Today and Practice due counts. A Conversas reply is `pt line\n(English gloss)` (the partner system prompt requires the gloss line). The one new problem: a saved chat word's pt/en exists in no static data, so it needs its own persisted record — and that record must cross the QR transfer, which is the F1 dependency. Constraints: no accounts, no database, no server (#33, ADR 0002); the only AI call is the Conversas chat (ADR 0006); saving must be a local, offline-capable action.

## Decision

- **Card id**: `chat:<normalizePt(pt)>` — global dedup, the same word saved in two scenes is one card. The card is created only when absent (idempotent, never resets a graded card), due today, no XP/streak (ADR 0016), via a new `saveChatWord({ pt, en, level })` action that reuses the `saveToPalabras` card semantics (ADR 0015).
- **New persisted record**: `savedWords: Record<cardId, { pt, en, level }>` in the progress store — added to state (default `{}`), `partialize`, `ProgressSnapshot` and `snapshot()`; `mergeProgress` unions it, and on the same id with different content remote wins (the tie convention `completed` already uses). Old stored state without the key hydrates to `{}` via zustand's shallow merge — no migration, the storage key stays `bica.progress.v1`.
- **Save UI**: bookmark button on assistant (partner) bubbles only, mirroring the `PhraseRow` pattern exactly (ghost 44px icon, `BookmarkPlus` → `Check` in `text-success`, `aria-pressed`, toast + `announce`). Native text selection inside a bubble selects a word or phrase; a floating "Save to Palavras" chip anchored at the selection rect makes selection discoverable on mobile; the bubble button saves the current selection when it lies in that bubble, else the whole first line. An inline panel grows under the tapped bubble: pt read-only, English input prefilled from the reply's gloss line for full-line saves (editable, required; a caveat line appears when a sub-phrase is saved because the gloss describes the whole reply), Save disabled until valid, `text-danger` error when `normalizePt(pt)` exceeds 120 chars (the `CARD_ID` limit), `<form>` so Enter saves, Esc cancels, focus moves into the input on open and back to the trigger on close, `scrollIntoView` on open. The panel stays outside `OnlineOnly` and enabled while `busy` — saving is local and works offline (the scene opener is an assistant turn and saveable).
- **Surfaces**: `/review` via `reviewPool(completedIds, cards, savedWords = {})` / `dueVocab(…, savedWords = {})` (defaulted params, existing callers keep compiling; Today/Practice counts pick saved words up with no call-site edits); `/me` gets a third Phrasebook group "From your conversas" ordered "On the trip" → "From your conversas" → "From your lessons", always rendered with a teaching empty state, rows pt/en + `SpeakButton`.
- **Transfer**: the envelope stays `{ v: 1, snapshot }`; the snapshot schema gains an optional, bounded `savedWords` record (`CARD_ID` keys with proto-key guard, strict `{ pt ≤ 160, en ≤ 200, level }` values, `MAX_SAVED_WORDS = 1000`). Old senders omit the field; the receiver defaults it with `?? {}`; the receive review shows "Saved words added/updated" rows via `newSaved`/`changedSaved` in `MergePreview`.
- **No server change, no new AI call, no new dependency.**

## Options Considered

| Option                                                               | Pros                                                                                           | Cons                                                                                                 |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `savedWords` record in the progress store, `chat:` card ids (chosen) | Reuses card machinery and the QR `CARD_ID` acceptance; text travels with Send; one state owner | New snapshot field; old app versions reject transfers that contain it (see Consequences)             |
| Encode pt/en inside the card id                                      | Zero schema change                                                                             | Fragile parsing, leaks into QR payload and merge keys, no validation at the boundary                 |
| Separate localStorage key outside the progress store                 | Small                                                                                          | Does not travel with Send progress — violates the third acceptance criterion                         |
| Server-side Mistral translation for the meaning                      | No user typing                                                                                 | A second AI call type; AGENTS.md allows only the Conversas chat; adds cost/limit surface             |
| Bump the transfer envelope to v2 with a v1/v2 union                  | Explicit forward compatibility                                                                 | Same mixed-version limitation (old receivers still reject v2), more code; v1 + optional field chosen |
| Scene-scoped ids `chat:<sceneId>:<normalizePt(pt)>`                  | Provenance per card                                                                            | The same word saved in two scenes becomes two cards; dedup is the better default                     |
| Save from the corrections panel or the learner's own lines           | More entry points                                                                              | Not asked for in #80; corrections stay session-only (ADR 0017)                                       |
| Remove-from-Palavras                                                 | Reversible save                                                                                | Palavras has no remove anywhere; deferred, out of scope (ADR 0015)                                   |

## Consequences

- Saved words are due today and raise the Palavras due counts on `/review`, Today and Practice until reviewed — intended, same accepted risk as ADR 0015.
- The transfer payload grows with `savedWords`; `MAX_SAVED_WORDS` plus the existing `MAX_INFLATED_BYTES`/`MAX_PARTS` caps make oversized transfers fail visibly, never truncate. Frame counts with ~1000 saved words are estimated, not measured — measure during #144.
- A device on the old app build rejects a transfer that contains `savedWords` (strict v1 schema): the transfer fails visibly, never silently corrupts. Mitigated by the PWA auto-update flow. Revisit with a v2 envelope if mixed-version transfers become common.
- localStorage needs no migration; hydration is unchanged.
- Saving is purely local, so it works offline and while a reply is in flight; no Mistral call, no Turnstile, no budget impact.
- Revisit when: remove-from-Palavras becomes a real need; saving from the corrections panel is requested; QR frame counts with a large `savedWords` pile need tuning.
