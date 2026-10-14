import { useProgress } from "@/lib/progress-store";

/**
 * Record a finished lesson. Progress is device-only (#33): it lives in the
 * persisted store (localStorage) and never leaves the device.
 */
export function persistCompletion(id: string, quizScore: number, quizTotal: number) {
  const xp = 8 + quizScore * 2;
  useProgress.getState().completeLesson(id, { quizScore, quizTotal, xp });
  return xp;
}
