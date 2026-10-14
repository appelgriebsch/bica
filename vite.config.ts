import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { nitro } from "nitro/vite";
// @ts-expect-error JS plugin alongside the TS vite config
import { grokPwaPlugin } from "./scripts/grok-pwa-plugin.mjs";
import { APP_NAME } from "./src/lib/app-name.mjs";
import { siteKeyForBuild } from "./src/lib/turnstile-keys.mjs";
// @ts-expect-error JS module alongside the TS vite config
import { activePreset } from "./scripts/build-output.mjs";

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
  },
  plugins: [
    // PWA head + ?install=1 tutorial page; runs before Start/Nitro.
    grokPwaPlugin({ appName: APP_NAME }),
    tailwindcss(),
    tanstackStart(),
    ...(command === "build"
      ? [
          nitro({
            preset: nitroPreset,
            // Auto-registers server/middleware/* (the PWA install page +
            // manifest + head-tag middleware). Nitro v3 defaults serverDir to
            // false, so removing this silently unwires /?install=1 on deploys.
            serverDir: "./server",
          }),
        ]
      : []),
    viteReact(),
  ],
}));
