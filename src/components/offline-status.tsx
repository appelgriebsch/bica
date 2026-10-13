import { CloudOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { announce, useAnnouncement, useOnline } from "@/lib/online";

let dismissed = false;
const dismissListeners = new Set<() => void>();

function useDismissed(): [boolean, () => void] {
  const [d, setD] = useState(dismissed);
  useEffect(() => {
    const l = () => setD(dismissed);
    dismissListeners.add(l);
    return () => {
      dismissListeners.delete(l);
    };
  }, []);
  return [
    d,
    () => {
      dismissed = true;
      for (const l of dismissListeners) l();
    },
  ];
}

/**
 * App-wide offline line + the app's single polite live region. Fixed above the
 * bottom nav, so showing or hiding it never shifts the page. Mounted once in __root.
 */
export function OfflineStatus() {
  const online = useOnline();
  const said = useAnnouncement();
  const [hidden, dismiss] = useDismissed();
  const was = useRef(online);

  useEffect(() => {
    if (was.current === online) return;
    was.current = online;
    if (online) {
      dismissed = false; // a later drop shows the line again
      announce("Back online");
    }
  }, [online]);

  const showLine = !online && !hidden;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 px-4 md:bottom-4">
      <div
        aria-live="polite"
        role="status"
        className={
          showLine || said
            ? "pointer-events-auto mx-auto flex max-w-2xl items-center gap-3 rounded-[var(--radius-md)] bg-fg px-3 py-1 text-sm text-bg shadow-[var(--shadow-border)] motion-safe:transition-opacity"
            : "sr-only"
        }
      >
        {showLine ? (
          <>
            <CloudOff aria-hidden className="size-4 shrink-0" />
            <p className="min-w-0 flex-1 py-1.5">
              <span className="min-[360px]:hidden">Offline. Lessons and audio still work.</span>
              <span className="hidden min-[360px]:inline">
                You're offline. Lessons, review and audio still work.
              </span>
            </p>
            <button
              type="button"
              className="min-h-11 shrink-0 px-1 text-sm font-medium"
              onClick={dismiss}
            >
              Hide
            </button>
          </>
        ) : (
          said && <p className="py-2.5">{said}</p>
        )}
      </div>
    </div>
  );
}

/** Header chip once the offline line was dismissed. */
export function OfflineChip() {
  const online = useOnline();
  const [hidden] = useDismissed();
  if (online || !hidden) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-1 text-xs text-muted">
      <CloudOff aria-hidden className="size-3.5" />
      Offline
    </span>
  );
}
