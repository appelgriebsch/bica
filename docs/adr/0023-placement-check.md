# 0023. Placement check: offline banded quiz that recommends the Start level

- **Status**: Accepted
- **Date**: 2026-11-20
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; architecture pressure-tested via the domain-expert Consultant mode — web-frontend, bun, ci-cd lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none
- **Related issues**: #85, #156

## Context

The start level (`floor`, `src/lib/progress-store.ts`) is self-chosen: "Treat me as" on You (`src/routes/me.tsx`), "I am starting at" on Today (`src/routes/index.tsx`). Returning learners with prior Portuguese guess and land too easy or too hard (#85). Today offers the next unfinished lesson from `floor` up via `firstIncomplete(doneIds, floor)`; You shows an estimated level via `workingLevel`.

Forces in play: no accounts and no database (#33) — progress is device-only (zustand persist, localStorage) and moves between devices only via encrypted QR transfer (`transfer-schema.ts` is a strict zod schema; `mergeProgress` merges `floor` by `floorUpdatedAt`). The only AI call in the app is Conversas against Mistral (ADR 0006), so a placement check must be hand-authored and fully offline (not registered in `src/lib/online-features.ts`). The quiz machinery already exists: `QuizQuestion` (`src/data/types.ts`) with kinds `choice`/`truefalse`/`listen`/`type`, rendered by `QuizBlock` (`src/components/quiz-block.tsx`), with on-device pt-PT TTS for `listen` items and a `NO_VOICE_NOTE` fallback. CEFR is an ordinal ladder, not a percentage; short in-app diagnostics run ~10–20 minutes across all bands, while full adaptive/IRT placement needs item calibration and is out of scope for a five-minute check. GLOSSARY.md already names the product term "Placement check" ("Seen in: not in the tree").

## Decision

- **Item bank.** New `src/data/placement.ts`: `placementBands` — one band per level in `cefrRank` order (A1→C1), 3 `QuizQuestion` items each (15 total, ~5 minutes), mix of `choice`/`truefalse`/`listen`/`type`, English prompts with European Portuguese content, same conventions as the lesson quizzes. The file also exports a pure `recommendLevel(scores: Record<CefrLevel, number>): CefrLevel`; it imports no store code.
- **Scoring rule.** A band is cleared with ≥2 of 3 correct. The recommendation is the highest cleared band, capped so it never sits above the lowest failed band (lucky-hard-hit guard); if no band is cleared, the recommendation is A1.
- **Flow.** New route `src/routes/placement.tsx` runs one band at a time through the unmodified `QuizBlock` (`onFinished(correct)` yields the per-band score), then shows a result screen: recommended level with its `title`/`blurb` from `levels`, per-band score dots, primary action "Start at {level}", secondary "Choose another level" revealing the existing `StartLevelPicker`. Accepting calls only `setFloor(level)` (+ `announce()` + toast, then navigate to `/`); no XP, no streak, no lesson completion, no new persisted field. `routeTree.gen.ts` regenerates via the TanStack Start plugin.
- **Entry points.** Today's `doneCount === 0` section leads with a "Take the five-minute check" link to `/placement` plus a "choose yourself" toggle that reveals the existing picker; You gains a "Find my level with a short check" retake link next to "Treat me as".
- **Unchanged.** `progress-store.ts`, `transfer-schema.ts`, `mergeProgress`, `quiz-block.tsx`, `online-features.ts`, all server routes; no new dependency. `floor`/`floorUpdatedAt` keep travelling in QR transfers exactly as today (#15), and Today's "next unfinished lesson from that level up" works via the existing `firstIncomplete(doneIds, floor)`.

## Options Considered

| Option                                                                | Pros                                                                     | Cons                                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| Fixed banded check, 3 items per band, reusing QuizBlock (chosen)      | ~5 min, offline, smallest diff, per-band scores fall out of `onFinished` | Hand-authored, uncalibrated items                                                    |
| Adaptive / multistage CAT                                             | Stops when confident; fewer items on average                             | Needs calibrated item bank and routing logic; overkill for 5 bands                   |
| AI-generated questions via Mistral                                    | Zero authoring                                                           | Violates the ADR 0006 rule (only Conversas calls AI); not offline; non-deterministic |
| Self-assessment can-do list                                           | Zero items to author                                                     | Measures self-image, not performance; #85 asks for a check                           |
| Score = overall majority of 15 mapped to one band                     | One number                                                               | Hides per-band gaps; CEFR is an ordinal ladder                                       |
| Highest cleared band without the cap                                  | Simpler rule                                                             | A lucky pass on a hard band places the learner too high                              |
| Persist the full placement result (scores, timestamp) in the snapshot | "Last check" display; analytics                                          | Requires `transfer-schema.ts` + `mergeProgress` changes; not asked for (#85)         |
| Accept writes only the existing `floor` via `setFloor` (chosen)       | Zero schema/merge changes; QR semantics unchanged (#15)                  | No record that a check was taken; retake is always available anyway                  |
| Silent accept, no result screen                                       | Fewest states                                                            | Learner never sees why Today changed; breaks "accept or override on You"             |

## Consequences

- New files: `src/data/placement.ts`, `src/routes/placement.tsx`, `scripts/placement.test.mjs`; edited: `src/routes/index.tsx`, `src/routes/me.tsx`, `GLOSSARY.md` ("Placement check" gains its `Seen in` paths). New data-contract test pins the bank invariants and the `recommendLevel` boundaries (all-clear → C1; all-fail → A1; cap cases).
- Quality gates unchanged: `bun run test` (glob picks up the new test), typecheck, lint, build, `BICA_BUILT=1 bun run test`, plus a Playwright render check of `/placement` on dev and built output at ~390px (AGENTS.md quality bar).
- Risk accepted: 15 hand-authored items are not psychometrically calibrated, so a wrong recommendation is possible; mitigated by one-tap accept/override and unlimited retakes.
- No server, schema, budget, precache, secret, or dependency change; deploy is the existing Workers workflow; no migration.
- Revisit when: more items per band are wanted (raise `PLACEMENT_PER_BAND` and extend the bank), a per-skill (listen/read) split is needed, or placement analytics are requested (would add a persisted result field and transfer-schema changes).
