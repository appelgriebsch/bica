# 0014. Conversas partners for the restaurant and accommodation travel scenes

- **Status**: Accepted
- **Date**: 2026-11-17
- **Deciders**: Andreas Gerlach with the user
- **Supersedes**: none
- **Related issues**: #76; PR #115 (this change); tickets #117 and #118 (scenes linking to these partners); ADR 0016 (scene → partner model)

## Context

The six travel situations of #76 each need a Conversas partner (ADR 0016). Four already exist: `pastelaria` (café), `bilhete` (transport), `farmacia` (chemist), `direcoes` (asking the way). Restaurant and accommodation had none. No server change is needed for new scenarios: `src/lib/chat-core.ts` validates `scenarioId` against `speakScenarios` and builds the partner system prompt from the scenario's own fields (`partner`, `setting`, `level`, `goals`, opener).

## Decision

- Add two speak scenarios to `src/data/scenarios.ts` (shipped in PR #115):
  - `restaurante` — A1, 8 min, `/scenes/tasca.jpg`: a tasca in Bairro Alto; ask for mesa para dois, order from the menu, ask for a conta. Partner: the waiter.
  - `alojamento` — A2, 10 min, `/scenes/doorway.jpg`: the receção of a small guesthouse in Alfama; reserva para duas noites, pequeno-almoço, Wi-Fi password. Partner: the host at the desk.
- Levels match the lessons the scenes link to (`a1-mesa` is A1; `a2-hotel` is A2). Both images already exist in the 20 precached scene JPGs (ADR 0009 set), so offline listing and the precache are unchanged. `/speak` and the Practice Conversas card pick the new entries up automatically (`speakScenarios.length` is dynamic).

## Options Considered

| Option                                                                            | Pros                                                                          | Cons                                                                              |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Add `restaurante` + `alojamento` scenarios (chosen)                               | All six #76 situations get a live partner; data-only change; no server change | Two more chat surfaces under the same Turnstile / `CHAT_RATE` / `ChatBudget` caps |
| Link only the four existing partners; restaurant/accommodation scenes without one | Smaller change                                                                | Leaves two of the six issue situations without a partner                          |
| Reuse `trabalho-chat` (tasca table talk) for the restaurant                       | No new content                                                                | Different goal — work small talk, not ordering and paying                         |
| Partners defined only inside future `/scene/$id` pages, not in `/speak`           | Scenes self-contained                                                         | Duplicates content; `/speak` is the canonical scenario list                       |

## Consequences

- Data-only change (`src/data/scenarios.ts`, +32 lines); typecheck, lint, tests and build pass; `/speak` lists 15 scenes.
- Conversas cost stays bounded by the existing global/per-IP caps (`ChatBudget` Durable Object, `CHAT_RATE`), which are not per-scenario — no budget change was needed.
- The new ids are valid `scenarioId`s immediately; tickets #117/#118 link `scene-restaurant`→`restaurante` and `scene-accommodation`→`alojamento`.
- Revisit when: per-scenario usage analytics show an imbalance, or a scenario ever needs its own rate limit.
