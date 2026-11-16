#!/usr/bin/env node
/**
 * #74: CI guard on the built worker, run after `bun run build` in ci.yml.
 * Fails when .output/public/sw.js still has placeholders or is inconsistent:
 * VERSION must be 16 hex chars (not "dev" — a skipped precache.mjs step ships
 * that, and it never rotates the cache), PRECACHE must be non-empty, and every
 * precached URL must exist in the output folder.
 */
import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildOutput } from "./build-output.mjs";

const VERSION_RE = /^const VERSION = "([0-9a-f]{16})";$/m;
const PRECACHE_RE = /^const PRECACHE = (\[.*\]);$/m;

/**
 * @param {string} dir the built public folder (buildOutput().publicDir)
 * @returns {Promise<{ version: string, urls: string[] }>}
 * @throws when sw.js is missing, VERSION is not 16 hex, PRECACHE is empty or
 *   not injected, or a precached URL is missing from `dir`
 */
export async function checkBuiltSw(dir) {
  const swPath = join(dir, "sw.js");
  if (!existsSync(swPath)) throw new Error(`[sw-build-check] no built worker at ${swPath}`);
  const sw = await readFile(swPath, "utf8");
  const version = sw.match(VERSION_RE)?.[1];
  if (!version) {
    const raw = sw.match(/^const VERSION = "([^"]*)";$/m)?.[1] ?? null;
    throw new Error(
      `[sw-build-check] VERSION is ${JSON.stringify(raw)}, not 16 hex chars; did scripts/precache.mjs run?`,
    );
  }
  const precacheMatch = sw.match(PRECACHE_RE);
  if (!precacheMatch) throw new Error("[sw-build-check] PRECACHE placeholder was not injected");
  let urls;
  try {
    urls = JSON.parse(precacheMatch[1]);
  } catch {
    throw new Error("[sw-build-check] PRECACHE is not valid JSON");
  }
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error("[sw-build-check] PRECACHE is empty; the worker would precache nothing");
  }
  const missing = urls.filter((u) => typeof u !== "string" || !existsSync(join(dir, u)));
  if (missing.length > 0) {
    throw new Error(
      `[sw-build-check] precached URLs missing from the output folder: ${missing.join(", ")}`,
    );
  }
  return { version, urls };
}

// ponytail: not import.meta.main, which Node 20 lacks (see node-check.mjs).
function invokedDirectly() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (invokedDirectly()) {
  const dir = join(process.cwd(), buildOutput().publicDir);
  try {
    const { version, urls } = await checkBuiltSw(dir);
    console.log(
      `[sw-build-check] ${join(dir, "sw.js")}: version ${version}, ${urls.length} precached files all present`,
    );
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
