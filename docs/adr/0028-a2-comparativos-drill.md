# 0028. Gap G4: A2 grammar drill `gram-a2-comparativos` — append as the 5th A2 drill, reuse the ADR 0024 ptNote pattern, no route/component/quiz-kind change

- **Status**: Accepted
- **Date**: 2026-11-22
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; pressure-tested via the domain-expert Consultant mode — bun, web-frontend lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none (extends the ADR 0024 drill pattern with a fifth A2 drill)
- **Related issues**: #165, #189, #86

## Context

Issue #165 (gap-review row G4, RICE 48, release: Next): Camões lists comparatives and superlatives at A2; bica has one passing mention (e.g. `demasiado caro` in the A2 market lesson `a2-compras`, which the drill ties to). Movers and residents are confirmed in scope (#86).

Current state: `GrammarDrill` (`src/data/types.ts`, ADR 0024) already carries `ptNote?: PtNote`, and `grammarDrills` in `src/data/grammar.ts` has four A2 drills (`gram-a2-continuo`, `gram-a2-passado`, `gram-a2-preps`, `gram-a2-imperativo`). Rendering is fully generic: `/grammar` maps `grammarDrills` per level, `/grammar/$id` renders the body, three examples with `SpeakButton` (slow replay included, on-device pt-PT TTS per `src/lib/tts.ts`), an optional `PortugalNote`, then `QuizBlock`; "Next drill" and Today's next-drill chain follow authored array order; completion persists via `persistCompletion`. GLOSSARY.md and the two route copy sites say "at least three drills on every level" (reworded in #160/#181, pinned by `scripts/grammar-notes.test.mjs`).

## Decision

- Append one static `GrammarDrill` `gram-a2-comparativos` after `gram-a2-imperativo` (5th A2 drill): level A2, 8 min, title "Mais caro do que — comparatives and superlatives", titlePt "Comparativos e superlativos". Body covers mais/menos … do que, o mais / o menos + adjective with gender agreement, tão … quanto, and the irregulars melhor/pior/maior/menor. Three examples, one short line each, in a market/shopping register that ties to `a2-compras`. Seven-question quiz using only the four existing kinds (`choice`, `truefalse`, `listen` with `speak`, `type` with `accept`), with `explain` on every question.
- ptNote per ADR 0024, contrasting the one real PT×BR difference in this topic: Portugal keeps "do que" (`mais caro do que`), Brazil often drops it (`mais caro que`). The irregulars melhor/pior/maior/menor are identical in both varieties and stay in the body and quiz.
- The GLOSSARY.md three-drill line is edited in the same change: it keeps "at least three drills on every level" (guard-test requirement) and records that A2 carries five drills, the fifth being `gram-a2-comparativos`.
- Test: extend `scripts/grammar-notes.test.mjs` — 5th A2 position (index 4), 8 min, 7 questions, all four kinds, `listen` has `speak`, `type` has `accept`, 3 examples; coverage assertions for mais/menos … do que, o mais/o menos + adjective, and melhor/pior/maior/menor; ptNote shape (non-empty `pt`/`br`/`en`, `pt !== br`) plus the do-que/que contrast. The per-level `>= 3` guard keeps the copy honest.
- No new route, component, quiz kind, type, dependency, image, or precache change.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Append as the 5th A2 drill + GLOSSARY line edit + guard pins (chosen) | Smallest complete change; array order keeps existing position pins stable; the "at least three" copy stays true | A2 grows to five drills (accepted by the owner) |
| Replace an existing A2 drill to keep the count at 4 | Count unchanged | Deletes working content that covers a distinct topic; allowed by #165 but unneeded once the line says "at least three"; rejected |
| A dedicated lesson + scene pair instead of a drill | More content | #165 explicitly asks for a Grammar drill; `a2-compras` already exists; rejected |
| A new quiz kind or component for comparison drills | Richer UI | #165 mandates existing quiz kinds only; `QuizBlock`/`SpeakButton` already cover listen/type; rejected |
| ptNote on "do que" vs "que" | The one clear PT×BR difference in this topic | Irregulars need no note (identical in both) — recorded here instead |
| No ADR | Smaller PR | Owner chose to record the decision; repo pattern for significant decisions |

## Consequences

- Offline behavior, Speak + Slow replay, Practice/Path/Today listing, the Next-drill chain, and Palavras/progress feeding come free: static bundled data, existing components, `persistCompletion`. No dependency, config, migration, or `wrangler.toml` change. Deploys via the existing Cloudflare Workers workflow.
- Gates: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`, `BICA_BUILT=1 bun run test`; browser smoke on dev and the served build; 390px check. In a sandbox without Chromium system libs the smoke runs in CI (precedent #161/#181).
- Accessibility and layout: unchanged template (mobile-first `max-w-2xl`, accessible `SpeakButton` names, exactly one `SpeakButton` on `note.pt`); example lines stay short so the row's Speak button is not squeezed at 390px (ui-ux review finding).
- Portuguese wording remains a human gate: language review by the repo owner (#165 acceptance criteria).
- Revisit when: gap-review schedules more A2 grammar, or a cap on drills per level is ever wanted — the guard test pins array positions, so appends stay deliberate.
