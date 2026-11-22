# 0025. Gap L1 lesson `a1-dias` (days, months, booking a time) as content-only data, linked through a SocialScene/Conversas pair — travel situations stay capped at six

- **Status**: Accepted
- **Date**: 2026-11-22
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; architecture pressure-tested via the domain-expert Consultant mode — bun, web-frontend lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none
- **Related issues**: #162

## Context

Issue #162 (gap-review row L1, RICE 64, release: Now): no Lesson teaches weekdays, months or dates — `janeiro`/`dezembro`/weekday names appear only incidentally (6 hits, none as taught content). `a1-horas` covers clock time and opening hours but not `às três`, `no dia 15`, `na segunda-feira`, `marcar uma hora`.

Everything the lesson needs already exists and is generic over lesson data: the `Lesson` type with intro/vocab/grammar/dialogue/culture sections, optional `ptNote` per section and a quiz (`src/data/types.ts`); rendering in `lesson-player.tsx` / `dialogue.tsx` / `quiz-block.tsx` including the `SpeakButton` with slow replay on every line and `PortugalNote` below the current section; strictly pt-PT on-device TTS (`src/lib/tts.ts`, ADR 0012/0013); Palavras feeding through `catalogVocab`/`vocabFromCompleted` (`src/data/curriculum.ts`) once the lesson is finished; offline precache that scans `public/` recursively (`scripts/precache.mjs`), so every existing `/scenes/*.jpg` is already precached.

Contract constraints found during planning: `scripts/travel-scenes.test.mjs` asserts exactly the six #76 travel situations, and all six are taken (cafe, restaurant, transport, accommodation, chemist, directions) — a new TravelScene is impossible without a contract change. `scripts/social-scenes.test.mjs` requires every SocialScene at level ≥ A2 with a 1:1 mapping to a topic-`social` Conversas partner that declares a register and ends its setting with the register sentence; an A2 scene may link an A1 lesson (precedent: `social-almoco-familia` → `a1-familia`). `scripts/pt-notes.test.mjs` asserts the exact `NOTED_LESSONS` set and that any A1/A2 lesson whose prose mentions Brazil carries a `ptNote` (ADR 0018).

## Decision

- **Lesson**: `a1-dias` in `src/data/a1.ts`, unit `a1-city`, authored-array position directly after `a1-horas` (`order: 8`; `a1-metro` → 9, `a1-mesa` → 10), 12 min, skill `speak`, image `/scenes/phone.jpg`. Sections: intro; vocab (seven weekdays, month names, `hoje / amanhã`, `marcar uma hora`, `às … horas`, `e meia / um quarto`); grammar (`à segunda` / `às terças`, `em + month`, dates as cardinals with the 1st as ordinal — cross-reference `a1-ordinais`, no ordinals beyond 10th; a booked time `às três e meia`); dialogue (phone call booking a consulta at a clínica); culture (punctuality, Sunday lunch); quiz of 5–7 questions using the existing `choice`/`listen`/`truefalse`/`type` kinds.
- **ptNotes ×2** on the lesson: weekday preposition PT `à segunda-feira` / `às terças` vs BR `na segunda-feira`; PT `marcar uma hora` vs BR `marcar um horário`. `scripts/pt-notes.test.mjs` gains `"a1-dias"` in `NOTED_LESSONS` plus one contrast assertion — in the same change as the lesson.
- **Linked pair** (one atomic change): a new `SocialScene` in `src/data/social-scenes.ts` (A2, register `tu`, `lessonId: "a1-dias"`, `scenarioId: "marcar-encontro"`, image `/scenes/phone.jpg`, setting ending exactly `Falam de tu.`, 6–8 lines: phoning a friend to fix a day and time, `Vamos jantar na sexta-feira às oito?`) plus its 1:1 Conversas partner in `src/data/scenarios.ts` (id `marcar-encontro`, topic `social`, level A2, register `tu`, image `/scenes/phone.jpg`, ≥3 goals, opener).
- **No** new image, component, type, dependency, route, or precache change. `/scenes/phone.jpg` is already precached and already used (`scenarios.ts`, `social-scenes.ts`).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Content-only lesson + SocialScene/Conversas pair (chosen) | Smallest complete change; obeys all contract tests; reuses dias/datas content in a social phone call; offline + Speak/Slow + Palavras come free | Scene is A2 while the lesson is A1 (accepted precedent); pt-notes and social 1:1 tests must land in the same change |
| New TravelScene (e.g. chemist) for the booking | Semantically closest to a clínica | Blocked: exactly-six-situations test, all six taken; would need a contract change |
| Standalone topic-`health` Conversas scenario, no Practice scene | Smallest diff | No offline scripted practice linked to the lesson; user chose a linked pair in planning |
| Generate a new scene image | Thematic fit | Issue says scene image from `/scenes/`; `phone.jpg` already precached; regeneration is a separate pipeline |
| Split weekdays and dates into two lessons | Finer granularity | Issue asks for one lesson `a1-dias` (RICE E2) |
| Play the `br` ptNote form with audio | Symmetric audio | Contradicts the strict pt-PT-only rule in `src/lib/tts.ts`; rejected (same as ADR 0018) |

## Consequences

- Offline behavior, Speak + Slow replay, and Palavras feeding come free: static bundled data, existing components, recursive precache unchanged. No new dependency, config, migration, or `wrangler.toml` change; deploys via the existing Cloudflare Workers workflow.
- Gates per #162: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`, `BICA_BUILT=1 bun run test`, browser smoke on dev and on the served build, plus a 390px check of `/path`, `/lesson/a1-dias`, Practice and `/speak`.
- The pt-notes exact-set assertion and the social 1:1 mapping make the lesson, the scene pair, and the test-list line one atomic change — otherwise `bun run test` goes red.
- European-Portuguese wording of the new prose remains a human gate: language review by the repo owner (#162 AC).
- Revisit when: a seventh travel situation is ever wanted (needs a contract change to the six-situation test), or gap-review schedules a standalone health Conversas scenario.
