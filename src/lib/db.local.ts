/**
 * Dev-only local D1 (`npm run dev`), imported only behind `import.meta.env.DEV`
 * so builds never bundle wrangler. Same state dir as `wrangler dev`.
 */
import type { D1Database } from "./db";

/** Inlined so dev applies exactly the files `wrangler d1 migrations apply` would. */
const MIGRATIONS = import.meta.glob("/migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

/** One statement per `;` at a line end; `--` comment lines dropped. */
export function splitSql(text: string): string[] {
  return text
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*$/m)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Apply pending files, recorded in wrangler's own `d1_migrations` table. */
export async function applyMigrations(
  db: D1Database,
  files: Record<string, string> = MIGRATIONS,
): Promise<string[]> {
  await db
    .prepare(
      "CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)",
    )
    .run();
  const done = new Set(
    (await db.prepare("SELECT name FROM d1_migrations").all<{ name: string }>()).results.map(
      (r) => r.name,
    ),
  );
  const applied: string[] = [];
  for (const [path, text] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const name = path.split("/").pop() as string;
    if (done.has(name)) continue;
    await db.batch([
      ...splitSql(text).map((s) => db.prepare(s)),
      db.prepare("INSERT INTO d1_migrations (name) VALUES (?1)").bind(name),
    ]);
    applied.push(name);
  }
  return applied;
}

export async function openLocalDb(): Promise<D1Database> {
  const { getPlatformProxy } = await import("wrangler");
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ persist: true });
  const applied = await applyMigrations(proxy.env.DB);
  if (applied.length) console.info("[db] local D1: applied", applied.join(", "));
  return proxy.env.DB;
}
