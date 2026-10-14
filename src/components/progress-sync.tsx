import { useEffect, useRef } from "react";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { useOnline } from "@/lib/online";
import { useProgress } from "@/lib/progress-store";
import { whenHydrated } from "@/lib/progress-hydration";
import { syncProgressWithAccount } from "@/lib/sync-progress";

/**
 * Pull the account, union it with this device, push the union back.
 * Runs on sign-in, on return to the tab, and when the line comes back
 * (confirmed by the shared online hook) — that last one flushes the offline
 * queue (`syncPending`) and says "Synced".
 */
export function ProgressSync() {
  const { user, isPending } = useCurrentUserState();
  const hydrated = useProgress((s) => s.hydrated);
  const userId = user?.id ?? null;
  const online = useOnline();
  const wasOnline = useRef(online);

  useEffect(() => {
    if (useProgress.getState().hydrated) return;
    // Sync starts only once persist has hydrated; there is no timer fallback (#15).
    return whenHydrated(useProgress.persist, () => useProgress.getState().markHydrated());
  }, []);

  useEffect(() => {
    if (isPending || !userId || !hydrated) return;

    let cancelled = false;

    async function sync() {
      if (cancelled) return;
      const first = await syncProgressWithAccount();
      if (cancelled || first.ok) return;
      // The session cookie / D1 write can lag one beat after the X callback lands.
      await new Promise((r) => window.setTimeout(r, 1200));
      if (!cancelled) await syncProgressWithAccount();
    }

    void sync();
    const onVisible = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [userId, isPending, hydrated]);

  useEffect(() => {
    const back = online && !wasOnline.current;
    wasOnline.current = online;
    if (!back || isPending || !userId || !hydrated) return;
    if (!useProgress.getState().syncPending) return;
    void syncProgressWithAccount();
  }, [online, userId, isPending, hydrated]);

  return null;
}
