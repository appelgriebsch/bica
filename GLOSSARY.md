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

Spaced review of words from finished Lessons.

Seen in: `src/routes/practice.tsx`, `src/routes/index.tsx`, `src/routes/review.tsx`, `src/lib/online-features.ts`

## Phrasebook

Words from finished Lessons, listed on You. Empty until a Lesson is finished.

Seen in: `src/routes/me.tsx`

## Rádio

Listening bulletins. The Practice card title; Today calls the same thing Listen.

Seen in: `src/routes/practice.tsx`, `src/data/radio.ts`, `src/routes/listen/$id.tsx`

## Uma página

Reading pieces. The Practice card title; Today calls the same thing Read.

Seen in: `src/routes/practice.tsx`, `src/data/reading.ts`, `src/routes/read/$id.tsx`

## Grammar / Verbs

Grammar drills and verb tables by Level. Practice titles them Gramática and Verbos. Gramática is three drills on every level. Verbos is one desk per level.

Seen in: `src/routes/practice.tsx`, `src/routes/grammar/index.tsx`, `src/routes/verbs/index.tsx`, `src/data/types.ts`

## Conversas

Online chat practice with a partner in a Scene.

Seen in: `src/routes/practice.tsx`, `src/routes/speak/index.tsx`, `src/lib/online-features.ts`, `README.md`

## Scene

A Conversas situation: setting, partner and goals (`SpeakScenario`). Today’s Speak card says "A short scene". A Lesson dialogue uses that same heading for a script, not for Conversas.

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

Device-to-device progress transfer. Not a control in the tree. Planned on issue #36 as encrypted QR frames between devices, with no server. That issue supersedes the earlier file export/import (#34). About still hides an "Export and import" link for #34.

Seen in: issue #36 (not a file in this tree). Related leftover for #34: `src/routes/about.tsx` (`SHOW_EXPORT_IMPORT`), `src/lib/progress-store.ts` (`mergeRemote`), `README.md`, `docs/adr/0002-d1-database.md` (the #34 paragraph only).

## Offline / Online-only

Works without internet, or needs it. Lessons, review and on-device audio work offline. Conversas needs a connection.

Seen in: `src/lib/online-features.ts`, `src/components/online-only.tsx`, `src/components/offline-status.tsx`

## Corrections

Errors and European forms shown after a Scene. Not a screen in the tree. During a Scene the partner recasts a grammar, word or Brazilian form in the next line ("Recasts come for free").

Seen in: `src/lib/chat-core.ts`, `src/routes/speak/index.tsx`. No post-Scene Corrections view.

## Portugal note

Lesson note contrasting European and Brazilian forms. Not a separate name in the tree. Culture sections are labelled "Portugal", and some of those notes (and other Lesson lines) make the contrast, for example eléctrico / bonde and connosco / conosco.

Seen in: `src/components/lesson-player.tsx` (kicker "Portugal"), `src/data/types.ts` (`culture`), `src/data/a1.ts`, `src/data/a2.ts`

## Speak button

Control that plays a sentence or a word aloud. The accessible name is "Play pronunciation".

Seen in: `src/components/speak-button.tsx`, `src/lib/tts.ts`, `src/routes/me.tsx`, `src/components/lesson-player.tsx`

## CIPLE A2 practice

Practice set modelled on the CIPLE A2 exam.

Seen in: not in the tree.

## Placement check

Short test that recommends a Start level. Choosing a Level by hand is Start level, not this check.

Seen in: not in the tree.

## Travel Scenes

Scenes for a trip: café, restaurant, transport, accommodation, chemist, directions. Not a named set. Ordinary Scenes already cover a pastelaria, a ticket desk, a chemist and asking the way. No Scene is for ordering a meal or booking a room. `trabalho-chat` sits in a tasca to talk about work. `habitacao` is a dinner argument about housing.

Seen in: not in the tree as this set. Closest rows in `src/data/scenarios.ts`: `pastelaria`, `bilhete`, `direcoes`, `farmacia`.

## Travel Phrasebook

Phrasebook section by trip situation, available before any Lesson. The Phrasebook on You is only words from finished Lessons.

Seen in: not in the tree.

## Social Scenes

Conversas Scenes for family, friends and colleagues, with a stated register. Not a named set, and a Scene has no register field. Friend, colleague and neighbour situations already exist as ordinary Scenes.

Seen in: not in the tree as this set. Related rows in `src/data/scenarios.ts`. `SpeakScenario` is in `src/data/types.ts`.
