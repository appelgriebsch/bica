export function normalizeBicaStage(value: unknown): string | undefined;

export function resolveBicaStage(sources?: {
  workerEnv?: unknown;
  processEnv?: unknown;
}): string | undefined;

export function healthForStage(
  stage: string | undefined,
):
  | { status: 200; body: { ok: true; stage: "staging" | "production" } }
  | { status: 503; body: { ok: false } };
