/* Bica offline cache + notification click.
 *
 * `npm run build` (scripts/precache.mjs) fills VERSION and PRECACHE with every
 * static file of the build, including the SPA shell and all route chunks.
 * Install fills a fresh cache for that version and fails if any file fails, so
 * the previous worker (and its cache) keeps serving until a complete set of
 * matching HTML + chunks is in place. No skipWaiting: an open page keeps the
 * worker whose chunks it was built against.
 * ponytail: no update prompt — an installed iOS app that is never fully closed
 * can stay on the old build for days. Add "update ready, reload" (postMessage
 * SKIP_WAITING from the page) if that becomes a problem.
 *
 * Only precached (hashed) URLs are answered from cache. Unknown scripts go to
 * the network untouched — answering those is what made Safari report
 * "Importing a module script failed".
 */
const VERSION = "dev";
const PRECACHE = [];
const CACHE = "bica-" + VERSION;
const RUNTIME = CACHE + "-runtime";
// No .html (Workers' auto-trailing-slash would redirect it); served as text/html below.
const SHELL = "/_shell";
// ponytail: fixed 4 s — on a slow but working line the user gets this build's shell
// instead of the fresh page after 4 s; make it adaptive if that shows up in the field.
const NAV_TIMEOUT_MS = 4000;
const precached = new Set(PRECACHE);

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      try {
        await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
        // A redirected or non-200 shell can't answer navigations: refuse the install.
        const shell = await cache.match(SHELL);
        if (
          PRECACHE.includes(SHELL) &&
          (!shell ||
            shell.redirected ||
            shell.status !== 200 ||
            // `redirected` may not survive Cache API storage; the final URL does.
            (shell.url && new URL(shell.url).pathname !== SHELL))
        ) {
          throw new Error("shell precache is a redirect or missing");
        }
      } catch (err) {
        await caches.delete(CACHE);
        throw err;
      }
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of all) {
        if ("focus" in client) {
          await client.focus();
          if ("navigate" in client) {
            try {
              await client.navigate(target);
            } catch {
              /* older clients */
            }
          }
          return;
        }
      }
      if (self.clients.openWindow) await self.clients.openWindow(target);
    })(),
  );
});

function isNetworkOnly(url) {
  const p = url.pathname;
  return (
    p.startsWith("/api/") ||
    p.startsWith("/_server") ||
    p.includes("/_serverFn") ||
    p.startsWith("/__grok/") ||
    p === "/sw.js"
  );
}

function wantsHtml(req) {
  return req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
}

/** Navigations, and same-origin HTML GETs of app routes (not files like /og.jpg). */
function isPageRequest(req, url) {
  if (req.mode === "navigate") return true;
  return wantsHtml(req) && !precached.has(url.pathname) && !/\.[a-z0-9]+$/i.test(url.pathname);
}

/**
 * What every respondWith path resolves to when neither cache nor network can
 * answer: never undefined, never a rejection ("Failed to convert value to
 * 'Response'", #28). HTML gets the shell (or a 503 page); anything else a 503.
 */
async function offlineFallback(req) {
  if (wantsHtml(req)) {
    // The shell renders only the root and hydrates whatever route the URL names,
    // with chunks from this same cache.
    const shell = await caches.match(SHELL, { cacheName: CACHE });
    if (shell) {
      // Extensionless file: hosts may label it octet-stream, so force HTML.
      return new Response(shell.body, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response("Bica is offline.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response("", { status: 503, statusText: "Offline" });
}

function isScriptRequest(req) {
  const d = req.destination;
  return d === "script" || d === "worker" || d === "sharedworker" || d === "audioworklet";
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isNetworkOnly(url)) return;

  // A router/preload fetch of an app route (Accept: text/html) is a page load too:
  // offline it must get the shell, not fall to the runtime cache (#28).
  if (isPageRequest(req, url)) {
    event.respondWith(networkFirstPage(req));
    return;
  }

  if (precached.has(url.pathname)) {
    event.respondWith(cacheFirst(req, url.pathname));
    return;
  }

  if (isScriptRequest(req)) return;
  event.respondWith(staleWhileRevalidate(req));
});

async function networkFirstPage(req) {
  try {
    return await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), NAV_TIMEOUT_MS)),
    ]);
  } catch {
    return offlineFallback(req);
  }
}

async function cacheFirst(req, path) {
  const hit = await caches.match(path, { cacheName: CACHE });
  return hit ?? fetch(req).catch(() => offlineFallback(req));
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(req);
  const fetching = fetch(req)
    .then((fresh) => {
      if (fresh && fresh.ok) void cache.put(req, fresh.clone());
      return fresh;
    })
    .catch(() => hit ?? offlineFallback(req));
  return hit ?? fetching;
}
