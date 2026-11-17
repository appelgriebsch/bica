# 0016. Travel Scenes: offline scripted trip scenes on Practice, linked to lessons and Conversas partners

- **Status**: Accepted
- **Date**: 2026-11-17
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill, UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none
- **Related issues**: #76; tracer tickets #116 (walking skeleton), #118 (four scenes), #117 (accommodation + `a2-hotel`), #119 (verification); PR #115 (Conversas partners, ADR 0014)

## Context

Issue #76 asks for Travel Scenes on Practice for six trip situations (café, restaurant, transport, accommodation, chemist, asking the way) with four acceptance criteria: offered from Practice; each opens without finishing the A1 path; each has a matching A1/A2 lesson whose words feed Palavras; scene text and audio work offline — only the Conversas partner needs internet.

Forces in play: Bica is an offline-first PWA — the service worker precaches the whole build including all `/scenes/*.jpg` (#5), TTS is on-device Web Speech with a strictly pt-PT voice (`src/lib/tts.ts`), and Conversas is the only online feature (`src/lib/online-features.ts`, `OnlineOnly`). Progress is device-only (`src/lib/progress-store.ts`), and a finished lesson's vocab sections already feed Palavras via `catalogVocab()` / `vocabFromCompleted()` / `dueVocab()` (`src/data/curriculum.ts`). Existing A1/A2 lessons cover five of the six situations (`a1-bica`, `a1-mesa`, `a1-metro`, `a1-onde-fica`, `a2-farmacia`); accommodation had no lesson.

## Decision

- Travel Scenes are a new lightweight content type — not Lessons and not Conversas scenarios: `TravelScene` in `src/data/types.ts` (`id`, `situation`, `level`, `minutes`, `title`/`titlePt`, `setting`, `partner`, `lines[]`, `image`, `lessonId`, optional `scenarioId`), data in `src/data/travel-scenes.ts`, exported with `getTravelScene(id)` via `src/data/curriculum.ts`.
- One route `/scene/$id` renders a scene: precached image, setting, dialogue lines each with a `SpeakButton` (offline pt-PT TTS), a link card to the matching `/lesson/$id`, and — when `scenarioId` is set — an `OnlineOnly feature="conversas"`-gated link to `/speak/$scenarioId`. A shared `DialogueView` (`src/components/dialogue.tsx`) is extracted from `lesson-player.tsx` and used by both.
- Practice (`src/routes/practice.tsx`) gets a "Cenas de viagem" section listing the scenes; cards are plain links, never gated on path progress.
- Scenes record no progress: no completion, no XP, no SRS cards. The linked lesson is the only unit of progress; finishing it feeds Palavras through the existing pipeline, unchanged.
- Accommodation gets a new A2 lesson `a2-hotel` (unit `a2-life`, image `/scenes/doorway.jpg`) so the sixth scene has a matching lesson. Accepted side effect: `isLevelComplete("A2")` now includes `a2-hotel`, so users who finished A2 see the level open again (release:now content; the mastery overlay re-triggers on re-completion).
- Scene → lesson → partner mapping: café→`a1-bica`/`pastelaria`, restaurant→`a1-mesa`/`restaurante`, transport→`a1-metro`/`bilhete`, accommodation→`a2-hotel`/`alojamento`, chemist→`a2-farmacia`/`farmacia`, directions→`a1-onde-fica`/`direcoes`.
- Data contract enforced by `scripts/travel-scenes.test.mjs`: exactly the six situations, unique ids, every `lessonId` resolves and is A1/A2 with ≥1 vocab section, every `scenarioId` resolves in `speakScenarios`, every image exists under `public/scenes/`.

## Options Considered

| Option                                                      | Pros                                                                                        | Cons                                                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| New `TravelScene` type + `/scene/$id` route (chosen)        | Matches the acceptance criteria exactly; offline by construction; no path/progress coupling | One more content type and route                                                                                            |
| Scenes as `Lesson` objects with a flag                      | Reuses the lesson player                                                                    | Drags scenes into path ordering, `isLevelComplete`, `firstIncomplete` and the completion semantics the issue does not want |
| Extend `speakScenarios` with scripted lines                 | One model for everything scene-like                                                         | Conflates the online chat (server round-trip, Turnstile, budget) with offline rehearsal; different gating                  |
| Scene records its own completion or feeds Palavras directly | Visible progress on the scene itself                                                        | Duplicates the lesson→Palavras pipeline; the issue asks for the lesson link, not a second feed                             |
| Accommodation reuses `a1-ordinais` (floor/lift words)       | No new lesson                                                                               | Weak fit for check-in; no reservation/room vocabulary                                                                      |
| Accommodation scene ships without a lesson link             | Smaller slice                                                                               | Violates the "matching lesson feeds Palavras" criterion                                                                    |

## Consequences

- The offline criterion holds with zero new infrastructure: route chunks and images are precached by the existing build (`scripts/precache.mjs`), audio is on-device; only the partner link is online-gated.
- No server code, no new dependency, no database; Conversas budget mechanics unchanged.
- Precache grows by one small route chunk; all scene images already ship.
- Risk accepted: the A2 completion threshold changes with `a2-hotel` (see Decision).
- Revisit when: scenes need their own progress tracking, or a scene without a matching lesson becomes a real case.
