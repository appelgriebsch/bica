import { saveLessonProgress, saveProgressSnapshot } from "@/lib/progress-server";
import { useProgress } from "@/lib/progress-store";

/**
 * Always write locally first. Then try the account — guests 401 and stay
 * local; a signed-in session is picked up from the cookie/bearer even if
 * React has not painted the user yet.
 */
export async function persistCompletion(
  id: string,
  quizScore: number,
  quizTotal: number,
  _signedIn?: boolean,
) {
  const xp = 8 + quizScore * 2;
  useProgress.getState().completeLesson(id, { quizScore, quizTotal, xp });
  useProgress.getState().setSyncPending(true);
  try {
    await saveLessonProgress({
      data: { lessonId: id, quizScore, quizTotal, xp },
    });
    await saveProgressSnapshot({ data: useProgress.getState().snapshot() });
    useProgress.getState().markSynced();
  } catch {
    /* guest, or the line dropped — stays pending; ProgressSync flushes on reconnect / sign-in */
  }
  return xp;
}
