import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db";
import {
  INVALID_PROGRESS,
  loadProgress,
  parseLessonSave,
  parseSnapshot,
  saveLesson,
  saveSnapshot,
} from "@/lib/progress-merge";
import type { CefrLevel } from "@/data/types";

/** Auth errors pass through; anything else becomes a stable message, never driver text. */
function rethrowProgress(err: unknown): never {
  if (err && typeof err === "object" && "status" in err) {
    const status = Number((err as { status?: number }).status);
    if (status === 401 || status === 403) throw err;
  }
  const raw = err instanceof Error ? err.message : String(err);
  console.error("[bica] progress:", raw);
  if (/Unauthorized/i.test(raw)) throw err instanceof Error ? err : new Error("Unauthorized");
  if (/Forbidden|cross-site|CrossSite/i.test(raw)) {
    throw err instanceof Error ? err : new Error("Forbidden: cross-site request blocked");
  }
  if (raw === INVALID_PROGRESS) throw new Error(INVALID_PROGRESS);
  throw new Error("Could not reach the account.");
}

/** POST, not GET — a cached GET was handing the second browser an empty path. */
export const fetchProgress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    try {
      const progress = await loadProgress(await getDb(), context.userId);
      return { ...progress, floor: progress.floor as CefrLevel };
    } catch (err) {
      rethrowProgress(err);
    }
  });

export const saveLessonProgress = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseLessonSave)
  .handler(async ({ context, data }) => {
    try {
      await saveLesson(await getDb(), context.userId, data);
      return { ok: true as const };
    } catch (err) {
      rethrowProgress(err);
    }
  });

export const saveProgressSnapshot = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(parseSnapshot)
  .handler(async ({ context, data }) => {
    try {
      await saveSnapshot(await getDb(), context.userId, data);
      return { ok: true as const };
    } catch (err) {
      rethrowProgress(err);
    }
  });
