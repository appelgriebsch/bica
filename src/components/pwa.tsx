import { Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { clearModuleReloadToken } from "@/lib/error-component";

function isEmbeddedFrame() {
  try {
    return window.parent !== window;
  } catch {
    return true;
  }
}

export function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || ios;
}

function isApplePhone() {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

/** Registers the offline worker on a published, top-level Bica — not in the preview iframe, not during local HMR. */
export function PwaRegister() {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    if (isEmbeddedFrame()) return;
    const register = () => {
      clearModuleReloadToken();
      void navigator.serviceWorker
        .register("/sw.js", { updateViaCache: "none" })
        // Ask the browser not to evict the offline precache (iOS evicts readily).
        .then(() => navigator.storage?.persist?.())
        .catch(() => {
          /* install still works from the manifest; cache can wait */
        });
    };
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}

export function InstallHint({ className }: { className?: string }) {
  const [show, setShow] = useState(false);
  const [apple, setApple] = useState(false);

  useEffect(() => {
    setShow(!isStandaloneDisplay());
    setApple(isApplePhone());
  }, []);

  if (!show) return null;

  return (
    <section
      className={cn(
        "rounded-[var(--radius-lg)] bg-surface p-4 shadow-[var(--shadow-border)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-accent" />
        <div className="min-w-0">
          <h2 className="font-display text-xl font-medium">On your phone</h2>
          <p className="mt-1 text-sm text-muted">
            {apple
              ? "Share, then Add to Home Screen. After that, the path works without a signal — and you can turn on a daily reminder."
              : "Install Bica from the browser menu. After that, the path works without a signal — and you can turn on a daily reminder."}
          </p>
        </div>
      </div>
    </section>
  );
}
