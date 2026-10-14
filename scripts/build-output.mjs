/**
 * Single source for the Nitro preset and where that preset writes its output.
 * vite.config.ts takes the preset from here; scripts/precache.mjs and
 * scripts/serve-build.mjs take the paths, so a preset switch can't leave the
 * worker pointing at a folder that no longer exists.
 *
 * #17: Cloudflare Workers (`cloudflare-module`) is the only preset.
 */
export const NITRO_PRESET = "cloudflare-module";

/** Always the Workers module preset. `DEPLOY_TARGET=cloudflare` is kept by
 *  `build` / `build:cf` for the Turnstile site-key bake and older scripts. */
export function activePreset(_env = process.env) {
  return NITRO_PRESET;
}

const OUTPUTS = {
  // precache.mjs renders the shell by importing this bundle under Node.
  "cloudflare-module": {
    publicDir: ".output/public",
    serverEntry: ".output/server/index.mjs",
    workerEntry: ".output/server/staging-entry.mjs",
  },
};

export function buildOutput(preset = activePreset()) {
  const out = OUTPUTS[preset];
  if (!out) {
    throw new Error(
      `[build-output] no output paths for Nitro preset "${preset}"; add them to scripts/build-output.mjs`,
    );
  }
  return out;
}
