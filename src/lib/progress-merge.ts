/**
 * Progress validation and the D1 statements behind the progress server
 * functions. Pure (takes the database), so tests run it against a local D1.
 *
 * Every save is ONE `db.batch` with a fixed number of statements, whatever the
 * number of lessons or cards: D1 has no interactive transactions, a batch is
 * atomic, and Workers Free allows 50 queries per invocation (ADR 0002).
 */
import { z } from "zod";
import { catalogVocab, lessons } from "@/data/curriculum";
import type { D1Database, D1PreparedStatement } from "@/lib/db";

const LESSON_IDS = new Set(lessons.map((l) => l.id));
export const LESSON_XP_MAX = 200;
export const STREAK_MAX = 3650;
/** Twice the catalog, so renamed vocab ids still fit. */
export const CARDS_MAX = catalogVocab().length * 2;
// ponytail: review XP (touchStudy) has no curriculum bound, so the total allows a
// fixed review allowance on top of every lesson at max XP.
export const TOTAL_XP_MAX = lessons.length * LESSON_XP_MAX + 1_000_000;
export const BODY_MAX_BYTES = 256 * 1024;

/** The one message clients see for any rejected payload (never driver or zod text). */
export const INVALID_PROGRESS = "Invalid progress snapshot";

const int = (max: number) => z.number().int().min(0).max(max);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoTime = z
  .string()
  .max(40)
  .refine((v) => /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v)));
const lessonId = z.string().refine((id) => LESSON_IDS.has(id));

const lessonRow = z
  .object({ quizScore: int(20), quizTotal: int(20), xp: int(LESSON_XP_MAX), completedAt: isoTime })
  .refine((r) => r.quizScore <= r.quizTotal);

const card = z.object({
  interval: int(3650),
  ease: int(10),
  due: day,
  reps: int(100_000),
  lapses: int(100_000),
});

const snapshotSchema = z.object({
  completed: z
    .record(lessonId, lessonRow)
    .refine((r) => Object.keys(r).length <= LESSON_IDS.size)
    .default({}),
  xp: int(TOTAL_XP_MAX),
  streak: int(STREAK_MAX),
  lastStudyDate: day.nullable().optional(),
  cards: z
    .record(z.string().min(1).max(120), card)
    .refine((r) => Object.keys(r).length <= CARDS_MAX)
    .optional(),
  floor: z.enum(["A1", "A2", "B1", "B2", "C1"]).optional(),
});

const resultSchema = z
  .object({ lessonId, quizScore: int(20), quizTotal: int(20).min(1), xp: int(LESSON_XP_MAX) })
  .refine((r) => r.quizScore <= r.quizTotal);

export type Snapshot = z.infer<typeof snapshotSchema>;
export type LessonSave = z.infer<typeof resultSchema>;

function unwrap(input: unknown): unknown {
  return input && typeof input === "object" && "data" in input
    ? (input as { data: unknown }).data
    : input;
}

function parseWith<T>(schema: z.ZodType<T>, input: unknown): T {
  const data = unwrap(input);
  let size = Infinity;
  try {
    size = new TextEncoder().encode(JSON.stringify(data) ?? "").length;
  } catch {
    // cyclic or BigInt: rejected below as oversized
  }
  const parsed = size <= BODY_MAX_BYTES ? schema.safeParse(data) : null;
  if (!parsed?.success) throw new Error(INVALID_PROGRESS);
  return parsed.data;
}

export const parseSnapshot = (input: unknown) => parseWith(snapshotSchema, input);
export const parseLessonSave = (input: unknown) => parseWith(resultSchema, input);

const now = () => new Date().toISOString();

// Best score wins together with its total; XP is the max; completed_at is the earliest.
const LESSONS_UPSERT = `
INSERT INTO lesson_progress (user_id, lesson_id, quiz_score, quiz_total, xp, completed_at, updated_at)
SELECT ?1, key, json_extract(value, '$.quizScore'), json_extract(value, '$.quizTotal'),
       json_extract(value, '$.xp'), json_extract(value, '$.completedAt'), ?3
FROM json_each(?2) WHERE true
ON CONFLICT (user_id, lesson_id) DO UPDATE SET
  quiz_total = CASE WHEN excluded.quiz_score > lesson_progress.quiz_score
                    THEN excluded.quiz_total ELSE lesson_progress.quiz_total END,
  quiz_score = max(lesson_progress.quiz_score, excluded.quiz_score),
  xp = max(lesson_progress.xp, excluded.xp),
  completed_at = min(coalesce(lesson_progress.completed_at, excluded.completed_at),
                     coalesce(excluded.completed_at, lesson_progress.completed_at)),
  updated_at = excluded.updated_at`;

// The streak belongs to the later study day (so a broken streak can drop); on a tie, the max.
const STATS_UPSERT = `
INSERT INTO user_stats (user_id, streak, last_study_date, total_xp, floor, updated_at)
VALUES (?1, ?2, ?3, ?4, coalesce(?5, 'A1'), ?6)
ON CONFLICT (user_id) DO UPDATE SET
  streak = CASE
    WHEN coalesce(excluded.last_study_date, '') > coalesce(user_stats.last_study_date, '')
      THEN excluded.streak
    WHEN coalesce(excluded.last_study_date, '') = coalesce(user_stats.last_study_date, '')
      THEN max(user_stats.streak, excluded.streak)
    ELSE user_stats.streak END,
  last_study_date = CASE
    WHEN coalesce(excluded.last_study_date, '') > coalesce(user_stats.last_study_date, '')
      THEN excluded.last_study_date ELSE user_stats.last_study_date END,
  total_xp = max(user_stats.total_xp, excluded.total_xp),
  floor = CASE WHEN ?5 IS NULL THEN user_stats.floor ELSE max(user_stats.floor, excluded.floor) END,
  updated_at = excluded.updated_at`;
// Floor is the max, as on the client (progress-store mergeRemote); A1 < A2 < B1 < B2 < C1 sorts as text.

// Per card, the client rule (progress-store mergeRemote): more reps wins, then the later due.
// json_patch only ever receives the incoming cards that win, never a stale one.
const CARDS_MERGE = `
UPDATE user_stats SET vocab_cards = json_patch(vocab_cards, (
  SELECT json_group_object(n.key, json(n.value)) FROM json_each(?2) n
  WHERE NOT EXISTS (
    SELECT 1 FROM json_each(user_stats.vocab_cards) o
    WHERE o.key = n.key AND (
      json_extract(o.value, '$.reps') > json_extract(n.value, '$.reps')
      OR (json_extract(o.value, '$.reps') = json_extract(n.value, '$.reps')
          AND json_extract(o.value, '$.due') >= json_extract(n.value, '$.due'))))))
WHERE user_id = ?1`;

/** The statements of one snapshot save, in batch order (constant count). */
export function snapshotStatements(
  db: D1Database,
  userId: string,
  s: Snapshot,
  at = now(),
): D1PreparedStatement[] {
  return [
    db
      .prepare(STATS_UPSERT)
      .bind(userId, s.streak, s.lastStudyDate ?? null, s.xp, s.floor ?? null, at),
    db.prepare(CARDS_MERGE).bind(userId, JSON.stringify(s.cards ?? {})),
    db.prepare(LESSONS_UPSERT).bind(userId, JSON.stringify(s.completed), at),
  ];
}

export async function saveSnapshot(db: D1Database, userId: string, s: Snapshot): Promise<void> {
  await db.batch(snapshotStatements(db, userId, s));
}

export async function saveLesson(db: D1Database, userId: string, r: LessonSave): Promise<void> {
  const at = now();
  const row = { quizScore: r.quizScore, quizTotal: r.quizTotal, xp: r.xp, completedAt: at };
  await db
    .prepare(LESSONS_UPSERT)
    .bind(userId, JSON.stringify({ [r.lessonId]: row }), at)
    .run();
}

type LessonRowDb = {
  lesson_id: string;
  quiz_score: number;
  quiz_total: number;
  xp: number;
  completed_at: string | null;
};
type StatsRowDb = {
  streak: number;
  last_study_date: string | null;
  total_xp: number;
  vocab_cards: string;
  floor: Snapshot["floor"];
};

/** The account's progress in the client's snapshot shape (one batch, two reads). */
export async function loadProgress(db: D1Database, userId: string) {
  const [rows, stats] = await db.batch([
    db
      .prepare(
        "SELECT lesson_id, quiz_score, quiz_total, xp, completed_at FROM lesson_progress WHERE user_id = ?1",
      )
      .bind(userId),
    db
      .prepare(
        "SELECT streak, last_study_date, total_xp, vocab_cards, floor FROM user_stats WHERE user_id = ?1",
      )
      .bind(userId),
  ]);
  const completed: Record<
    string,
    { quizScore: number; quizTotal: number; xp: number; completedAt: string }
  > = {};
  for (const r of rows!.results as unknown as LessonRowDb[]) {
    completed[r.lesson_id] = {
      quizScore: r.quiz_score,
      quizTotal: r.quiz_total,
      xp: r.xp,
      completedAt: r.completed_at ?? now(),
    };
  }
  const s = (stats!.results as unknown as StatsRowDb[])[0];
  return {
    completed,
    xp: s?.total_xp ?? 0,
    streak: s?.streak ?? 0,
    lastStudyDate: s?.last_study_date ?? null,
    cards: (s ? JSON.parse(s.vocab_cards) : {}) as NonNullable<Snapshot["cards"]>,
    floor: s?.floor ?? "A1",
  };
}
