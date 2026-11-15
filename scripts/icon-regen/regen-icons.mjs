#!/usr/bin/env node
/**
 * Prototype (issue #96, ADR 0010): evaluate original replacements for the
 * Grok-generated app icon/mark (`public/favicon.svg`, `public/icon-*.png`,
 * `public/icon-maskable-*.png`). Research + prototype only — nothing in
 * `public/` is touched by this script; it writes to `icon-regen-out/` for
 * hand review. The follow-up ticket swaps the 6 shipped files + THIRD-PARTY.md
 * + `scripts/about.test.mjs` in one change.
 *
 * Arms:
 *   default (`--via=svg`)      Original hand-authored mark (`mark.svg`,
 *                              `mark-maskable.svg`), rasterized locally with
 *                              sharp (already in the lockfile via miniflare).
 *                              $0, no AI, no attribution obligation.
 *   `--via=mistral`            Regenerate via Mistral's built-in
 *                              `image_generation` tool (BFL FLUX1.1 [pro]
 *                              Ultra) — the path verified in ADR 0009: POST
 *                              /v1/chat/completions with
 *                              tools:[{type:"image_generation"}], image URL in
 *                              the role:"tool" message's JSON-string content.
 *                              ~$0.10/image, needs MISTRAL_API_KEY.
 *
 * Usage (from the repo root):
 *   node scripts/icon-regen/regen-icons.mjs                          # SVG arm -> icon-regen-out/
 *   node scripts/icon-regen/regen-icons.mjs --via=mistral --dry-run  # print the prompt, no calls
 *   MISTRAL_API_KEY=... node scripts/icon-regen/regen-icons.mjs --via=mistral
 *
 * Output: icon-regen-out/{favicon.svg, icon-180/192/512.png,
 *          icon-maskable-192/512.png, current/*, qc.html, regen-log.json}
 * The log records the programmatic QC: PNG dimensions, opacity, byte size,
 * and for maskable icons the max ink distance from center vs the 80%
 * safe-zone circle (radius 0.4 * size).
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const OUT = join(ROOT, "icon-regen-out");
const GLOBAL_BASE = "https://api.mistral.ai/v1";

const args = process.argv.slice(2);
const viaArg = args.find((a) => a.startsWith("--via="));
const VIA = (viaArg ? viaArg.slice(6) : "svg").toLowerCase();
const DRY_RUN = args.includes("--dry-run");
if (!["svg", "mistral"].includes(VIA)) {
  console.error(`unknown --via "${VIA}"; known: svg, mistral`);
  process.exit(2);
}

const COBALT = "#1E4D73";
const SIZES = { regular: [180, 192, 512], maskable: [192, 512] };

const MISTRAL_PROMPT = [
  'Generate a 1024x1024 app icon for "Bica", a Lisbon Portuguese-learning app.',
  "A single square azulejo (Portuguese ceramic tile): full-bleed background in deep cobalt blue #1E4D73,",
  "with a centered cream #F6F1E8 eight-pointed star (compass-rose / azulejo estrela motif) inside a thin",
  "cream frame ring. Flat vector style, exactly two colors (#1E4D73 and #F6F1E8), no gradients, no shadows,",
  "no text, no watermark, no people, no photorealism. All artwork must sit inside the central circle of",
  "radius 40% of the icon (the maskable safe zone).",
].join(" ");

/** Render an SVG string to an opaque S×S PNG (optionally with a backing rect for full-bleed). */
async function svgToPng(svgText, size, { fullBleedColor } = {}) {
  let src = svgText.replace(/\swidth="\d+"\sheight="\d+"/, "");
  if (fullBleedColor) {
    src = src.replace(/(<svg[^>]*>)/, `$1<rect width="64" height="64" fill="${fullBleedColor}"/>`);
  }
  const buf = Buffer.from(src);
  // density makes librsvg rasterize the 64-unit viewBox at exactly `size` px.
  const density = Math.round((size * 72) / 64);
  // Flatten onto the full-bleed color: the shipped PNGs carry no alpha channel.
  const pipeline = sharp(buf, { density })
    .resize(size, size, { fit: "fill" })
    .flatten({ background: fullBleedColor || COBALT });
  return pipeline.png({ compressionLevel: 9 }).toBuffer();
}

/**
 * Maskable safe-zone check: every pixel that differs from the corner
 * (background) color must lie inside the circle of radius 0.4*size around
 * the center — the maskable safe zone. Returns the max ink distance (px).
 */
async function maxInkDistance(pngBuffer, size) {
  const { data, info } = await sharp(pngBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels;
  const bg = [data[0], data[1], data[2]];
  const c = (size - 1) / 2;
  let maxD = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * ch;
      const dr = data[i] - bg[0];
      const dg = data[i + 1] - bg[1];
      const db = data[i + 2] - bg[2];
      if (dr * dr + dg * dg + db * db > 8 * 8) {
        const d = Math.hypot(x - c, y - c);
        if (d > maxD) maxD = d;
      }
    }
  }
  return maxD;
}

async function pngInfo(pngBuffer) {
  const meta = await sharp(pngBuffer).metadata();
  return {
    width: meta.width,
    height: meta.height,
    hasAlpha: Boolean(meta.hasAlpha),
    bytes: pngBuffer.length,
  };
}

/* ---------- Mistral arm (API path per ADR 0009) ---------- */

const IMG_URL_RE = /https:\/\/[^\s"'\\]+/g;
function looksLikeImageUrl(u) {
  return (
    /\.(png|jpe?g|webp)(\?|["']|$)/i.test(u) ||
    /files\.mistral\.ai|blob\.core\.windows\.net\/images\//.test(u)
  );
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
  if (
    !found.url &&
    typeof node.url === "string" &&
    node.url.startsWith("http") &&
    looksLikeImageUrl(node.url)
  ) {
    found.url = node.url;
  }
  for (const v of Object.values(node)) findImageRef(v, found);
  return found;
}

async function generateMistralIcon() {
  const key = process.env.MISTRAL_API_KEY || "";
  if (!key) {
    console.error(
      "MISTRAL_API_KEY is required for --via=mistral (~$0.10/image on the owner's quota).",
    );
    process.exit(2);
  }
  const base = (process.env.MISTRAL_API_BASE || GLOBAL_BASE).replace(/\/$/, "");
  const started = Date.now();
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.MISTRAL_IMAGE_MODEL || "mistral-large-latest",
      messages: [{ role: "user", content: `Generate an image: ${MISTRAL_PROMPT}` }],
      tools: [{ type: "image_generation" }],
    }),
  });
  if (!res.ok)
    throw new Error(`chat/completions -> ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const { fileId, url } = findImageRef(json);
  if (!fileId && !url)
    throw new Error(`no image reference in response: ${JSON.stringify(json).slice(0, 2000)}`);
  let bytes;
  if (fileId) {
    const fr = await fetch(`${base}/v1/files/${fileId}/content`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!fr.ok) throw new Error(`files/${fileId} -> ${fr.status}`);
    bytes = Buffer.from(await fr.arrayBuffer());
  } else {
    let r = await fetch(url);
    if ((r.status === 401 || r.status === 403) && key)
      r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!r.ok) throw new Error(`image url -> ${r.status}`);
    bytes = Buffer.from(await r.arrayBuffer());
  }
  const png = await sharp(bytes).resize(1024, 1024, { fit: "cover" }).png().toBuffer();
  return { png, latencyMs: Date.now() - started, model: json.model, usage: json.usage || null };
}

/* ---------- main ---------- */

async function main() {
  console.log(`arm: ${VIA}${DRY_RUN ? " (dry run)" : ""}`);
  console.log(`out: ${OUT}`);
  if (VIA === "mistral") {
    console.log(`\nprompt:\n${MISTRAL_PROMPT}\n`);
    if (DRY_RUN) return;
  }

  await mkdir(join(OUT, "current"), { recursive: true });
  for (const f of [
    "favicon.svg",
    ...SIZES.regular.map((s) => `icon-${s}.png`),
    ...SIZES.maskable.map((s) => `icon-maskable-${s}.png`),
  ]) {
    await copyFile(join(ROOT, "public", f), join(OUT, "current", f));
  }

  const markSvg = await readFile(join(HERE, "mark.svg"), "utf8");
  const markMaskableSvg = await readFile(join(HERE, "mark-maskable.svg"), "utf8");

  let genMaster = null; // raster master when VIA === "mistral"
  let armNote = "hand-authored SVG (mark.svg / mark-maskable.svg), rasterized locally with sharp";
  if (VIA === "mistral") {
    const gen = await generateMistralIcon();
    console.log(`mistral icon generated in ${gen.latencyMs}ms, model ${gen.model}`);
    genMaster = gen.png;
    armNote = `Mistral image_generation (BFL FLUX1.1 [pro] Ultra), model ${gen.model}, ${gen.latencyMs}ms, ~$0.10`;
  }

  const files = []; // { name, bytes, ...info, qc }
  async function emit(name, pngBuffer, { maskable = false } = {}) {
    const size = Number(name.match(/-(\d+)\.png$/)[1]);
    const info = await pngInfo(pngBuffer);
    const qc = { ...info, sizeOk: info.width === size && info.height === size };
    if (maskable) {
      const maxD = await maxInkDistance(pngBuffer, size);
      qc.safeZone = {
        maxInkRadiusPx: +maxD.toFixed(1),
        limitPx: +(0.4 * size).toFixed(1),
        pass: maxD <= 0.4 * size,
      };
    } else {
      qc.opaque = !info.hasAlpha;
    }
    await writeFile(join(OUT, name), pngBuffer);
    files.push({ name, ...qc });
    console.log(
      `wrote ${name}  ${info.width}x${info.height}  ${(info.bytes / 1024).toFixed(1)}KB  ` +
        (maskable
          ? `safe-zone ${qc.safeZone.maxInkRadiusPx}/${qc.safeZone.limitPx}px ${qc.safeZone.pass ? "PASS" : "FAIL"}`
          : `opaque=${qc.opaque}`),
    );
  }

  if (VIA === "svg") {
    await writeFile(join(OUT, "favicon.svg"), markSvg);
    files.push({
      name: "favicon.svg",
      bytes: Buffer.byteLength(markSvg),
      note: "vector source, transparent corners",
    });
    for (const s of SIZES.regular)
      await emit(`icon-${s}.png`, await svgToPng(markSvg, s, { fullBleedColor: COBALT }));
    for (const s of SIZES.maskable)
      await emit(`icon-maskable-${s}.png`, await svgToPng(markMaskableSvg, s), { maskable: true });
  } else {
    // Generated master is a full-bleed square: use it for both regular and maskable outputs.
    await writeFile(join(OUT, "favicon.svg"), markSvg); // favicon stays vector
    files.push({
      name: "favicon.svg",
      bytes: Buffer.byteLength(markSvg),
      note: "vector source kept for the favicon",
    });
    for (const s of SIZES.regular) {
      await emit(
        `icon-${s}.png`,
        await sharp(genMaster).resize(s, s, { fit: "fill" }).png().toBuffer(),
      );
    }
    for (const s of SIZES.maskable) {
      await emit(
        `icon-maskable-${s}.png`,
        await sharp(genMaster).resize(s, s, { fit: "fill" }).png().toBuffer(),
        { maskable: true },
      );
    }
  }

  // QC harness page (paths are relative; open icon-regen-out/qc.html over http).
  const qcTemplate = await readFile(join(HERE, "qc.html"), "utf8");
  const payload = { arm: VIA, armNote, files };
  const qcHtml = qcTemplate.replace(/\/\*__QC__\*\/\s*\{[^}]*\}/, JSON.stringify(payload));
  if (qcHtml === qcTemplate)
    throw new Error("qc.html template is missing the /*__QC__*/ placeholder");
  await writeFile(join(OUT, "qc.html"), qcHtml);

  const log = {
    issue: 96,
    arm: VIA,
    armNote,
    generatedAt: new Date().toISOString(),
    sizes: SIZES,
    files,
    pass: files.every((f) => (f.safeZone ? f.safeZone.pass : true) && (f.sizeOk ?? true)),
  };
  await writeFile(join(OUT, "regen-log.json"), JSON.stringify(log, null, 2));
  console.log(`\nQC pass: ${log.pass}  (see icon-regen-out/regen-log.json)`);
  console.log(`open ${join(OUT, "qc.html")} in a browser for the visual QC`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
