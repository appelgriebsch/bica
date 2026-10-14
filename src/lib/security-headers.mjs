/**
 * Security headers (#28). Plain ESM so the Nitro middleware, the router and
 * `node --test` share one copy.
 *
 * - STATIC_SECURITY_HEADERS go on every Worker response (server/middleware/
 *   00-security-headers.ts). Workers Static Assets serve files without running
 *   the Worker, so public/_headers repeats them for `/*`; a test keeps the two
 *   in sync.
 * - The CSP carries a per-request nonce, so only the Worker can send it. The
 *   router (src/router.tsx) mints the nonce, sets the header and hands the
 *   nonce to TanStack's scripts; the PWA middleware reads it back from the
 *   header for the extensions.js tag it injects.
 * - Report-Only unless CSP_ENFORCE=1 (staging stays Report-Only until a clean
 *   Tessa pass; then set the var instead of editing code).
 */
export const STATIC_SECURITY_HEADERS = Object.freeze({
  // ponytail: no `preload` until the production domain is final.
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-frame-options": "DENY",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-content-type-options": "nosniff",
  // The mic is unused (speaking practice is text chat + speechSynthesis).
  "permissions-policy": "camera=(), geolocation=(), microphone=()",
  // No sign-in popup since #33, so no opener allowance is needed.
  "cross-origin-opener-policy": "same-origin",
  // Reporting API endpoint for the CSP's `report-to` (report-uri stays for
  // browsers without it).
  "reporting-endpoints": 'csp-endpoint="/api/csp-report"',
});

/** The only third-party origin the CSP allows (Cloudflare Turnstile, #35). */
export const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

export const CSP_REPORT_PATH = "/api/csp-report";
export const CSP_HEADER = "content-security-policy";
export const CSP_REPORT_ONLY_HEADER = "content-security-policy-report-only";

/** Header name for the CSP: enforced only when CSP_ENFORCE is "1"/"true". */
export function cspHeaderName(enforce) {
  return enforce === "1" || enforce === "true" || enforce === true
    ? CSP_HEADER
    : CSP_REPORT_ONLY_HEADER;
}

/** 128 random bits, base64. */
export function newNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp(nonce) {
  return [
    "default-src 'self'",
    // 'strict-dynamic': chunks loaded by a nonced script are trusted; host
    // allowlists are ignored, so extensions.js gets the nonce too.
    // challenges.cloudflare.com: Turnstile (#35). Under 'strict-dynamic' the
    // nonced bundle's inserted script is what's trusted; the host is the
    // fallback for browsers without it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' ${TURNSTILE_ORIGIN}`,
    // ponytail: Tailwind/sonner inline styles; tighten if styles get a nonce.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://og.grok.me",
    "font-src 'self'",
    // Server fns, /api/*, ping, Turnstile. xAI is called server-side.
    `connect-src 'self' ${TURNSTILE_ORIGIN}`,
    // The Turnstile widget iframe (#35); nothing else is framed.
    `frame-src ${TURNSTILE_ORIGIN}`,
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
    "report-to csp-endpoint",
  ].join("; ");
}

/** The nonce named in a CSP header value, or undefined. */
export function nonceFromCsp(value) {
  const m = /'nonce-([A-Za-z0-9+/=_-]+)'/.exec(String(value ?? ""));
  return m ? m[1] : undefined;
}

/** Set every static header the response doesn't already carry. */
export function applyStaticSecurityHeaders(headers) {
  for (const [name, value] of Object.entries(STATIC_SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
  return headers;
}
