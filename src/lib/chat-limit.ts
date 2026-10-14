/**
 * Per-user chat limits (#13); every turn is billed to XAI_API_KEY.
 * - Burst: the Rate Limiting binding CHAT_RATE (wrangler.toml, per minute, across
 *   isolates). Without it (dev, Vercel), per isolate in memory.
 * - Turns per 10 min and per day: fixed-window counters in D1 `chat_usage`, across
 *   isolates. Without a database, in memory.
 * Windows are epoch-aligned: the day resets at 00:00 UTC. A 10-min refusal
 * doesn't use daily turns (a day-cap refusal may still count in the 10-min
 * window; harmless, the day is over).
 */
import { boundDb, type D1Database } from "@/lib/db";

export type Limits = { perMinute: number; per10Min: number; perDay: number };
export type Verdict = { ok: true } | { ok: false; retryAfter: number };

/** perMinute must match CHAT_RATE's `simple.limit` in wrangler.toml. */
export const DEFAULT_LIMITS: Limits = { perMinute: 6, per10Min: 20, perDay: 200 };

const positive = (v: string | undefined, d: number) => (v && /^[1-9]\d*$/.test(v) ? Number(v) : d);

/** CHAT_LIMIT_PER_10_MIN and CHAT_LIMIT_PER_DAY override the defaults. */
export function limitsFromEnv(env: Record<string, string | undefined> = process.env): Limits {
  return {
    ...DEFAULT_LIMITS,
    per10Min: positive(env.CHAT_LIMIT_PER_10_MIN, DEFAULT_LIMITS.per10Min),
    perDay: positive(env.CHAT_LIMIT_PER_DAY, DEFAULT_LIMITS.perDay),
  };
}

const MIN = 60_000;
const TEN = 10 * MIN;
const DAY = 24 * 60 * MIN;
const start = (now: number, size: number) => Math.floor(now / size) * size;
const secondsUntil = (now: number, at: number) => Math.max(1, Math.ceil((at - now) / 1000));

/** Takes a turn if both windows have room: "ok", or which cap refused it. */
export type Counter = (userId: string, now: number, l: Limits) => Promise<"ok" | "10m" | "day">;
/** True when the burst limit lets this user through. */
export type Burst = (userId: string, now: number) => Promise<boolean>;

const keys = (now: number) => [`10m:${start(now, TEN)}`, `day:${start(now, DAY)}`];

/**
 * One batch (one transaction): drop stale windows, count the day only if the
 * 10-min window has room (the SELECT's WHERE gates insert and update alike: no
 * row selected, no conflict), then count the 10-min window.
 */
export function d1Counter(db: D1Database): Counter {
  return async (userId, now, l) => {
    const [ten, day] = keys(now);
    const tenTurns = `coalesce((SELECT turns FROM chat_usage WHERE user_id = ?1 AND window = ?4), 0)`;
    const [, dayRes, tenRes] = await db.batch([
      db
        .prepare("DELETE FROM chat_usage WHERE user_id = ?1 AND window NOT IN (?2, ?3)")
        .bind(userId, ten, day),
      db
        .prepare(
          `INSERT INTO chat_usage (user_id, window, turns) SELECT ?1, ?2, 1 WHERE ${tenTurns} < ?5
           ON CONFLICT (user_id, window) DO UPDATE SET turns = turns + 1
           WHERE chat_usage.turns < ?3 RETURNING turns`,
        )
        .bind(userId, day, l.perDay, ten, l.per10Min),
      db
        .prepare(
          `INSERT INTO chat_usage (user_id, window, turns) VALUES (?1, ?2, 1)
           ON CONFLICT (user_id, window) DO UPDATE SET turns = turns + 1
           WHERE chat_usage.turns < ?3 RETURNING turns`,
        )
        .bind(userId, ten, l.per10Min),
    ]);
    if (dayRes.results.length) return "ok";
    return tenRes.results.length ? "day" : "10m";
  };
}

/** Same rules as d1Counter, per isolate. */
export function memoryCounter(): Counter {
  const users = new Map<string, Map<string, number>>();
  return async (userId, now, l) => {
    const [ten, day] = keys(now);
    const old = users.get(userId);
    const w = new Map([ten, day].map((k) => [k, old?.get(k) ?? 0]));
    users.set(userId, w);
    const tenFull = w.get(ten)! >= l.per10Min;
    const dayFull = w.get(day)! >= l.perDay;
    if (!tenFull) w.set(ten, w.get(ten)! + 1);
    if (tenFull) return "10m";
    if (dayFull) return "day";
    w.set(day, w.get(day)! + 1);
    return "ok";
  };
}

/** The Cloudflare Rate Limiting binding, keyed by user. */
export type RateLimitBinding = { limit(o: { key: string }): Promise<{ success: boolean }> };
export const bindingBurst =
  (rl: RateLimitBinding): Burst =>
  async (userId) =>
    (await rl.limit({ key: userId })).success;

/** Per-minute fixed window, per isolate. */
export function memoryBurst(perMinute: number): Burst {
  const hits = new Map<string, { at: number; n: number }>();
  return async (userId, now) => {
    const at = start(now, MIN);
    const h = hits.get(userId);
    const n = h?.at === at ? h.n + 1 : 1;
    hits.set(userId, { at, n });
    return n <= perMinute;
  };
}

export async function checkChatLimit(
  userId: string,
  now: number,
  { burst, counter, limits }: { burst: Burst; counter: Counter; limits: Limits },
): Promise<Verdict> {
  if (!(await burst(userId, now))) return { ok: false, retryAfter: 60 };
  const r = await counter(userId, now, limits);
  if (r === "ok") return { ok: true };
  return {
    ok: false,
    retryAfter: secondsUntil(now, start(now, r === "10m" ? TEN : DAY) + (r === "10m" ? TEN : DAY)),
  };
}

const g = globalThis as typeof globalThis & { __env__?: { CHAT_RATE?: RateLimitBinding } };
let memory: { burst: Burst; counter: Counter } | undefined;

/** The binding and D1 when this request has them, else this isolate's memory. */
export function chatLimiter() {
  memory ??= { burst: memoryBurst(DEFAULT_LIMITS.perMinute), counter: memoryCounter() };
  const rl = g.__env__?.CHAT_RATE;
  const db = boundDb();
  return {
    burst: rl ? bindingBurst(rl) : memory.burst,
    counter: db ? d1Counter(db) : memory.counter,
    limits: limitsFromEnv(),
  };
}
