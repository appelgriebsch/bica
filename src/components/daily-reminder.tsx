import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isStandaloneDisplay } from "@/components/pwa-display";
import {
  loadReminderPrefs,
  markNotifiedToday,
  msUntilReminder,
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
  saveReminderPrefs,
  shouldNudge,
  showDailyNudge,
  type ReminderPrefs,
} from "@/lib/reminder";
import { useProgress } from "@/lib/progress-store";
import { cn } from "@/lib/utils";

/**
 * Daily nudge — only when Bica is installed (standalone).
 * Fires a local notification at the preferred time if the day is still empty.
 */
export function DailyReminder({ className }: { className?: string }) {
  const lastStudyDate = useProgress((s) => s.lastStudyDate);
  const [standalone, setStandalone] = useState(false);
  const [prefs, setPrefs] = useState<ReminderPrefs>(() => loadReminderPrefs());
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const [busy, setBusy] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    setStandalone(isStandaloneDisplay());
    setPerm(notificationPermission());
  }, []);

  const tryNudge = useCallback(async () => {
    const current = loadReminderPrefs();
    if (!shouldNudge(lastStudyDate, current)) return;
    const ok = await showDailyNudge();
    if (ok) setPrefs(markNotifiedToday(current));
  }, [lastStudyDate]);

  // Check on mount / study-date change, and schedule the next preferred time.
  useEffect(() => {
    if (!standalone || !prefs.enabled) return;
    if (notificationPermission() !== "granted") return;

    void tryNudge();

    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    const wait = msUntilReminder(prefs.time);
    timerRef.current = window.setTimeout(() => {
      void tryNudge();
    }, Math.min(wait, 24 * 60 * 60 * 1000));

    const onVisible = () => {
      if (document.visibilityState === "visible") void tryNudge();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [standalone, prefs.enabled, prefs.time, tryNudge]);

  async function enable() {
    setBusy(true);
    try {
      if (!notificationsSupported()) {
        setPerm("unsupported");
        return;
      }
      const nextPerm = await requestNotificationPermission();
      setPerm(nextPerm);
      if (nextPerm !== "granted") return;
      const next = { ...prefs, enabled: true };
      saveReminderPrefs(next);
      setPrefs(next);
    } finally {
      setBusy(false);
    }
  }

  function disable() {
    const next = { ...prefs, enabled: false };
    saveReminderPrefs(next);
    setPrefs(next);
  }

  function setTime(time: string) {
    const next = { ...prefs, time };
    saveReminderPrefs(next);
    setPrefs(next);
  }

  // Always show the section on You so people discover it.
  // Controls only work after install (standalone); otherwise nudge them to install.
  if (!standalone) {
    return (
      <section
        className={cn(
          "rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]",
          className,
        )}
      >
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 size-5 shrink-0 text-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-xl font-medium">Daily reminder</h2>
            <p className="mt-1 text-sm text-muted">
              Install Bica on your home screen first. Then you can pick a time and get a nudge
              if the day is still empty.
            </p>
            <p className="mt-3 text-sm text-subtle">
              On iPhone: Share → Add to Home Screen. On Android: browser menu → Install app.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Bell className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-xl font-medium">Daily reminder</h2>
          <p className="mt-1 text-sm text-muted">
            If you have not studied by this time, Bica will nudge you once.
          </p>

          {perm === "unsupported" ? (
            <p className="mt-3 text-sm text-subtle">
              Notifications are not available on this device.
            </p>
          ) : perm === "denied" ? (
            <p className="mt-3 text-sm text-subtle">
              Notifications are blocked. Allow them in system settings to get a daily nudge.
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--color-accent)]"
                  checked={prefs.enabled}
                  disabled={busy}
                  onChange={(e) => {
                    if (e.target.checked) void enable();
                    else disable();
                  }}
                />
                <span className="font-medium">Remind me</span>
              </label>
              <label className="flex min-h-11 items-center gap-2 text-sm text-muted">
                <span className="sr-only">Preferred time</span>
                <input
                  type="time"
                  value={prefs.time}
                  disabled={!prefs.enabled && perm !== "granted"}
                  onChange={(e) => setTime(e.target.value || "08:00")}
                  className="h-11 rounded-[var(--radius-md)] border-0 bg-surface-2 px-3 text-fg tabular-nums"
                />
              </label>
            </div>
          )}

          {prefs.enabled && perm === "granted" ? (
            <p className="mt-2 text-sm text-subtle">
              On at {prefs.time} — only if the day is still empty.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
