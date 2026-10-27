/**
 * Some server-function failures happen before function middleware runs (#28,
 * #55). TanStack decodes the payload, then looks up the id, and serializes
 * either miss as a 500. This wraps the response: an undecodable body is a
 * 400, an unknown id is a 404. A real server fault stays 500.
 */
import {
  isUndecodablePayloadError,
  isUnknownServerFnError,
} from "../../src/lib/server-fn-status.mjs";

interface ServerFnErrorsEvent {
  url: URL;
  req: Request;
}

const jsonError = (status: number, error: string) =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function serverFnErrorsMiddleware(
  event: ServerFnErrorsEvent,
  next: () => unknown | Promise<unknown>,
): Promise<unknown> {
  if (!event.url.pathname.includes("/_serverFn/")) return next();
  // Not JSON at all: answer before TanStack parses it (its error text varies by runtime).
  // ponytail: this parses the body a second time (TanStack parses it again);
  // fine for small server-fn payloads, and the only stable way to get a 400.
  if (event.req.method === "POST" && event.req.headers.get("content-type")?.includes("json")) {
    try {
      JSON.parse(await event.req.clone().text());
    } catch {
      return jsonError(400, "invalid_input");
    }
  }
  const result = await next();
  if (!(result instanceof Response) || result.status !== 500) return result;
  const body = await result.clone().text();
  if (isUndecodablePayloadError(body)) return jsonError(400, "invalid_input");
  if (isUnknownServerFnError(body)) return jsonError(404, "not_found");
  return result;
}
