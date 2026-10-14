/**
 * Client side of the Turnstile gate (#35). Loads Cloudflare's script on first
 * use (from a nonced module, so CSP 'strict-dynamic' allows it), renders one
 * invisible-until-needed widget and hands out single-use tokens.
 */
import { TURNSTILE_ACTION, TURNSTILE_TEST_KEYS } from "@/lib/turnstile-keys.mjs";

/** Build-time site key (vite.config.ts: staging key for build:cf, test key otherwise). */
export const TURNSTILE_SITE_KEY: string =
  (import.meta.env.TURNSTILE_SITE_KEY as string | undefined) ||
  TURNSTILE_TEST_KEYS.siteAlwaysPasses;
export const TURNSTILE_SCRIPT =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type Turnstile = {
  render(el: HTMLElement, o: Record<string, unknown>): string;
  execute(id: string): void;
  reset(id: string): void;
};
type W = Window & { turnstile?: Turnstile };

let script: Promise<Turnstile> | undefined;
function load(): Promise<Turnstile> {
  const w = window as W;
  if (w.turnstile) return Promise.resolve(w.turnstile);
  script ??= new Promise<Turnstile>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = TURNSTILE_SCRIPT;
    s.async = true;
    s.onload = () => (w.turnstile ? resolve(w.turnstile) : reject(new Error("turnstile")));
    s.onerror = () => {
      script = undefined;
      reject(new Error("turnstile"));
    };
    document.head.appendChild(s);
  });
  return script;
}

/**
 * One explicitly rendered widget in `el` (render=explicit; turnstile.render
 * returns the widget id). `token()` resolves with a fresh token; call
 * `reset()` after every chat request so each token is used once.
 */
export function createTurnstile(el: HTMLElement, siteKey = TURNSTILE_SITE_KEY) {
  let id: string | undefined;
  let issued = false;
  let pending: { resolve(t: string): void; reject(e: Error): void } | undefined;
  const settle = (t: string | Error) => {
    const p = pending;
    pending = undefined;
    if (typeof t === "string") p?.resolve(t);
    else p?.reject(t);
  };
  return {
    async token(): Promise<string> {
      const ts = await load();
      const out = new Promise<string>((resolve, reject) => (pending = { resolve, reject }));
      id ??= ts.render(el, {
        sitekey: siteKey,
        action: TURNSTILE_ACTION,
        execution: "execute",
        appearance: "interaction-only",
        callback: (t: string) => settle(t),
        "error-callback": () => settle(new Error("turnstile")),
        "expired-callback": () => settle(new Error("turnstile")),
      });
      if (issued) ts.reset(id); // a token was handed out since the last reset
      issued = true;
      ts.execute(id);
      return out;
    },
    /** Single-use tokens: reset the widget after each request that carried one. */
    reset() {
      const ts = (window as W).turnstile;
      if (ts && id !== undefined && issued) ts.reset(id);
      issued = false;
    },
  };
}
