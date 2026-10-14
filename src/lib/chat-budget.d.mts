export type DailyLimits = { global: number; perIp: number };
export type BudgetVerdict =
  { ok: true } | { ok: false; scope: "ip_day" | "global_day"; retryAfter: number };
export type BudgetStorage = {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<void>;
  deleteAll(): Promise<void>;
};
export const DAY_MS: number;
export const DEFAULT_DAILY: Readonly<DailyLimits>;
export function dayStart(now: number): number;
export function secondsToMidnight(now: number): number;
export function takeBudget(
  storage: BudgetStorage,
  ip: string,
  now: number,
  limits: DailyLimits,
): Promise<BudgetVerdict>;
export function memoryStorage(): BudgetStorage;
export function makeChatBudget<
  B extends new (...args: never[]) => { ctx: { storage: BudgetStorage } },
>(
  Base: B,
): B &
  (new (...args: never[]) => {
    take(ip: string, now: number, limits: DailyLimits): Promise<BudgetVerdict>;
  });
