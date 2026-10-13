import { createFileRoute } from "@tanstack/react-router";

/** Reachability probe for the shared online hook (src/lib/online.ts). */
const noContent = () =>
  new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

export const Route = createFileRoute("/api/ping")({
  server: { handlers: { HEAD: noContent, GET: noContent } },
});
