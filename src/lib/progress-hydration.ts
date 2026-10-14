/**
 * Hydration gate (#15): run `onReady` once persist has restored this device's
 * progress, and never before. No timer fallback: on a fresh D1 the device is
 * the only source for the re-upload, so syncing an unhydrated (empty) store
 * would wipe the account. A failed hydration never calls `onReady`; the store
 * logs it (`onRehydrateStorage`).
 */
type Persist = {
  hasHydrated: () => boolean;
  onFinishHydration: (fn: () => void) => () => void;
  rehydrate: () => Promise<void> | void;
};

export function whenHydrated(persist: Persist, onReady: () => void): () => void {
  let done = false;
  const ready = () => {
    if (done) return;
    done = true;
    onReady();
  };
  const unsub = persist.onFinishHydration(ready);
  if (persist.hasHydrated()) ready();
  else void persist.rehydrate();
  return () => {
    done = true;
    unsub();
  };
}
