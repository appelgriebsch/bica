/**
 * Load the database module (and, when asked, the auth server) under Vite so
 * `import.meta.env` and `import.meta.glob` match the app. Prints one JSON line.
 * The project Vite config is not used: its serve plugin bootstraps PGLite.
 */
import { createServer } from "vite";

if (process.env.PROBE_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.PROBE_DATABASE_URL;
} else {
  delete process.env.DATABASE_URL;
}
if (process.env.PROBE_STAGE) {
  process.env.BICA_STAGE = process.env.PROBE_STAGE;
} else {
  delete process.env.BICA_STAGE;
}

const cloudflareBuild = process.env.PROBE_CF_BUILD === "1" ? "1" : "";
const server = await createServer({
  configFile: false,
  envFile: false,
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  logLevel: "error",
  define: {
    "import.meta.env.BICA_CLOUDFLARE_BUILD": JSON.stringify(cloudflareBuild),
  },
});

try {
  const db = await server.ssrLoadModule("/src/lib/db.ts");
  const result = {
    embedded: db.embeddedDbDisabled(),
    dbSource: db.dbSource,
    pglite: Boolean(globalThis.__pgliteInstance__),
  };
  if (process.env.PROBE_GET_SQL === "1") {
    try {
      await db.getSql();
      result.getSql = "resolved";
    } catch (err) {
      result.getSql = err instanceof Error ? err.message : String(err);
      result.pglite = Boolean(globalThis.__pgliteInstance__);
    }
  }
  if (process.env.PROBE_AUTH === "1") {
    await server.ssrLoadModule("/src/lib/auth/server.ts");
    result.authBuilt = Boolean(globalThis.__grokAuth__);
    result.pglite = Boolean(globalThis.__pgliteInstance__);
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
} finally {
  await server.close();
}
process.exit(0);
