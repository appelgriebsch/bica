import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { PwaRegister } from "@/components/pwa";
import { PtVoiceNotice } from "@/components/pt-voice-notice";
import { OfflineStatus } from "@/components/offline-status";
import { Toaster } from "sonner";
import { APP_NAME } from "@/lib/app-name.mjs";
import appCss from "../styles.css?url";

const host = import.meta.env.VITE_PUBLIC_HOSTNAME;
const ogImage = host ? `https://${host}/og.jpg` : undefined;
const xBanner = host
  ? `https://og.grok.me/v1/banner.png?host=${encodeURIComponent(host)}&title=${encodeURIComponent(APP_NAME)}&color=1E4D73`
  : undefined;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "European Portuguese in sips — byte-sized lessons from A1 to C1, with quizzes and café conversations.",
      },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
      {
        name: "theme-color",
        content: "#1E4D73",
        media: "(prefers-color-scheme: light)",
      },
      {
        name: "theme-color",
        content: "#141922",
        media: "(prefers-color-scheme: dark)",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: APP_NAME },
      {
        property: "og:description",
        content: "European Portuguese, twenty minutes at a time.",
      },
      ...(ogImage
        ? [
            { property: "og:image", content: ogImage },
            { property: "og:image:width", content: "1200" },
            { property: "og:image:height", content: "630" },
            { property: "og:image:alt", content: "Bica — European Portuguese in sips" },
            { name: "twitter:image", content: ogImage },
            { name: "twitter:title", content: APP_NAME },
          ]
        : []),
      ...(xBanner
        ? [
            { property: "x:game:image", content: xBanner },
            { property: "x:game:image:width", content: "1200" },
            { property: "x:game:image:height", content: "264" },
          ]
        : []),
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/icon-180.png", sizes: "180x180" },
    ],
    scripts: [
      {
        // Zod probes `new Function("")` to decide whether to JIT its parsers;
        // under the nonce CSP (#28) that is an eval report on every page. Its
        // config lives on globalThis, so this must run before any schema module
        // (z.config() in app code runs too late). The schemas are tiny.
        children: "globalThis.__zod_globalConfig={jitless:true};",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  // The CSP nonce (#28) for the one inline script we render ourselves.
  const nonce = useRouter().options.ssr?.nonce;
  return (
    <html lang="en" className="antialiased" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: `(function(){var k="bica-module-reload";function stuck(m){return /importing a module script failed|failed to fetch dynamically imported module|failed to load module script/i.test(String(m||""))}function go(){try{if(sessionStorage.getItem(k)==="1")return;sessionStorage.setItem(k,"1")}catch(e){return}var done=function(){location.reload()};var t=[];if(navigator.serviceWorker){t.push(navigator.serviceWorker.getRegistrations().then(function(rs){return Promise.all(rs.map(function(r){return r.unregister()}))}))}if(window.caches){t.push(caches.keys().then(function(ks){return Promise.all(ks.map(function(x){return caches.delete(x)}))}))}Promise.all(t).then(done,done)}window.addEventListener("error",function(e){if(stuck(e&&e.message))go()});window.addEventListener("unhandledrejection",function(e){var r=e&&e.reason;if(stuck(r&&(r.message||r)))go()})})();`,
          }}
        />
        <PreviewHostBridge />
        <PwaRegister />
        <PtVoiceNotice />
        <OfflineStatus />
        <Outlet />
        <Toaster
          position="top-center"
          toastOptions={{
            className: "font-sans bg-surface text-fg border-border",
          }}
        />
        <Scripts />
      </body>
    </html>
  );
}
