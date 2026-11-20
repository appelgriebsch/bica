// WCAG AA contrast for theme tokens in src/styles.css, light and dark (#16).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function tokens(block) {
  const out = {};
  for (const [, name, hex] of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    out[name] = hex.toLowerCase();
  }
  return out;
}

const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
const darkMedia = css.match(/@media \(prefers-color-scheme: dark\)\s*\{([\s\S]*?)\n\}/);
// The dark overrides must live in exactly one :root block: a second block would
// silently win in the browser while this test only reads the first one.
assert.ok(darkMedia, "could not locate the dark prefers-color-scheme block");
assert.equal(
  (darkMedia[1].match(/:root\s*\{/g) ?? []).length,
  1,
  "expected exactly one :root block in the dark media query",
);
const darkBlock = darkMedia[1].match(/:root\s*\{([\s\S]*?)\}/);
assert.ok(themeBlock && darkBlock, "could not locate theme blocks in styles.css");
const light = tokens(themeBlock[1]);
const dark = { ...light, ...tokens(darkBlock[1]) };

export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Composite a foreground drawn at opacity `a` over a solid background (sRGB).
export function alpha(fg, bg, a) {
  const ch = (h, i) => parseInt(h.slice(i, i + 2), 16);
  return (
    "#" +
    [1, 3, 5]
      .map((i) =>
        Math.round(a * ch(fg, i) + (1 - a) * ch(bg, i))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
  );
}

const PAGE = ["bg", "surface", "surface-2"];
const TEXT = 4.5;
const UI = 3;
// [foreground, background, minimum]: pairs actually used in src/.
const PAIRS = [
  ...["fg", "muted", "subtle", "accent", "success", "danger", "warn"].flatMap((fg) =>
    PAGE.map((bg) => [fg, bg, TEXT]),
  ),
  ["fg", "soft", TEXT],
  ["muted", "soft", TEXT], // voice-notice hint
  ["accent", "soft", TEXT], // active nav tab (app-shell)
  ["accent-fg", "accent", TEXT],
  ["accent-fg", "accent", UI], // #158 Cloud badge on accent cards (text-muted is ~1.2:1)
  ["accent-fg", "tile", TEXT],
  ["success-fg", "success", TEXT],
  ["danger-fg", "danger", TEXT],
  // UI components / large text
  ...PAGE.map((bg) => ["accent", bg, UI]),
  ["tile", "bg", UI],
];

// #150 disabled-state pairs: every button variant's disabled label on its disabled
// background, the empty ghost Send glyph on bg-bg, and the OnlineOnly badge Cloud on bg-bg.
const DISABLED_PAIRS = [
  ["subtle", "surface-2", TEXT],
  ["subtle", "bg", TEXT],
  ["muted", "bg", TEXT],
];

// [foreground, opacity, background, minimum]: every text-*/NN on a solid fill in src/.
// Also pins the aria-disabled glyph pairs (#129 M1): the separate opacity-60 class is
// not scanned above, so the disabled play/snail glyphs are asserted here at UI 3:1.
const ALPHA_PAIRS = [
  ["accent-fg", 0.8, "accent", TEXT], // practice, review, index, lesson-player small text
  ["accent-fg", 0.7, "accent", UI], // practice.tsx Speak card icon ([&>svg]:text-accent-fg/70)
  ["tile", 0.6, "bg", UI], // no-voice SpeakButton glyphs on every default-tone surface
  ["tile", 0.6, "surface", UI],
  ["tile", 0.6, "surface-2", UI],
  ["tile", 0.6, "soft", UI], // "You" dialogue bubbles
  ["accent-fg", 0.6, "accent", UI], // no-voice onAccent (lesson intro) pair
  ["fg", 0.6, "surface", UI], // quiz "Play the line" pair when no voice
];

// `text-*/NN` and the bracket form `text-*/[0.7]`. A separate `opacity-NN` class
// is only used on disabled and hover states, which WCAG exempts, so it is not scanned.
const TEXT_OPACITY = /(\]:)?text-([a-z0-9-]+)\/(\d+|\[[\d.]+\])(?!\w)/g;

function textOpacities(src) {
  return [...src.matchAll(TEXT_OPACITY)].map((m) => {
    const [, icon, fg, raw] = m;
    const a = raw.startsWith("[") ? Number(raw.slice(1, -1)) : Number(raw) / 100;
    return { icon: Boolean(icon), fg, a, raw: m[0] };
  });
}

test("every text-*/NN opacity class in src/ is covered by ALPHA_PAIRS", () => {
  assert.deepEqual(textOpacities("text-accent-fg/[0.7]"), [
    { icon: false, fg: "accent-fg", a: 0.7, raw: "text-accent-fg/[0.7]" },
  ]);
  assert.deepEqual(textOpacities("[&>svg]:text-accent-fg/70"), [
    { icon: true, fg: "accent-fg", a: 0.7, raw: "]:text-accent-fg/70" },
  ]);
  const root = new URL("../src/", import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter((f) => /\.(tsx?|css)$/.test(f));
  const missing = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, root), "utf8");
    for (const hit of textOpacities(src)) {
      // Arbitrary-variant classes (e.g. [&>svg]:text-x/70) style icons: UI 3:1.
      const min = hit.icon ? UI : TEXT;
      if (!ALPHA_PAIRS.some(([f2, a2, , m2]) => f2 === hit.fg && a2 === hit.a && m2 >= min)) {
        missing.push(`${f}: ${hit.raw}`);
      }
    }
  }
  assert.deepEqual(missing, [], "add these to ALPHA_PAIRS with their background");
});

test("alpha() composites like the browser", () => {
  assert.equal(alpha("#ffffff", "#000000", 0.5), "#808080");
  assert.equal(alpha("#123456", "#abcdef", 1), "#123456");
});

test("contrast() matches WCAG reference values", () => {
  assert.equal(contrast("#000000", "#ffffff").toFixed(2), "21.00");
  assert.equal(contrast("#777777", "#ffffff").toFixed(2), "4.48");
  assert.equal(contrast("#948c82", "#f3eee6").toFixed(2), "2.87"); // ticket's old value
});

// #158 m3: Practice and Scene draw the corner Cloud on bg-accent. The old
// text-muted pair is about 1.21:1 light and 1.02:1 dark, under the 3:1 UI bar.
test("corner Cloud on accent cards is accent-fg, and text-muted fails 3:1 (#158)", () => {
  const online = readFileSync(new URL("../src/components/online-only.tsx", import.meta.url), "utf8");
  const practice = readFileSync(new URL("../src/routes/practice.tsx", import.meta.url), "utf8");
  const scene = readFileSync(new URL("../src/routes/scene/$id.tsx", import.meta.url), "utf8");
  assert.match(online, /onAccent \? "text-accent-fg" : "text-muted"/);
  assert.match(practice, /placement="corner" onAccent/);
  assert.match(scene, /placement="corner" onAccent/);
  for (const [theme, t] of [
    ["light", light],
    ["dark", dark],
  ]) {
    const used = contrast(t["accent-fg"], t.accent);
    assert.ok(used >= UI, `${theme} accent-fg on accent is ${used.toFixed(2)}:1`);
    const old = contrast(t.muted, t.accent);
    assert.ok(
      old < UI,
      `${theme} text-muted on accent is ${old.toFixed(2)}:1; the old badge pair must fail`,
    );
  }
});

for (const [theme, t] of [
  ["light", light],
  ["dark", dark],
]) {
  for (const [fg, bg, min] of [...PAIRS, ...DISABLED_PAIRS]) {
    test(`${theme}: ${fg} on ${bg} >= ${min}:1`, () => {
      assert.ok(t[fg] && t[bg], `missing token ${fg} or ${bg} in ${theme}`);
      const ratio = contrast(t[fg], t[bg]);
      assert.ok(ratio >= min, `${theme} ${fg} ${t[fg]} on ${bg} ${t[bg]} is ${ratio.toFixed(2)}:1`);
    });
  }
  for (const [fg, a, bg, min] of ALPHA_PAIRS) {
    test(`${theme}: ${fg}/${a * 100} on ${bg} >= ${min}:1`, () => {
      const ratio = contrast(alpha(t[fg], t[bg], a), t[bg]);
      assert.ok(ratio >= min, `${theme} ${fg}/${a * 100} on ${bg} is ${ratio.toFixed(2)}:1`);
    });
  }
}
