# 0018. Portugal notes in Lessons: side-by-side European vs Brazilian forms on the section that teaches them

- **Status**: Accepted
- **Date**: 2026-11-18
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; UI reviewed via the ui-ux-expert skill; architecture pressure-tested via the domain-expert Consultant mode — web-frontend, ui-ux-design lenses)
- **Supersedes**: none
- **Related issues**: #82; tracer tickets #139 (T1 walking skeleton), #140 (T2 widen A1/A2 + coverage test)

## Context

Issue #82: most learners arrive from Duolingo or Babbel, which teach Brazilian Portuguese, and carry Brazilian habits. Every Lesson teaching a form that differs in Brazil should carry a Portugal note showing both forms side by side; A1 and A2 must cover tu vs você, estar a + infinitive vs -ndo, and the pronoun after the verb. Notes must work offline and play with the Speak button where a pt-PT voice exists.

Current state: `Lesson.sections` is a discriminated union (`intro | vocab | grammar | dialogue | culture`) in `src/data/types.ts`, rendered by `SectionView` in `src/components/lesson-player.tsx`. The `culture` section already uses a "Portugal" kicker, but prose only — no side-by-side forms, no audio. The BR→PT presentation pattern already exists in `src/components/scene-review.tsx` ("In Portugal: …" + `BR → PT` pill + `SpeakButton` on the European form only). TTS (`src/lib/tts.ts`) is strictly pt-PT: a pt-BR or bare "pt" voice is never picked. Lessons are static bundled data, so they work offline by construction (`src/lib/online-features.ts` lists only Conversas/GitHub/multiplayer as online); the precache needs no change. `scripts/contrast.test.mjs` pins the text pairs actually used (`fg`/`muted`/`accent` on `soft`, `accent-fg` on `accent`, …), so new UI must reuse existing tokens.

## Decision

- **Data**: a new `PtNote = { pt: string; br: string; en: string }` in `src/data/types.ts`, attached as an optional `ptNote?: PtNote` on every `LessonSection` variant. The note lives on the section that teaches the form — not as a new section step and not lesson-level.
- **UI**: one new component `src/components/portugal-note.tsx`, rendered from a single site in `Player` (`src/components/lesson-player.tsx`) below the current non-quiz section. Card: `bg-soft rounded-[var(--radius-lg)] p-4`, a `Languages` lucide icon + "Portugal × Brasil" title (`font-display text-lg font-medium`), the `en` line as `text-sm text-muted`. Two labeled rows — "In Portugal": `pt` in `text-fg font-medium` with an inline `SpeakButton`; "In Brazil": `br` in `text-muted` with a non-interactive `BR` pill (`bg-accent text-accent-fg`). Rows stack at phone width and go `sm:grid-cols-2` above. Only token pairs already covered by `scripts/contrast.test.mjs` (no `text-subtle` on `soft`).
- **Audio**: the `SpeakButton` plays only the European `pt` form. The Brazilian form is text only; TTS stays pt-PT-only, and no-voice devices get the existing `NO_VOICE_NOTE` toast.
- **Scope**: `/lesson/$id` lessons only in this pass. This pass covers every A1/A2 lesson whose prose already flags a Brazilian form (12 notes: `a1-ola`, `a1-como-esta`, `a1-de-onde`, `a1-numeros`, `a1-ordinais`, `a1-bica`, `a1-metro`, `a1-mesa`, `a2-tempo`, `a2-planos`, `a2-farmacia`, `a2-compras`). Grammar drills, verb desks, readings and radio are a follow-up.
- **Test**: `scripts/pt-notes.test.mjs` (same transpile-and-load pattern as `scripts/travel-scenes.test.mjs`) asserts the note shape (`pt`/`br`/`en` non-empty, `pt !== br`), that the three required contrasts are present in A1 and A2, that every A1/A2 lesson mentioning "Brazil…" in prose or quiz explains has at least one note, and (source level) that the note component renders `SpeakButton` only for the `pt` form.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Optional `ptNote` on the existing section + one render site in `Player` (chosen) | Note sits next to the form it explains; smallest diff; one caller; no new state | None material |
| New `ptnote` `LessonSection` variant as its own step | Very visible | Adds a progress step per lesson; needs render branches in five section views; more authoring |
| Lesson-level single note rendered before the quiz | One field on `Lesson` | Detached from the section that teaches the form |
| Side table keyed by lesson id in a separate data file | Lesson data files untouched | Splits content from the lesson; easy to miss lessons |
| Play the Brazilian form with a pt-BR voice when one exists | Symmetric audio | Contradicts the strict pt-PT-only rule in `src/lib/tts.ts`; rejected |
| Extend notes to grammar drills, verb desks, readings, radio now | Wider coverage | Not asked for ("Every Lesson"); kept as follow-up |

## Consequences

- Offline and Speak-button behavior come for free: the notes are static bundled data (precache unchanged) and TTS remains on-device pt-PT. No new dependency, no config, no migration, no `wrangler.toml` change; deploys through the existing Cloudflare Workers workflow.
- Accessibility: the only interactive element is the existing `SpeakButton` (accessible name, ≥44px targets, live-region announcements); row labels carry the PT/BR distinction as text, not color alone; `contrast.test.mjs` passes unchanged because only pinned token pairs are used.
- `scripts/pt-notes.test.mjs` mechanically enforces acceptance criterion 1 for A1/A2 ("mentions Brazil ⇒ has a note"), so prose and notes cannot drift apart silently.
- Risk accepted: the note copy (`pt`/`br`/`en`) is hand-authored and needs a language review by the repo owner before merge (tracked in #140).
- Revisit when: notes are wanted in grammar drills / verb desks / readings / radio or on `/path` cards; when the copy needs per-level tuning; if learners ask for the BR form to be playable (would require relaxing the pt-PT-only TTS rule).
