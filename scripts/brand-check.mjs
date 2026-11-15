/**
 * Brand-asset gate shared by browser-smoke.mjs (unit-testable without a
 * browser): Bica ships a custom share card (public/og.jpg) and wires og:image
 * to it in the root head. Checked on the filesystem (not the served head)
 * because a preview without a public host renders no og:image tag at all.
 */
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Over this, link scrapers (X card previews included) time out or skip the
// image, so the card silently fails to unfurl. The JPEG contract
// (ffmpeg -q:v 4, ~150-300 KB) exists precisely to stay under it.
export const MAX_CARD_BYTES = 600 * 1024;

export function computeBrandWarnings({
  workspaceRoot = fileURLToPath(new URL("..", import.meta.url)),
} = {}) {
  // The card URL may live in the root route itself or in the public-host
  // helper it calls (ogImageUrl/OG_IMAGE_PATH) — judge both.
  const sources = ["src/routes/__root.tsx", "src/lib/public-host.ts"]
    .map((rel) => join(workspaceRoot, rel))
    .filter(existsSync)
    .map((p) => readFileSync(p, "utf8"))
    .join("\n");
  const cardPath = [
    join(workspaceRoot, "public/og.jpg"),
    join(workspaceRoot, "public/og.png"),
  ].find(existsSync);
  const warnings = [];

  if (cardPath !== undefined) {
    const cardUrl = cardPath.endsWith(".png") ? "/og.png" : "/og.jpg";
    if (!sources.includes(cardUrl)) {
      warnings.push(
        `BRAND WARNING: ${cardPath} exists but the root head does not wire og:image to "https://\${host}${cardUrl}".`,
      );
    } else if (statSync(cardPath).size > MAX_CARD_BYTES) {
      warnings.push(
        `BRAND WARNING: ${cardPath} is over 600 KB — link scrapers (X card previews included) `
          + "time out or skip images this heavy, so the card silently fails to unfurl. "
          + "Re-encode as JPEG (public/og.jpg, ffmpeg -q:v 4).",
      );
    }
  }

  return warnings;
}
