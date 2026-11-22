# 0029. Gap G3: B1 grammar drill `gram-b1-perfeito-composto` — append as the 4th B1 drill, reuse the ADR 0024/0028 pattern, no route/component/quiz-kind change

- **Status**: Accepted
- **Date**: 2026-11-22
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; pressure-tested via the domain-expert Consultant mode — bun, web-frontend lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none (extends the ADR 0024 ptNote / ADR 0028 drill-append pattern with a fourth B1 drill)
- **Related issues**: #166, #191, #86

## Context

Issue #166 (gap-review row G3, RICE 48, release: Next): Camões puts the pretérito perfeito composto at B1; bica has zero examples (verified: no "perfeito composto" / "tenho andado" in `src/`, `scripts/`, `GLOSSARY.md`, `docs/adr/`). It does not map to English "have done" — it marks an action that started in the past and continues or is still relevant: `tenho andado muito ultimamente`.

Current state on main (`8f05650`, post-#165): B1 has exactly three drills in `src/data/grammar.ts` — `gram-b1-dois-passados`, `gram-b1-subjuntivo`, `gram-b1-infinitivo` (all 10 min). `gram-b1-dois-passados` covers imperfeito vs pretérito **simples**, a different contrast from this drill (perfeito composto vs simples); both stay, cross-referenced. Rendering is fully generic: `/grammar` maps `grammarDrills` per level, `/grammar/$id` renders the body, three examples with `SpeakButton` (slow replay, on-device pt-PT TTS per `src/lib/tts.ts`), an optional `PortugalNote`, then `QuizBlock`; "Next drill" and Today's next-drill chain follow authored array order; completion persists via `persistCompletion`. GLOSSARY.md says "at least three drills on every level" with the A2 count note added by #165 (pinned by `scripts/grammar-notes.test.mjs`).

## Decision

- Append one static `GrammarDrill` `gram-b1-perfeito-composto` after `gram-b1-infinitivo` (4th B1 drill): level B1, 10 min, title "Tenho andado — the perfect compound past", titlePt "Pretérito perfeito composto". Body covers ter + participle formation (tenho andado), the common irregulars feito, dito, visto, posto, and the contrast with the plain pretérito perfeito simples ("hoje comi" vs "tenho comido"), with an explicit cross-reference to `gram-b1-dois-passados` for the imperfeito contrast. Three examples, one short line each. Seven-question quiz using only the four existing kinds (`choice`, `truefalse`, `listen` with `speak`, `type` with `accept`), `explain` on every question — same shape as the merged `gram-a2-comparativos`.
- ptNote per ADR 0024/0028, contrasting the one real PT×BR difference in this tense: Portugal keeps `ter + participle` for a past action still relevant (`Tenho andado muito ultimamente.`); Brazil usually uses the simple pretérito there (`Andei muito ultimamente.`). The participles are identical in both varieties and stay in the body and quiz.
- The GLOSSARY.md three-drill line is edited in the same change: it keeps "at least three drills on every level" (guard-test requirement) and the existing A2 count note, and adds that B1 carries four drills, the fourth being `gram-b1-perfeito-composto`.
- Test: extend `scripts/grammar-notes.test.mjs` — 4th B1 position (index 3), 10 min, 7 questions, all four kinds, `listen` has `speak`, `type` has `accept`, 3 examples; coverage assertions for ter + participle, feito/dito/visto/posto, and the composto-vs-simples contrast; ptNote shape (non-empty `pt`/`br`/`en`, `pt !== br`) plus the tenho-vs-andei contrast. The per-level `>= 3` guard and copy-site tests keep passing.
- No new route, component, quiz kind, type, dependency, image, or precache change.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Append as the 4th B1 drill + GLOSSARY line edit + guard pins (chosen) | Smallest complete change; array order keeps existing pins stable; the "at least three" copy stays true | B1 grows to four drills (accepted by the owner) |
| Replace/rework an existing B1 drill to keep the count at 3 | Count unchanged | `gram-b1-dois-passados` covers a distinct contrast (imperfeito vs simples); no cap exists; rejected |
| Extend `gram-b1-dois-passados` instead of a new drill | One fewer drill | #166 explicitly asks for a new B1 drill; keeps drills focused; rejected |
| A new quiz kind or component for compound-past drills | Richer UI | #166 mandates existing quiz kinds only; `QuizBlock`/`SpeakButton` already cover listen/type; rejected |
| ptNote on "tenho andado" vs "andei" | The one clear PT×BR difference in this tense | Participles need no note (identical in both) — recorded here instead |
| No ADR | Smaller PR | Owner chose to record the decision; repo pattern for significant decisions (cf. ADR 0028) |

## Consequences

- Offline behavior, Speak + Slow replay, Practice/Path/Today listing, the Next-drill chain, and Palavras/progress feeding come free: static bundled data, existing components, `persistCompletion`. No dependency, config, migration, or `wrangler.toml` change. Deploys via the existing Cloudflare Workers workflow.
- Gates: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`, `BICA_BUILT=1 bun run test`; browser smoke on dev and the served build (`/grammar`, `/grammar/gram-b1-perfeito-composto`); 390px check. In a sandbox without Chromium system libs the smoke runs in CI (precedent #161/#181).
- Accessibility and layout: unchanged template (mobile-first `max-w-2xl`, accessible `SpeakButton` names, exactly one `SpeakButton` on `note.pt`); example lines stay short so the row's Speak button is not squeezed at 390px (ui-ux review finding).
- Portuguese wording remains a human gate: language review by the repo owner (#166 acceptance criteria).
- Revisit when: gap-review schedules more B1 grammar, or a cap on drills per level is ever wanted — the guard test pins array positions, so appends stay deliberate.
