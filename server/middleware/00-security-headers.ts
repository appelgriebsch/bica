/**
 * Static security headers on every Worker response (#28): SSR HTML, server
 * functions, /api/*, the manifest. Named `00-` so Nitro registers it first and
 * it wraps the other middleware's short-circuit responses too. Static assets
 * never reach the Worker; public/_headers covers them. The CSP is set per
 * request by the router (src/lib/csp-nonce.ts), not here.
 */
import { applyStaticSecurityHeaders } from "../../src/lib/security-headers.mjs";

export default async function securityHeadersMiddleware(
  _event: unknown,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  const result = await next();
  if (!(result instanceof Response)) return result;
  try {
    applyStaticSecurityHeaders(result.headers);
    return result;
  } catch {
    // Immutable headers (a fetched/asset Response): copy into a new one.
    const copy = new Response(result.body, result);
    applyStaticSecurityHeaders(copy.headers);
    return copy;
  }
}
