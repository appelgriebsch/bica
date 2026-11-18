# 0020. Spoken Conversas: answer a Scene by speaking (Web Speech API, pt-PT only)

- **Status**: Accepted
- **Date**: 2026-11-18
- **Deciders**: Andreas Gerlach with the user
- **Supersedes**: none
- **Related issues**: #83

## Context

Issue #83: Conversas is typed; the hardest skill, speaking aloud, is never practised. Acceptance criteria: (1) a learner can answer by speaking and sees what was understood before sending, (2) typed input stays available, (3) devices without pt-PT speech support say so and keep the typed Scene. Constraints from the project rules: no sign-in/database (#33); the only AI call is server-side Mistral for the chat itself — speech recognition must not add any server call; the app is offline-first and Conversas is the only online feature; audio is sensitive, so nothing may leave the device except through the browser's own recognition service, and the recognized text only reaches the chat when the learner sends it themselves.

## Decision

- **Client-side only, Web Speech API `SpeechRecognition`** (`window.SpeechRecognition ?? window.webkitSpeechRecognition`), wrapped in a new `src/lib/speech-input.ts`. Recognition is pinned to `lang: "pt-PT"` — the same European-Portuguese-only rule as the TTS voice in `src/lib/tts.ts` (a pt-BR or bare `pt` recognition is never used) — with `interimResults: true`, `continuous: false`, `maxAlternatives: 1`. No new dependency, no server route, no env var, no binding; the audio never reaches Bica's servers.
- **One session per tap.** `startSpeechInput(callbacks)` returns a handle with `stop()`; starting a new session aborts the previous one. `onTranscript(final, interim)` recomputes finals + current interim from every `result` event, so the composer always shows the full picture.
- **See it before sending:** a new `MicButton` (`src/components/mic-button.tsx`) sits in the `/speak/$id` composer next to the typed input (which stays exactly as it was). While listening, the recognized text streams into the input itself — finals plus interim — so the learner reads, edits if needed, then presses Send. The composer placeholder switches to "A ouvir…" while listening. While listening the button becomes Stop (`aria-pressed`, Square icon), matching the Speak button's playing state; state changes go through the app's polite live region (`announce`: "Listening…", "Stopped listening.").
- **Unsupported devices say so and keep typing.** If the browser has no `SpeechRecognition`, or a session fails with `language-not-supported` / `service-not-allowed` (sticky: support flips to `unsupported`), the mic button is `aria-disabled` but focusable with `NO_SPEECH_NOTE` as title/aria-label, and activating it posts the note as a toast — the exact pattern of the no-pt-PT-voice Speak button (`NO_VOICE_NOTE`). The typed input is untouched and fully usable. Other errors get specific toasts (`not-allowed` → allow the mic, `network` → recognition needs a connection, `audio-capture` → no microphone); `no-speech`/`aborted` end quietly.
- **Mic is not inside the `OnlineOnly` gate:** recognition is a local browser capability (on-device on Safari, service-backed on Chrome — the `network` error covers the offline Chrome case), while only *sending* needs the server. The send button stays online-gated as before.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Web Speech API SpeechRecognition, pt-PT, client-side (chosen) | No server cost, no new dependency, works with the existing composer, privacy-clean (no Bica-side audio), instant interim feedback | Not in Firefox; Chrome's default service is network-backed and lang support varies by platform — handled with the unsupported note + `network` toast |
| Server-side ASR endpoint (new route + Mistral/other STT) | Uniform quality | New AI call against the "only Conversas chat calls Mistral server-side" rule, new cost surface, audio leaves the device — rejected |
| `MediaRecorder` + manual playback only (record, no recognition) | Works everywhere with a mic | No "sees what was understood" — fails acceptance criterion 1 |
| Replace the typed input with voice-only | Smaller UI | Fails criterion 2 (typed input stays) — rejected |
| Continuous recognition mode | Hands-free long answers | Keeps the mic hot, more battery/privacy surface, harder stop semantics; single-utterance per tap is enough for one line |

## Consequences

- End-to-end slice is client-only: one new lib (`src/lib/speech-input.ts`), one new component (`src/components/mic-button.tsx`), a few lines in `src/routes/speak/$id.tsx`. Unit tests in `scripts/speech-input.test.mjs` (same transpile-and-mock style as `scripts/tts.test.mjs`) cover the pt-PT pinning, interim/final flow, stop semantics, fatal vs non-fatal errors, and the composer wiring; no chat-gate/budget changes because no server call is added.
- Privacy/cost posture unchanged: no audio or transcript is sent anywhere except the chat turn the learner explicitly sends; the browser's own recognition service is out of Bica's control either way, which the ADR records rather than hides.
- Offline: typed Scene fully works; the mic still works where the browser recognizes on-device, and Chrome-offline fails with the "needs a connection" toast instead of breaking the composer.
- Revisit when: Firefox gains SpeechRecognition (or a bundled on-device model becomes viable), learners ask for continuous dictation, or the `language-not-supported` rate on Chrome shows pt-PT is effectively unsupported there (would push toward an explicit per-browser hint like `voiceInstallHint`).
