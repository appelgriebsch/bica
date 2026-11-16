import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkBuiltSw } from "./sw-build-check.mjs";

async function fixture({ sw, files = {} }) {
  const dir = await mkdtemp(join(tmpdir(), "bica-swcheck-"));
  if (sw != null) await writeFile(join(dir, "sw.js"), sw);
  for (const [name, body] of Object.entries(files)) {
    await mkdir(join(dir, name, ".."), { recursive: true });
    await writeFile(join(dir, name), body);
  }
  return dir;
}

const GOOD = 'const VERSION = "0123456789abcdef";\nconst PRECACHE = ["/a.js", "/_shell"];\n';

test("accepts a built sw.js: 16-hex VERSION, non-empty PRECACHE, every URL on disk", async () => {
  const dir = await fixture({ sw: GOOD, files: { "a.js": "a", _shell: "<html></html>" } });
  try {
    const r = await checkBuiltSw(dir);
    assert.equal(r.version, "0123456789abcdef");
    assert.deepEqual(r.urls, ["/a.js", "/_shell"]);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("rejects the dev placeholder and non-16-hex versions", async () => {
  for (const v of ["dev", "abc", "0123456789abcdef0", "gggg6789abcdef0"]) {
    const dir = await fixture({
      sw: `const VERSION = "${v}";\nconst PRECACHE = ["/a.js"];\n`,
      files: { "a.js": "a" },
    });
    try {
      await assert.rejects(checkBuiltSw(dir), /VERSION/);
    } finally {
      await rm(dir, { recursive: true });
    }
  }
});

test("rejects an empty or uninjected PRECACHE", async () => {
  for (const [sw, re] of [
    ['const VERSION = "0123456789abcdef";\nconst PRECACHE = [];\n', /PRECACHE is empty/],
    ['const VERSION = "0123456789abcdef";\nconst PRECACHE = ["/a.js"];\n'.replace("PRECACHE", "PRECACHE_X"), /PRECACHE placeholder/],
  ]) {
    const dir = await fixture({ sw, files: { "a.js": "a" } });
    try {
      await assert.rejects(checkBuiltSw(dir), re);
    } finally {
      await rm(dir, { recursive: true });
    }
  }
});

test("rejects precached URLs missing from the output folder", async () => {
  const dir = await fixture({
    sw: 'const VERSION = "0123456789abcdef";\nconst PRECACHE = ["/a.js", "/gone.js"];\n',
    files: { "a.js": "a" },
  });
  try {
    await assert.rejects(checkBuiltSw(dir), /\/gone\.js/);
  } finally {
    await rm(dir, { recursive: true });
  }
});

test("rejects a missing sw.js", async () => {
  const dir = await fixture({ sw: null });
  try {
    await assert.rejects(checkBuiltSw(dir), /no built worker/);
  } finally {
    await rm(dir, { recursive: true });
  }
});
