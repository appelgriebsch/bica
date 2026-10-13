import { fetchProgress, saveProgressSnapshot } from "@/lib/progress-server";
import { announce, isOnline } from "@/lib/online";
import { useProgress } from "@/lib/progress-store";

/**
 * Pull the account, union it with this device, push the union.
 * Empty local + full remote → this device catches up.
 * Full local + empty remote → the account catches up.
 */
export async function syncProgressWithAccount(): Promise<{ ok: boolean; error?: string }> {
  const progress = useProgress.getState();
  if (progress.syncing) return { ok: true };
  // Offline: stay queued (syncPending); ProgressSync flushes on a confirmed reconnect.
  if (!isOnline()) return { ok: false, error: "offline" };
  const queued = progress.syncPending;
  progress.setSyncing(true);
  try {
    const remote = await fetchProgress();
    useProgress.getState().mergeRemote(remote);
    const changes = useProgress.getState().changes;
    await saveProgressSnapshot({ data: useProgress.getState().snapshot() });
    useProgress.getState().markSynced(changes);
    if (queued && !useProgress.getState().syncPending) announce("Synced");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not reach the account.";
    console.warn("[bica] progress sync failed:", message);
    let friendly = "Could not reach the account. Try again.";
    if (message === "Unauthorized" || message.includes("Unauthorized")) {
      friendly = "Sign in again to save the path to this account.";
    } else if (
      message.includes("Forbidden") ||
      message.includes("cross-site") ||
      message.includes("CrossSite")
    ) {
      friendly = "Sign-in could not be verified on this device. Close extra tabs and try again.";
    } else if (
      message.includes("Failed to fetch") ||
      message.includes("NetworkError") ||
      message.includes("network")
    ) {
      friendly = "No connection to the account right now. Check the line and try again.";
    } else if (message.includes("relation") || message.includes("does not exist")) {
      friendly = "Account storage is still setting up. Wait a moment and try again.";
    } else if (
      message.includes("Expected") ||
      message.includes("invalid_type") ||
      message.includes("Zod")
    ) {
      friendly = "This device sent a path the account could not read. Try again after a refresh.";
    }
    useProgress.getState().setSyncError(friendly);
    return { ok: false, error: friendly };
  } finally {
    if (useProgress.getState().syncing) useProgress.getState().setSyncing(false);
  }
}
