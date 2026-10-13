import { useEffect, useSyncExternalStore } from "react";

/**
 * On-device speech only (Web Speech API), strictly European Portuguese.
 * A pt-BR or bare "pt" voice is never used: no pt-PT voice means text only.
 */

export type PtVoiceStatus = "ready" | "loading" | "none";

/** Some browsers never fire `voiceschanged`; after this we stop waiting. */
export const VOICE_TIMEOUT_MS = 1500;

let status: PtVoiceStatus = "loading";
let voice: SpeechSynthesisVoice | null = null;
let timedOut = false;
/** Set when an utterance errors; cleared when voices or connectivity change. */
let failed = false;
let loading: Promise<SpeechSynthesisVoice | null> | null = null;
let currentResolve: (() => void) | null = null;
const listeners = new Set<() => void>();

function synth(): SpeechSynthesis | undefined {
  return typeof window === "undefined" ? undefined : window.speechSynthesis;
}

export function isPtPt(lang: string): boolean {
  return lang.replace(/_/g, "-").toLowerCase() === "pt-pt";
}

/** Local pt-PT voice first; a network voice (e.g. Edge "Online (Natural)") only while online. */
export function pickPtVoice(
  voices: readonly SpeechSynthesisVoice[],
  online = true,
): SpeechSynthesisVoice | null {
  const pt = voices.filter((v) => isPtPt(v.lang));
  return pt.find((v) => v.localService) ?? (online ? pt[0] : undefined) ?? null;
}

// ponytail: raw navigator.onLine — #11's shared isOnline() (probe-confirmed) sits above this PR in the stack and replaces it there.
function browserOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function setStatus(next: PtVoiceStatus) {
  if (next === status) return;
  status = next;
  for (const l of listeners) l();
}

/** Re-read the voice list. An empty list is inconclusive until the timeout. */
function refresh(s: SpeechSynthesis) {
  const list = s.getVoices();
  voice = failed ? null : pickPtVoice(list, browserOnline());
  setStatus(voice ? "ready" : failed || timedOut || list.length > 0 ? "none" : "loading");
}

/** Resolves with the pt-PT voice, or null. Safe before any user gesture; keeps listening for later voices. */
export function loadPtVoice(): Promise<SpeechSynthesisVoice | null> {
  const s = synth();
  if (!s) {
    setStatus("none");
    return Promise.resolve(null);
  }
  loading ??= new Promise((resolve) => {
    const retry = () => {
      failed = false;
      refresh(s);
      if (status !== "loading") resolve(voice);
    };
    s.addEventListener("voiceschanged", retry);
    window.addEventListener("online", retry);
    window.addEventListener("offline", retry);
    refresh(s);
    if (status !== "loading") return resolve(voice);
    setTimeout(() => {
      timedOut = true;
      refresh(s);
      resolve(voice);
    }, VOICE_TIMEOUT_MS);
  });
  // Later voiceschanged events update `voice`; return the current one, not the first.
  return loading.then(() => voice);
}

export function getPtVoiceStatus(): PtVoiceStatus {
  return status;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function usePtVoiceStatus(): PtVoiceStatus {
  useEffect(() => {
    void loadPtVoice();
  }, []);
  return useSyncExternalStore(subscribe, getPtVoiceStatus, () => "loading");
}

/** Speaks `text` with the pt-PT voice; resolves when it ends, errors or is stopped. No voice: resolves at once. */
export async function speakPt(text: string, rate = 0.88): Promise<void> {
  const trimmed = text.trim();
  const s = synth();
  if (!trimmed || !s) return;
  const v = await loadPtVoice();
  if (!v) return;
  stopSpeaking();
  await new Promise<void>((resolve) => {
    const utter = new SpeechSynthesisUtterance(trimmed);
    utter.voice = v;
    utter.lang = "pt-PT";
    utter.rate = rate;
    const done = () => {
      if (currentResolve === done) currentResolve = null;
      resolve();
    };
    currentResolve = done;
    utter.addEventListener("end", done, { once: true });
    utter.addEventListener(
      "error",
      (e) => {
        // Our own cancel()/stop is not a failure, nor is "not-allowed" (autoplay before a
        // user gesture, e.g. review auto-speak); anything else means this voice can't speak here.
        const err = (e as SpeechSynthesisErrorEvent).error;
        if (err !== "interrupted" && err !== "canceled" && err !== "not-allowed") {
          failed = true;
          refresh(s);
        }
        done();
      },
      { once: true },
    );
    s.speak(utter);
  });
}

export function stopSpeaking() {
  synth()?.cancel();
  const r = currentResolve;
  currentResolve = null;
  r?.();
}

/** Test hook: forget the loaded voice so a new mocked speechSynthesis is read. */
export function resetPtVoiceForTests() {
  status = "loading";
  voice = null;
  timedOut = false;
  failed = false;
  loading = null;
  currentResolve = null;
}
