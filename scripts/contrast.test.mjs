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
  ["accent-fg", "tile", TEXT],
  ["success-fg", "success", TEXT],
  ["danger-fg", "danger", TEXT],
  // UI components / large text
  ...PAGE.map((bg) => ["accent", bg, UI]),
  ["tile", "bg", UI],
];

// [foreground, opacity, background, minimum]: every text-*/NN on a solid fill in src/.
const ALPHA_PAIRS = [
  ["accent-fg", 0.8, "accent", TEXT], // practice, review, index, lesson-player small text
  ["accent-fg", 0.7, "accent", UI], // practice.tsx Speak card icon ([&>svg]:text-accent-fg/70)
];

test("every text-*/NN opacity class in src/ is covered by ALPHA_PAIRS", () => {
  const root = new URL("../src/", import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter((f) => /\.(tsx?|css)$/.test(f));
  const missing = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, root), "utf8");
    for (const m of src.matchAll(/(\]:)?text-([a-z0-9-]+)\/(\d+)\b/g)) {
      const [, icon, fg, pct] = m;
      const a = Number(pct) / 100;
      // Arbitrary-variant classes (e.g. [&>svg]:text-x/70) style icons: UI 3:1.
      const min = icon ? UI : TEXT;
      if (!ALPHA_PAIRS.some(([f2, a2, , m2]) => f2 === fg && a2 === a && m2 >= min)) {
        missing.push(`${f}: ${m[0]}`);
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

for (const [theme, t] of [
  ["light", light],
  ["dark", dark],
]) {
  for (const [fg, bg, min] of PAIRS) {
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
