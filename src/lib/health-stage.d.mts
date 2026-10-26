export function normalizeBicaStage(value: unknown): string | undefined;

export function resolveBicaStage(sources?: {
  workerEnv?: unknown;
  processEnv?: unknown;
}): string | undefined;

export function healthForStage(
  stage: string | undefined,
  sha?: string,
):
  | { status: 200; body: { ok: true; stage: "staging" | "production"; sha: string } }
  | { status: 503; body: { ok: false } };
