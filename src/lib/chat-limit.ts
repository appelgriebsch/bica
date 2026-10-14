/**
 * Anonymous chat limits (#35, replacing #13's per-user limits); every turn is
 * billed to XAI_API_KEY. Keyed by client IP (`cf-connecting-ip`, IPv6 by /64),
 * never by identity.
 * - Burst: the Rate Limiting binding CHAT_RATE (wrangler.toml, 6 per 60 s,
 *   across isolates). Without it (dev, Vercel), per isolate in memory.
 * - Daily: the Durable Object CHAT_BUDGET (`ChatBudget`, chat-budget.mjs) holds
 *   the global and per-IP day counters, reset at 00:00 UTC. Without the
 *   binding, the same logic runs per isolate in memory.
 * A burst refusal doesn't use daily turns.
 */
import {
  DEFAULT_DAILY,
  makeChatBudget,
  memoryStorage,
  type BudgetVerdict,
  type DailyLimits,
} from "@/lib/chat-budget.mjs";

export type Limits = { perMinute: number; dailyGlobal: number; dailyPerIp: number };
export type LimitScope = "burst" | "ip_day" | "global_day";
export type Verdict = { ok: true } | { ok: false; retryAfter: number; scope: LimitScope };

/** perMinute must match CHAT_RATE's `simple.limit` in wrangler.toml. */
export const DEFAULT_LIMITS: Limits = {
  perMinute: 6,
  dailyGlobal: DEFAULT_DAILY.global,
  dailyPerIp: DEFAULT_DAILY.perIp,
};

const positive = (v: string | undefined, d: number) => (v && /^[1-9]\d*$/.test(v) ? Number(v) : d);

/** CHAT_DAILY_GLOBAL and CHAT_DAILY_PER_IP (Worker vars) override the defaults. */
export function limitsFromEnv(env: Record<string, string | undefined> = process.env): Limits {
  return {
    ...DEFAULT_LIMITS,
    dailyGlobal: positive(env.CHAT_DAILY_GLOBAL, DEFAULT_LIMITS.dailyGlobal),
    dailyPerIp: positive(env.CHAT_DAILY_PER_IP, DEFAULT_LIMITS.dailyPerIp),
  };
}

/**
 * The limiter key for a client address: IPv4 as is, IPv6 truncated to its /64
 * (one subscriber usually gets a whole /64). Missing → "unknown" (one shared
 * bucket; on Workers cf-connecting-ip is always set).
 */
export function ipKey(raw: string | null | undefined): string {
  const ip = (raw ?? "").trim().toLowerCase();
  if (!ip) return "unknown";
  if (!ip.includes(":")) return ip;
  // IPv4-mapped IPv6 (::ffff:1.2.3.4) is that IPv4 address.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return mapped[1];
  const [head, tail = ""] = ip.split("::");
  const h = head ? head.split(":") : [];
  const t = ip.includes("::") && tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill("0"), ...t]
    : h;
  return (
    groups
      .slice(0, 4)
      .map((g) => g.replace(/^0+(?=.)/, "") || "0")
      .join(":") + "::/64"
  );
}

/**
 * The client address for the limiter and Turnstile's remoteip: CF-Connecting-IP
 * (set by Cloudflare, not spoofable on Workers), else x-real-ip (Vercel's
 * equivalent) only when CF's header is missing. X-Forwarded-For is client-
 * controlled and never read. Missing → "unknown".
 */
export function clientIp(get: (name: string) => string | null | undefined): string {
  const pick = (name: string) => get(name)?.trim() || undefined;
  return pick("cf-connecting-ip") ?? pick("x-real-ip") ?? "unknown";
}

/** True when the burst limit lets this key through. */
export type Burst = (key: string, now: number) => Promise<boolean>;
/** Takes a daily turn for this key, or says which day cap refused it. */
export type Budget = (key: string, now: number, l: DailyLimits) => Promise<BudgetVerdict>;

/** The Cloudflare Rate Limiting binding. */
export type RateLimitBinding = { limit(o: { key: string }): Promise<{ success: boolean }> };
export const bindingBurst =
  (rl: RateLimitBinding): Burst =>
  async (key) =>
    (await rl.limit({ key })).success;

/** Per-minute fixed window, per isolate. */
export function memoryBurst(perMinute: number): Burst {
  const hits = new Map<string, { at: number; n: number }>();
  return async (key, now) => {
    const at = Math.floor(now / 60_000) * 60_000;
    const h = hits.get(key);
    const n = h?.at === at ? h.n + 1 : 1;
    hits.set(key, { at, n });
    return n <= perMinute;
  };
}

/** The Durable Object namespace binding (RPC stub). */
export type BudgetNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): { take(ip: string, now: number, l: DailyLimits): Promise<BudgetVerdict> };
};
/** Every request goes to the one global ChatBudget instance. */
export const bindingBudget =
  (ns: BudgetNamespace): Budget =>
  (key, now, l) =>
    ns.get(ns.idFromName("global")).take(key, now, l);

/** The same counters per isolate (no DO binding: dev, Vercel). */
export function memoryBudget(): Budget {
  const Local = makeChatBudget(
    class {
      ctx = { storage: memoryStorage() };
    },
  );
  const b = new Local();
  return (key, now, l) => b.take(key, now, l);
}

export async function checkChatLimit(
  key: string,
  now: number,
  { burst, budget, limits }: { burst: Burst; budget: Budget; limits: Limits },
): Promise<Verdict> {
  if (!(await burst(key, now))) return { ok: false, retryAfter: 60, scope: "burst" };
  const r = await budget(key, now, { global: limits.dailyGlobal, perIp: limits.dailyPerIp });
  return r.ok ? { ok: true } : { ok: false, retryAfter: r.retryAfter, scope: r.scope };
}

type ChatEnv = { CHAT_RATE?: RateLimitBinding; CHAT_BUDGET?: BudgetNamespace };
const g = globalThis as typeof globalThis & { __env__?: ChatEnv };
let memory: { burst: Burst; budget: Budget } | undefined;

/** The CHAT_RATE / CHAT_BUDGET bindings when this request has them, else this isolate's memory. */
export function chatLimiter(vars: Record<string, string | undefined> = process.env) {
  memory ??= { burst: memoryBurst(DEFAULT_LIMITS.perMinute), budget: memoryBudget() };
  const env = g.__env__;
  return {
    burst: env?.CHAT_RATE ? bindingBurst(env.CHAT_RATE) : memory.burst,
    budget: env?.CHAT_BUDGET ? bindingBudget(env.CHAT_BUDGET) : memory.budget,
    limits: limitsFromEnv(vars),
  };
}
