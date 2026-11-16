/**
 * Cookieless Cloudflare Web Analytics, production only (ADR 0011).
 * Plain ESM so `node --test` shares one copy. The site token is public by
 * design; it is baked at build time (vite define) and passed in by the client
 * entry, so this module never references the define itself.
 */
import { CF_BEACON_ORIGIN } from "./security-headers.mjs";

export const CF_BEACON_SRC = `${CF_BEACON_ORIGIN}/beacon.min.js`;

/** @typedef {{ defer: boolean, src: string, setAttribute: (name: string, value: string) => void }} BeaconScript */
/** @typedef {{ querySelector: (sel: string) => unknown, createElement: (tag: string) => BeaconScript, head: { appendChild: (el: unknown) => unknown } }} BeaconDocument */
/** @typedef {{ token?: string, health?: () => Promise<{ stage?: string } | undefined>, doc?: BeaconDocument }} AnalyticsDeps */

let started = false;

/**
 * Inject the beacon script once per document. Returns false if already present.
 *
 * @param {BeaconDocument} doc
 * @param {string} token
 * @returns {boolean}
 */
export function loadBeacon(doc, token) {
  if (doc.querySelector("script[data-cf-beacon]")) return false;
  const script = doc.createElement("script");
  script.defer = true;
  script.src = CF_BEACON_SRC;
  script.setAttribute("data-cf-beacon", JSON.stringify({ token }));
  doc.head.appendChild(script);
  return true;
}

/** Same-origin health probe; undefined on any failure (offline, staging 503). */
async function defaultHealth() {
  const res = await fetch("/api/health", { cache: "no-store" });
  if (!res.ok) return undefined;
  return await res.json();
}

/**
 * Load the beacon only when /api/health reports stage "production" and a token
 * is configured. Any failure leaves analytics off, so offline and staging
 * plays are never counted. Runs at most once per page load.
 *
 * @param {AnalyticsDeps} [deps]
 */
export async function initAnalytics(deps = {}) {
  if (started) return;
  started = true;
  const token = (deps.token ?? "").trim();
  if (token === "") return;
  try {
    const health = await (deps.health ?? defaultHealth)();
    if (health?.stage !== "production") return;
    loadBeacon(deps.doc ?? document, token);
  } catch {
    // Offline or staging: no beacon, nothing counted.
  }
}

/** Test seam: reset the once-per-load guard. */
export function resetAnalyticsForTest() {
  started = false;
}
