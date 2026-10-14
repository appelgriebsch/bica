/**
 * Server-only access to the Cloudflare D1 database (binding `DB`).
 *
 * - Worker (staging): Nitro's cloudflare-module handler sets `globalThis.__env__`
 *   to the request's bindings before any route runs.
 * - `npm run dev`: a local D1 from wrangler's platform proxy (state in
 *   `.wrangler/state`, shared with `wrangler dev`), with `migrations/` applied.
 * - Anything else (the Vercel build): no database; calls throw.
 *
 * D1 has no interactive transactions: group writes in one `db.batch([...])`.
 */

/** The part of Cloudflare's D1 API this app and Better Auth use. */
export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta?: Record<string, unknown>;
}
export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(column?: string): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
  raw<T = unknown[]>(): Promise<T[]>;
}
export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
  exec(query: string): Promise<unknown>;
}

const g = globalThis as typeof globalThis & {
  __env__?: { DB?: D1Database };
  __bicaLocalDb__?: Promise<D1Database>;
};

/** The deployed Worker's D1 binding, if this request has one. */
export function boundDb(): D1Database | undefined {
  return g.__env__?.DB;
}

/** The D1 database for this request. Throws when there is none. */
export async function getDb(): Promise<D1Database> {
  const bound = boundDb();
  if (bound) return bound;
  if (import.meta.env.DEV) {
    g.__bicaLocalDb__ ??= import("./db.local")
      .then((m) => m.openLocalDb())
      .catch((err) => {
        g.__bicaLocalDb__ = undefined;
        throw err;
      });
    return g.__bicaLocalDb__;
  }
  throw new Error("Database unavailable: this server has no D1 binding named DB.");
}

type LazyStatement = D1PreparedStatement & { real(): Promise<D1PreparedStatement> };

function lazyStatement(query: string, values: unknown[]): LazyStatement {
  const real = async () => {
    const stmt = (await getDb()).prepare(query);
    return values.length ? stmt.bind(...values) : stmt;
  };
  return {
    real,
    bind: (...next) => lazyStatement(query, next),
    first: async (column) => (await real()).first(column),
    all: async () => (await real()).all(),
    run: async () => (await real()).run(),
    raw: async () => (await real()).raw(),
  } as LazyStatement;
}

/**
 * A D1 handle that resolves the binding on every call, for Better Auth, which is
 * built once per isolate: it must not hold one request's binding.
 */
export const lazyDb: D1Database = {
  prepare: (query) => lazyStatement(query, []),
  batch: async (statements) =>
    (await getDb()).batch(
      await Promise.all(statements.map((s) => (s as LazyStatement).real?.() ?? s)),
    ),
  exec: async (query) => (await getDb()).exec(query),
};
