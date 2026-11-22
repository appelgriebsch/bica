# 0030. Gap S4: A2 Conversas scene "No mercado" + seventh travel situation "market", linked to `a2-compras`

- **Status**: Accepted
- **Date**: 2026-11-22
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; pressure-tested via the domain-expert Consultant mode — bun, web-frontend lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none (extends the ADR 0016 travel-scene contract with a seventh situation, the revisit ADR 0025 anticipated)
- **Related issues**: #167, #193, #86

## Context

Issue #167 (gap-review row S4, RICE 48, release: Next): the shopping topic has a Conversas partner only at B1 (`livro`, bookshop); the A2 market Lesson `a2-compras` has no Scene. Movers and residents are in scope (#86) — the market is daily life, not only travel.

Current state on main (`8f05650`): `SpeakScenario` has no lesson field — the lesson-link pattern lives on the offline scenes (`TravelScene`/`SocialScene` carry `lessonId` + `scenarioId`; the linked lesson's vocab feeds Palavras via `catalogVocab`/`vocabFromCompleted`). Travel situations are pinned to exactly six by `scripts/travel-scenes.test.mjs`, and ADR 0025's revisit note says a seventh situation needs exactly that contract change. SocialScenes must map 1:1 to `topic: "social"` scenarios (`scripts/social-scenes.test.mjs`), so a shopping scene cannot go there. `/scenes/market.jpg` already exists in `public/scenes/` and is recursively precached. Register mechanics are data-driven: pill on `/speak` cards, `registerPrompt` in the system prompt, "Register:" line in the end-of-scene review.

## Decision

- Add `"market"` as the seventh entry of `TRAVEL_SITUATIONS` (`src/data/types.ts`).
- New `SpeakScenario` `mercado` in `src/data/scenarios.ts`: level A2, topic `shopping`, 8–10 min, title "At the market" / titlePt "No mercado", setting at a market stall ending with "Falam de você.", partner "The market vendor", openerPt/openerEn, at least three goals (ask for um quarto/meio quilo de…, ask the price, say demasiado caro, pay), image `/scenes/market.jpg`, `register: "você"`.
- New `TravelScene` `scene-mercado` in `src/data/travel-scenes.ts`: `situation: "market"`, level A2, 6–10 scripted você lines, image `/scenes/market.jpg`, `lessonId: "a2-compras"`, `scenarioId: "mercado"`. This is the lesson link: finishing `a2-compras` feeds its vocab to Palavras through the existing pattern.
- Contract tests move in the same change: `scripts/travel-scenes.test.mjs` six→seven situations plus a pin for the mercado scene (lesson with vocab, scenario link, image, line count, level match); `scripts/phrasebook.test.mjs` derived-phrase counts grow by the new scene's You lines and the Travel Phrasebook gains a market group; `GLOSSARY.md` "Travel Scenes" entry lists seven situations.
- No route, component, `chat-core.ts`, `package.json`, or CI change: the `/speak` grouping (ADR 0022), the partner system prompt (partner/setting/register/level/goals), the Turnstile gate, the burst and daily caps, and Corrections (ADR 0017) all work from the data unchanged. No scene-regen: `market.jpg` is reused.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Seventh travel situation "market" + mercado scenario/scene pair + contract test updates (chosen) | Uses the existing lesson-link pattern; ADR 0025 anticipated this exact contract change; image already precached | Pinned counts in travel-scenes/phrasebook tests must move in the same PR |
| SpeakScenario only, no offline scene | Smallest diff | The "linked to lesson a2-compras" acceptance criterion is unmet — no pattern links a bare scenario to a lesson |
| Link via a SocialScene | Reuses the #135 pair pattern | Rejected by contract: `social-scenes.test.mjs` requires SocialScenes to map 1:1 to `topic: "social"` scenarios |
| New optional `lessonId` on `SpeakScenario` itself | Direct link on the Conversas side | A new pattern, not "the existing lesson link pattern" the issue asks for; more code (type + render) for the same effect |
| Regenerate a dedicated market illustration via `scripts/scene-regen` | Thematic art | `market.jpg` already exists and is precached; regen is a separate pipeline (cf. #136) — not needed |
| Register "você" with pill/prompt/review pin (chosen) | Matches vendor–customer service register; ADR 0021 mechanics | Setting must state the register in words to stay consistent |

## Consequences

- The scenario appears on `/speak` under A2 → Shopping with the register pill automatically; the partner prompt pins "você"; the end-of-scene review repeats `Register: você.`; Conversas stays online-only with the existing caps; Corrections apply unchanged.
- The offline scene appears on Practice under "Cenas de viagem" and renders fully offline; only its Conversas button needs internet.
- Gates: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`, `BICA_BUILT=1 bun run test`; browser smoke on dev and the served build (`/speak`, `/speak/mercado`, `/practice`, `/scene/scene-mercado`); 390px check. In a sandbox without Chromium system libs the smoke runs in CI (precedent #161/#181).
- Portuguese wording (setting, opener, goals, scripted lines) remains a human gate: language review by the repo owner (#167 acceptance criteria).
- Revisit when: an eighth travel situation is ever wanted (same contract-change path), or shopping scenes grow beyond one (then consider a dedicated group on Practice).
