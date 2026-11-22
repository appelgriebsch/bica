# 0032. Gap S1: a third scripted-scene kind — Service Scenes ("Cenas de serviço") on Practice, first scene "marcar consulta" paired with L4/L8

- **Status**: Accepted
- **Date**: 2026-11-22
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; pressure-tested via the domain-expert Consultant mode — bun, web-frontend lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none (extends the ADR 0016/0021 scene-kind pattern with a third kind)
- **Related issues**: #173, #202, #168, #169, #86

## Context

Issue #173 (gap-review row S1, RICE 30, release: Next): Travel Scenes and Social Scenes exist; public services have none. First Service Scene: booking a consulta at the centro de saúde by phone. Persona: residents and movers (#86).

Current state on main (`5fc35dc`): two scripted-scene kinds exist. `TravelScene` (six/seven situations, `situation` field) and `SocialScene` (topic "social", register contract) each live in their own data file, and `getScriptedScene(id)` (`src/data/curriculum.ts`) returns `{ scene, kind: "travel" | "social" }`. `/scene/$id` renders any kind generically — `DialogueView` (Speak + Slow per line, offline), a lesson link from `lessonId` (its vocab feeds Palavras when finished), and a Conversas link from `scenarioId` (OnlineOnly). `practice.tsx` lists "Cenas de viagem" and "Cenas sociais". The social contract test pins `socialScenes` 1:1 to topic-"social" scenarios, so services cannot reuse that array. Dependencies are satisfied: L4 `a2-saude` (order 6) merged via #196, L8 `a2-telefone` (order 9) merged via #201; the scene's required `lessonId` is L4, L8 supplies phone phrases topically. `/scenes/phone.jpg` exists and is precached.

## Decision

- New third kind, mirroring SocialScene: `ServiceScene` type in `src/data/types.ts` (id, level, minutes, title, titlePt, setting, partner, lines, image, required `lessonId`, required `scenarioId`), `serviceScenes` array in a new `src/data/service-scenes.ts`, `getServiceScene` + `kind: "service"` branch in `getScriptedScene` (`curriculum.ts`), a "Cenas de serviço" section in `src/routes/practice.tsx` (rendered when non-empty, mirroring the social block), and the "Cenas de serviço" kicker in `src/routes/scene/$id.tsx`. All additive; they must land together or typecheck fails.
- First pair: offline scene `service-marcar-consulta` (A2, 8 min, "Booking a consulta" / "Marcar consulta", setting = phone call to the centro de saúde reception ending "Falam de você.", 6–10 You/Receptionist lines, image `/scenes/phone.jpg`, `lessonId: "a2-saude"`, `scenarioId: "marcar-consulta"`) and Conversas partner `marcar-consulta` in `src/data/scenarios.ts` (A2, topic `health`, 8–10 min, partner "The receptionist at the centro de saúde", opener + ≥3 goals, same image, `register: "você"` — pill on `/speak`, `registerPrompt` in the partner prompt, "Register: você." in the review).
- GLOSSARY.md gains the **Service Scenes** term in the same PR (issue AC): scripted offline scenes for public services on Practice, Travel Scenes pattern, required `lessonId` feeding Palavras, plus a Conversas `scenarioId` partner; opens from Practice without finishing the Path; offline except Conversas.
- Test: new `scripts/service-scenes.test.mjs` mirroring the social contract — unique ids, level ≥ A2, `lessonId` resolves with a vocab section, `scenarioId` resolves and levels match, image exists under `public/`, 6–10 lines, setting ends with the register sentence, 1:1 scene↔partner mapping; extend the `getScriptedScene` assertion in `social-scenes.test.mjs` to the third kind.
- No `chat-core.ts` change: the partner prompt is assembled from scenario fields and the gate/caps/Corrections apply unchanged. No server, migration, config, dependency, or CI change.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| New ServiceScene kind mirroring SocialScene (chosen) | Direct precedent (#134/#135); social 1:1 contract untouched; scenes feature stays uniform | Touches six source files (all additive, must land together) |
| Reuse the socialScenes array with a flag | One array | Breaks `social-scenes.test.mjs` 1:1 social-scenario mapping; rejected |
| Extend TravelScene with a service situation | Reuses one kind | Travel situations are pinned by contract test; services are not travel; rejected |
| Register "você" on the partner (chosen) | Matches reception/service formality; ADR 0021 mechanics | Setting must state the register in words — pinned by the new test |
| Dedicated illustration via `scripts/scene-regen` | Thematic art | `phone.jpg` exists, is precached and fits a phone scene; regen is a separate pipeline — follow-up |
| No ADR | Smaller PR | Owner chose an ADR for the new kind (cf. ADR 0030 for the seventh travel situation) |

## Consequences

- Practice gains "Cenas de serviço"; `/scene/service-marcar-consulta` works offline with Speak + Slow on every line, links the `a2-saude` lesson (Palabras on completion) and the `marcar-consulta` Conversas partner (online-only). `/speak` gains A2 → Health with the register pill.
- Gates: `bun run test` (new contract + updated getScriptedScene assertion + full suite), `bun run typecheck`, `bun run lint`, `bun run build`, `BICA_BUILT=1 bun run test`; browser smoke on dev and the served build (`/practice`, `/scene/service-marcar-consulta`, `/speak`, `/speak/marcar-consulta`); 390px check. Sandbox without Chromium system libs → smoke in CI (precedent #161/#181).
- Portuguese wording (scene lines, setting, opener, goals) remains a human gate: language review by the repo owner (#173 AC).
- Revisit when: more service scenes land (post office/bank from L2, casa from L3) — then the kind is exercised beyond one entry; or if a cap on scenes per section is ever wanted.
