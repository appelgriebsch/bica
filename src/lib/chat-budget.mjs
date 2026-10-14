/**
 * Daily chat budget (#35): one global turn counter (the hard cost ceiling) and
 * one counter per IP, both reset at 00:00 UTC. Plain ESM so the Worker's
 * Durable Object (`ChatBudget`, wired in scripts/write-cf-entry.mjs), the
 * per-isolate fallback in chat-limit.ts and `node --test` share one copy.
 *
 * A refused turn counts nowhere: a full per-IP budget can't use up the global
 * one, and a full global budget doesn't burn anyone's per-IP turns.
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
/** CHAT_DAILY_GLOBAL / CHAT_DAILY_PER_IP override these (chat-limit.ts). */
export const DEFAULT_DAILY = Object.freeze({ global: 2000, perIp: 60 });

export const dayStart = (now) => Math.floor(now / DAY_MS) * DAY_MS;
/** Whole seconds until the next 00:00 UTC, at least 1. */
export const secondsToMidnight = (now) =>
  Math.max(1, Math.ceil((dayStart(now) + DAY_MS - now) / 1000));

/**
 * Takes one turn for `ip` if both budgets have room. `storage` is the Durable
 * Object storage API subset { get, put, deleteAll }. The caller serializes calls.
 */
export async function takeBudget(storage, ip, now, limits) {
  const day = dayStart(now);
  // A new UTC day: drop yesterday's counters (and every old per-IP key).
  if ((await storage.get("day")) !== day) {
    await storage.deleteAll();
    await storage.put("day", day);
  }
  const ipKey = `ip:${ip}`;
  const used = (await storage.get("global")) ?? 0;
  const mine = (await storage.get(ipKey)) ?? 0;
  if (mine >= limits.perIp)
    return { ok: false, scope: "ip_day", retryAfter: secondsToMidnight(now) };
  if (used >= limits.global) {
    return { ok: false, scope: "global_day", retryAfter: secondsToMidnight(now) };
  }
  await storage.put("global", used + 1);
  await storage.put(ipKey, mine + 1);
  return { ok: true };
}

/** In-memory storage with the same async API (dev, Vercel, tests). */
export function memoryStorage() {
  const map = new Map();
  return {
    get: async (k) => map.get(k),
    put: async (k, v) => void map.set(k, v),
    deleteAll: async () => void map.clear(),
  };
}

/**
 * The Durable Object class, built on `Base` (DurableObject from
 * "cloudflare:workers" in the Worker; a stub in tests). One instance
 * (`idFromName("global")`) holds every counter, so the caps are global.
 * Durable Objects already gate storage I/O; the explicit queue makes the
 * read-check-write of `take` atomic even across awaits.
 */
export function makeChatBudget(Base) {
  return class ChatBudget extends Base {
    #queue = Promise.resolve();
    /** RPC: `{ ok: true }` or `{ ok: false, scope, retryAfter }`. */
    take(ip, now, limits) {
      const run = this.#queue.then(() => takeBudget(this.ctx.storage, String(ip), now, limits));
      this.#queue = run.then(
        () => {},
        () => {},
      );
      return run;
    }
  };
}
