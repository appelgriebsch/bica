#!/usr/bin/env node
/**
 * Post-build: render the SPA shell, list every static file of this build and
 * inject that list plus a content hash into the built sw.js, so the worker
 * precaches HTML and chunks of exactly one build (issue #5).
 */
import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { buildOutput } from "./build-output.mjs";

// No .html: Workers' html_handling (auto-trailing-slash) would redirect it, and a
// cached redirect can't answer a navigation. sw.js serves it as text/html.
export const SHELL = "/_shell";

/** Every file under `dir` as a URL path, minus the worker itself and the install tutorial. */
export async function collectPrecache(dir) {
  const files = await readdir(dir, { recursive: true, withFileTypes: true });
  const entries = [];
  for (const f of files) {
    if (!f.isFile()) continue;
    const abs = join(f.parentPath ?? f.path, f.name);
    const url = "/" + relative(dir, abs).split(sep).join("/");
    if (url === "/sw.js" || url.startsWith("/__grok/")) continue;
    entries.push({ url, bytes: await readFile(abs) });
  }
  entries.sort((a, b) => (a.url < b.url ? -1 : 1));
  const hash = createHash("sha256");
  for (const e of entries) hash.update(e.url).update("\0").update(e.bytes).update("\0");
  return {
    urls: entries.map((e) => e.url),
    version: hash.digest("hex").slice(0, 16),
    bytes: entries.reduce((n, e) => n + e.bytes.length, 0),
  };
}

/** Fail the build rather than ship a worker that precaches nothing. */
export function assertManifest({ urls }) {
  if (!urls.some((u) => u.startsWith("/assets/")) || !urls.includes(SHELL)) {
    throw new Error(
      `[precache] no build assets or shell found (${urls.length} files); is the output folder in scripts/build-output.mjs right?`,
    );
  }
}

export function injectManifest(sw, { urls, version }) {
  const out = sw
    .replace(/const VERSION = "[^"]*";/, `const VERSION = ${JSON.stringify(version)};`)
    .replace(/const PRECACHE = \[\];/, `const PRECACHE = ${JSON.stringify(urls)};`);
  if (!out.includes(version) || (urls.length && !out.includes(JSON.stringify(urls)))) {
    throw new Error("sw.js is missing the VERSION / PRECACHE placeholders");
  }
  return out;
}

/** Root-only render (no route matched, no loader data) that hydrates any route client-side. */
async function renderShell() {
  process.env.TSS_SHELL = "true";
  delete process.env.DATABASE_URL; // the shell never queries; keep the build off the real DB
  const { loadBuildHandler } = await import("./serve-build.mjs");
  const { handler, cleanup } = await loadBuildHandler();
  const res = await handler.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {},
  );
  if (!res.ok) throw new Error(`shell render failed: ${res.status}`);
  return { html: Buffer.from(await res.arrayBuffer()), cleanup };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = join(process.cwd(), buildOutput().publicDir);
  const { html, cleanup } = await renderShell();
  await writeFile(join(dir, SHELL), html);
  const manifest = await collectPrecache(dir);
  assertManifest(manifest);
  const swPath = join(dir, "sw.js");
  await writeFile(swPath, injectManifest(await readFile(swPath, "utf8"), manifest));
  console.log(
    `[precache] ${manifest.urls.length} files, ${(manifest.bytes / 1024 / 1024).toFixed(2)} MB, version ${manifest.version}`,
  );
  await cleanup(); // only now: the server's PGLite boot reads the copied files in the background
  process.exit(0); // the imported server keeps PGLite handles open
}
