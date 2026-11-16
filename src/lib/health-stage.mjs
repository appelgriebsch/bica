/**
 * Pure health decision for the staging and production Workers.
 * Accepts only the exact stage strings "staging" and "production". No I/O,
 * no auth, no database.
 */

/** @param {unknown} value */
export function normalizeBicaStage(value) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Worker binding wins. `process.env` is the local / nodejs_compat fallback.
 *
 * @param {{ workerEnv?: unknown, processEnv?: unknown }} [sources]
 * @returns {string | undefined}
 */
export function resolveBicaStage(sources = {}) {
  const fromWorker = normalizeBicaStage(sources.workerEnv);
  if (fromWorker) return fromWorker;
  return normalizeBicaStage(sources.processEnv);
}

/**
 * @param {unknown} sha
 * @returns {string}
 */
function healthSha(sha) {
  if (typeof sha !== "string") return "dev";
  const trimmed = sha.trim();
  return trimmed || "dev";
}

/**
 * #73: the CF_VERSION_METADATA binding ({ id }); absent locally and in tests.
 * @param {unknown} metadata
 * @returns {string} the deployed version id, or "dev" when the binding is missing
 */
function healthVersion(metadata) {
  if (metadata && typeof metadata === "object") {
    const id = /** @type {{ id?: unknown }} */ (metadata).id;
    if (typeof id === "string" && id.trim()) return id.trim();
  }
  return "dev";
}

/**
 * @param {string | undefined} stage
 * @param {string} [sha] full build id; empty becomes "dev". Omitted from 503.
 * @param {unknown} [versionMetadata] CF_VERSION_METADATA binding; its `id` becomes
 *   `version`, "dev" when absent. Omitted from 503.
 * @returns {{ status: 200, body: { ok: true, stage: "staging" | "production", sha: string, version: string } } | { status: 503, body: { ok: false } }}
 */
export function healthForStage(stage, sha, versionMetadata) {
  if (stage === "staging" || stage === "production") {
    return {
      status: 200,
      body: { ok: true, stage, sha: healthSha(sha), version: healthVersion(versionMetadata) },
    };
  }
  return { status: 503, body: { ok: false } };
}
