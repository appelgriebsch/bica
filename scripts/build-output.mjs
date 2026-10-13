/**
 * Single source for the Nitro preset and where that preset writes its output.
 * vite.config.ts takes the preset from here; scripts/precache.mjs and
 * scripts/serve-build.mjs take the paths, so a preset switch can't leave the
 * worker pointing at a folder that no longer exists.
 */
export const NITRO_PRESET = "vercel";

// ponytail: vercel only. For cloudflare_module, confirm where Nitro 3 beta writes
// the public dir and worker entry (likely .output/public, .output/server/index.mjs)
// and how precache.mjs can render the shell under workerd, then add the entry.
const OUTPUTS = {
  vercel: {
    publicDir: ".vercel/output/static",
    serverEntry: ".vercel/output/functions/__server.func/index.mjs",
    serverLibs: ".vercel/output/functions/__server.func/_libs",
  },
};

export function buildOutput(preset = NITRO_PRESET) {
  const out = OUTPUTS[preset];
  if (!out) {
    throw new Error(
      `[build-output] no output paths for Nitro preset "${preset}"; add them to scripts/build-output.mjs`,
    );
  }
  return out;
}
