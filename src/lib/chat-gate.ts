/**
 * Turnstile gate for `sendChat` (#35). A turn passes with a fresh Turnstile
 * token (checked via siteverify) or with the signed session cookie that a
 * verified token earns. The cookie lasts 30 min and covers 10 turns; the first
 * turn of a conversation always needs a token. No identity is involved: the
 * cookie holds only its expiry, a turn count and a hash of the client IP key,
 * signed with CHAT_SESSION_SECRET.
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const CHAT_COOKIE = "bica_chat";
export const SESSION_TTL_MS = 30 * 60 * 1000;
/** Turns one verification covers (the token's own turn included). */
export const TURNS_PER_VERIFY = 10;
export const SITEVERIFY_TIMEOUT_MS = 10_000;
export const MAX_TOKEN_LENGTH = 2048;

/** TURNSTILE_HOSTNAMES: comma-separated frontend hostnames siteverify may report. */
export function parseHostnames(v: string | undefined): Set<string> {
  return new Set(
    (v ?? "")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );
}

import { TURNSTILE_ACTION } from "@/lib/turnstile-keys.mjs";

export { TURNSTILE_ACTION, TURNSTILE_TEST_KEYS } from "@/lib/turnstile-keys.mjs";

/**
 * Cloudflare's canonical siteverify (developers.cloudflare.com/turnstile/spin):
 * true only for `success === true` with our action and an allowed hostname.
 * An empty or oversized token, or an empty allowlist, never reaches fetch; a
 * fetch error, timeout or non-OK response fails closed. The secret only goes
 * into the request body and is never logged.
 */
export async function verifyTurnstile(
  token: string | undefined,
  secret: string,
  ip: string | undefined,
  hostnames: Set<string>,
  f: typeof fetch = fetch,
): Promise<boolean> {
  if (typeof token !== "string" || token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return false;
  }
  if (hostnames.size === 0) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  let out: { success?: unknown; action?: unknown; hostname?: unknown } | null;
  try {
    const res = await f(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    out = await res.json();
  } catch {
    return false;
  }
  return (
    out?.success === true &&
    out.action === TURNSTILE_ACTION &&
    typeof out.hostname === "string" &&
    hostnames.has(out.hostname.toLowerCase())
  );
}

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0)) as Uint8Array<ArrayBuffer>;
};
const hmacKey = (secret: string) =>
  crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);

export type Session = { exp: number; n: number };

/** Minimum CHAT_SESSION_SECRET length in bytes; shorter or missing → chat unavailable. */
export const MIN_SESSION_SECRET_BYTES = 32;
export const sessionSecretOk = (v: string | undefined): v is string =>
  !!v && enc.encode(v).length >= MIN_SESSION_SECRET_BYTES;

/** SHA-256 of the client's limiter key (ipKey: IPv4, or IPv6 /64), base64url, 22 chars. */
async function ipTag(bind: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(bind))).slice(0, 22);
}

/**
 * `v1.<exp>.<n>.<iptag>.<hmac>`. The HMAC covers the IP tag, so the cookie only
 * works from the same IPv4 address or IPv6 /64 it was issued to.
 * Remaining replay bound: from that same address a client can replay an older
 * cookie (lower n) until it expires, i.e. at most 30 min without a new solve;
 * the per-IP burst and daily caps still apply to every turn.
 */
export async function signSession(secret: string, s: Session, bind: string): Promise<string> {
  const payload = `v1.${s.exp}.${s.n}.${await ipTag(bind)}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

/** The session if signed, unexpired and issued to this `bind` (ipKey), else null. */
export async function readSession(
  secret: string,
  value: string | undefined,
  now: number,
  bind: string,
): Promise<Session | null> {
  const m = /^v1\.(\d{1,15})\.(\d{1,4})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(
    value ?? "",
  );
  if (!m) return null;
  if (m[3] !== (await ipTag(bind))) return null;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = fromB64url(m[4]);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    sig,
    enc.encode(`v1.${m[1]}.${m[2]}.${m[3]}`),
  );
  const s = { exp: Number(m[1]), n: Number(m[2]) };
  return ok && s.exp > now ? s : null;
}

export type GateResult = { ok: boolean; cookie?: string };

/**
 * Decides one turn. `cookie` in the result is the session to set (renewed
 * count, or a new session after a verified token); none on refusal, and none
 * without CHAT_SESSION_SECRET (then every turn needs a token).
 */
export async function checkGate({
  token,
  cookie,
  firstTurn,
  secret,
  sessionSecret,
  ip,
  bind,
  hostnames,
  now,
  fetch: f = fetch,
}: {
  token: string | undefined;
  cookie: string | undefined;
  firstTurn: boolean;
  secret: string;
  sessionSecret: string | undefined;
  ip: string | undefined;
  /** The client's ipKey; the session cookie is bound to it. */
  bind: string;
  hostnames: Set<string>;
  now: number;
  fetch?: typeof fetch;
}): Promise<GateResult> {
  if (!firstTurn && sessionSecret) {
    const s = await readSession(sessionSecret, cookie, now, bind);
    if (s && s.n < TURNS_PER_VERIFY) {
      return {
        ok: true,
        cookie: await signSession(sessionSecret, { exp: s.exp, n: s.n + 1 }, bind),
      };
    }
  }
  if (!(await verifyTurnstile(token, secret, ip, hostnames, f))) return { ok: false };
  return {
    ok: true,
    cookie: sessionSecret
      ? await signSession(sessionSecret, { exp: now + SESSION_TTL_MS, n: 1 }, bind)
      : undefined,
  };
}
