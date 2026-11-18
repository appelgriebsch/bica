# 0018. Social Scenes in Conversas: a named set with a stated register (tu / você), plus offline scripted scenes on Practice

- **Status**: Accepted
- **Date**: 2026-11-18
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; architecture pressure-tested via the domain-expert Consultant mode — bun, web-frontend, ui-ux-design lenses)
- **Supersedes**: none
- **Related issues**: #81; tracer tickets #134 (T1 walking skeleton), #135 (T2 content), #136 (T3 images), #137 (T4 docs/verification)

## Context

Issue #81 asks for Social Scenes in Conversas — a family lunch, meeting a partner's friends, a coffee with colleagues — where each Scene states the register (tu or você) and the partner keeps to it, from A2 up. Today `SpeakScenario` (`src/data/types.ts`, data in `src/data/scenarios.ts`, 15 entries A1–C1) has no register field (GLOSSARY "Social Scenes" said "not a named set"), `/speak` is one flat list, and the partner system prompt is built per scenario in `chatTurn` (`src/lib/chat-core.ts`) from `partner`/`setting`/`level`/`goals`. Forces in play: Travel Scenes (ADR 0016) are the offline Practice item type, but `phrasebook.ts` derives the Travel Phrasebook from the `travelScenes` array, so social scenes must stay out of it; Conversas budget caps are global/per-IP, not per-scenario (ADR 0014); the end-of-scene corrections review exists and reviews learner lines only (ADR 0017); no sign-in, no database, no identity keying (#33); the app is offline-first and the only AI call is server-side Mistral (ADR 0006); the request schema is `{ scenarioId, messages }`, so any new scenario field is server-side data the client cannot inject; 20 precached scene JPGs exist under `public/scenes/` and `scripts/scene-regen` can generate more (~$0.10/image, MISTRAL_API_KEY). Grammar already teaches tu vs o senhor/a senhora (`src/data/grammar.ts`).

## Decision

- **Named set.** `SpeakScenario` gains `group?: "social"` and `register?: Register` where `Register = "tu" | "você"`. `/speak` (`src/routes/speak/index.tsx`) renders a "Cenas sociais" section above the remaining list. The existing family/friend/colleague scenes are tagged: `planos` (tu), `fim-de-semana` (você), `habitacao` (tu), `saudade-talk` (você), `mesa-serio` (tu).
- **Register is stated and enforced.** A visible-text tu/você pill shows on the `/speak` card kicker and the `/speak/$id` header. In `chatTurn`, a set register adds one system-prompt line — tu: "Address the learner as 'tu' (informal you) — never 'você' or 'o senhor/a senhora'." você: "Address the learner as 'você' — never 'tu'." — via a small `registerPrompt()` helper; `reviewTurn` gets a `Register: tu/você.` context line (review behavior unchanged). A data test requires every `group: "social"` scenario to declare a register and a level ≥ A2.
- **Three new chat scenes** (`src/data/scenarios.ts`): `almoco-familia` (A2, 10 min, você — family lunch at the partner's parents), `amigos-da-ines` (A2, 10 min, tu — meeting the partner's friends), `cafe-colegas` (B1, 10 min, você — coffee with colleagues), openers and goals written in-register.
- **Offline scripted scenes on Practice.** New `SocialScene` type (no `situation` field — the phrasebook stays travel-only): `{ id, level, minutes, title, titlePt, setting, partner, lines, image, lessonId, scenarioId }`, data in `src/data/social-scenes.ts` (8 entries, lines in the stated register), exported via `src/data/curriculum.ts` together with a combined `getScriptedScene(id)` → `{ scene, kind: "travel" | "social" }`. `/scene/$id` resolves both kinds (kicker "Cenas sociais" vs "Cenas de viagem", register pill when the linked scenario has one, lesson card always); Practice gets a "Cenas sociais" section. Every scene links a required lesson: family lunch→`a1-familia`, friends→new `a2-amigos`, colleagues→`a2-trabalho`, planos→`a2-planos`, fim-de-semana→`a2-ontem`, habitacao→`b2-debate`, saudade-talk→`b2-saudade`, mesa-serio→`c1-discussao`. `a2-amigos` is a new A2 lesson (unit `a2-talk`) with a vocab section so it feeds Palavras.
- **Images.** Three new JPGs (`family-lunch.jpg`, `friends.jpg`, `colleagues.jpg`) generated via `scripts/scene-regen` for the three new situations; the five existing social scenarios reuse their current precached images. The service worker precaches the whole built public folder, so no precache change.
- **No budget change.** The new scenes ride the existing Turnstile gate, `CHAT_RATE` burst and `ChatBudget` daily caps (ADR 0014). `reviewTurn`'s schema is unchanged (ADR 0017).

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| New `SocialScene` type + shared `/scene/$id` route (chosen) | Travel data, phrasebook and the travel test stay untouched; one scene page | Slightly more types than reusing `TravelScene` |
| Extend `travelScenes` with social situations | Least new code | `phrasebook.ts` derivation and the travel data-contract test would pick up social scenes; situation union widens |
| Separate `/social-scene/$id` route | Fully isolated | Duplicates the scene page UI |
| `register` field + prompt line + badge (chosen) | UI states it, partner is instructed, testable | Prompt-level enforcement only — not a hard guarantee |
| Badge only, no prompt line | Smaller diff | Partner would not reliably keep the register — fails the acceptance criterion |
| Prompt line only, no field | No type change | UI cannot state the register — fails the acceptance criterion |
| Client-supplied register in the request | Flexible | Trust-boundary violation — rejected; schema stays `{ scenarioId, messages }` |
| Named "Cenas sociais" section on `/speak` (chosen) | Discoverable named set | One more section on the page |
| Offline social scenes in scope (chosen) | Matches Travel Scenes pattern; offline rehearsal | More content to maintain |
| Required lesson per offline scene + one new lesson `a2-amigos` (chosen) | Every scene feeds Palavras via the existing pipeline | A2 reopens for users who completed A2 (accepted, ADR 0016 precedent) |
| Generate 3 new images (chosen) | Topically exact illustrations | Needs `MISTRAL_API_KEY` + manual QC; ~$0.30 one-off; +3 JPGs in the precache |

## Consequences

- +3 chat surfaces under the existing global/per-IP caps; no `wrangler.toml`, secret, binding or schema change; deploy is the existing Workers workflow.
- Register enforcement is prompt-level (temperature 0.7, 1–3 sentence replies) — a partner reply can still slip out of register; pinned by a `chat.test.mjs` prompt assertion, not by a guarantee. The corrections review does not flag register (out of scope, ADR 0017 unchanged).
- `a2-amigos` reopens a completed A2 level (accepted; same pattern as `a2-hotel` in ADR 0016).
- Tests: new `scripts/social-scenes.test.mjs` data contract (unique ids, level ≥ A2, lesson resolves with vocab, scenario resolves with register, 1:1 scene↔scenario mapping, images exist) plus register-line assertions in `scripts/chat.test.mjs`.
- Precache grows by 3 JPGs; no new dependency.
- Revisit when: per-scenario usage analytics show an imbalance (ADR 0014's revisit trigger), learners ask for register feedback in the corrections panel (would extend the `reviewTurn` schema), or social phrases are wanted in the Travel Phrasebook (would require widening `PhraseSituation` deliberately).
