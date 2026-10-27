import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildOutput } from "./build-output.mjs";
import { assertManifest, collectPrecache, injectManifest, SHELL } from "./precache.mjs";

const precacheCli = fileURLToPath(new URL("./precache.mjs", import.meta.url));

async function fakeBuild() {
  const dir = await mkdtemp(join(tmpdir(), "bica-precache-"));
  const files = {
    _shell: "<html>shell</html>",
    "sw.js": "worker",
    _headers: "/assets/*",
    "og.jpg": "og",
    "assets/lesson-player-abc.js": "lesson",
    "assets/grammar-def.js": "grammar",
    "assets/styles-1.css": "css",
    "scenes/cafe.jpg": "cafe",
    "scenes/tram.jpg": "tram",
    "__grok/install/styles.css": "tutorial",
  };
  for (const [name, body] of Object.entries(files)) {
    await mkdir(join(dir, name, ".."), { recursive: true });
    await writeFile(join(dir, name), body);
  }
  return dir;
}

test("manifest lists shell, every chunk and scene; skips sw.js, _headers and __grok", async () => {
  const dir = await fakeBuild();
  try {
    const { urls } = await collectPrecache(dir);
    for (const u of [
      SHELL,
      "/og.jpg",
      "/assets/lesson-player-abc.js",
      "/assets/grammar-def.js",
      "/assets/styles-1.css",
      "/scenes/cafe.jpg",
      "/scenes/tram.jpg",
    ]) {
      assert.ok(urls.includes(u), u);
    }
    assert.ok(!urls.includes("/sw.js"));
    assert.ok(!urls.includes("/_headers"));
    assert.ok(urls.includes("/__grok/manifest.webmanifest"));
    assert.ok(!urls.some((u) => u.startsWith("/__grok/") && u !== "/__grok/manifest.webmanifest"));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("version changes when any asset changes", async () => {
  const dir = await fakeBuild();
  try {
    const a = (await collectPrecache(dir)).version;
    assert.equal((await collectPrecache(dir)).version, a);
    await writeFile(join(dir, "scenes/cafe.jpg"), "cafe2");
    const changed = (await collectPrecache(dir)).version;
    assert.notEqual(changed, a);
    assert.notEqual((await collectPrecache(dir, "not the manifest")).version, changed);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("injects into the real sw.js placeholders", async () => {
  const sw = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
  const out = injectManifest(sw, { urls: ["/a.js"], version: "v1" });
  assert.match(out, /const VERSION = "v1";/);
  assert.match(out, /const PRECACHE = \["\/a\.js"\];/);
  assert.throws(() => injectManifest("nothing here", { urls: ["/a.js"], version: "v1" }));
});

test(
  "the built worker precaches every scene and route chunk",
  { skip: !process.env.BICA_BUILT && "set BICA_BUILT=1 after bun run build" },
  async () => {
    const root = new URL(`../${buildOutput().publicDir}/`, import.meta.url);
    const sw = await readFile(new URL("sw.js", root), "utf8");
    const urls = JSON.parse(sw.match(/const PRECACHE = (\[.*\]);/)[1]);
    const { urls: onDisk } = await collectPrecache(root.pathname);
    assert.deepEqual(urls, onDisk);
    assert.equal(urls.filter((u) => u.startsWith("/scenes/")).length, 20);
    for (const chunk of ["lesson-player-", "grammar-", "review-", "me-", "path-"]) {
      assert.ok(
        urls.some((u) => u.startsWith("/assets/" + chunk) && u.endsWith(".js")),
        chunk,
      );
    }
    assert.ok(urls.includes(SHELL));
  },
);

test("an empty or asset-less output folder fails the build", async () => {
  const dir = await mkdtemp(join(tmpdir(), "bica-empty-"));
  try {
    assert.throws(() => assertManifest({ urls: [] }), /no build assets/);
    assert.throws(() => assertManifest({ urls: ["/og.jpg", SHELL] }), /no build assets/);
    assert.throws(() => assertManifest({ urls: ["/assets/a.js"] }), /no build assets/);
    assert.doesNotThrow(() => assertManifest({ urls: ["/assets/a.js", SHELL] }));
    const empty = await collectPrecache(dir);
    assert.throws(() => assertManifest(empty));
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("cloudflare-module output paths", () => {
  assert.equal(buildOutput("cloudflare-module").publicDir, ".output/public");
});

test("unknown Nitro preset has no output paths", () => {
  assert.throws(() => buildOutput("cloudflare_module"), /no output paths/);
});

test("shell path has no .html (Workers auto-trailing-slash would redirect it)", () => {
  assert.ok(!SHELL.endsWith(".html"));
});

/** Tiny build output the CLI hashes. The server stub ignores the host; the manifest does not. */
async function cliFixture() {
  const cwd = await mkdtemp(join(tmpdir(), "bica-precache-cli-"));
  const pub = join(cwd, buildOutput().publicDir);
  const serverEntry = join(cwd, buildOutput().serverEntry);
  await mkdir(join(pub, "assets"), { recursive: true });
  await mkdir(join(serverEntry, ".."), { recursive: true });
  await writeFile(join(pub, "assets/app.js"), "app");
  await writeFile(join(pub, "sw.js"), 'const VERSION = "dev";\nconst PRECACHE = [];\n');
  await writeFile(
    serverEntry,
    "export default { fetch() { return new Response('<html>shell</html>', { status: 200 }); } };\n",
  );
  return cwd;
}

test("CLI hashes a host-free manifest", async () => {
  const dirs = [];
  try {
    const versions = [];
    const sws = [];
    for (const host of [undefined, "bica.appelgriebsch.org"]) {
      const cwd = await cliFixture();
      dirs.push(cwd);
      const env = { ...process.env };
      if (host === undefined) delete env.PUBLIC_HOSTNAME;
      else env.PUBLIC_HOSTNAME = host;
      const run = spawnSync(process.execPath, [precacheCli], { cwd, env, encoding: "utf8" });
      assert.equal(run.status, 0, run.stderr || run.stdout);
      const sw = await readFile(join(cwd, buildOutput().publicDir, "sw.js"), "utf8");
      sws.push(sw);
      versions.push(sw.match(/const VERSION = "([0-9a-f]{16})";/)[1]);
    }
    assert.equal(versions[0], versions[1]);
    assert.equal(sws[0], sws[1]);
  } finally {
    await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
  }
});
