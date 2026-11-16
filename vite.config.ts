import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
import { siteKeyForBuild } from "./src/lib/turnstile-keys.mjs";
// @ts-expect-error JS module alongside the TS vite config
import { activePreset } from "./scripts/build-output.mjs";
// @ts-expect-error JS module alongside the TS vite config
import { resolveBuildSha, resolveBuildShaFull } from "./scripts/build-sha.mjs";

// `0.0.0.0:8080` is the live-preview contract — don't change host/port.
// Keep `nitro` gated to `build`: enabled in dev it opens a second dev-server
// port, which breaks the single-port preview.
// Nitro preset is Cloudflare Workers (`cloudflare-module`, #17). The only
// deploy path. The dev server starts once `src/router.tsx` and `src/routes/`
// exist — see AGENTS.md § "First scaffold".
const nitroPreset = activePreset();

export default defineConfig(({ command }) => ({
  server: {
    host: "0.0.0.0",
    port: 8080,
    strictPort: true,
  },
  resolve: { tsconfigPaths: true },
  // #35: the public Turnstile site key is baked in at build time: the
  // committed staging key for build:cf, Cloudflare's test key otherwise.
  define: {
    "import.meta.env.TURNSTILE_SITE_KEY": JSON.stringify(siteKeyForBuild(process.env)),
    __BICA_BUILD_SHA__: JSON.stringify(resolveBuildSha()),
    __BICA_BUILD_SHA_FULL__: JSON.stringify(resolveBuildShaFull()),
    // ADR 0011: public-by-design Web Analytics site token from the
    // WEB_ANALYTICS_TOKEN Actions variable; empty keeps the beacon off.
    __BICA_WEB_ANALYTICS_TOKEN__: JSON.stringify(process.env.WEB_ANALYTICS_TOKEN ?? ""),
  },
  plugins: [
    tailwindcss(),
    tanstackStart(),
    ...(command === "build"
      ? [
          nitro({
            preset: nitroPreset,
            // Auto-registers server/middleware/* (00-security-headers,
            // server-fn-errors). Nitro v3 defaults serverDir to false, so
            // removing this silently unwires the Worker middleware on deploys.
            serverDir: "./server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
