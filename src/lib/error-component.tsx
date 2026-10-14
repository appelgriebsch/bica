import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";

const RELOAD_KEY = "bica-module-reload";

function isModuleLoadError(error: unknown) {
  const msg = error instanceof Error ? error.message : String(error ?? "");
  return /importing a module script failed|failed to fetch dynamically imported module|error loading dynamically imported module|failed to load module script|loading chunk/i.test(
    msg,
  );
}

async function clearStuckClient() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  if (typeof caches !== "undefined") {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
}

function takeReloadToken() {
  try {
    if (sessionStorage.getItem(RELOAD_KEY) === "1") return false;
    sessionStorage.setItem(RELOAD_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function clearModuleReloadToken() {
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* private mode */
  }
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const [retrying, setRetrying] = useState(false);
  const chunkError = isModuleLoadError(error);

  useEffect(() => {
    if (!chunkError || typeof window === "undefined") return;
    if (!takeReloadToken()) return;
    setRetrying(true);
    void clearStuckClient().finally(() => {
      window.location.reload();
    });
  }, [chunkError]);

  async function retry() {
    setRetrying(true);
    try {
      sessionStorage.removeItem(RELOAD_KEY);
    } catch {
      /* private mode */
    }
    await clearStuckClient();
    window.location.reload();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-fg">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-8" strokeWidth={2} />
      </span>
      <h1 className="font-display text-xl font-medium">
        {retrying ? "Refreshing…" : "Something went wrong"}
      </h1>
      <p className="max-w-md text-sm break-words text-muted">
        {retrying
          ? "A stuck copy of Bica was sitting on this phone. Loading a fresh one."
          : chunkError
            ? "This copy of Bica got stuck. Tap try again."
            : (error instanceof Error && error.message) ||
              "An unexpected error occurred. Try reloading the page."}
      </p>
      {retrying ? null : (
        <button
          type="button"
          className="mt-2 min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-accent-fg"
          onClick={() => void retry()}
        >
          Try again
        </button>
      )}
    </main>
  );
}
