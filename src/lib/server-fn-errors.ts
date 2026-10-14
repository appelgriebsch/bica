import { createMiddleware } from "@tanstack/react-start";
import { classifyServerFnError } from "@/lib/server-fn-status.mjs";

/**
 * Status codes for server functions (#28). Without it TanStack sends a thrown
 * error with HTTP 200 (or 500). Every server function lists it first, so it
 * wraps the validator: 400 bad input with the stable message "invalid_input".
 * Everything else passes through unchanged.
 * Undecodable bodies fail before any middleware; server/middleware/
 * server-fn-errors.ts turns those into 400.
 */
export const serverFnErrors = createMiddleware({ type: "function" }).server(async ({ next }) => {
  try {
    return await next();
  } catch (err) {
    const mapped = classifyServerFnError(err);
    if (!mapped) throw err;
    const { setResponseStatus } = await import("./http-status.server");
    setResponseStatus(mapped.status);
    throw mapped.error;
  }
});
