import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { collectPrecache, injectManifest, SHELL } from "./precache.mjs";

async function fakeBuild() {
  const dir = await mkdtemp(join(tmpdir(), "bica-precache-"));
  const files = {
    "_shell.html": "<html>shell</html>",
    "sw.js": "worker",
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

test("manifest lists shell, every chunk and scene; skips sw.js and __grok", async () => {
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
    assert.ok(!urls.some((u) => u.startsWith("/__grok/")));
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
    assert.notEqual((await collectPrecache(dir)).version, a);
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
  { skip: !process.env.BICA_BUILT && "set BICA_BUILT=1 after npm run build" },
  async () => {
    const root = new URL("../.vercel/output/static/", import.meta.url);
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
