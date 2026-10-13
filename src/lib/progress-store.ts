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
};

export type ProgressState = {
  completed: Record<string, LessonResult>;
  xp: number;
  streak: number;
  lastStudyDate: string | null;
  floor: CefrLevel;
  cards: Record<string, SrsCard>;
  hydrated: boolean;
  lastSyncedAt: string | null;
  syncing: boolean;
  syncError: string | null;
  /** Local changes not yet pushed to the account (the offline sync queue). Persisted. */
  syncPending: boolean;
  setSyncPending: (pending: boolean) => void;
  markHydrated: () => void;
  markSynced: () => void;
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
      cards: {},
      hydrated: false,
      lastSyncedAt: null,
      syncing: false,
      syncError: null,
      syncPending: false,
      setSyncPending: (syncPending) => set({ syncPending }),
      markHydrated: () => set({ hydrated: true }),
      markSynced: () =>
        set({
          lastSyncedAt: new Date().toISOString(),
          syncError: null,
          syncing: false,
          syncPending: false,
        }),
      setSyncing: (syncing) => set({ syncing }),
      setSyncError: (syncError) => set({ syncError, syncing: false }),
      setFloor: (level) => set({ floor: level }),
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
        const lastStudyDate =
          (localDay ?? "") > (remoteDay ?? "") ? localDay : remoteDay;
        const remoteFloor = remote.floor ?? "A1";
        const floor = rank[local.floor] >= rank[remoteFloor] ? local.floor : remoteFloor;
        set({
          completed,
          cards,
          xp: Math.max(local.xp, remote.xp),
          streak: Math.max(local.streak, remote.streak),
          lastStudyDate,
          floor,
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
        cards: s.cards,
        syncPending: s.syncPending,
      }),
      onRehydrateStorage: () => (_state, error) => {
        if (!error) useProgress.getState().markHydrated();
        else useProgress.getState().markHydrated();
      },
    },
  ),
);
