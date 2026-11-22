# Glossary

Product words for Bica. Each line is the meaning, then where the tree uses it.

The last eight names are confirmed. Where a name has no screen yet, `Seen in` says so. Feature ids from the roadmap are not file paths.

## Today

Home tab. It offers the next lesson and any Palavras that are due.

Seen in: `src/components/app-shell.tsx` (nav label), `src/routes/index.tsx`

## Path

Ordered lessons by Level and Unit. The page title is "The path".

Seen in: `src/components/app-shell.tsx`, `src/routes/path.tsx`, `src/data/curriculum.ts`

## Practice

Tab for Rádio, Uma página, Grammar, Verbs, Conversas and Palavras.

Seen in: `src/components/app-shell.tsx`, `src/routes/practice.tsx`

## You

Profile tab: Streak, the start Level ("Treat me as") and Phrasebook.

Seen in: `src/components/app-shell.tsx`, `src/routes/me.tsx`

## Level

CEFR band A1–C1.

Seen in: `src/data/types.ts` (`CefrLevel`), `src/data/curriculum.ts` (`levels`), `src/routes/path.tsx`

## Unit

Group of Lessons inside a Level.

Seen in: `src/data/types.ts`, `src/data/curriculum.ts` (`units`), `src/routes/path.tsx`

## Lesson

Sections plus a Quiz.

Seen in: `src/data/types.ts`, `src/data/curriculum.ts`, `src/components/lesson-player.tsx`

## Quiz

Questions that close a Lesson, or a Rádio, Uma página, Grammar or Verbs item.

Seen in: `src/data/types.ts` (`QuizQuestion`), `src/components/quiz-block.tsx`

## Palavras

Spaced review of words from finished Lessons, saved Travel Phrasebook phrases, and words saved from Conversas (#80, ADR 0019).

Seen in: `src/routes/practice.tsx`, `src/routes/index.tsx`, `src/routes/review.tsx`, `src/lib/online-features.ts`

## Phrasebook

The You section with phrases you can play aloud: the Travel Phrasebook ("On the trip") always, plus "From your conversas" (words saved from Conversas replies) and "From your lessons" (words from finished Lessons) — both groups always render, with a teaching empty state until there is something to list.

Seen in: `src/routes/me.tsx`

## Rádio

Listening bulletins. The Practice card title; Today calls the same thing Listen.

Seen in: `src/routes/practice.tsx`, `src/data/radio.ts`, `src/routes/listen/$id.tsx`

## Uma página

Reading pieces. The Practice card title; Today calls the same thing Read.

Seen in: `src/routes/practice.tsx`, `src/data/reading.ts`, `src/routes/read/$id.tsx`

## Grammar / Verbs

Grammar drills and verb tables by Level. Practice titles them Gramática and Verbos. Gramática is at least three drills on every level — A2 carries five, the fifth being comparativos e superlativos (`gram-a2-comparativos`). Verbos is one desk per level.

Seen in: `src/routes/practice.tsx`, `src/routes/grammar/index.tsx`, `src/routes/verbs/index.tsx`, `src/data/types.ts`

## Conversas

Online chat practice with a partner in a Scene.

Seen in: `src/routes/practice.tsx`, `src/routes/speak/index.tsx`, `src/lib/online-features.ts`, `README.md`

## Scene

A Conversas situation: level, topic, setting, partner and goals (`SpeakScenario`); `/speak` groups scenes by level, then topic (#154, ADR 0022). Today’s Speak card says "A short scene". A Lesson dialogue uses that same heading for a script, not for Conversas. A Travel Scene (below) is a separate Practice item, not a Conversas Scene.

Seen in: `src/data/types.ts`, `src/data/scenarios.ts`, `src/routes/index.tsx`, `src/routes/speak/index.tsx`, `src/components/lesson-player.tsx`

## Streak

Consecutive learning days. The header shows it as `{n}d` once it is at least one.

Seen in: `src/routes/index.tsx`, `src/routes/me.tsx`, `src/lib/progress-store.ts`, `src/components/app-shell.tsx`

## Start level

Level the learner chooses. You says "Treat me as". A new learner on Today sees "I am starting at". The control’s own default label is "Start from". Stored as `floor`.

Seen in: `src/routes/me.tsx`, `src/routes/index.tsx`, `src/components/start-level.tsx`, `src/lib/progress-store.ts`

## Nível concluído

Level completion. Kicker on the completion card. The Path marks a finished Level "Concluído".

Seen in: `src/data/level-mastery.ts`, `src/components/level-complete.tsx`, `src/routes/path.tsx`

## Send progress

Device-to-device progress transfer. You offers Send and Receive. Encrypted QR frames move progress between phones, with no server.

Seen in: `src/routes/me.tsx`, `src/routes/me_.send.tsx`, `src/routes/me_.receive.tsx`

## Offline / Online-only

Works without internet, or needs it. Lessons, review and on-device audio work offline. Conversas needs a connection.

Seen in: `src/lib/online-features.ts`, `src/components/online-only.tsx`, `src/components/offline-status.tsx`

## Corrections

Errors and European forms shown after a Scene: the end-of-scene panel "As tuas correções" lists each learner line that needed a fix with its European Portuguese form (#131, ADR 0017). During a Scene the partner recasts a grammar, word or Brazilian form in the next line ("Recasts come for free").

Seen in: `src/components/scene-review.tsx`, `src/routes/speak/$id.tsx`, `src/lib/chat-core.ts`

## Portugal note

Lesson note contrasting European and Brazilian forms side by side, rendered as the `PortugalNote` component below the lesson section that teaches it (#82, ADR 0018). Culture sections are labelled "Portugal", and some of those notes (and other Lesson lines) make the contrast, for example eléctrico / bonde and connosco / conosco.

Seen in: `src/components/portugal-note.tsx`, `src/components/lesson-player.tsx` (renders a section's `ptNote`; kicker "Portugal"), `src/data/types.ts` (`PtNote`), `src/data/a1.ts`, `src/data/a2.ts`

## Speak button

Control that plays a sentence or a word aloud. The accessible name is `Play "…"` with a snippet of the line — `Play "…" slower` for the snail button, "Stop" while playing.

Seen in: `src/components/speak-button.tsx`, `src/lib/tts.ts`, `src/routes/me.tsx`, `src/components/lesson-player.tsx`

## Spoken answer

Answering a Conversas Scene by speaking instead of typing (#83, ADR 0020). The microphone button in the `/speak/$id` composer starts pt-PT speech recognition (Web Speech API); what was understood streams into the composer — visible and editable before sending — and typing stays available the whole time. Devices without pt-PT speech recognition say so (toast + disabled mic) and keep the typed composer.

Seen in: `src/lib/speech-input.ts`, `src/components/mic-button.tsx`, `src/routes/speak/$id.tsx`, `docs/adr/0020-spoken-conversas.md`

## CIPLE A2 practice

Practice set modelled on the CIPLE A2 exam.

Seen in: not in the tree.

## Placement check

Short test that recommends a Start level. Choosing a Level by hand is Start level, not this check. Fifteen questions, three per Level A1–C1, run one Level at a time through the Quiz; the result screen recommends the highest cleared Level (≥2 of 3), never above a failed one, and "Start at X" writes `floor` and opens Today. Offered on Today to a new learner and on You as a retake ("Find my level with a short check").

Seen in: `src/data/placement.ts`, `src/routes/placement.tsx`, `src/routes/index.tsx`, `src/routes/me.tsx`

## Travel Scenes

Scripted trip scenes on Practice, under "Cenas de viagem": café, restaurant, transport, accommodation, chemist, asking the way. Each opens `/scene/$id` without finishing the A1 path, works offline (text and on-device audio), and links to a matching A1/A2 Lesson whose words feed Palavras, plus an online-only Conversas partner (`TravelScene`, ADR 0016).

Seen in: `src/routes/practice.tsx`, `src/routes/scene/$id.tsx`, `src/data/travel-scenes.ts`, `src/data/types.ts`, `src/components/dialogue.tsx`

## Travel Phrasebook

"On the trip" on You: trip phrases grouped by situation, available before any Lesson and working offline. "Qualquer lado" (the anywhere staples) first, then the six Travel Scenes' situations with their "You" lines. Each phrase plays with the Speak button and can be saved to Palavras. Below it, "From your conversas" holds the words saved from Conversas replies and "From your lessons" the words from finished Lessons.

Seen in: `src/routes/me.tsx`, `src/data/phrasebook.ts`

## Social Scenes

A named set in Conversas: family, friends and colleagues situations tagged `topic: "social"` on `SpeakScenario`, from A2 up, grouped under the "Social" topic of their level on `/speak` (#154, ADR 0022). Each Scene states its register (tu or você) — as a pill on the `/speak` card, in the `/speak/$id` kicker and in the setting text — and the partner prompt pins that register (`registerPrompt` in `src/lib/chat-core.ts`), with the end-of-scene review repeating it as a `Register:` line (ADR 0021). 8 chat scenes: the family lunch, meeting the partner's friends and the colleagues' coffee are new (#135); the 5 existing friend/colleague situations were retagged (#134). The same 8 situations also run as offline scripted scenes on Practice under "Cenas sociais" (`SocialScene`: 1:1 `scenarioId` link to the Conversas partner, a required `lessonId` whose words feed Palavras), opened via `/scene/$id`. The 3 new situations got their own illustrations via `scripts/scene-regen` (#136); the 5 existing ones keep their current images.

Seen in: `src/data/scenarios.ts`, `src/data/social-scenes.ts`, `src/data/types.ts`, `src/routes/speak/index.tsx`, `src/routes/speak/$id.tsx`, `src/routes/scene/$id.tsx`, `src/routes/practice.tsx`, `src/components/register-pill.tsx`, `src/lib/chat-core.ts`, `docs/adr/0021-social-scenes.md`
