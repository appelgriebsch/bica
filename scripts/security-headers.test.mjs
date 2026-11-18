/** #28: the security header values and the CSP builder. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CF_BEACON_ORIGIN,
  CF_RUM_ORIGIN,
  CSP_HEADER,
  CSP_REPORT_ONLY_HEADER,
  STATIC_SECURITY_HEADERS,
  TURNSTILE_ORIGIN,
  applyStaticSecurityHeaders,
  buildCsp,
  cspHeaderName,
  newNonce,
  nonceFromCsp,
} from "../src/lib/security-headers.mjs";

test("static headers: HSTS without preload, DENY, referrer, nosniff, COOP same-origin (no sign-in popup, #33)", () => {
  assert.equal(
    STATIC_SECURITY_HEADERS["strict-transport-security"],
    "max-age=31536000; includeSubDomains",
  );
  assert.equal(STATIC_SECURITY_HEADERS["x-frame-options"], "DENY");
  assert.equal(STATIC_SECURITY_HEADERS["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(STATIC_SECURITY_HEADERS["x-content-type-options"], "nosniff");
  assert.equal(STATIC_SECURITY_HEADERS["cross-origin-opener-policy"], "same-origin");
  // #36: camera for same-origin QR scanning; #83 (ADR 0020): mic for same-origin
  // Spoken Conversas (#151: microphone=() blocked the app's own mic); location off.
  assert.equal(
    STATIC_SECURITY_HEADERS["permissions-policy"],
    "camera=(self), geolocation=(), microphone=(self)",
  );
});

test("CSP: nonce scripts with strict-dynamic, no unsafe-inline scripts, locked framing", () => {
  const csp = buildCsp("N0nce");
  const directives = Object.fromEntries(
    csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1).join(" ")]),
  );
  assert.equal(
    directives["script-src"],
    `'self' 'nonce-N0nce' 'strict-dynamic' ${TURNSTILE_ORIGIN} ${CF_BEACON_ORIGIN}`,
  );
  assert.equal(directives["worker-src"], "'self'");
  assert.equal(directives["frame-ancestors"], "'none'");
  assert.equal(directives["form-action"], "'self'");
  assert.doesNotMatch(csp, /auth\.grok\.me/); // #33: no auth broker
  // #35 + ADR 0011: the third-party origins are Turnstile (script/connect/frame)
  // and the two Web Analytics hosts (script-src beacon, connect-src RUM).
  assert.equal(directives["connect-src"], `'self' ${TURNSTILE_ORIGIN} ${CF_RUM_ORIGIN}`);
  assert.equal(directives["frame-src"], TURNSTILE_ORIGIN);
  assert.equal(directives["default-src"], "'self'");
  assert.equal(directives["img-src"], "'self' data: blob:");
  const urls = csp.match(/https:\/\/[^\s;]+/g);
  assert.deepEqual(
    [...new Set(urls)].sort(),
    [TURNSTILE_ORIGIN, CF_BEACON_ORIGIN, CF_RUM_ORIGIN].sort(),
  );
  assert.equal(urls.filter((u) => u === TURNSTILE_ORIGIN).length, 3);
  assert.equal(directives["object-src"], "'none'");
  assert.equal(directives["report-uri"], "/api/csp-report");
  assert.equal(directives["report-to"], "csp-endpoint");
  assert.equal(STATIC_SECURITY_HEADERS["reporting-endpoints"], 'csp-endpoint="/api/csp-report"');
  assert.equal(nonceFromCsp(csp), "N0nce");
});

test("Report-Only unless CSP_ENFORCE is 1/true", () => {
  for (const v of [undefined, "", "0", "false", "yes"]) {
    assert.equal(cspHeaderName(v), CSP_REPORT_ONLY_HEADER, String(v));
  }
  assert.equal(cspHeaderName("1"), CSP_HEADER);
  assert.equal(cspHeaderName("true"), CSP_HEADER);
  // Enforce mode uses the same policy: reports, nonce and the Turnstile frame stay.
  const enforced = buildCsp("N0nce");
  assert.match(enforced, /'nonce-N0nce'/);
  assert.match(enforced, /report-uri \/api\/csp-report/);
  assert.match(enforced, /report-to csp-endpoint/);
  assert.match(enforced, /frame-src https:\/\/challenges\.cloudflare\.com/);
});

test("nonces are fresh, 128-bit base64", () => {
  const a = newNonce();
  assert.match(a, /^[A-Za-z0-9+/]{22}==$/);
  assert.notEqual(a, newNonce());
  assert.equal(nonceFromCsp(buildCsp(a)), a);
  assert.equal(nonceFromCsp(undefined), undefined);
});

test("applyStaticSecurityHeaders fills gaps, keeps a value already set", () => {
  const h = new Headers({ "x-frame-options": "SAMEORIGIN" });
  applyStaticSecurityHeaders(h);
  assert.equal(h.get("x-frame-options"), "SAMEORIGIN");
  for (const [k, v] of Object.entries(STATIC_SECURITY_HEADERS)) {
    if (k !== "x-frame-options") assert.equal(h.get(k), v, k);
  }
});
