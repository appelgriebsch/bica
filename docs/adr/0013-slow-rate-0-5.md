# 0013. Slow replay rate: SLOW_RATE 0.5 and /listen Slow 0.6

- **Status**: Accepted
- **Date**: 2026-11-17
- **Deciders**: Andreas Gerlach (rates chosen 2026-11-17; plan produced via the solution-engineer skill)
- **Supersedes**: in part ADR 0012 (the `SLOW_RATE = 0.7` value only; the snail button design stands)
- **Related issues**: #75, PR #114

## Context

ADR 0012 shipped the snail button with `SLOW_RATE = 0.7` (PR #114, cb5a89a). In Chrome on macOS (Chrome, macOS and voice versions unknown), Andreas heard normal and slow replay as identical, on every tap. Staging tests only proved that 0.7 reaches a stubbed `speechSynthesis`, not what real voices do. What the engines do with `utterance.rate` (source-checked):

- **Windows, Chrome and Edge local voices.** Chromium calls `SetRate((int)(10 * log10(rate)))` ([tts_win.cc](https://chromium.googlesource.com/chromium/src/+/main/content/browser/speech/tts_win.cc)). The cast truncates, and one SAPI step is about ×1.1 ([SAPI engine characteristics](https://learn.microsoft.com/en-us/previous-versions/windows/desktop/ee431826(v=vs.85))). 0.96, 0.9, 0.88 and 0.86 all map to step 0 (default speed); 0.78 and 0.7 both map to step −1 (about 0.9×). So the snail is only about 10% slower, and /listen Slow equals the snail. Step −2 needs rate ≤ 0.63; step −3 (about 0.72×) needs rate ≤ 0.501.
- **Apple (Safari, Chrome and Firefox on macOS, every iOS browser) and Android.** WebKit, Chromium and Firefox all pass `rate × AVSpeechUtteranceDefaultSpeechRate` (linear below 1) to AVSpeechSynthesizer ([WebKit](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/platform/cocoa/PlatformSpeechSynthesizerCocoa.mm), [Chromium tts_mac.mm](https://chromium.googlesource.com/chromium/src/+/main/content/browser/speech/tts_mac.mm), [Firefox](https://github.com/mozilla-firefox/firefox/blob/main/dom/media/webspeech/synth/cocoa/OSXSpeechSynthesizerService.mm); older Firefox used NSSpeechSynthesizer at `rate × 200` words per minute). Android Chrome calls `TextToSpeech.setSpeechRate(rate)`. Apple documents 0–0.5 as roughly 0×–1× speed. So 0.7 against 0.86–0.9 is only about 0.8× of normal: audible side by side (tempo JND is about 5%, [Quené 2007](https://hugoquene.nl/onderzoek/q.jphon.20060912.pdf)), but mild for a learner.
- **Chrome on macOS (the reported case).** Chromium creates one `AVSpeechSynthesizer` for the process. For each `speak()` it makes a new `AVSpeechUtterance`, sets the voice and `rate × 0.5`, then calls `speakUtterance:`; `cancel()` maps to `stopSpeakingAtBoundary:Immediate` ([tts_mac.mm](https://chromium.googlesource.com/chromium/src/+/main/content/browser/speech/tts_mac.mm)). WebKit uses the same AVFoundation pattern, and no Chrome code drops or clamps the rate. So "identical" most likely comes from AVSpeechSynthesizer or the voice itself (medium confidence). In [WebKit bug 282920](https://bugs.webkit.org/show_bug.cgi?id=282920) (open, InRadar), the WebKit triager reproduced that on macOS 15.2 a rate below 1 applies only to the first utterance and later utterances play at rate 1. On 14.6 the rate always applied. The triager suspected "a macOS change below WebKit". If the fault is in AVFoundation, it hits Chrome too; no crbug report was found to confirm this. If Bica's first play was a normal tap (0.88, which is AVSpeech 0.44, close to the default 0.5), every later normal and slow play sounds the same. AVSpeech rate ranges also differ per voice ([moutend](https://github.com/moutend/MacAVSpeechSynthesizerDemo); low to medium confidence).
- **Which voice Chrome on macOS picks.** Chrome lists the system default voice first, then every `AVSpeechSynthesisVoice.speechVoices` entry sorted by name. All have `localService: true`, and Enhanced and Premium variants are included if installed. Chrome's own Google network voices (`localService: false`) have no pt-PT voice, only `pt-BR` ([manifest.json](https://chromium.googlesource.com/chromium/src/+/main/chrome/browser/resources/network_speech_synthesis/manifest.json)), so `isPtPt` excludes them. `pickPtVoice` therefore gets the alphabetically first Apple pt-PT voice: most likely standard Joana (Catarina sorts first if installed). If several qualities of one voice are installed, Bica does not control which comes first. The logged `voiceURI` (for example `com.apple.voice.compact.pt-PT.Joana`) settles this.

## Decision

- `src/lib/tts.ts`: `SLOW_RATE = 0.5` (was 0.7). Windows step −3 against step 0 for normal (about 0.72×); about 0.57× of normal on Apple and Android.
- `src/routes/listen/$id.tsx`: Slow rate `0.6` (was 0.78); Natural stays 0.96. Windows step −2 (about 0.81×), about 0.63× elsewhere.
- `scripts/tts.test.mjs` pins `SLOW_RATE <= 0.5`, `Math.trunc(10 * Math.log10(SLOW_RATE)) <= -3`, and `Math.trunc(10 * Math.log10(0.6)) === -2`.
- No other change: same voice choice, same `speakPt`, same snail UI from ADR 0012.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| A. Lower the two constants (chosen) | Two numbers; no new code path; fixes the Windows step and the mild 0.8× elsewhere | May sound drawn out on Apple/Android; cannot help a voice or OS that ignores the rate (macOS caveat) |
| B. Per-platform rate (0.5 on Windows, 0.6 elsewhere) | Gentler off Windows | Browser sniffing and a branch to maintain for a small gain |
| C. Measure, then fall back (time normal vs slow on the device; if slow is not slower, step the rate down or speak word chunks with pauses) | Works even when the engine ignores the rate | State, timing code and flaky iOS events; chunked speech breaks prosody |

## Consequences

- Slow replay is audibly slower wherever the engine honours the rate; /listen Slow is now distinct from Natural on Windows.
- **macOS caveat:** if AVSpeechSynthesizer or the voice ignores or resets the rate (WebKit bug 282920), 0.5 is not slower either. The device check decides this, with **Chrome on macOS as the primary repro**:
  - Log the Chrome and macOS versions, `voice.name`, `voice.voiceURI`, `voice.localService` and the full pt-PT list from `getVoices()`.
  - In a fresh tab, time `onstart` to `onend` for normal, slow, normal, slow.
  - Pass when median slow/normal ≥ 1.4 and each slow play is within ±10% of the first slow play.
  - Then repeat on macOS Safari and Firefox, iOS Safari, Android Chrome and Windows Chrome/Edge.
  - If it fails on a platform, option C is the documented fallback, decided in a new ADR.
- ADR 0012 stays valid apart from the rate value.
