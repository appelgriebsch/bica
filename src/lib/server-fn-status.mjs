/**
 * HTTP status for server-function failures (#28). Plain ESM: used by the
 * `serverFnErrors` middleware, the Nitro decode-error middleware, the client
 * sync code and `node --test`.
 */

/** Stable message (and `{ error }` body) for any client-side input mistake. */
export const INVALID_INPUT = "invalid_input";

const INVALID_PROGRESS = "Invalid progress snapshot";

function statusOf(err) {
  if (!err || typeof err !== "object" || !("status" in err)) return undefined;
  const status = Number(err.status);
  return Number.isInteger(status) ? status : undefined;
}

/**
 * `{ status, error }` for a client mistake, or null for anything else (which
 * stays a 500 with its own stable message):
 * - no session (`UnauthorizedError`, status 401) → 401, same error
 * - cross-site (`CrossSiteRequestError`, status 403) → 403, same error
 * - a zod failure or the progress validator's INVALID_PROGRESS → 400 invalid_input
 */
export function classifyServerFnError(err) {
  const status = statusOf(err);
  if (status === 401 || status === 403) return { status, error: err };
  const name = err && typeof err === "object" ? err.name : undefined;
  const message = err instanceof Error ? err.message : undefined;
  if (name === "ZodError" || name === "$ZodError" || message === INVALID_PROGRESS) {
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

/** Client side: the server said the call itself was malformed (a bug, not the line). */
export function isInvalidInputError(err) {
  const message = err instanceof Error ? err.message : String(err ?? "");
  return message === INVALID_INPUT || message.includes(INVALID_PROGRESS);
}
