/**
 * Server-function bodies that can't be decoded are a client mistake: 400, not
 * 500 (#28). TanStack decodes the payload (JSON, then Seroval) before any
 * function middleware runs, so `serverFnErrors` (src/lib/server-fn-errors.ts)
 * can't see it; this wraps the response instead. Only 500s are read, and only
 * Seroval decode failures are rewritten; a real server fault stays 500.
 */
import { isUndecodablePayloadError } from "../../src/lib/server-fn-status.mjs";

interface ServerFnErrorsEvent {
  url: URL;
  req: Request;
}

const invalidInput = () =>
  new Response(JSON.stringify({ error: "invalid_input" }), {
    status: 400,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function serverFnErrorsMiddleware(
  event: ServerFnErrorsEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if (!event.url.pathname.includes("/_serverFn/")) return next();
  // Not JSON at all: answer before TanStack parses it (its error text varies by runtime).
  if (event.req.method === "POST" && event.req.headers.get("content-type")?.includes("json")) {
    try {
      JSON.parse(await event.req.clone().text());
    } catch {
      return invalidInput();
    }
  }
  const result = await next();
  if (!(result instanceof Response) || result.status !== 500) return result;
  const body = await result.clone().text();
  if (!isUndecodablePayloadError(body)) return result;
  return invalidInput();
}
