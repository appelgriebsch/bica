import { createFileRoute } from "@tanstack/react-router";
import { createCspReportHandler } from "@/lib/csp-report.mjs";
import { methodNotAllowed } from "@/lib/method-not-allowed.mjs";

/**
 * CSP violation reports (#28; `report-uri`/`report-to` in
 * src/lib/security-headers.mjs). Rate and size caps live in
 * src/lib/csp-report.mjs.
 */
const handle = createCspReportHandler();

export const Route = createFileRoute("/api/csp-report")({
  server: {
    handlers: {
      POST: ({ request }) => handle(request),
      ANY: () => methodNotAllowed("POST"),
    },
  },
});
