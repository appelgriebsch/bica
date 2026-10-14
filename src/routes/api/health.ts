import { createFileRoute } from "@tanstack/react-router";
import { healthForStage, resolveBicaStage } from "@/lib/health-stage.mjs";

/** Staging and production liveness. Do not import the auth server or the database from here. */
function readBicaStage(): string | undefined {
  const workerEnv = (globalThis as { __env__?: { BICA_STAGE?: unknown } }).__env__;
  return resolveBicaStage({
    workerEnv: workerEnv?.BICA_STAGE,
    processEnv: typeof process !== "undefined" ? process.env.BICA_STAGE : undefined,
  });
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        const decision = healthForStage(readBicaStage());
        return new Response(JSON.stringify(decision.body), {
          status: decision.status,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
    },
  },
});
