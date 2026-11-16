import { createFileRoute } from "@tanstack/react-router";
import { healthForStage, resolveBicaStage } from "@/lib/health-stage.mjs";
import { methodNotAllowed } from "@/lib/method-not-allowed.mjs";

/** Staging and production liveness. Do not import the auth server or the database from here. */
function readWorkerEnv(): { BICA_STAGE?: unknown; CF_VERSION_METADATA?: unknown } | undefined {
  return (globalThis as { __env__?: { BICA_STAGE?: unknown; CF_VERSION_METADATA?: unknown } })
    .__env__;
}

function readBicaStage(): string | undefined {
  const workerEnv = readWorkerEnv();
  return resolveBicaStage({
    workerEnv: workerEnv?.BICA_STAGE,
    processEnv: typeof process !== "undefined" ? process.env.BICA_STAGE : undefined,
  });
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: () => {
        // #73: CF_VERSION_METADATA is bound per env; locally it is absent and
        // healthForStage reports "dev".
        const decision = healthForStage(
          readBicaStage(),
          __BICA_BUILD_SHA_FULL__,
          readWorkerEnv()?.CF_VERSION_METADATA,
        );
        return new Response(JSON.stringify(decision.body), {
          status: decision.status,
          headers: {
            "content-type": "application/json; charset=utf-8",
            "cache-control": "no-store",
          },
        });
      },
      ANY: () => methodNotAllowed("GET, HEAD"),
    },
  },
});
