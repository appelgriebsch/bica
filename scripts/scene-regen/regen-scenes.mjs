#!/usr/bin/env node
/**
 * Prototype (issue #93): regenerate the 20 scene illustrations in
 * public/scenes/ via Mistral's built-in `image_generation` tool (BFL FLUX1.1
 * [pro] Ultra) so the xAI attribution on those files can eventually go.
 * Research + prototype only — nothing is shipped by this script; it writes to
 * an output directory you review by hand.
 *
 * API path (verified 2026-11-15 against docs.mistral.ai cookbook "Using
 * Connectors in Chat Completions"): image_generation is a built-in tool of
 * POST /v1/chat/completions — no agent needed (the old /v1/agents +
 * /v1/conversations API is deprecated and 404s now):
 *   POST {base}/v1/chat/completions
 *     { model, messages: [{role:"user", content:"Generate an image: …"}],
 *       tools: [{ type: "image_generation" }] }
 * The response is multi_completion (choices[].messages[]): the model emits a
 * generate_image tool_call and the result arrives as a role:"tool" message
 * whose `content` is a JSON *string* — {"url": "https://…blob.core.windows.net/images/…/image.jpg?sig=…"}
 * (observed live 2026-11-15). String values are URL-scanned and JSON-parsed;
 * image_url chunks (files.mistral.ai) and agents-style tool_file/file_id
 * chunks (download via GET {base}/v1/files/{file_id}/content) are also handled.
 *
 * Usage (from the repo root):
 *   MISTRAL_API_KEY=... node scripts/scene-regen/regen-scenes.mjs                 # all 20, photoreal
 *   MISTRAL_API_KEY=... node scripts/scene-regen/regen-scenes.mjs --only=tram,cafe,street   # QC subset
 *   MISTRAL_API_KEY=... node scripts/scene-regen/regen-scenes.mjs --styles=photo,illustration  # both styles
 *   node scripts/scene-regen/regen-scenes.mjs --dry-run --styles=photo,illustration  # print prompts, no calls
 *
 * Styles ("photo" = current photoreal look, "illustration" = flat azulejo-branded
 * editorial illustration; see prompts.mjs STYLES). One image per scene per style.
 *
 * Env:
 *   MISTRAL_API_KEY    required (the app owner's la plateforme key; the tool
 *                      bills ~$100 / 1k images = $0.10 per image)
 *   MISTRAL_API_BASE   default https://api.mistral.ai/v1 (global). The regional
 *                      endpoints (api.eu.mistral.ai) host chat completions but
 *                      NOT the Files API; on a "no Route matched" 404 the
 *                      script falls back to the global endpoint automatically.
 *                      Prompts are static scene descriptions, no learner data.
 *   MISTRAL_IMAGE_MODEL  comma-separated fallback chain, default
 *                      "mistral-small-latest,mistral-medium-latest,mistral-large-latest"
 *                      (a model that emits no image ref falls through to the next)
 *
 * Output: <out>/styles/<style>/<name>.jpg (1200px-wide progressive JPEG, q82),
 *         <out>/current/*.jpg (copies of public/scenes for side-by-side),
 *         <out>/qc.html (open it in a browser for the visual QC),
 *         <out>/regen-log.json (per-scene/style latency + cost estimate)
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { SCENES, STYLES, promptFor } from "./prompts.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const GLOBAL_BASE = "https://api.mistral.ai/v1";
let API_BASE = (process.env.MISTRAL_API_BASE || GLOBAL_BASE).replace(/\/$/, "");
const BASE_NOTES = [];
const KEY = process.env.MISTRAL_API_KEY || "";
const COST_PER_IMAGE_USD = 0.10; // la plateforme built-in tool billing: ~$100 / 1k images

const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith("--only="));
const outArg = args.find((a) => a.startsWith("--out="));
const concArg = args.find((a) => a.startsWith("--concurrency="));
const stylesArg = args.find((a) => a.startsWith("--styles=")) || args.find((a) => a.startsWith("--style="));
const DRY_RUN = args.includes("--dry-run");
const OUT = outArg ? outArg.slice(6) : join(ROOT, "scene-regen-out");
const CONCURRENCY = Math.max(1, Number(concArg?.slice(14) || 3));
const names = onlyArg
  ? onlyArg.slice(7).split(",").map((s) => s.trim()).filter(Boolean)
  : Object.keys(SCENES);
const styles = stylesArg
  ? stylesArg.slice(stylesArg.indexOf("=") + 1).split(",").map((s) => s.trim()).filter(Boolean)
  : ["photo"];

for (const n of names) {
  if (!SCENES[n]) {
    console.error(`unknown scene "${n}"; known: ${Object.keys(SCENES).join(", ")}`);
    process.exit(2);
  }
}
for (const st of styles) {
  if (!STYLES[st]) {
    console.error(`unknown style "${st}"; known: ${Object.keys(STYLES).join(", ")}`);
    process.exit(2);
  }
}
const jobs = styles.flatMap((style) => names.map((name) => ({ style, name })));

async function rawApi(base, path, { method = "GET", body, accept = "application/json" } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const headers = { Authorization: `Bearer ${KEY}`, Accept: accept };
    if (body) headers["Content-Type"] = "application/json";
    const res = await fetch(`${base}${path}`, {
      method,
      signal: ctrl.signal,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const err = new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
      err.status = res.status;
      err.routeMiss = text.includes("no Route matched");
      throw err;
    }
    return res;
  } finally {
    clearTimeout(t);
  }
}

/** Call the API; on a route-miss 404 from a regional base, retry once on the global endpoint. */
async function api(path, opts = {}) {
  try {
    return await rawApi(API_BASE, path, opts);
  } catch (err) {
    if (err.status === 404 && err.routeMiss && API_BASE !== GLOBAL_BASE) {
      BASE_NOTES.push(`${API_BASE} lacks ${path} (regional endpoints miss some routes); fell back to ${GLOBAL_BASE}`);
      API_BASE = GLOBAL_BASE;
      return rawApi(API_BASE, path, opts);
    }
    throw err;
  }
}

/**
 * Recursively find the generated image reference in a chat-completions
 * response. With the built-in image tool the response is multi_completion
 * (choices[].messages[]) and the tool result arrives as a message with
 * role:"tool" whose `content` is a JSON *string* like
 *   {"url": "https://…blob.core.windows.net/images/…/image.jpg?sig=…"}
 * so string values are both URL-scanned and JSON-parsed. Also handled:
 * image_url chunks (files.mistral.ai, possibly extensionless) and
 * agents-style tool_file chunks with a file_id.
 */
const IMG_URL_RE = /https:\/\/[^\s"'\\]+/g;
function looksLikeImageUrl(u) {
  return /\.(png|jpe?g|webp)(\?|["']|$)/i.test(u) || /files\.mistral\.ai|blob\.core\.windows\.net\/images\//.test(u);
}
function findImageRef(node, found = {}) {
  if (found.done) return found;
  if (typeof node === "string") {
    for (const u of node.match(IMG_URL_RE) || []) {
      if (looksLikeImageUrl(u)) {
        found.url = u;
        found.done = true;
        return found;
      }
    }
    try {
      return findImageRef(JSON.parse(node), found);
    } catch {
      return found;
    }
  }
  if (!node || typeof node !== "object") return found;
  if (node.type === "tool_file" && typeof node.file_id === "string") {
    found.fileId = node.file_id;
    found.done = true;
    return found;
  }
  if (node.type === "image_url") {
    const u = typeof node.image_url === "string" ? node.image_url : node.image_url?.url;
    if (typeof u === "string" && u.startsWith("http")) {
      found.url = u;
      found.done = true;
      return found;
    }
  }
  if (typeof node.file_id === "string" && !found.fileId) found.fileId = node.file_id;
  if (!found.url && typeof node.url === "string" && node.url.startsWith("http") && looksLikeImageUrl(node.url)) {
    found.url = node.url;
  }
  for (const v of Object.values(node)) findImageRef(v, found);
  return found;
}

async function downloadImage(fileId, url) {
  if (fileId) {
    const fileRes = await api(`/v1/files/${fileId}/content`, { accept: "application/octet-stream" });
    return Buffer.from(await fileRes.arrayBuffer());
  }
  let res = await fetch(url);
  if ((res.status === 401 || res.status === 403) && KEY) {
    res = await fetch(url, { headers: { Authorization: `Bearer ${KEY}` } });
  }
  if (!res.ok) throw new Error(`image url -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

const MODELS = (process.env.MISTRAL_IMAGE_MODEL || "mistral-small-latest,mistral-medium-latest,mistral-large-latest")
  .split(",").map((s) => s.trim()).filter(Boolean);

async function generateOne(name, style) {
  const prompt = promptFor(name, style);
  const started = Date.now();
  let lastErr;
  for (const model of MODELS) {
    const res = await api("/v1/chat/completions", {
      method: "POST",
      body: {
        model,
        messages: [{ role: "user", content: `Generate an image: ${prompt}` }],
        tools: [{ type: "image_generation" }],
      },
    });
    const json = await res.json();
    const { fileId, url } = findImageRef(json);
    if (!fileId && !url) {
      lastErr = new Error(`no image reference in chat response for "${name}" [${style}] (model ${model}): ${JSON.stringify(json).slice(0, 4000)}`);
      continue; // try the next model
    }
    const bytes = await downloadImage(fileId, url);
    const latencyMs = Date.now() - started;
    const jpg = await sharp(bytes)
      .resize({ width: 1200, withoutEnlargement: true })
      .jpeg({ quality: 82, progressive: true })
      .toBuffer();
    return { name, style, model, prompt, fileId: fileId || null, url: url || null, latencyMs, srcBytes: bytes.length, jpgBytes: jpg.length, usage: json.usage || null, jpg };
  }
  throw lastErr;
}

async function main() {
  console.log(`scenes: ${names.join(", ")}`);
  console.log(`styles: ${styles.join(", ")}`);
  console.log(`out:    ${OUT}`);
  console.log(`api:    ${API_BASE}  models: ${MODELS.join(" -> ")}  concurrency: ${CONCURRENCY}${DRY_RUN ? "  DRY RUN" : ""}`);
  for (const st of styles) {
    for (const n of names) console.log(`\n--- [${st}] ${n}.jpg ---\n${promptFor(n, st)}\n`);
  }
  if (DRY_RUN) return;
  if (!KEY) {
    console.error("\nMISTRAL_API_KEY is required (it spends the app owner's quota; ~$0.10/image).");
    process.exit(2);
  }

  await mkdir(join(OUT, "current"), { recursive: true });
  for (const st of styles) await mkdir(join(OUT, "styles", st), { recursive: true });
  for (const n of Object.keys(SCENES)) {
    await copyFile(join(ROOT, "public", "scenes", `${n}.jpg`), join(OUT, "current", `${n}.jpg`));
  }
  // Inject the generated style list into the QC harness (no fetch on file://).
  const qcTemplate = await readFile(join(dirname(fileURLToPath(import.meta.url)), "qc.html"), "utf8");
  const styleMeta = styles.map((id) => ({ id, label: STYLES[id].label }));
  const qcHtml = qcTemplate.replace(/\/\*__STYLES__\*\/\s*\[[^\]]*\]/, JSON.stringify(styleMeta));
  if (qcHtml === qcTemplate) throw new Error("qc.html template is missing the /*__STYLES__*/ placeholder");
  await writeFile(join(OUT, "qc.html"), qcHtml);

  const log = { apiBase: API_BASE, baseNotes: BASE_NOTES, models: MODELS, styles, costPerImageUsd: COST_PER_IMAGE_USD, scenes: [] };
  let done = 0;
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const { style, name } = jobs[next++];
      try {
        const r = await generateOne(name, style);
        await writeFile(join(OUT, "styles", style, `${name}.jpg`), r.jpg);
        log.scenes.push({ ...r, jpg: undefined, costUsd: COST_PER_IMAGE_USD });
        done++;
        console.log(`ok  [${style}] ${name}.jpg  ${r.latencyMs}ms  ${(r.jpgBytes / 1024).toFixed(0)}KB  [${done}/${jobs.length}]`);
      } catch (err) {
        log.scenes.push({ name, style, error: String(err.message || err) });
        console.error(`ERR [${style}] ${name}: ${err.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker));

  const totalMs = log.scenes.reduce((n, s) => n + (s.latencyMs || 0), 0);
  const ok = log.scenes.filter((s) => !s.error).length;
  const perStyle = {};
  for (const st of styles) {
    const entries = log.scenes.filter((s) => s.style === st);
    perStyle[st] = { ok: entries.filter((s) => !s.error).length, failed: entries.filter((s) => s.error).length };
  }
  log.summary = {
    requested: jobs.length,
    ok,
    failed: jobs.length - ok,
    perStyle,
    totalLatencyMs: totalMs,
    estCostUsd: +(ok * COST_PER_IMAGE_USD).toFixed(2),
    note: "built-in image_generation tool in /v1/chat/completions bills ~$0.10/image; 20 scenes x 1 style ≈ $2.00, x2 styles ≈ $4.00. /v1/agents is deprecated (404) — do not use it",
  };
  await writeFile(join(OUT, "regen-log.json"), JSON.stringify(log, null, 2));
  console.log(`\n${JSON.stringify(log.summary, null, 2)}`);
  console.log(`open ${join(OUT, "qc.html")} in a browser for the side-by-side QC`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
