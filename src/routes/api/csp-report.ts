import { createFileRoute } from "@tanstack/react-router";

/**
 * CSP violation reports (#28; `report-uri` in src/lib/security-headers.mjs).
 * Logged to Workers observability, never stored. Capped per isolate so a noisy
 * page can't flood the logs; the body is cut to 2 KB.
 */
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;
let windowStart = 0;
let count = 0;

const noContent = () =>
  new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const now = Date.now();
        if (now - windowStart > WINDOW_MS) {
          windowStart = now;
          count = 0;
        }
        if (++count > MAX_PER_WINDOW) return noContent();
        const body = (await request.text().catch(() => "")).slice(0, 2048);
        console.warn("[bica] csp-report", body);
        return noContent();
      },
    },
  },
});
