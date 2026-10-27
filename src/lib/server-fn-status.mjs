/**
 * HTTP status for server-function failures (#28). Plain ESM: used by the
 * `serverFnErrors` middleware, the Nitro decode-error middleware and `node --test`.
 */

/** Stable message (and `{ error }` body) for any client-side input mistake. */
export const INVALID_INPUT = "invalid_input";

/**
 * `{ status, error }` for a client mistake, or null for anything else (which
 * stays a 500 with its own stable message):
 * a zod failure (a validator) → 400 invalid_input. The 401/403 mappings went
 * with sign-in (#33).
 */
export function classifyServerFnError(err) {
  const name = err && typeof err === "object" ? err.name : undefined;
  if (name === "ZodError" || name === "$ZodError") {
    return { status: 400, error: new Error(INVALID_INPUT) };
  }
  return null;
}

/**
 * True for the serialized 500 TanStack sends when Seroval can't decode the
 * request payload. (Non-JSON bodies are refused before TanStack sees them.)
 */
export function isUndecodablePayloadError(body) {
  return /Seroval Error/.test(String(body ?? ""));
}

/**
 * True for the 500 TanStack sends when the id is missing or server-only.
 * `handleServerAction` throws this before function middleware runs.
 */
export function isUnknownServerFnError(body) {
  return /Server function (info not found|not accessible from client)/.test(String(body ?? ""));
}
