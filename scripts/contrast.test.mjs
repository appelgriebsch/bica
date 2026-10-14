// WCAG AA contrast for theme tokens in src/styles.css, light and dark (#16).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function tokens(block) {
  const out = {};
  for (const [, name, hex] of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)) {
    out[name] = hex.toLowerCase();
  }
  return out;
}

const themeBlock = css.match(/@theme\s*\{([\s\S]*?)\n\}/);
const darkBlock = css.match(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root\s*\{([\s\S]*?)\}/);
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
}
