/** #28: the security header values and the CSP builder. */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CSP_HEADER,
  CSP_REPORT_ONLY_HEADER,
  STATIC_SECURITY_HEADERS,
  applyStaticSecurityHeaders,
  buildCsp,
  cspHeaderName,
  newNonce,
  nonceFromCsp,
} from "../src/lib/security-headers.mjs";

test("static headers: HSTS without preload, DENY, referrer, nosniff, COOP for the popup", () => {
  assert.equal(
    STATIC_SECURITY_HEADERS["strict-transport-security"],
    "max-age=31536000; includeSubDomains",
  );
  assert.equal(STATIC_SECURITY_HEADERS["x-frame-options"], "DENY");
  assert.equal(STATIC_SECURITY_HEADERS["referrer-policy"], "strict-origin-when-cross-origin");
  assert.equal(STATIC_SECURITY_HEADERS["x-content-type-options"], "nosniff");
  assert.equal(STATIC_SECURITY_HEADERS["cross-origin-opener-policy"], "same-origin-allow-popups");
  assert.match(STATIC_SECURITY_HEADERS["permissions-policy"], /camera=\(\)/);
});

test("CSP: nonce scripts with strict-dynamic, no unsafe-inline scripts, locked framing", () => {
  const csp = buildCsp("N0nce");
  const directives = Object.fromEntries(
    csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1).join(" ")]),
  );
  assert.equal(directives["script-src"], "'self' 'nonce-N0nce' 'strict-dynamic'");
  assert.equal(directives["worker-src"], "'self'");
  assert.equal(directives["frame-ancestors"], "'none'");
  assert.equal(directives["form-action"], "'self' https://auth.grok.me");
  assert.equal(directives["connect-src"], "'self'");
  assert.equal(directives["object-src"], "'none'");
  assert.equal(directives["report-uri"], "/api/csp-report");
  assert.equal(directives["report-to"], "csp-endpoint");
  assert.equal(
    STATIC_SECURITY_HEADERS["reporting-endpoints"],
    'csp-endpoint="/api/csp-report"',
  );
  assert.equal(nonceFromCsp(csp), "N0nce");
});

test("Report-Only unless CSP_ENFORCE is 1/true", () => {
  for (const v of [undefined, "", "0", "false", "yes"]) {
    assert.equal(cspHeaderName(v), CSP_REPORT_ONLY_HEADER, String(v));
  }
  assert.equal(cspHeaderName("1"), CSP_HEADER);
  assert.equal(cspHeaderName("true"), CSP_HEADER);
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
