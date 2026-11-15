/**
 * Review and commit a received snapshot (#36). Preview and commit both use
 * mergeProgress, so what the user reviews is what gets saved.
 */
import { useEffect, useState } from "react";
import {
  mergeProgress,
  PROGRESS_KEY,
  useProgress,
  type ProgressSnapshot,
} from "@/lib/progress-store";

export const MERGE_RULE = "Newest/best wins per field. Nothing is deleted or wholesale replaced.";

export type MergePreview = {
  merged: Required<ProgressSnapshot>;
  newLessons: number;
  changedLessons: number;
  newCards: number;
  changedCards: number;
  xp: [number, number];
  streak: [number, number];
  floor: [string, string];
  /** False: the merge would leave this phone exactly as it is. */
  changed: boolean;
};

/** Stable JSON: object keys sorted, a missing floorUpdatedAt reads as null. */
function canon(s: ProgressSnapshot): string {
  return JSON.stringify({ ...s, floorUpdatedAt: s.floorUpdatedAt ?? null }, (_k, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : v,
  );
}

export const sameProgress = (a: ProgressSnapshot, b: ProgressSnapshot) => canon(a) === canon(b);

function rowDiff<T>(local: Record<string, T>, merged: Record<string, T>): [number, number] {
  let added = 0;
  let changed = 0;
  for (const [id, row] of Object.entries(merged)) {
    if (!(id in local)) added++;
    else if (JSON.stringify(local[id]) !== JSON.stringify(row)) changed++;
  }
  return [added, changed];
}

export function previewMerge(local: ProgressSnapshot, remote: ProgressSnapshot): MergePreview {
  const merged = mergeProgress(local, remote);
  const [newLessons, changedLessons] = rowDiff(local.completed, merged.completed);
  const [newCards, changedCards] = rowDiff(local.cards, merged.cards);
  return {
    merged,
    newLessons,
    changedLessons,
    newCards,
    changedCards,
    xp: [local.xp, merged.xp],
    streak: [local.streak, merged.streak],
    floor: [local.floor, merged.floor],
    changed: !sameProgress(local, merged),
  };
}

export type CommitResult =
  | { status: "saved" | "noop" | "changed"; preview: MergePreview }
  | { status: "failed" | "unhydrated" };

/**
 * Recompute against the latest local state. A different result than the one
 * reviewed comes back as "changed" for a new review. No-ops never write.
 * "saved" only after the persisted copy reads back as the merge.
 */
export function commitMerge(reviewed: MergePreview, remote: ProgressSnapshot): CommitResult {
  const state = useProgress.getState();
  if (!state.hydrated || state.hydrationFailed) return { status: "unhydrated" };
  const before = state.snapshot();
  const preview = previewMerge(before, remote);
  if (!sameProgress(preview.merged, reviewed.merged)) return { status: "changed", preview };
  if (!preview.changed) return { status: "noop", preview };
  try {
    state.mergeRemote(remote);
    const saved = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? "null")?.state;
    if (!saved || !sameProgress(saved, preview.merged)) {
      throw new Error("read-back mismatch");
    }
    return { status: "saved", preview };
  } catch {
    // Put memory back to what is on disk; a second write failure changes nothing more.
    try {
      useProgress.setState(before);
    } catch {
      /* memory is restored even when the write throws */
    }
    return { status: "failed" };
  }
}

/**
 * Transfers wait for this device's progress: never snapshot or merge unread data.
 * "loading" until mounted, so the server render and hydration agree.
 */
export function useStoreReady(): "loading" | "failed" | "ok" {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const hydrated = useProgress((s) => s.hydrated);
  const failed = useProgress((s) => s.hydrationFailed);
  if (!mounted) return "loading";
  return failed ? "failed" : hydrated ? "ok" : "loading";
}

export const HYDRATION_FAILED =
  "Couldn't read the progress saved on this device. Reload the page to try again.";

export function summary(s: { completed: object; cards: object; streak: number }) {
  return `${Object.keys(s.completed).length} lessons · ${Object.keys(s.cards).length} cards · streak ${s.streak}`;
}
