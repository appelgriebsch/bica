#!/usr/bin/env node
/**
 * Serve the built Vercel output locally (static files + the server function),
 * because `vite preview` can't run the Nitro vercel preset. Test-only.
 * Usage: node scripts/serve-build.mjs [port]
 */
import { createServer } from "node:http";
import { copyFile, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { Readable } from "node:stream";
import { pathToFileURL } from "node:url";
import { buildOutput } from "./build-output.mjs";

const { publicDir, serverEntry, serverLibs } = buildOutput();
const STATIC = join(process.cwd(), publicDir);
const TYPES = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/**
 * Import the built server function. Its bundle expects PGLite's runtime files
 * next to it (Vercel ships them via its file tracer), so copy them in and hand
 * back a cleanup that removes the copies again.
 */
export async function loadBuildHandler() {
  const libs = join(process.cwd(), serverLibs);
  const copied = [];
  for (const f of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
    if (!existsSync(join(libs, f))) {
      await copyFile(
        join(process.cwd(), "node_modules/@electric-sql/pglite/dist", f),
        join(libs, f),
      );
      copied.push(join(libs, f));
    }
  }
  const { default: handler } = await import(pathToFileURL(join(process.cwd(), serverEntry)).href);
  return { handler, cleanup: () => Promise.all(copied.map((f) => rm(f, { force: true }))) };
}

export async function startBuildServer(port = 8090) {
  const { handler } = await loadBuildHandler();
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]));
    const file = join(STATIC, path);
    if (file.startsWith(STATIC) && path !== "/") {
      const info = await stat(file).catch(() => null);
      if (info?.isFile()) {
        res.setHeader("content-type", TYPES[extname(file)] ?? "application/octet-stream");
        res.setHeader(
          "cache-control",
          path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
        );
        res.end(await readFile(file));
        return;
      }
    }
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const response = await handler.fetch(
      new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers,
        body: hasBody ? Readable.toWeb(req) : undefined,
        duplex: "half",
      }),
      {},
    );
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    if (response.body) Readable.fromWeb(response.body).pipe(res);
    else res.end();
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.argv[2] || 8090);
  await startBuildServer(port);
  console.log(`serving ${publicDir} on http://127.0.0.1:${port}`);
}
