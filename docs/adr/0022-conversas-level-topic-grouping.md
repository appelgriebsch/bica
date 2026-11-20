# 0022. Group Conversas on /speak by CEFR level and topic

- **Status**: Accepted
- **Date**: 2026-11-20
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; architecture pressure-tested via the domain-expert Consultant mode — web-frontend, ui-ux-design lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none (revises the `/speak` presentation point of ADR 0021 — the pinned "Cenas sociais" section goes away; the register contract stays)
- **Related issues**: #154

## Context

`/speak` (`src/routes/speak/index.tsx`) renders the 14 `speakScenarios` (`src/data/scenarios.ts`) in two fixed sections: "Cenas sociais" (`group === "social"`, ADR 0021) on top, then "Outras cenas" in raw array order. Levels and subjects are interleaved, so the list reads as random. The request (#154) is to group and sort the conversas by (a) language level (A1, A2, ...) and (b) topic (social, travel, shopping, ...). Forces in play: `SpeakScenario` (`src/data/types.ts`) has `level` but no topic field; `cefrRank` and `levels` (`src/data/curriculum.ts`) already provide level order and titles; only `/speak` lists conversas as cards (Practice shows a count, `src/lib/chat-core.ts` validates `scenarioId` only, request schema stays `{ scenarioId, messages }`, so any new scenario field is server-side data the client cannot inject); the ADR 0021 register (tu/você) contract and the SocialScene 1:1 mapping are keyed on `group === "social"` and enforced by `scripts/social-scenes.test.mjs`; the a11y smoke pins `/speak` heading structure and a 390px pass (`scripts/a11y.test.mjs`), and `scripts/contrast.test.mjs` pins token color pairs; no sign-in, no database (#33); offline-first PWA deployed to Cloudflare Workers.

## Decision

- **Topic field.** `SpeakScenario` gains a required `topic: ScenarioTopic` and loses `group?: "social"`. `SCENARIO_TOPICS` (in `src/data/types.ts`, display order) is the fixed set of eight: `social, travel, food, shopping, health, work, home, leisure`, with an English `topicLabels` record (Social, Travel, Food, Shopping, Health, Work, Home, Leisure). All 14 entries in `src/data/scenarios.ts` are tagged: origem/planos/fim-de-semana/saudade-talk/mesa-serio/almoco-familia/amigos-da-ines → social; direcoes/bilhete/alojamento → travel; pastelaria/restaurante → food; livro → shopping; farmacia → health; trabalho-chat/cafe-colegas → work; habitacao → home; radio-chat → leisure.
- **Grouping helper.** `src/data/curriculum.ts` exports a pure `speakScenarioGroups()`: one group per level in `cefrRank` order (A1 → C1, titles from `levels`), inside it one sub-group per topic in `SCENARIO_TOPICS` order, and within a sub-group the authored array order (stable — no re-sort of items).
- **Presentation.** `/speak` renders one `<section>` per level with `h2` = level id + title, and inside it one `h3` + card list per topic; empty groups are skipped. The old "Cenas sociais"/"Outras cenas" split is deleted. Each card's kicker row gains a topic chip (visible text, muted pill using a contrast-pinned token pair, `flex-wrap` so nothing clips at 390px) next to the existing `level · minutes` and `RegisterPill`; heading order stays h1 → h2 → h3.
- **Social contract re-keyed.** `topic === "social"` replaces `group === "social"` everywhere, including `scripts/social-scenes.test.mjs` (register required, level ≥ A2, register sentence in the setting, 1:1 SocialScene mapping). The register pill and the `/speak/$id` kicker are unchanged.
- **Server untouched.** `chat-core.ts` keeps validating `scenarioId`; `topic` is display metadata only, never client input. No schema, binding, secret, or budget change.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Level outer, topic inner (chosen) | Matches the learning path and `cefrRank`; levels are the primary progression axis | Two heading levels of nesting |
| Topic outer, level inner | Topic-first browsing | Inverts the progression the rest of the app follows |
| Two flat lists (level-ordered + topic-grouped) | No nesting | Duplicates every card |
| 8 curated topics (chosen) | Covers all 14 scenes with one noun each | New vocabulary to maintain |
| 5 topics + "other" bucket | Smaller set | "Other" is a junk drawer; 9 of 14 scenes would need it |
| Reuse the 6 travel situations + social | No new vocabulary | Leaves work/health/home/news scenes unmapped; conflates two concepts |
| Required `topic` replacing `group` (chosen) | One source of truth; type-enforced | Renames a field ADR 0021 introduced; tests re-keyed |
| Keep `group` and add `topic` alongside | Smaller diff | Two overlapping fields can disagree |
| Keep the pinned "Cenas sociais" section | Preserves #134 as-is | Duplicates social scenes when topic grouping lands |
| English labels + topic chip on card (chosen) | Matches level titles; topic survives in flat contexts | New chip needs a contrast-pinned pair |
| Portuguese labels, headers only | Matches current section headers | Inconsistent with the English level titles; topic invisible on the card |

## Consequences

- `/speak` becomes a level → topic → card hierarchy; every scenario renders exactly once, pinned by a new `scripts/speak-topics.test.mjs` data-contract test (valid topic, exact coverage, group orders).
- `scripts/social-scenes.test.mjs` is re-keyed to `topic === "social"`; `travel-scenes.test.mjs` and `chat.test.mjs` are unaffected.
- The a11y smoke (s1 heading order, s2 390px) and the contrast test must stay green with the new `h3` level and the topic chip.
- No server, schema, budget, precache, or dependency change; deploy is the existing Workers workflow; no migration (progress store untouched).
- Revisit when: learners ask for topic/level filters on `/speak` (would add a client-side filter state on top of `speakScenarioGroups()`), a ninth topic is needed (widen `SCENARIO_TOPICS` and `topicLabels`), or the topic should also steer the partner system prompt in `chatTurn` (would be a deliberate server-side use of a new field).
