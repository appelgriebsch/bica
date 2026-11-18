import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CefrLevel } from "@/data/types";
import { chatCardId, MAX_CHAT_TEXT } from "@/lib/chat-words";
import { gradeCard, type SrsCard } from "@/lib/srs";
import { asDayKey, normalizePt, todayKey, yesterdayKey } from "@/lib/utils";

export type LessonResult = {
  quizScore: number;
  quizTotal: number;
  xp: number;
  completedAt: string;
};

/** A word/phrase saved from a Conversas reply (#80, ADR 0019), keyed by its `chat:` card id. */
export type SavedWord = {
  pt: string;
  en: string;
  level: CefrLevel;
};

export type ProgressSnapshot = {
  completed: Record<string, LessonResult>;
  xp: number;
  streak: number;
  lastStudyDate: string | null;
  cards: Record<string, SrsCard>;
  savedWords: Record<string, SavedWord>;
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
  savedWords: Record<string, SavedWord>;
  /** True once persist has restored this device's progress (false if that failed). */
  hydrated: boolean;
  /** Set when restoring this device's progress from localStorage failed. */
  hydrationFailed: boolean;
  markHydrated: () => void;
  setFloor: (level: CefrLevel) => void;
  completeLesson: (lessonId: string, result: Omit<LessonResult, "completedAt">) => void;
  gradeVocab: (cardId: string, knew: boolean) => void;
  /** Save a Travel Phrasebook phrase (#77, ADR 0015) or any card id to Palavras: due today, no XP/streak. */
  saveToPalabras: (cardId: string) => void;
  /** Save a Conversas word/phrase (#80, ADR 0019): `chat:` card due today, no XP/streak. */
  saveChatWord: (word: SavedWord) => void;
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

/**
 * Field-wise merge, the same for preview and commit (#36): union of lesson and
 * card IDs; best quiz score wins (a tie selects remote); card reps, then later
 * due (an exact tie selects remote); XP is max; the streak goes with the later
 * study day; the newer floor setting wins (#15). Nothing is deleted.
 */
export function mergeProgress(
  local: Omit<ProgressSnapshot, "floorUpdatedAt"> & { floorUpdatedAt?: string | null },
  remote: ProgressSnapshot,
): Required<ProgressSnapshot> {
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
  // Saved words: union; the same id with different content selects remote (the `completed` tie convention).
  const savedWords = { ...(remote.savedWords ?? {}) };
  for (const [id, row] of Object.entries(local.savedWords ?? {})) {
    if (!(id in savedWords)) savedWords[id] = row;
  }
  const localDay = asDayKey(local.lastStudyDate);
  const remoteDay = asDayKey(remote.lastStudyDate);
  // The streak goes with the later study day, so a broken streak can drop; max only on a tie.
  const l = localDay ?? "";
  const r = remoteDay ?? "";
  const lastStudyDate = l > r ? localDay : remoteDay;
  const streak =
    l > r ? local.streak : l < r ? remote.streak : Math.max(local.streak, remote.streak);
  // Floor: the newer setting wins (#15). A timestamp beats none; rank max only when neither side has one; a tie keeps local.
  const remoteFloor = remote.floor ?? "A1";
  const lt = local.floorUpdatedAt ?? "";
  const rt = remote.floorUpdatedAt ?? "";
  const remoteWins = lt || rt ? rt > lt : rank[remoteFloor] > rank[local.floor];
  return {
    completed,
    cards,
    savedWords,
    xp: Math.max(local.xp, remote.xp),
    streak,
    lastStudyDate,
    floor: remoteWins ? remoteFloor : local.floor,
    floorUpdatedAt: remoteWins ? (remote.floorUpdatedAt ?? null) : (local.floorUpdatedAt ?? null),
  };
}

export const PROGRESS_KEY = "bica.progress.v1";

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
      savedWords: {},
      hydrated: false,
      hydrationFailed: false,
      markHydrated: () => set({ hydrated: true }),
      setFloor: (level) =>
        set({
          floor: level,
          floorUpdatedAt: new Date().toISOString(),
        }),
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
      saveToPalabras: (cardId) => {
        const prev = get();
        // Idempotent: never reset a card that already has review history.
        if (prev.cards[cardId]) return;
        set({
          cards: {
            ...prev.cards,
            [cardId]: { interval: 0, ease: 0, due: todayKey(), reps: 0, lapses: 0 },
          },
        });
      },
      saveChatWord: ({ pt, en, level }) => {
        const normalized = normalizePt(pt);
        // Reject empty or over-long input (the CARD_ID limit); no XP/streak (ADR 0016).
        if (!normalized || normalized.length > MAX_CHAT_TEXT || !en.trim()) return;
        const prev = get();
        const id = chatCardId(pt);
        set({
          savedWords: { ...prev.savedWords, [id]: { pt, en: en.trim(), level } },
          // Idempotent: never reset a card that already has review history.
          cards: prev.cards[id]
            ? prev.cards
            : {
                ...prev.cards,
                [id]: { interval: 0, ease: 0, due: todayKey(), reps: 0, lapses: 0 },
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
      mergeRemote: (remote) => set(mergeProgress(get(), remote)),
      snapshot: () => {
        const s = get();
        return {
          completed: s.completed,
          xp: s.xp,
          streak: s.streak,
          lastStudyDate: asDayKey(s.lastStudyDate),
          cards: s.cards,
          savedWords: s.savedWords,
          floor: s.floor,
          floorUpdatedAt: s.floorUpdatedAt,
        };
      },
    }),
    {
      name: PROGRESS_KEY,
      partialize: (s) => ({
        completed: s.completed,
        xp: s.xp,
        streak: s.streak,
        lastStudyDate: s.lastStudyDate,
        floor: s.floor,
        floorUpdatedAt: s.floorUpdatedAt,
        cards: s.cards,
        savedWords: s.savedWords,
      }),
      // A failed hydration leaves `hydrated` false (#34's import must not merge into it).
      // Uses the callback's `state`: with synchronous storage this runs inside create(),
      // before `useProgress` is assigned. On error `state` is undefined and a throwing
      // synchronous getItem lands here inside create() too, so the flag is set later.
      onRehydrateStorage: () => (state, error) => {
        if (!error) return state?.markHydrated();
        console.error("[bica] progress hydration failed:", error);
        queueMicrotask(() => useProgress.setState({ hydrationFailed: true }));
      },
    },
  ),
);
