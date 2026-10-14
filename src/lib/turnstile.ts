/**
 * Client side of the Turnstile gate (#35). Loads Cloudflare's script on first
 * use (from a nonced module, so CSP 'strict-dynamic' allows it), renders one
 * invisible-until-needed widget and hands out single-use tokens.
 */
import { TURNSTILE_TEST_KEYS } from "@/lib/chat-gate";

/** Build-time TURNSTILE_SITE_KEY (vite.config.ts); Cloudflare's test key when unset. */
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

/** One widget in `el`; `token()` resolves with a fresh token or rejects. */
export function createTurnstile(el: HTMLElement, siteKey = TURNSTILE_SITE_KEY) {
  let id: string | undefined;
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
      if (id === undefined) {
        id = ts.render(el, {
          sitekey: siteKey,
          action: "chat",
          execution: "execute",
          appearance: "interaction-only",
          callback: (t: string) => settle(t),
          "error-callback": () => settle(new Error("turnstile")),
          "expired-callback": () => settle(new Error("turnstile")),
        });
      } else {
        ts.reset(id); // tokens are single-use
      }
      ts.execute(id);
      return out;
    },
  };
}
