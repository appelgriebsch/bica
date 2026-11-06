/**
 * Strict bounds for a received transfer (#36). mergeRemote itself trusts its
 * input, so everything that arrives over QR passes this first.
 * Self-contained (only `zod`) so `node --test` can load it.
 */
import { z } from "zod";

export const MAX_LESSONS = 1000;
export const MAX_CARDS = 5000;
export const MAX_QUIZ = 100;
export const MAX_LESSON_XP = 1000;
export const MAX_XP = 10_000_000;
export const MAX_STREAK = 100_000;
export const MAX_COUNTER = 100_000;
/** srs.ts: ease steps 1..5, intervals up to 30 days. */
export const MAX_EASE = 5;
export const MAX_INTERVAL = 30;
/** Observed dates (completedAt, lastStudyDate, floorUpdatedAt): today + 1. */
export const OBSERVED_DAYS_AHEAD = 1;
/** Scheduled cards.due: srs.ts schedules up to 30 days ahead, plus one day of slack. */
export const DUE_DAYS_AHEAD = 31;

const LESSON_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
// `<lessonId>:<normalised Portuguese>`; no control characters.
const CARD_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}:\P{Cc}{1,120}$/u;
const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

/** A real calendar day as YYYY-MM-DD (rejects 2026-02-30). */
export function isDayKey(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!));
  return d.toISOString().slice(0, 10) === s;
}

export function addDayKey(day: string, days: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const count = (max: number) => z.number().int().min(0).max(max);
const key = (pattern: RegExp) =>
  z
    .string()
    .regex(pattern)
    .refine((k) => !PROTO_KEYS.has(k));
const capped = <T extends z.ZodType>(record: T, max: number) =>
  record.refine((o) => Object.keys(o as object).length <= max, `at most ${max} entries`);

export function transferSchema(today: string) {
  const observedMax = addDayKey(today, OBSERVED_DAYS_AHEAD);
  const dueMax = addDayKey(today, DUE_DAYS_AHEAD);
  const day = z.string().refine(isDayKey, "not a calendar day");
  const observedDay = day.refine((d) => d <= observedMax, "in the future");
  const observedTime = z
    .string()
    .regex(ISO_TIME)
    .refine((s) => isDayKey(s.slice(0, 10)) && !Number.isNaN(Date.parse(s)), "not a time")
    .refine((s) => s.slice(0, 10) <= observedMax, "in the future");

  const lesson = z
    .strictObject({
      quizScore: count(MAX_QUIZ),
      quizTotal: count(MAX_QUIZ),
      xp: count(MAX_LESSON_XP),
      completedAt: observedTime,
    })
    .refine((r) => r.quizScore <= r.quizTotal, "quizScore above quizTotal");
  const card = z.strictObject({
    interval: count(MAX_INTERVAL),
    ease: count(MAX_EASE),
    due: day.refine((d) => d <= dueMax, "due too far ahead"),
    reps: count(MAX_COUNTER),
    lapses: count(MAX_COUNTER),
  });
  const snapshot = z.strictObject({
    completed: capped(z.record(key(LESSON_ID), lesson), MAX_LESSONS),
    xp: count(MAX_XP),
    streak: count(MAX_STREAK),
    lastStudyDate: observedDay.nullable(),
    cards: capped(z.record(key(CARD_ID), card), MAX_CARDS),
    floor: z.enum(["A1", "A2", "B1", "B2", "C1"]),
    // Older snapshots have no floorUpdatedAt; null means "never on record" (#15).
    floorUpdatedAt: observedTime.nullable().optional(),
  });
  return z.strictObject({ v: z.literal(1), snapshot });
}

export type TransferEnvelope = z.infer<ReturnType<typeof transferSchema>>;
