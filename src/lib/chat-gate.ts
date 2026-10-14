/**
 * Turnstile gate for `sendChat` (#35). A turn passes with a fresh Turnstile
 * token (checked via siteverify) or with the signed session cookie that a
 * verified token earns. The cookie lasts 30 min and covers 10 turns; the first
 * turn of a conversation always needs a token. No identity is involved: the
 * cookie holds only its expiry and a turn count, signed with CHAT_SESSION_SECRET.
 */

export const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
export const CHAT_COOKIE = "bica_chat";
export const SESSION_TTL_MS = 30 * 60 * 1000;
/** Turns one verification covers (the token's own turn included). */
export const TURNS_PER_VERIFY = 10;
export const SITEVERIFY_TIMEOUT_MS = 5000;

/**
 * Cloudflare's documented Turnstile test keys (dev and tests only; never valid
 * against a real site). https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_TEST_KEYS = Object.freeze({
  siteAlwaysPasses: "1x00000000000000000000AA",
  secretAlwaysPasses: "1x0000000000000000000000000000000AA",
  secretAlwaysFails: "2x0000000000000000000000000000000AA",
});

/** True only for a siteverify `success: true`; any error or timeout fails closed. */
export async function verifyTurnstile(
  token: string,
  secret: string,
  ip: string | undefined,
  f: typeof fetch = fetch,
): Promise<boolean> {
  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);
  try {
    const res = await f(SITEVERIFY_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(SITEVERIFY_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const out = (await res.json()) as { success?: unknown } | null;
    return out?.success === true;
  } catch {
    return false;
  }
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

/** `v1.<exp>.<n>.<hmac>` */
export async function signSession(secret: string, s: Session): Promise<string> {
  const payload = `v1.${s.exp}.${s.n}`;
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(payload));
  return `${payload}.${b64url(sig)}`;
}

/** The session if the signature checks out and it hasn't expired, else null. */
export async function readSession(
  secret: string,
  value: string | undefined,
  now: number,
): Promise<Session | null> {
  const m = /^v1\.(\d{1,15})\.(\d{1,4})\.([A-Za-z0-9_-]{43})$/.exec(value ?? "");
  if (!m) return null;
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = fromB64url(m[3]);
  } catch {
    return null;
  }
  const ok = await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    sig,
    enc.encode(`v1.${m[1]}.${m[2]}`),
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
  now,
  fetch: f = fetch,
}: {
  token: string | undefined;
  cookie: string | undefined;
  firstTurn: boolean;
  secret: string;
  sessionSecret: string | undefined;
  ip: string | undefined;
  now: number;
  fetch?: typeof fetch;
}): Promise<GateResult> {
  if (!firstTurn && sessionSecret) {
    const s = await readSession(sessionSecret, cookie, now);
    if (s && s.n < TURNS_PER_VERIFY) {
      return { ok: true, cookie: await signSession(sessionSecret, { exp: s.exp, n: s.n + 1 }) };
    }
  }
  if (!token || !(await verifyTurnstile(token, secret, ip, f))) return { ok: false };
  return {
    ok: true,
    cookie: sessionSecret
      ? await signSession(sessionSecret, { exp: now + SESSION_TTL_MS, n: 1 })
      : undefined,
  };
}
