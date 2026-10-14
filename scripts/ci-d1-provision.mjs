#!/usr/bin/env node
/**
 * Find or create the staging D1 and write `wrangler.ci.toml` with its id
 * (#21). Safe to re-run: an existing database is reused, never re-created.
 *
 *   node scripts/ci-d1-provision.mjs        # CI and `npm run deploy:staging`
 *
 * Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. `wrangler.toml` keeps
 * only the marker below; the real id lives in the gitignored generated file.
 * WRANGLER overrides the wrangler command (tests use a mock).
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const MARKER = "${BICA_STAGING_D1_ID}";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULTS = {
  name: "bica-staging",
  env: "staging",
  location: "weur",
  input: "wrangler.toml",
  output: "wrangler.ci.toml",
};

function wrangler(args, env = process.env) {
  const [cmd, ...pre] = (env.WRANGLER || "npx wrangler").split(" ");
  return execFileSync(cmd, [...pre, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });
}

/** The uuid of the database called `name`, or undefined. */
export function findDatabase(listJson, name) {
  // Wrangler may print warnings first ("[WARNING] ..."); the list itself starts a line
  // with "[{" or "[]" (pretty-printed: "[" then a newline and "{").
  const at = listJson.search(/^\[\s*[{\]]/m);
  let list;
  try {
    list = at < 0 ? undefined : JSON.parse(listJson.slice(at));
  } catch {
    list = undefined;
  }
  if (!Array.isArray(list)) throw new Error("wrangler d1 list --json did not return a list");
  const hits = list.filter((d) => d?.name === name);
  if (hits.length > 1) throw new Error(`more than one D1 named ${name}`);
  return hits[0]?.uuid;
}

/** Replace the marker id in `[[env.<env>.d1_databases]]`, and only there. */
export function injectId(toml, env, id) {
  if (!UUID.test(id ?? "")) throw new Error(`not a D1 uuid: ${JSON.stringify(id)}`);
  const header = `[[env.${env}.d1_databases]]`;
  const blocks = toml.split(/^(?=\[)/m);
  const at = blocks.findIndex((b) => b.startsWith(header));
  if (at < 0) throw new Error(`${header} not found`);
  const line = `database_id = "${MARKER}"`;
  if (!blocks[at].includes(line)) throw new Error(`${header} has no ${line}`);
  blocks[at] = blocks[at].replace(line, `database_id = "${id}"`);
  const out = blocks.join("");
  // The marker anywhere else would ship as a database id: refuse.
  if (out.includes(MARKER)) throw new Error("generated config still has the marker");
  return out;
}

export function provision(opts = {}, env = process.env, log = console.log) {
  const o = { ...DEFAULTS, ...opts };
  for (const key of ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]) {
    if (!env[key]?.trim())
      throw new Error(
        `${key} is empty: set it in the GitHub "staging" environment (or export it locally)`,
      );
  }
  let id = findDatabase(wrangler(["d1", "list", "--json"], env), o.name);
  if (id) {
    log(`[d1] ${o.name} exists, reusing ${id}`);
  } else {
    log(`[d1] ${o.name} not found, creating it (${o.location})`);
    wrangler(["d1", "create", o.name, "--location", o.location], env);
    id = findDatabase(wrangler(["d1", "list", "--json"], env), o.name);
    log(`[d1] created ${o.name}: ${id}`);
  }
  writeFileSync(o.output, injectId(readFileSync(o.input, "utf8"), o.env, id));
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `d1_id=${id}\n`);
  log(`[d1] wrote ${o.output}`);
  return id;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    provision();
  } catch (err) {
    console.error(`[d1] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  }
}
