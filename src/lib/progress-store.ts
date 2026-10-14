import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CefrLevel } from "@/data/types";
import { gradeCard, type SrsCard } from "@/lib/srs";
import { asDayKey, todayKey, yesterdayKey } from "@/lib/utils";

export type LessonResult = {
  quizScore: number;
  quizTotal: number;
  xp: number;
  completedAt: string;
};

export type ProgressSnapshot = {
  completed: Record<string, LessonResult>;
  xp: number;
  streak: number;
  lastStudyDate: string | null;
  cards: Record<string, SrsCard>;
  floor: CefrLevel;
  /** When the floor was last set (Date.toISOString), or null if never on record. */
  floorUpdatedAt?: string | null;
};

export type ProgressState = {
  completed: Record<string, LessonResult>;
  xp: number;
  streak: number;
  lastStudyDate: string | null;
  floor: CefrLevel;
  floorUpdatedAt: string | null;
  cards: Record<string, SrsCard>;
  /** True once persist has restored this device's progress; sync never runs before. */
  hydrated: boolean;
  lastSyncedAt: string | null;
  syncing: boolean;
  syncError: string | null;
  /** Local changes not yet pushed to the account (the offline sync queue). Persisted. */
  syncPending: boolean;
  /** Bumped by every local change (not persisted); markSynced compares it to the snapshot's. */
  changes: number;
  markHydrated: () => void;
  /** Clears syncPending only if nothing changed since `changesAtSnapshot` (the `changes` read before the push). */
  markSynced: (changesAtSnapshot?: number) => void;
  setSyncing: (syncing: boolean) => void;
  setSyncError: (syncError: string | null) => void;
  setFloor: (level: CefrLevel) => void;
  completeLesson: (lessonId: string, result: Omit<LessonResult, "completedAt">) => void;
  gradeVocab: (cardId: string, knew: boolean) => void;
  touchStudy: (xp?: number) => void;
  mergeRemote: (remote: ProgressSnapshot) => void;
  snapshot: () => ProgressSnapshot;
};

const rank: Record<CefrLevel, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4 };

function nextStreak(last: string | null, today: string): number {
  if (last === today) return -1;
  if (last === yesterdayKey()) return 1;
  return 0;
}

function applyStreak(
  lastStudyDate: string | null,
  streak: number,
  today: string,
): { streak: number; lastStudyDate: string } {
  const bump = nextStreak(lastStudyDate, today);
  return {
    lastStudyDate: today,
    streak: bump === -1 ? streak : bump === 1 ? streak + 1 : 1,
  };
}

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      completed: {},
      xp: 0,
      streak: 0,
      lastStudyDate: null,
      floor: "A1",
      floorUpdatedAt: null,
      cards: {},
      hydrated: false,
      lastSyncedAt: null,
      syncing: false,
      syncError: null,
      syncPending: false,
      changes: 0,
      markHydrated: () => set({ hydrated: true }),
      markSynced: (changesAtSnapshot) =>
        set((s) => ({
          lastSyncedAt: new Date().toISOString(),
          syncError: null,
          syncing: false,
          syncPending:
            changesAtSnapshot !== undefined && s.changes !== changesAtSnapshot
              ? s.syncPending
              : false,
        })),
      setSyncing: (syncing) => set({ syncing }),
      setSyncError: (syncError) => set({ syncError, syncing: false }),
      setFloor: (level) =>
        set((s) => ({
          floor: level,
          floorUpdatedAt: new Date().toISOString(),
          syncPending: true,
          changes: s.changes + 1,
        })),
      completeLesson: (lessonId, result) => {
        const today = todayKey();
        const prev = get();
        const existing = prev.completed[lessonId];
        const better =
          !existing || result.quizScore >= existing.quizScore
            ? {
                ...result,
                completedAt: new Date().toISOString(),
              }
            : existing;
        const deltaXp = existing ? Math.max(0, better.xp - existing.xp) : result.xp;
        const { streak, lastStudyDate } = applyStreak(
          prev.lastStudyDate,
          prev.streak,
          today,
        );
        set({
          completed: { ...prev.completed, [lessonId]: better },
          xp: prev.xp + deltaXp,
          streak,
          lastStudyDate,
          syncPending: true,
          changes: prev.changes + 1,
        });
      },
      gradeVocab: (cardId, knew) => {
        const today = todayKey();
        const prev = get();
        set({
          cards: {
            ...prev.cards,
            [cardId]: gradeCard(prev.cards[cardId], knew, today),
          },
          syncPending: true,
          changes: prev.changes + 1,
        });
      },
      touchStudy: (xp = 0) => {
        const today = todayKey();
        const prev = get();
        const { streak, lastStudyDate } = applyStreak(
          prev.lastStudyDate,
          prev.streak,
          today,
        );
        set({
          xp: prev.xp + xp,
          streak,
          lastStudyDate,
          syncPending: true,
          changes: prev.changes + 1,
        });
      },
      mergeRemote: (remote) => {
        const local = get();
        const completed = { ...(remote.completed ?? {}) };
        for (const [id, row] of Object.entries(local.completed)) {
          const other = completed[id];
          if (!other || row.quizScore > other.quizScore) completed[id] = row;
        }
        const cards = { ...(remote.cards ?? {}) };
        for (const [id, row] of Object.entries(local.cards)) {
          const other = cards[id];
          if (!other || row.reps > other.reps || (row.reps === other.reps && row.due > other.due)) {
            cards[id] = row;
          }
        }
        const localDay = asDayKey(local.lastStudyDate);
        const remoteDay = asDayKey(remote.lastStudyDate);
        // Same rule as the server (progress-merge STATS_UPSERT): the streak goes with the later
        // study day, so a broken streak can drop; max only on a tie.
        const l = localDay ?? "";
        const r = remoteDay ?? "";
        const lastStudyDate = l > r ? localDay : remoteDay;
        const streak =
          l > r ? local.streak : l < r ? remote.streak : Math.max(local.streak, remote.streak);
        // Floor: the newer setting wins (#15), the same rule as the server's STATS_UPSERT. A
        // timestamp beats none; rank max only when neither side has one; a tie keeps local.
        const remoteFloor = remote.floor ?? "A1";
        const lt = local.floorUpdatedAt ?? "";
        const rt = remote.floorUpdatedAt ?? "";
        const remoteWins = lt || rt ? rt > lt : rank[remoteFloor] > rank[local.floor];
        const floor = remoteWins ? remoteFloor : local.floor;
        const floorUpdatedAt = remoteWins ? (remote.floorUpdatedAt ?? null) : local.floorUpdatedAt;
        set({
          completed,
          cards,
          xp: Math.max(local.xp, remote.xp),
          streak,
          lastStudyDate,
          floor,
          floorUpdatedAt,
        });
      },
      snapshot: () => {
        const s = get();
        return {
          completed: s.completed,
          xp: s.xp,
          streak: s.streak,
          lastStudyDate: asDayKey(s.lastStudyDate),
          cards: s.cards,
          floor: s.floor,
          floorUpdatedAt: s.floorUpdatedAt,
        };
      },
    }),
    {
      name: "bica.progress.v1",
      partialize: (s) => ({
        completed: s.completed,
        xp: s.xp,
        streak: s.streak,
        lastStudyDate: s.lastStudyDate,
        floor: s.floor,
        floorUpdatedAt: s.floorUpdatedAt,
        cards: s.cards,
        syncPending: s.syncPending,
      }),
      // A failed hydration leaves `hydrated` false, so nothing syncs: pushing an empty
      // store would overwrite the account (the device is the re-upload source, #19).
      // Uses the callback's `state`: with synchronous storage this runs inside create(),
      // before `useProgress` is assigned. On error `state` is undefined and a throwing
      // synchronous getItem lands here inside create() too, so the error is set later.
      onRehydrateStorage: () => (state, error) => {
        if (!error) return state?.markHydrated();
        console.error("[bica] progress hydration failed; sync stays off:", error);
        queueMicrotask(() => useProgress.getState().setSyncError("hydration-failed"));
      },
    },
  ),
);
