import { useSyncExternalStore } from "react";

/**
 * One app-wide online state. Offline flips at once (`offline` event or any
 * failed fetch). Online needs `navigator.onLine` plus a HEAD reachability probe
 * that still passes after a ~2 s debounce. Dev builds honour a fake-offline
 * switch: `?fakeOffline=1` / `?fakeOffline=0` or `window.__bicaFakeOffline(bool)`.
 */

export const DEBOUNCE_MS = 2000;
// ponytail: fixed retry while the browser says online but requests fail; add backoff if the probe ever matters for load.
export const RETRY_MS = 15000;
export const PROBE_URL = "/api/ping";
const FAKE_KEY = "bica.fakeOffline";

let online = true;
let fake = false;
let started = false;
let timer: ReturnType<typeof setTimeout> | undefined;
let rawFetch: typeof fetch = (...args) => fetch(...args);
const listeners = new Set<() => void>();

function set(next: boolean) {
  if (next === online) return;
  online = next;
  for (const l of listeners) l();
}

function schedule(ms: number) {
  clearTimeout(timer);
  timer = setTimeout(() => void check(), ms);
}

/** Only our own 204 counts: a captive portal answers too, but not with that. */
export async function probe(): Promise<boolean> {
  try {
    const res = await rawFetch(PROBE_URL, { method: "HEAD", cache: "no-store" });
    return res.status === 204;
  } catch {
    return false;
  }
}

async function check() {
  if (fake || !navigator.onLine) return set(false);
  const ok = await probe();
  if (fake || !navigator.onLine) return set(false);
  if (ok) set(true);
  else {
    set(false);
    schedule(RETRY_MS);
  }
}

/** A request failed: go offline now, confirm the way back with the probe. */
export function markOffline() {
  set(false);
  if (!fake && navigator.onLine) schedule(RETRY_MS);
}

export function setFakeOffline(on: boolean) {
  fake = on;
  try {
    if (on) localStorage.setItem(FAKE_KEY, "1");
    else localStorage.removeItem(FAKE_KEY);
  } catch {
    /* private mode */
  }
  if (on) {
    clearTimeout(timer);
    set(false);
  } else schedule(DEBOUNCE_MS);
}

export function startOnlineWatch() {
  if (started || typeof window === "undefined") return;
  started = true;
  if (import.meta.env?.DEV) {
    const param = new URLSearchParams(location.search).get("fakeOffline");
    if (param !== null) setFakeOffline(param === "1");
    else fake = localStorage.getItem(FAKE_KEY) === "1";
    (window as Window & { __bicaFakeOffline?: (on: boolean) => void }).__bicaFakeOffline =
      setFakeOffline;
  }
  if (fake || !navigator.onLine) set(false);
  window.addEventListener("online", () => schedule(DEBOUNCE_MS));
  window.addEventListener("offline", () => {
    clearTimeout(timer);
    set(false);
  });
  const base = window.fetch.bind(window);
  rawFetch = base;
  window.fetch = (input, init) => {
    // Only our own origin says anything about "the app is reachable"; a third-party outage doesn't.
    const url = input instanceof Request ? input.url : String(input);
    if (new URL(url, location.href).origin !== location.origin) return base(input, init);
    if (fake) return Promise.reject(new TypeError("Failed to fetch (fake offline)"));
    return base(input, init).catch((err: unknown) => {
      if (!(err instanceof DOMException && err.name === "AbortError")) markOffline();
      throw err;
    });
  };
}

export function isOnline() {
  return online;
}

/** Called on every confirmed online/offline change (starts the watch on first use). */
export function subscribeOnline(listener: () => void) {
  startOnlineWatch();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, isOnline, () => true);
}

// ── One polite live region for the whole app ────────────────────────────────
let message = "";
let clearTimer: ReturnType<typeof setTimeout> | undefined;
const messageListeners = new Set<() => void>();

/** Say `text` in the app's single live region; it clears after ~3 s. */
export function announce(text: string) {
  message = text;
  for (const l of messageListeners) l();
  clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    message = "";
    for (const l of messageListeners) l();
  }, 3000);
}

export function useAnnouncement(): string {
  return useSyncExternalStore(
    (l) => {
      messageListeners.add(l);
      return () => {
        messageListeners.delete(l);
      };
    },
    () => message,
    () => "",
  );
}
