/**
 * Single source for the Nitro preset and where that preset writes its output.
 * vite.config.ts takes the preset from here; scripts/precache.mjs and
 * scripts/serve-build.mjs take the paths, so a preset switch can't leave the
 * worker pointing at a folder that no longer exists.
 */
export const NITRO_PRESET = "vercel";

/** `DEPLOY_TARGET=cloudflare` (`npm run build:cf`) selects the module Worker preset. */
export function activePreset(env = process.env) {
  return env.DEPLOY_TARGET === "cloudflare" ? "cloudflare-module" : NITRO_PRESET;
}

const OUTPUTS = {
  vercel: {
    publicDir: ".vercel/output/static",
    serverEntry: ".vercel/output/functions/__server.func/index.mjs",
    serverLibs: ".vercel/output/functions/__server.func/_libs",
    // serve-build.mjs copies PGLite's runtime files next to the bundle.
    embeddedDb: true,
  },
  // precache.mjs renders the shell by importing this bundle under Node, which works
  // because the Cloudflare build never boots PGLite (embeddedDbDisabled).
  "cloudflare-module": {
    publicDir: ".output/public",
    serverEntry: ".output/server/index.mjs",
    serverLibs: ".output/server/_libs",
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
