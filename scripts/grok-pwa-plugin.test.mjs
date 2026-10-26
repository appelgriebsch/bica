import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  appNameFromHost,
  createHeadInjector,
  grokPwaHeadTags,
  grokXCreatorHeadTags,
  injectGrokPwaHead,
  isDocumentPath,
  isInstallQuery,
  renderWebManifest,
  resolvePublicHost,
  stripInstallParams,
} from "./grok-pwa-shared.mjs";
import { renderInstallPage } from "./grok-pwa-plugin.mjs";
import { buildOutput } from "./build-output.mjs";
import { APP_NAME } from "../src/lib/app-name.mjs";

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

test("injects before </head>", () => {
  const out = injectGrokPwaHead("<html><head><title>x</title></head><body></body></html>");
  assert.match(out, /rel="manifest"/);
  assert.match(out, /rel="apple-touch-icon" href="\/icon-180\.png" sizes="180x180"/);
  assert.doesNotMatch(out, /__grok\/icon/);
  assert.match(out, /grok-app-builder\/extensions\.js/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
});

const bareSite = { site: {} };

test("injects the extensions script without a project id", () => {
  const out = injectGrokPwaHead("<html><head></head></html>", {
    ...bareSite,
    appName: "Demo",
    projectId: "",
  });
  assert.match(out, /src="https:\/\/grok\.com\/grok-app-builder\/extensions\.js" defer/);
  assert.doesNotMatch(out, /grok-project-id/);
  assert.doesNotMatch(out, /data-project-id/);
  assert.doesNotMatch(out, /property="grok:app_id"/);
});

test("injects project id on the script and meta when provided", () => {
  const out = injectGrokPwaHead("<html><head></head></html>", {
    ...bareSite,
    appName: "Demo",
    projectId: "proj-123",
  });
  assert.match(out, /name="grok-project-id" content="proj-123"/);
  assert.match(out, /data-project-id="proj-123"/);
  assert.match(out, /property="grok:app_id" content="proj-123"/);
});

test("does not duplicate grok:app_id", () => {
  const ctx = { ...bareSite, appName: "Demo", projectId: "proj-123" };
  const once = injectGrokPwaHead("<html><head></head></html>", ctx);
  const twice = injectGrokPwaHead(once, ctx);
  assert.equal(once, twice);
  assert.equal(twice.split('property="grok:app_id"').length - 1, 1);
});

test("omits x:creator tags without both creator values", () => {
  assert.deepEqual(grokXCreatorHeadTags("", "42"), []);
  assert.deepEqual(grokXCreatorHeadTags("@alice", ""), []);
  const out = injectGrokPwaHead("<html><head></head></html>", {
    ...bareSite,
    appName: "Demo",
    projectId: "",
    creator: "@alice",
    creatorId: "",
  });
  assert.doesNotMatch(out, /property="x:creator"/);
});

test("injects x:creator tags when both creator values are set", () => {
  const out = injectGrokPwaHead("<html><head></head></html>", {
    ...bareSite,
    appName: "Demo",
    projectId: "",
    creator: "@alice",
    creatorId: "42",
  });
  assert.match(out, /property="x:creator" content="@alice"/);
  assert.match(out, /property="x:creator:id" content="42"/);
});

test("escapes x:creator values", () => {
  const tags = grokXCreatorHeadTags('"><script>', '1" onclick="alert(1)');
  assert.equal(tags[0], '<meta property="x:creator" content="&quot;&gt;&lt;script&gt;">');
  assert.equal(tags[1], '<meta property="x:creator:id" content="1&quot; onclick=&quot;alert(1)">');
});

test("does not duplicate x:creator tags", () => {
  const ctx = {
    ...bareSite,
    appName: "Demo",
    projectId: "",
    creator: "@alice",
    creatorId: "42",
  };
  const once = injectGrokPwaHead("<html><head></head></html>", ctx);
  const twice = injectGrokPwaHead(once, ctx);
  assert.equal(once, twice);
  assert.equal(twice.split('property="x:creator" content=').length - 1, 1);
  assert.equal(twice.split('property="x:creator:id"').length - 1, 1);
});

test("platform chrome injects twitter:card when the document has none", () => {
  const out = injectGrokPwaHead("<html><head><title>Hello World</title></head></html>");
  assert.match(out, /name="twitter:card" content="summary_large_image"/);
  assert.match(out, /property="og:title"/);
});

test("does not duplicate twitter:card", () => {
  const once = injectGrokPwaHead("<html><head><title>Hello World</title></head></html>");
  const twice = injectGrokPwaHead(once);
  assert.equal(once, twice);
  assert.equal(twice.split('name="twitter:card"').length - 1, 1);
});

test("replaces a non-large twitter:card with the platform card", () => {
  const html = '<html><head><meta name="twitter:card" content="summary"></head></html>';
  const out = injectGrokPwaHead(html, { ...bareSite, appName: "Wild Race" });
  assert.match(out, /name="twitter:card" content="summary_large_image"/);
  assert.doesNotMatch(out, /content="summary"/);
  assert.equal(out.split('name="twitter:card"').length - 1, 1);
});

test("#62: strips only the share keys the middleware re-adds", () => {
  const host = "share.example";
  const html = [
    "<html><head>",
    '<meta name="twitter:card" content="summary_large_image"/>',
    '<meta property="og:type" content="website"/>',
    '<meta property="og:image" content="https://doc.example/og.jpg"/>',
    '<meta name="twitter:image" content="https://doc.example/og.jpg"/>',
    '<meta name="twitter:title" content="Doc"/>',
    '<meta property="x:game:image" content="https://og.grok.me/v1/banner.png?host=doc.example"/>',
    '<meta property="x:game:image:width" content="1200"/>',
    '<meta property="x:game:image:height" content="264"/>',
    '<meta property="og:image:alt" content="Alt"/>',
    "</head></html>",
  ].join("");
  const contents = (doc, key) => {
    const found = [];
    for (const tag of doc.match(/<meta\b[^>]*>/gi) ?? []) {
      const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      if (name !== key) continue;
      found.push(tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? "");
    }
    return found;
  };
  const out = injectGrokPwaHead(html, { ...bareSite, host });
  for (const key of [
    "twitter:card",
    "og:type",
    "og:image",
    "twitter:image",
    "twitter:title",
    "x:game:image",
    "x:game:image:width",
    "x:game:image:height",
    "og:image:alt",
  ]) {
    assert.equal(contents(out, key).length, 1, key);
  }
  assert.equal(contents(out, "og:image")[0], `https://${host}/og.jpg`);
  assert.equal(contents(out, "twitter:image")[0], "https://doc.example/og.jpg");
  assert.equal(contents(out, "twitter:title")[0], "Doc");
  assert.equal(contents(out, "og:type")[0], "website");
  assert.equal(contents(out, "x:game:image")[0], "https://og.grok.me/v1/banner.png?host=doc.example");
  assert.equal(contents(out, "x:game:image:width")[0], "1200");
  assert.equal(contents(out, "x:game:image:height")[0], "264");

  const banner = injectGrokPwaHead(html, { site: { banner: "/x-banner.jpg" }, host });
  assert.deepEqual(contents(banner, "x:game:image"), [`https://${host}/x-banner.jpg`]);

  const game = injectGrokPwaHead(html, { site: { type: "x:game" }, host });
  assert.deepEqual(contents(game, "og:type"), ["x:game"]);
});

test("does not duplicate the extensions script", () => {
  const ctx = { ...bareSite, appName: "Demo", projectId: "proj-123" };
  const once = injectGrokPwaHead("<html><head></head></html>", ctx);
  const twice = injectGrokPwaHead(once, ctx);
  assert.equal(once, twice);
  assert.equal(twice.split("extensions.js").length - 1, 1);
});

test("is idempotent", () => {
  const once = injectGrokPwaHead("<html><head></head></html>");
  const twice = injectGrokPwaHead(once);
  assert.equal(once, twice);
});

test("uses the app name in the injected title tag", () => {
  const out = injectGrokPwaHead("<html><head></head></html>", {
    ...bareSite,
    appName: "Wild Race",
  });
  assert.match(out, /apple-mobile-web-app-title" content="Wild Race"/);
});

test("streaming injector handles </head> split across chunks", () => {
  const injector = createHeadInjector("Wild Race");
  const chunks = [
    ...injector.push("<html><head><title>x</title></he"),
    ...injector.push("ad><body>hello</body></html>"),
  ];
  const out = Buffer.concat(chunks).toString("utf8");
  assert.match(out, /rel="manifest"/);
  assert.ok(out.indexOf("manifest") < out.indexOf("</head>"));
  assert.match(out, /<body>hello<\/body>/);
  assert.deepEqual(injector.flush(), []);
});

test("streaming injector passes post-head chunks through untouched", () => {
  const injector = createHeadInjector();
  injector.push("<html><head></head>");
  const [tail] = injector.push("<body>tail</body>");
  assert.equal(tail.toString("utf8"), "<body>tail</body>");
});

test("streaming injector falls back when no </head> is seen", () => {
  const injector = createHeadInjector();
  assert.deepEqual(injector.push("<html><head>"), []);
  const out = Buffer.concat(injector.flush()).toString("utf8");
  assert.match(out, /rel="manifest"/);
});

test("detects install query", () => {
  assert.equal(isInstallQuery("/?install=1&platform=ios"), true);
  assert.equal(isInstallQuery("/app?foo=1&install=true&platform=ios"), true);
  assert.equal(isInstallQuery("/?install=1"), false);
  assert.equal(isInstallQuery("/?install=1&platform=android"), false);
  assert.equal(isInstallQuery("/?install=0&platform=ios"), false);
  assert.equal(isInstallQuery("/"), false);
});

test("filters non-document paths", () => {
  assert.equal(isDocumentPath("/"), true);
  assert.equal(isDocumentPath("/app"), true);
  assert.equal(isDocumentPath("/api/thing"), false);
  assert.equal(isDocumentPath("/auth/popup"), true);
  assert.equal(isDocumentPath("/__grok/install/styles.css"), false);
  assert.equal(isDocumentPath("/logo.png"), false);
});

test("strips install params from the app link", () => {
  assert.equal(stripInstallParams("/?install=1&platform=ios"), "/");
  assert.equal(stripInstallParams("/app?install=1&platform=ios&tab=2"), "/app?tab=2");
});

test("names the install page from host slug", () => {
  assert.equal(appNameFromHost("localhost:8080"), "Grok App");
  assert.equal(appNameFromHost("172.17.154.217:8080"), "Grok App");
  assert.equal(appNameFromHost("wild-race.grok.me"), "Wild Race");
});

test("rejects hosts that are not plain slugs", () => {
  assert.equal(appNameFromHost("<script>alert(1)</script>"), "Grok App");
  assert.equal(appNameFromHost('"><img src=x onerror=1>.grok.me'), "Grok App");
});

test("renders install page markup", () => {
  const html = renderInstallPage("wild-race.grok.me", "/?install=1&platform=ios");
  assert.match(html, /Add Wild Race to your/);
  assert.match(html, /\/__grok\/install\/styles\.css/);
  assert.match(html, /href="\/"/);
  assert.equal(html.includes("{{APP_NAME}}"), false);
  assert.equal(html.includes("{{APP_URL}}"), false);
});

test("escapes host-derived values in the install page", () => {
  const html = renderInstallPage("<script>alert(1)</script>", "/?install=1&platform=ios");
  assert.equal(html.includes("<script>alert(1)</script>"), false);
});

test("#51: PUBLIC_HOSTNAME wins over the request host; manifest id uses it", () => {
  assert.equal(
    resolvePublicHost("evil.example", {
      workerEnv: "bica.appelgriebsch.org",
      processEnv: "other.example",
    }),
    "bica.appelgriebsch.org",
  );
  assert.equal(
    resolvePublicHost("evil.example", {
      workerEnv: " ",
      processEnv: "bica-staging.appelgriebsch.workers.dev",
    }),
    "bica-staging.appelgriebsch.workers.dev",
  );
  assert.equal(resolvePublicHost("evil.example", { workerEnv: "localhost" }), "evil.example");
  assert.equal(resolvePublicHost("127.0.0.1", {}), "");
  const manifest = JSON.parse(renderWebManifest("wild-race.grok.me"));
  const host = resolvePublicHost("wild-race.grok.me");
  assert.equal(manifest.id, host ? `https://${host}/` : "/");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
});

test("renders the manifest with the per-app name", () => {
  const manifest = JSON.parse(renderWebManifest("wild-race.grok.me"));
  assert.equal(manifest.name, "Wild Race");
  assert.equal(manifest.short_name, "Wild Race");
  assert.deepEqual(manifest.icons, [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    {
      src: "/icon-maskable-512.png",
      sizes: "512x512",
      type: "image/png",
      purpose: "maskable",
    },
    { src: "/icon-180.png", sizes: "180x180", type: "image/png" },
  ]);
  assert.equal(manifest.background_color, "#f3eee6");
  assert.equal(manifest.theme_color, "#1E4D73");
});

test("theme-color fallback is the light/dark pair, and a present pair is left alone", () => {
  const tags = grokPwaHeadTags()
    .map(([, tag]) => tag)
    .join("");
  assert.doesNotMatch(tags, /#000000/);
  assert.match(tags, /content="#1E4D73" media="\(prefers-color-scheme: light\)"/);
  assert.match(tags, /content="#141922" media="\(prefers-color-scheme: dark\)"/);
  const pair =
    '<html><head><meta name="theme-color" content="#1E4D73" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#141922" media="(prefers-color-scheme: dark)"></head></html>';
  const out = injectGrokPwaHead(pair, bareSite);
  assert.equal(out.match(/name="theme-color"/g).length, 2);
  assert.doesNotMatch(out, /content="#000000"/);
});

test("head, manifest and install page use Bica icons, never the grok placeholder", () => {
  assert.equal(existsSync(join(TEMPLATE_ROOT, "public/__grok/icon-180.png")), false);
  const shared = readFileSync(join(TEMPLATE_ROOT, "scripts/grok-pwa-shared.mjs"), "utf8");
  const install = readFileSync(join(TEMPLATE_ROOT, "scripts/install-page.html"), "utf8");
  const root = readFileSync(join(TEMPLATE_ROOT, "src/routes/__root.tsx"), "utf8");
  for (const text of [shared, install, root]) assert.doesNotMatch(text, /__grok\/icon/);
  assert.match(install, /rel="apple-touch-icon" href="\/icon-180\.png"/);
  const present =
    '<html><head><link rel="apple-touch-icon" href="/icon-180.png" sizes="180x180"></head></html>';
  const out = injectGrokPwaHead(present, bareSite);
  assert.equal(out.match(/rel="apple-touch-icon"/g).length, 1);
  assert.doesNotMatch(out, /__grok\/icon/);
});

test(
  "built manifest and html reference only Bica icons",
  { skip: !process.env.BICA_BUILT && "set BICA_BUILT=1 after npm run build" },
  () => {
    const { publicDir, serverEntry } = buildOutput();
    const roots = [join(TEMPLATE_ROOT, publicDir), join(TEMPLATE_ROOT, dirname(serverEntry))];
    let manifest = "";
    const pages = [];
    for (const dir of roots) {
      for (const f of readdirSync(dir, { recursive: true, withFileTypes: true })) {
        if (!f.isFile()) continue;
        const abs = join(f.parentPath, f.name);
        assert.equal(abs.endsWith(`${sep}__grok${sep}icon-180.png`), false, abs);
        if (!/\.(m?js|html|css|json|webmanifest)$/.test(f.name) && f.name !== "_shell") continue;
        const text = readFileSync(abs, "utf8");
        const rel = relative(TEMPLATE_ROOT, abs);
        assert.equal(text.includes("/__grok/icon"), false, rel);
        if (/purpose:\s*"maskable"/.test(text)) manifest = text;
        if (f.name === "_shell" || f.name.endsWith(".html")) pages.push([rel, text]);
      }
    }
    assert.match(manifest, /\/icon-192\.png/);
    assert.match(manifest, /\/icon-512\.png/);
    assert.match(manifest, /\/icon-maskable-512\.png/);
    assert.ok(pages.length > 0, "built html");
    for (const [rel, page] of pages) {
      assert.equal(page.match(/rel="apple-touch-icon"/g)?.length ?? 0, 1, rel);
      assert.match(page, /href="\/icon-180\.png"/);
      assert.match(page, /href="\/favicon\.svg"/);
    }
  },
);

test("#28: the configured app name wins on workers.dev and custom hosts", () => {
  assert.equal(APP_NAME, "Bica");
  for (const host of [
    "bica-staging.appelgriebsch.workers.dev",
    "bica.example.pt",
    "wild-race.grok.me",
  ]) {
    const manifest = JSON.parse(renderWebManifest(host, APP_NAME));
    assert.equal(manifest.name, "Bica", host);
    assert.equal(manifest.short_name, "Bica", host);
  }
  assert.match(
    renderInstallPage("bica.example.pt", "/?install=1&platform=ios", APP_NAME),
    /Add Bica to your/,
  );
});

test("#28: the deployed middleware passes APP_NAME to the manifest, install page and head", () => {
  const middleware = readFileSync(join(TEMPLATE_ROOT, "server/middleware/grok-pwa.ts"), "utf8");
  assert.match(middleware, /renderWebManifest\(requestHost\(event\), APP_NAME\)/);
  assert.equal(middleware.match(/appName: APP_NAME/g)?.length, 2);
});

test("#28: the injected extensions.js carries the CSP nonce", () => {
  const html = "<html><head><title>Bica</title></head><body></body></html>";
  const out = injectGrokPwaHead(html, { ...bareSite, nonce: "abc+/=" });
  assert.match(out, /<script src="[^"]*extensions\.js" nonce="abc\+\/=" defer><\/script>/);
  assert.doesNotMatch(injectGrokPwaHead(html, bareSite), /nonce=/);
  const injector = createHeadInjector({ ...bareSite, nonce: "n1" });
  const streamed = Buffer.concat([...injector.push(html), ...injector.flush()]).toString();
  assert.match(streamed, /extensions\.js" nonce="n1"/);
});

test("#28: a configured name keeps exactly one apple-mobile-web-app-title", () => {
  const html =
    '<html><head><title>Bica</title><meta name="apple-mobile-web-app-title" content="Bica"/></head></html>';
  const out = injectGrokPwaHead(html, { ...bareSite, appName: APP_NAME });
  assert.equal(out.match(/apple-mobile-web-app-title/g).length, 1);
  assert.doesNotMatch(out, /Grok App/);
});

// Tripwires: the deployed-app path only works if Nitro scans server/ — an
// accidental edit that drops serverDir or the middleware file would otherwise
// fail silently (published apps would just render the app for ?install=1).
test("vite config keeps the nitro serverDir wiring", () => {
  const viteConfig = readFileSync(join(TEMPLATE_ROOT, "vite.config.ts"), "utf8");
  assert.match(viteConfig, /serverDir:\s*"\.\/server"/);
  // #28: the configured name, never the host-derived "Grok App".
  assert.match(viteConfig, /grokPwaPlugin\(\{ appName: APP_NAME \}\)/);
});

test("nitro middleware and its bundled assets exist", () => {
  const middleware = readFileSync(join(TEMPLATE_ROOT, "server/middleware/grok-pwa.ts"), "utf8");
  assert.match(middleware, /install-page\.html\?raw/);
  readFileSync(join(TEMPLATE_ROOT, "scripts/install-page.html"));
  readFileSync(join(TEMPLATE_ROOT, "public/__grok/install/styles.css"));
});
