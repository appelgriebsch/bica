import { createIsomorphicFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { buildCsp, cspHeaderName, newNonce } from "@/lib/security-headers.mjs";

function readCspEnforce(): unknown {
  const workerEnv = (globalThis as { __env__?: { CSP_ENFORCE?: unknown } }).__env__;
  return (
    workerEnv?.CSP_ENFORCE ?? (typeof process !== "undefined" ? process.env.CSP_ENFORCE : undefined)
  );
}

/**
 * Per-request CSP nonce (#28). On the server it mints the nonce and sets the
 * CSP header on this response; TanStack puts the nonce on its own scripts via
 * `ssr.nonce`. In the browser it reads the `csp-nonce` meta TanStack renders,
 * so hydration sees the same value.
 */
export const cspNonce = createIsomorphicFn()
  .server((): string => {
    const nonce = newNonce();
    setResponseHeader(cspHeaderName(readCspEnforce()), buildCsp(nonce));
    return nonce;
  })
  .client(
    (): string | undefined =>
      document.querySelector<HTMLMetaElement>('meta[property="csp-nonce"]')?.content || undefined,
  );
