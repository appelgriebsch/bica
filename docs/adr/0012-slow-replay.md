# 0012. Slow replay on the Speak button: paired snail icon with a fixed SLOW_RATE

- **Status**: Accepted
- **Date**: 2026-11-17
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill, UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none
- **Related issues**: #75, #112, #113

## Context

Issue #75: European Portuguese swallows unstressed vowels, so A1–B1 learners cannot catch device speech at normal speed. Anywhere the Speak button plays a sentence, the learner must be able to replay it slower; it must work offline wherever normal playback works; and with no pt-PT voice the existing text-only notice must still show.

Bica already speaks on-device through the Web Speech API with a strictly pt-PT voice (`src/lib/tts.ts`): `speakPt(text, rate)` plumbs a rate into the utterance, `pickPtVoice` prefers local voices and allows network voices only while online, and a `none` voice status already disables play controls and drives the text-only notice. The listen page (`src/routes/listen/$id.tsx`) already has a Slow/Natural toggle at rates 0.78 / 0.96. So the engine needs no new mechanism — only a lower rate and a control that reaches every Speak button.

## Decision

- `src/lib/tts.ts` exports one constant, `SLOW_RATE = 0.7` — fixed, below the slowest normal rate in use (0.78) — and `speakPt` is unchanged.
- `src/components/speak-button.tsx` renders a single wrapper `<span className="inline-flex shrink-0 items-center gap-0.5">` holding two ghost icon buttons: `Volume2` plays at the caller's `rate` (default 0.88), `Snail` plays the same text at `SLOW_RATE`. Because the pair lives inside the shared component, all 7 call sites (lesson-player, read, me, speak, review, grammar) get slow replay with zero call-site edits. One wrapper keeps `justify-between` call sites (lesson intro, /review at ≥sm) intact. A `playing: "normal" | "slow" | null` state shows the spinner only on the active button and disables both while playing; tapping snail while normal playback runs cancels and replays slower. The snail defaults to `text-muted hover:text-accent` while play stays `text-accent`; a caller's `className` still wins via `cn()`. Both buttons carry the existing no-voice handling: disabled when the pt-PT status is `none`, with `NO_VOICE_NOTE` in the aria-label/title, so the text-only notice path is unchanged.
- `src/components/quiz-block.tsx` pairs the quiz "Play the line" button (rate 0.86, unchanged) with the same snail icon button at `SLOW_RATE` ("Play the line slower"), sharing the playing/disabled logic.
- Slow replay is one-shot per tap. No persistence, no global switch, no change to verb-table rows, review auto-speak, or the listen page toggle.
- Tests in `scripts/tts.test.mjs` pin the slow rate on the utterance (rate, `lang: "pt-PT"`, picked voice) and pin that a local pt-PT voice still speaks at `SLOW_RATE` while offline.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Paired snail icon inside the shared `SpeakButton`, fixed `SLOW_RATE = 0.7` (chosen) | One tap, visible, reaches every call site with zero edits; reuses the existing `rate` plumbing; offline-safe because the voice choice is unchanged | Two icons per row; snail glyph must exist in the pinned lucide (verified) |
| Tap the Speak button again while playing to replay slower | Zero extra UI | Hidden; A1 learners will not discover it |
| Per-surface Slow/Natural toggle (like /listen) | Consistent with the one existing slow control | Cluttered when repeated on every screen |
| One persisted global "slow speech" switch | Simplest mental model | Removes the per-sentence choice the issue asks for; adds stored state |
| Cloud TTS or pre-recorded slow audio | Natural prosody | Violates the offline acceptance criterion; cannot cover arbitrary Conversas lines; asset cost. (Recorded native audio was already closed as out of scope in #87) |
| SSML `<prosody rate="slow">` | No rate constant | Web Speech API support is unreliable across browsers |
| Relative slow rate (75% of each surface's rate) | Preserves per-surface tuning | Each screen sounds differently slow; harder to reason about for learners |

## Consequences

- Slow replay works offline exactly wherever normal playback works: same utterance, same voice selection (`pickPtVoice` already prefers `localService` offline), only the rate changes. Pinned by the offline test.
- With no pt-PT voice both buttons are disabled with the existing `NO_VOICE_NOTE` and `PtVoiceNotice` still renders — the text-only acceptance criterion holds by construction.
- Verification: new tests in `scripts/tts.test.mjs`; gates `bun run test`, `BICA_BUILT=1 bun run test`, `typecheck`, `lint`, `build`; browser smoke on dev and built output plus a 390×844 check that rows fit both 44px icons and ≥sm screenshots of /review and the lesson intro card proving the pair stays glued.
- Risk accepted: 0.7 is asserted as a rate only; real-device voice quality at that rate was not measured. The `size-9` (36px) override in `speak/$id.tsx` stays as-is (pre-existing, still ≥24px).
- Revisit when: a learner-facing study shows 0.7 is too slow/fast, or if a global slow preference is ever wanted — that would be a new decision, not an extension of this one.
