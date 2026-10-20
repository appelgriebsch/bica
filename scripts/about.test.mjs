import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { buildOutput } from "./build-output.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const about = readFileSync(join(root, "src/routes/about.tsx"), "utf8");

test("about page credits Grok and bakes the build SHA", () => {
  assert.match(about, /Created with Grok/);
  assert.match(about, /__BICA_BUILD_SHA__/);
  assert.match(about, /blob\/main\/LICENSE/);
  assert.match(about, /blob\/main\/THIRD-PARTY\.md/);
});

test("me links to about", () => {
  const me = readFileSync(join(root, "src/routes/me.tsx"), "utf8");
  assert.match(me, /to="\/about"/);
});

test("THIRD-PARTY.md names scenes, og.jpg, and the app mark", () => {
  const md = readFileSync(join(root, "THIRD-PARTY.md"), "utf8");
  const scenes = readdirSync(join(root, "public/scenes")).filter((f) => f.endsWith(".jpg"));
  assert.ok(scenes.length >= 20, String(scenes.length));
  const icons = readdirSync(join(root, "public"))
    .filter((f) => f.startsWith("icon-") && f.endsWith(".png"))
    .map((f) => `public/${f}`);
  const paths = [
    "public/og.jpg",
    "public/favicon.svg",
    "src/components/azulejo-mark.tsx",
    ...scenes.map((f) => `public/scenes/${f}`),
    ...icons,
  ];
  assert.ok(icons.length >= 4, String(icons.length));
  assert.deepEqual(
    paths.filter((p) => !md.includes(`\`${p}\``)),
    [],
  );
  const section = (heading) => md.split(heading)[1]?.split("\n### ")[0] ?? "";
  assert.match(section("### Images"), /Created with Grok/);
  assert.match(section("### App icon and mark"), /Created with Grok/);
  assert.match(about, /app icon:[\s\S]{0,80}Created with Grok/);
});

test(
  "built JS has the injected SHA and precaches the about chunk",
  { skip: !process.env.BICA_BUILT && "set BICA_BUILT=1 after npm run build" },
  () => {
    const dir = join(root, buildOutput().publicDir);
    const sw = readFileSync(join(dir, "sw.js"), "utf8");
    const urls = JSON.parse(sw.match(/const PRECACHE = (\[.*\]);/)[1]);
    const js = readdirSync(dir, { recursive: true, withFileTypes: true })
      .filter((f) => f.isFile() && f.name.endsWith(".js"))
      .map((f) => {
        const abs = join(f.parentPath, f.name);
        return {
          url: "/" + relative(dir, abs),
          text: readFileSync(abs, "utf8"),
        };
      });
    let sha;
    try {
      sha = execFileSync("git", ["rev-parse", "HEAD"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      })
        .trim()
        .slice(0, 7);
    } catch {
      sha = (process.env.GITHUB_SHA ?? "").trim().slice(0, 7);
    }
    const quoted = [`"${sha}"`, `'${sha}'`, "`" + sha + "`"];
    assert.equal(
      js.some((f) => f.text.includes("__BICA_BUILD_SHA__")),
      false,
    );
    assert.ok(js.some((f) => quoted.some((q) => f.text.includes(q))));
    const chunk = js.find((f) => f.text.includes("Created with Grok"));
    assert.ok(chunk, "about chunk");
    assert.ok(urls.includes(chunk.url), chunk.url);
  },
);
