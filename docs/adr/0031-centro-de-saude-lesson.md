# 0031. Gap L4: A2 Lesson `a2-saude` "No centro de saúde" — insert at order 6 in `a2-life`, fixed id for the S1 pairing, ptNote centro de saúde vs posto de saúde

- **Status**: Accepted
- **Date**: 2026-11-22
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; pressure-tested via the domain-expert Consultant mode — bun, web-frontend lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none (follows the ADR 0025 #162 lesson-append precedent, with a thematic insertion instead)
- **Related issues**: #168, #195, #173, #86

## Context

Issue #168 (gap-review row L4, RICE 45 — highest Impact in Next, release: Next): health stops at the farmácia (`a2-farmacia`); there is no doctor / centro de saúde content and `112` has zero hits in `src/data` (verified). Camões A2 Serviços (theme 9) covers health centre, police and emergency. Persona: residents and movers (#86).

Dependency: S1 (#173, "First Service Scene — marcar consulta") pairs with this Lesson via the `lessonId` pattern on the scene. Therefore the lesson id is fixed as `a2-saude` and the lesson must carry a **vocab section** — the scene contract requires the linked lesson to resolve with vocab (`scripts/travel-scenes.test.mjs` pattern; words feed Palavras via `catalogVocab`/`vocabFromCompleted`).

Current state on main (`220e6b3`): a2-life lessons are a2-planos (order 4), a2-farmacia (5, titlePt "Saúde"), a2-compras (6), a2-hotel (7). `scripts/pt-notes.test.mjs` pins the exact set of A1/A2 lessons carrying a ptNote (`NOTED_LESSONS`). A2 lessons run 12 min with 5-question quizzes of the four existing kinds and reuse `/scenes/*.jpg` images (`farmacia.jpg` exists and is precached). Rendering is fully generic: `lesson-player.tsx` renders intro/vocab/grammar/dialogue/culture sections with `SpeakButton` (Play + Slower, on-device pt-PT TTS), per-section `PortugalNote`, and `QuizBlock`; the Path lists lessons by unit and order; completion persists via `persistCompletion`.

## Decision

- New `Lesson` `a2-saude` in `src/data/a2.ts`: level A2, unitId `a2-life`, order **6** (inserted after `a2-farmacia`; `a2-compras` renumbered 6→7, `a2-hotel` 7→8 — display-only, progress is keyed by lesson id), 12 min, skill `mix`, title "At the health centre — the doctor and 112", titlePt "No centro de saúde" (a2-farmacia already owns "Saúde"), image `/scenes/farmacia.jpg`. Sections: intro; **vocab** (centro de saúde, utente, inscrição, marcar consulta, symptoms — febre, tosse, dor de garganta — and 112/emergência phrases); grammar (inscrição no centro de saúde, marcar uma consulta para…, formal symptom description); dialogue (reception at the centro de saúde); culture (112 — the European emergency number, SNS 24). Quiz: 5 questions, existing kinds only, `explain` on each.
- ptNote per ADR 0018 on the vocab or grammar section: PT `centro de saúde` / `utente` vs BR `posto de saúde` / `paciente (SUS)` (e.g. pt "Vou marcar uma consulta no centro de saúde. Sou utente." / br "Vou marcar uma consulta no posto de saúde. Sou paciente do SUS.").
- Tests move in the same change: `scripts/pt-notes.test.mjs` gains `"a2-saude"` in `NOTED_LESSONS` (exact-set assertion) plus a centro-de-saúde vs posto-de-saúde contrast assertion; a new guard pin checks id, level, unit, order 6, 12 min, vocab ≥5 items, image exists under `public/`, quiz kinds within the four existing kinds, coverage of `112` / `inscri` / `utente` / `marcar consulta`, and the renumbered orders 7/8.
- No route, component, GLOSSARY ("Service Scenes" term is #173's), `package.json`, or CI change. No scene-regen: `farmacia.jpg` is reused. The S1 scene itself is implemented in #173.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| New lesson inserted at order 6 after a2-farmacia + renumber compras/hotel (chosen) | Thematic grouping (health next to farmácia); id fixed for the S1 pairing | Path order shifts for A2 learners mid-unit (display-only; ids stable, no migration) |
| Append at order 8 after a2-hotel | No renumbering | Health sits far from farmácia; owner preferred thematic placement |
| Also build the S1 service scene in this PR | One PR for the pair | #173 owns the Service Scene kind and its GLOSSARY term and depends on this lesson; splitting keeps contracts clean |
| ptNote centro de saúde/utente vs posto de saúde/paciente (chosen) | The clear BR difference in health vocabulary | Other health words are shared; noted here |
| New lesson image via `scripts/scene-regen` | Dedicated art | `farmacia.jpg` exists, is precached and topically right; regen is a separate pipeline |
| No ADR | Smaller PR | Owner chose to record the decision; repo pattern for significant decisions (cf. ADR 0025/0028/0029) |

## Consequences

- Path shows `a2-saude` at order 6 in a2-life; `/lesson/a2-saude` renders with the existing player — offline, Speak + Slow replay, per-section PortugalNote, QuizBlock. Vocab feeds Palavras on completion; the vocab section also satisfies the S1 `lessonId` contract for #173.
- Gates: `bun run test` (updated NOTED_LESSONS + guard pin), `bun run typecheck`, `bun run lint`, `bun run build`, `BICA_BUILT=1 bun run test`; browser smoke on dev and the served build (`/path`, `/lesson/a2-saude`); 390px check. In a sandbox without Chromium system libs the smoke runs in CI (precedent #161/#181).
- Portuguese wording (sections, quiz, ptNote) remains a human gate: language review by the repo owner (#168 acceptance criteria).
- Revisit when: #173 lands the first Service Scene (then the lesson↔scene link is exercised end to end), or more A2 Serviços lessons (L2 CTT/banco, L3 casa, L8 phone) shift the unit ordering again.
