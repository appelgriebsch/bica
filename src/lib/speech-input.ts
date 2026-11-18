import { useSyncExternalStore } from "react";

/**
 * Speech input for Conversas (#83): the Web Speech API's SpeechRecognition,
 * strictly European Portuguese — the recognition counterpart of the
 * pt-PT-only voice rule in tts.ts. Recognition runs in the browser; Bica's
 * servers never see the audio, and the recognized text only reaches the chat
 * when the learner sends it themselves.
 *
 * The DOM lib has no SpeechRecognition types, so the minimal surface we use
 * is declared below. `window.webkitSpeechRecognition` covers Safari/Chrome.
 */

export interface SpeechRecognitionResultItem {
  readonly transcript: string;
}

export interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionResultItem;
  [index: number]: SpeechRecognitionResultItem;
}

export interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

export type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

/** Recognition language is pinned to pt-PT, exactly like the TTS voice. */
export const RECOGNITION_LANG = "pt-PT";

export type SpeechInputSupport = "supported" | "unsupported";

/** Error codes that mean this device/service can never do pt-PT recognition. */
const FATAL_ERRORS = new Set(["language-not-supported", "service-not-allowed"]);

/** Error codes that are a quiet end of the session, not a failure. */
const QUIET_ERRORS = new Set(["no-speech", "aborted"]);

let forcedUnsupported = false;
let active: SpeechRecognitionLike | null = null;
const listeners = new Set<() => void>();

export function getRecognitionCtor(): SpeechRecognitionCtor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

function setForcedUnsupported() {
  if (forcedUnsupported) return;
  forcedUnsupported = true;
  for (const l of listeners) l();
}

export function getSpeechInputSupport(): SpeechInputSupport {
  if (forcedUnsupported) return "unsupported";
  return getRecognitionCtor() ? "supported" : "unsupported";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSpeechInputSupport(): SpeechInputSupport {
  return useSyncExternalStore(subscribe, getSpeechInputSupport, () => "supported");
}

export interface SpeechInputCallbacks {
  /** `final` is every finalized transcript so far, `interim` the current unconfirmed one. */
  onTranscript(final: string, interim: string): void;
  /** A non-quiet recognition error (`not-allowed`, `network`, `audio-capture`, …). */
  onError(code: string): void;
  /** The session ended (silence, stop() or an error). */
  onEnd(): void;
}

export interface SpeechInputSession {
  stop(): void;
}

/**
 * Starts one recognition session in pt-PT with interim results. Returns null
 * when the browser has no SpeechRecognition at all. Starting a new session
 * aborts the previous one. `stop()` ends it early; the final transcript is
 * still delivered through onTranscript before onEnd.
 */
export function startSpeechInput(cb: SpeechInputCallbacks): SpeechInputSession | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  active?.abort();
  const rec = new Ctor();
  active = rec;
  rec.lang = RECOGNITION_LANG;
  rec.interimResults = true;
  rec.continuous = false;
  rec.maxAlternatives = 1;
  rec.onresult = (event) => {
    let final = "";
    let interim = "";
    for (let i = 0; i < event.results.length; i++) {
      const r = event.results.item(i);
      const t = r.item(0)?.transcript ?? "";
      if (r.isFinal) final += t;
      else interim += t;
    }
    cb.onTranscript(final, interim);
  };
  rec.onerror = (event) => {
    const code = event.error;
    if (FATAL_ERRORS.has(code)) setForcedUnsupported();
    if (!QUIET_ERRORS.has(code)) cb.onError(code);
  };
  rec.onend = () => {
    if (active === rec) active = null;
    cb.onEnd();
  };
  rec.start();
  return {
    stop() {
      try {
        rec.stop();
      } catch {
        // already ended — onend still fires and clears `active`
      }
    },
  };
}

/** Test hook: forget the forced-unsupported flag and any active session. */
export function resetSpeechInputForTests() {
  forcedUnsupported = false;
  active = null;
  for (const l of listeners) l();
}
