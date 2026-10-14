/**
 * Self-hosted Better Auth for THIS app (server-only).
 *
 * Pre-wired for live preview + deploy — do not rewrite this file. To enable
 * local email/password, flip the flag in `./email-password` only (see auth skill).
 *
 * The app runs its own Better Auth at `/api/auth/*`, so the session cookie stays
 * on this app's own origin. Sign-in federates to the shared **Grok auth broker**
 * (`GROK_AUTH_ISSUER`) via the `genericOAuth` plugin — the broker brokers the
 * upstream sign-in methods (Google, X, …) and holds their shared secrets; this
 * app only holds its own client id/secret and names the upstream it wants via
 * each provider's `idp` hint.
 *
 * Tri-mode:
 *   - Deployed: the deployer injects a per-app `GROK_AUTH_*` + `BETTER_AUTH_URL`
 *     + `DATABASE_URL`, so real federated auth is persisted in Postgres.
 *   - Sandbox live preview: no injection -> falls back to the shared **preview
 *     client** (`./preview`) and derives the preview's `https://*.grok-sandbox.com`
 *     origin from the request, so real sign-in works (no demo users). Sessions
 *     and identities persist in the embedded PGLite DB (same DB as app data);
 *     the process restart wipes both. Live-preview iframe clients use a bearer
 *     token (partitioned cookies) — see `client.ts`.
 *   - Explicitly off (`VITE_AUTH_ENABLED=false`): no providers; per-user server
 *     functions fall back to a dev user (see `verify.server.ts`).
 *
 * NEVER import this from client code — it pulls in `pg` + the preview secret +
 * server-only Better Auth internals. The client uses `@/lib/auth/client`;
 * components read the user via `@/lib/auth/use-current-user`; server functions get
 * a verified id via `@/lib/auth/middleware`.
 */
import { betterAuth } from "better-auth";
import { bearer, genericOAuth } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getCookie } from "@tanstack/react-start/server";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { embeddedDbDisabled, ensureDbReady, getPglite } from "../db";
import { emailAndPasswordEnabled } from "./email-password";
import { GROK_PROVIDERS } from "./providers";
import { pgliteDialect } from "./pglite-dialect";
import {
  GROK_ISSUER_DEFAULT,
  PREVIEW_ALLOWED_HOSTS,
  PREVIEW_CLIENT_ID,
  PREVIEW_CLIENT_SECRET,
} from "./preview";

// Kick (and share) PGLite bootstrap as soon as the auth server module loads.
// Staging Workers set BICA_STAGE and have no DATABASE_URL — skip PGLite there
// so importing auth cannot hang the isolate before /api/health answers.
if (!embeddedDbDisabled()) {
  void ensureDbReady();
}

/**
 * Preview secret must outlive module reloads: PGLite (and its session rows) is
 * stored on `globalThis`, so an HMR re-eval of this file must NOT mint a new
 * signing secret or every existing session becomes invalid mid-dev. Process
 * restart clears both the secret and PGLite together.
 */
const globalAuthRef = globalThis as typeof globalThis & {
  __grokAuthPreviewSecret__?: string;
};
function previewAuthSecret(): string {
  globalAuthRef.__grokAuthPreviewSecret__ ??= randomBytes(32).toString("hex");
  return globalAuthRef.__grokAuthPreviewSecret__;
}

/** Read an env var, treating empty/whitespace as unset. */
const env = (key: string): string | undefined => {
  const value = process.env[key]?.trim();
  return value ? value : undefined;
};

// Explicit off-switch. The deployer sets `VITE_AUTH_ENABLED=true` when it
// provisions auth; set it to "false" to force auth off everywhere (dev user).
const authDisabled = env("VITE_AUTH_ENABLED") === "false";

// Broker federation creds: the deployer injects a per-app client when deployed;
// otherwise fall back to the shared live-preview client, which the broker accepts
// for any `*.grok-sandbox.com` callback (see `./preview`).
const grokIssuer = env("GROK_AUTH_ISSUER") ?? GROK_ISSUER_DEFAULT;
const grokClientId = env("GROK_AUTH_CLIENT_ID") ?? PREVIEW_CLIENT_ID;
const grokClientSecret = env("GROK_AUTH_CLIENT_SECRET") ?? PREVIEW_CLIENT_SECRET;

/** True when federated sign-in is active (real auth is enforced). */
export const authConfigured =
  !authDisabled && Boolean(grokClientId && grokClientSecret);

// This app's own Better Auth origin. When deployed the deployer injects the
// public URL. In the sandbox live preview there's no fixed URL (each preview gets
// a dynamic `*.grok-sandbox.com` host), so we hand Better Auth a dynamic baseURL:
// it derives the origin per-request from the (proxied) host, validated against an
// allowlist, which makes the OAuth `redirect_uri` the concrete URL the broker
// accepts.
//
// Published apps with a **custom domain** (and Vercel production/preview URLs)
// must use the same dynamic path. A locked string `BETTER_AUTH_URL` mints the
// OAuth callback and CSRF allowlist for `*.grok.me` / `*.vercel.app` only, so
// sign-in from the custom host fails with "Invalid origin" / a cookie on the
// wrong site.
const explicitBaseURL = env("BETTER_AUTH_URL");
// Explicit `string[]` (not a readonly tuple) — Better Auth's DynamicBaseURLConfig
// requires a mutable `allowedHosts: string[]`.
const previewAllowedHosts: string[] = [...PREVIEW_ALLOWED_HOSTS];
// Local `npm run dev` (port 8080 contract). Browsers may send Origin as any of
// these for the same server — trusting only `localhost` rejects `127.0.0.1` and
// breaks email/password with "Invalid origin".
const LOCAL_DEV_ORIGINS: string[] = [
  "http://localhost:8080",
  "http://127.0.0.1:8080",
  "http://[::1]:8080",
];

/** Hostname (optionally with port) from a URL or bare host string. */
function hostFromValue(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const withProto = /:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
    const host = new URL(withProto).host;
    return host || undefined;
  } catch {
    const host = trimmed.replace(/^https?:\/\//i, "").split("/")[0]?.trim();
    return host || undefined;
  }
}

/**
 * Apex ↔ www twins for a real custom domain. Skip platform hosts — `www` on
 * `*.grok.me` / `*.vercel.app` is not how those apps are served.
 */
function withWwwVariants(host: string): string[] {
  const h = host.toLowerCase();
  if (
    h === "localhost" ||
    h.startsWith("localhost:") ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".vercel.app") ||
    h.endsWith(".grok-sandbox.com") ||
    h.endsWith(".grok.me")
  ) {
    return [host];
  }
  if (h.startsWith("www.")) return [host, host.slice(4)];
  if (h.split(".").length === 2) return [host, `www.${h}`];
  return [host];
}

/**
 * Extra hosts this deployment is actually served on: the injected Better Auth
 * URL, the publish hostname (custom domain), Vercel URLs, and any explicit
 * `BETTER_AUTH_TRUSTED_ORIGINS` list (comma/space separated).
 */
function extraPublicHosts(): string[] {
  const hosts = new Set<string>();
  const viteHost =
    env("VITE_PUBLIC_HOSTNAME") ??
    (typeof import.meta !== "undefined"
      ? String(
          (import.meta as { env?: { VITE_PUBLIC_HOSTNAME?: string } }).env
            ?.VITE_PUBLIC_HOSTNAME ?? "",
        ).trim() || undefined
      : undefined);
  const extraOrigins = env("BETTER_AUTH_TRUSTED_ORIGINS");
  const candidates = [
    explicitBaseURL,
    viteHost,
    env("VERCEL_PROJECT_PRODUCTION_URL"),
    env("VERCEL_URL"),
    env("VERCEL_BRANCH_URL"),
    ...(extraOrigins ? extraOrigins.split(/[\s,]+/) : []),
  ];
  for (const value of candidates) {
    const host = hostFromValue(value);
    if (!host) continue;
    for (const variant of withWwwVariants(host)) hosts.add(variant);
  }
  return [...hosts];
}

const publicHosts = extraPublicHosts();

const allowedHosts: string[] = [
  ...previewAllowedHosts,
  "localhost",
  "127.0.0.1",
  "[::1]",
  "*.vercel.app",
  ...publicHosts,
];

const baseURL = {
  allowedHosts,
  // `auto` → trust both http:// and https:// expansions of allowedHosts
  // (preview is https; local dev is http; custom domains are https).
  protocol: "auto" as const,
  fallback: explicitBaseURL ?? "http://localhost:8080",
};

const staticTrustedOrigins: string[] = [
  // Host wildcards (matched against Origin's host)
  ...previewAllowedHosts,
  // Full-origin wildcards (matched against Origin)
  ...previewAllowedHosts.flatMap((host) => [`https://${host}`, `http://${host}`]),
  ...LOCAL_DEV_ORIGINS,
  ...(explicitBaseURL ? [explicitBaseURL] : []),
  ...publicHosts.flatMap((h) => [`https://${h}`, `http://${h}`]),
];

/**
 * CSRF allowlist. Static entries cover preview / local / the known public
 * hosts. The request callback also trusts Origin when it matches this
 * request's `Host` — same-origin by definition, so a newly mapped custom
 * domain isn't blocked before env catches up.
 */
const trustedOrigins = (request?: Request): string[] => {
  if (!request) return [...staticTrustedOrigins];
  const origins = [...staticTrustedOrigins];
  const originHeader = request.headers.get("origin");
  if (!originHeader) return origins;
  try {
    const originHost = new URL(originHeader).host.toLowerCase();
    const requestHost = request.headers
      .get("host")
      ?.split(",")[0]
      ?.trim()
      .toLowerCase();
    if (requestHost && originHost === requestHost) origins.push(originHeader);
  } catch {
    /* ignore malformed Origin */
  }
  return origins;
};

const databaseUrl = env("DATABASE_URL");

// Static broker OAuth endpoints (skip OIDC discovery on every sign-in / callback).
// Discovery would cost an extra network hop to the broker before the popup can
// even redirect to Google/X — the live-preview popup felt stuck on the app for
// that whole round-trip. These paths match the broker's discovery document.
const issuerBase = grokIssuer.replace(/\/+$/, "");
const grokAuthorizationUrl = `${issuerBase}/api/auth/oauth2/authorize`;
const grokTokenUrl = `${issuerBase}/api/auth/oauth2/token`;
const grokUserInfoUrl = `${issuerBase}/api/auth/oauth2/userinfo`;

// Real Postgres when `DATABASE_URL` is set (deployed apps), else the app's
// embedded PGLite (preview) via a Kysely dialect — so Better Auth persists to the
// SAME DB as app data, including email/password users. Both use the Better Auth
// schema from `migrations/0001_auth.sql`.
const database = databaseUrl
  ? new Pool({ connectionString: databaseUrl })
  : { dialect: pgliteDialect(() => getPglite()), type: "postgres" as const };

/** Session token cookie name — also read by the live-preview popup completion page. */
export const SESSION_TOKEN_COOKIE = "__Host-grok-auth.session_token";

// Built separately so the `betterAuth({...})` call stays easy to edit without
// breaking brackets (models often trip on the conditional plugin spread).
const grokOAuthPlugin = authConfigured
  ? genericOAuth({
      config: GROK_PROVIDERS.map(({ providerId, idp }) => ({
        providerId,
        clientId: grokClientId as string,
        clientSecret: grokClientSecret as string,
        // Prefer static endpoints over `discoveryUrl` so initiating (and
        // completing) OAuth does not wait on a broker discovery fetch.
        authorizationUrl: grokAuthorizationUrl,
        tokenUrl: grokTokenUrl,
        userInfoUrl: grokUserInfoUrl,
        scopes: ["openid", "profile", "email"],
        // `prompt: "login"` forces the broker to re-authenticate against the
        // upstream on every sign-in instead of silently reusing an existing
        // broker session. Combined with the broker sending Google
        // `prompt=select_account`, the user always gets the account chooser
        // and can pick (or switch) which account to sign in with.
        authorizationUrlParams: { idp, prompt: "login" },
      })),
    })
  : null;

function createAuth() {
  return betterAuth({
  baseURL,
  // Deployed apps inject BETTER_AUTH_SECRET. Preview: process-stable secret on
  // globalThis so HMR doesn't invalidate PGLite-backed sessions (see above).
  secret: env("BETTER_AUTH_SECRET") ?? previewAuthSecret(),
  database,

  // CSRF / origin check for credentialed auth POSTs (email sign-up/sign-in, …).
  // See `trustedOrigins` construction above — must cover live preview hosts AND
  // local loopback variants, or clients get "Invalid origin".
  trustedOrigins,

  // Encrypt broker-issued OAuth tokens at rest, and treat the broker's upstreams
  // as trusted first-party identities. The broker owns identity and X emails are
  // synthetic/unverified, so WITHOUT this a login can fail with
  // `account_not_linked` (Better Auth refuses to attach an untrusted, unverified
  // identity to an existing user). Google and X carry DISTINCT emails, so this
  // never merges them into one user — they stay separate identities.
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: GROK_PROVIDERS.map((p) => p.providerId),
      // X's synthetic email is never "verified", so don't gate linking on the
      // local user's email-verified state.
      requireLocalEmailVerified: false,
    },
  },

  // Cache the session in the short-lived signed `session_data` cookie so reads
  // (incl. the client's `/get-session`) skip the DB — this shrinks the "loading"
  // window and reduces auth flicker. See the `auth` skill for the full
  // flicker-prevention guidance (gate on `isPending`; SSR the session).
  session: { cookieCache: { enabled: true, maxAge: 300 } },

  // Local email/password — toggled only via `./email-password` (not a plugin).
  ...(emailAndPasswordEnabled ? { emailAndPassword: { enabled: true } } : {}),

  // `__Host-` prefixed cookies: the browser REFUSES any same-named cookie that
  // carries a `Domain` attribute, so a sibling `*.grok.me` app cannot "toss" a
  // `Domain=.grok.me` session cookie onto this app. `__Host-` requires Secure +
  // Path=/ + no Domain; Better Auth otherwise uses `__Secure-` (which permits
  // Domain), so we drop its auto prefix (`useSecureCookies: false`) and set
  // Secure + the names ourselves. (Browsers allow Secure cookies on
  // `http://localhost`, so local dev still works.)
  //
  // `trustedProxyHeaders`: custom domains on Vercel/CDN send the public host in
  // `x-forwarded-host`. Combined with the allowedHosts allowlist this is how
  // OAuth `redirect_uri` follows the domain the visitor actually used.
  advanced: {
    useSecureCookies: false,
    trustedProxyHeaders: true,
    defaultCookieAttributes: { secure: true, sameSite: "lax", path: "/" },
    cookies: {
      session_token: { name: SESSION_TOKEN_COOKIE },
      session_data: { name: "__Host-grok-auth.session_data" },
      account_data: { name: "__Host-grok-auth.account_data" },
      dont_remember: { name: "__Host-grok-auth.dont_remember" },
    },
  },

  plugins: [
    // One genericOAuth provider per upstream (when auth is on), all federating
    // to the broker with the SAME client and differing only by the `idp` hint.
    ...(grokOAuthPlugin ? [grokOAuthPlugin] : []),

    // Accept `Authorization: Bearer <session-token>` as an alternative to the
    // cookie. Needed for the LIVE PREVIEW: the app runs in an embedded iframe
    // where cookies are partitioned, so after popup sign-in it authenticates with
    // a bearer token instead (see `client.ts` / the `auth` skill). The hook only
    // fires when an Authorization header is present, so the cookie path
    // (deployed apps) is unaffected.
    bearer(),

    // Bridges Better Auth's Set-Cookie into TanStack Start responses. MUST be
    // last so it runs after every other plugin's hooks.
    tanstackStartCookies(),
  ],
  });
}

type Auth = ReturnType<typeof createAuth>;

// Preview / Vercel construct auth at import (unchanged). On the staging Worker,
// `randomBytes` during that call is illegal in global scope and would stop
// every route, including /api/health. Build it on first use instead.
const authState = globalAuthRef as typeof globalAuthRef & { __grokAuth__?: Auth };

function loadAuth(): Auth {
  authState.__grokAuth__ ??= createAuth();
  return authState.__grokAuth__;
}

if (!embeddedDbDisabled()) {
  loadAuth();
}

export const auth: Auth = new Proxy({} as Auth, {
  get(_target, prop) {
    const instance = loadAuth();
    const value = Reflect.get(instance, prop) as unknown;
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export function readSessionToken(): string | null {
  return getCookie(SESSION_TOKEN_COOKIE) ?? null;
}

// Re-exported for convenience; the array lives in the dependency-free
// `providers.ts` so the client can import it too.
export { GROK_PROVIDERS } from "./providers";
