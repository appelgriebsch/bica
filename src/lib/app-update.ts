/**
 * Explicit "Update app" (#36): only on a user tap, activate a worker that
 * finished its all-or-nothing install, then reload once on controllerchange.
 * Never runs on its own, so a reconnect can't update or merge anything.
 */
export type UpdateResult = "reloading" | "none" | "offline";

let reloading = false;

function settled(worker: ServiceWorker | null): Promise<void> {
  return new Promise((resolve) => {
    if (!worker) return resolve();
    const check = () => {
      if (worker.state === "installing") return;
      worker.removeEventListener("statechange", check);
      resolve();
    };
    worker.addEventListener("statechange", check);
    check();
  });
}

export async function updateApp(): Promise<UpdateResult> {
  const sw = typeof navigator !== "undefined" ? navigator.serviceWorker : undefined;
  const reg = await sw?.getRegistration().catch(() => undefined);
  if (sw && reg && !reg.waiting) {
    // Offline or a failed fetch rejects; a failed install ends "redundant" and
    // leaves the old worker in charge.
    await reg.update().catch(() => {});
    await settled(reg.installing);
  }
  const waiting = reg?.waiting;
  if (!sw || !waiting) return navigator.onLine === false ? "offline" : "none";
  sw.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  waiting.postMessage({ type: "SKIP_WAITING" });
  return "reloading";
}

export const UPDATE_MESSAGES: Record<Exclude<UpdateResult, "reloading">, string> = {
  none: "No update available yet. Try again later.",
  offline: "Connect to the internet to update Bica, then scan again.",
};
