export const WINDOW_MS: number;
export const MAX_PER_WINDOW: number;
export const MAX_BODY_BYTES: number;
export function readCapped(request: Request, max?: number): Promise<string | null>;
export function createCspReportHandler(opts?: {
  log?: (...args: unknown[]) => void;
  now?: () => number;
}): (request: Request) => Promise<Response>;
