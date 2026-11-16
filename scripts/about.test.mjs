import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { resolveBuildSha } from "./build-sha.mjs";
import { buildOutput } from "./build-output.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const about = readFileSync(join(root, "src/routes/about.tsx"), "utf8");

test("about page credits Grok for the icon and bakes the build SHA", () => {
  assert.match(about, /Created with Grok/);
  assert.match(about, /__BICA_BUILD_SHA__/);
  assert.match(about, /blob\/main\/LICENSE/);
  assert.match(about, /blob\/main\/THIRD-PARTY\.md/);
});

test("about page credits Mistral AI with its mark icon for the scenes and the Conversas replies (ADR 0006/0009)", () => {
  assert.match(about, /Scene illustrations: AI-generated with <MistralCredit \/>/);
  assert.match(about, /Conversas: Replies are AI-generated with <MistralCredit \/>/);
  assert.match(about, /src="\/brand\/mistral-mark\.svg"/);
  assert.match(about, />Mistral AI</);
  assert.ok(existsSync(join(root, "public/brand/mistral-mark.svg")), "public/brand/mistral-mark.svg ships");
});

test("about states what is counted: cookieless Cloudflare Web Analytics, production only (ADR 0011)", () => {
  assert.match(about, /What we count/);
  assert.match(about, /cookieless Cloudflare Web Analytics/);
  assert.match(about, /production site only/);
  assert.match(about, /no cookies/);
  assert.match(about, /not counted \(ADR 0011\)/);
});

test("me links to about", () => {
  const me = readFileSync(join(root, "src/routes/me.tsx"), "utf8");
  assert.match(me, /to="\/about"/);
});

test("about links back to You", () => {
  assert.match(about, /aria-label="Back to You"/);
  assert.match(about, /<Link to="\/me">/);
});

test("THIRD-PARTY.md names scenes, og.jpg, and the app mark with the right attributions", () => {
  const md = readFileSync(join(root, "THIRD-PARTY.md"), "utf8");
  const scenes = readdirSync(join(root, "public/scenes")).filter((f) => f.endsWith(".jpg"));
  assert.ok(scenes.length >= 20, String(scenes.length));
  const icons = readdirSync(join(root, "public"))
    .filter((f) => f.startsWith("icon-") && f.endsWith(".png"))
    .map((f) => `public/${f}`);
  const paths = [
    "public/og.jpg",
    "public/favicon.svg",
    "public/brand/mistral-mark.svg",
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
  // ADR 0009 / #102: the 20 scenes are Mistral-generated; og.jpg and the icon stay Grok-attributed.
  const shareCard = section("### Share card image");
  assert.match(shareCard, /Created with Grok/);
  assert.ok(!shareCard.includes("public/scenes/"), "scenes left the Grok section");
  const sceneSection = section("### Scene illustrations");
  assert.match(sceneSection, /Mistral AI/);
  assert.ok(!/Created with Grok/.test(sceneSection), "scenes are not Grok-attributed anymore");
  assert.match(section("### App icon and mark"), /Created with Grok/);
  assert.match(about, /app icon[\s\S]{0,120}Created with Grok/i);
});

test(
  "built JS has the injected SHA and precaches the about chunk",
  { skip: !process.env.BICA_BUILT && "set BICA_BUILT=1 after bun run build" },
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
    // Same resolver the build used. Holds when this process env matches the build env.
    const sha = resolveBuildSha();
    const quoted = [`"${sha}"`, `'${sha}'`, "`" + sha + "`"];
    assert.equal(
      js.some((f) => f.text.includes("__BICA_BUILD_SHA__")),
      false,
    );
    assert.ok(js.some((f) => quoted.some((q) => f.text.includes(q))));
    const chunk = js.find((f) => f.text.includes("Created with Grok"));
    assert.ok(chunk, "about chunk");
    assert.ok(urls.includes(chunk.url), chunk.url);
    assert.match(chunk.text, /Back to You/);
    assert.equal(chunk.text.includes("Export and import"), false);
  },
);
