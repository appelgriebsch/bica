import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { MAX_CARD_BYTES, computeBrandWarnings } from "./brand-check.mjs";

const CUSTOM_ROOT = `
const ogImage = host ? \`https://\${host}/og.jpg\` : undefined;
meta: [{ property: "og:image", content: ogImage }],
`;

function makeWorkspace({ rootTsx, cardFile, cardBytes = 200 * 1024 } = {}) {
  const root = mkdtempSync(join(tmpdir(), "brand-check-"));
  mkdirSync(join(root, "public"), { recursive: true });
  mkdirSync(join(root, "src/routes"), { recursive: true });
  if (rootTsx !== undefined) {
    writeFileSync(join(root, "src/routes/__root.tsx"), rootTsx);
  }
  if (cardFile !== undefined) {
    writeFileSync(join(root, "public", cardFile), Buffer.alloc(cardBytes, 7));
  }
  return root;
}

test("a wired card under the scraper budget is silent", () => {
  const root = makeWorkspace({ rootTsx: CUSTOM_ROOT, cardFile: "og.jpg" });
  assert.deepEqual(computeBrandWarnings({ workspaceRoot: root }), []);
});

test("no card on disk: nothing to judge, silent", () => {
  const root = makeWorkspace({ rootTsx: CUSTOM_ROOT });
  assert.deepEqual(computeBrandWarnings({ workspaceRoot: root }), []);
});

test("no root file and no card: nothing to judge, silent", () => {
  const root = makeWorkspace({});
  assert.deepEqual(computeBrandWarnings({ workspaceRoot: root }), []);
});

test("card exists but og:image is not wired to it warns", () => {
  const root = makeWorkspace({
    rootTsx: "export const Route = createRootRoute({});",
    cardFile: "og.jpg",
  });
  const warnings = computeBrandWarnings({ workspaceRoot: root });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^BRAND WARNING:/);
  assert.match(warnings[0], /does not wire og:image/);
});

test("oversized card warns on the scraper budget (jpg and legacy png)", () => {
  for (const [cardFile, url] of [
    ["og.jpg", "/og.jpg"],
    ["og.png", "/og.png"],
  ]) {
    const root = makeWorkspace({
      rootTsx: `const ogImage = host ? \`https://\${host}${url}\` : undefined;`,
      cardFile,
      cardBytes: MAX_CARD_BYTES + 1,
    });
    const warnings = computeBrandWarnings({ workspaceRoot: root });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /over 600 KB/);
  }
});

test("card exactly at the budget is silent", () => {
  const root = makeWorkspace({ rootTsx: CUSTOM_ROOT, cardFile: "og.jpg", cardBytes: MAX_CARD_BYTES });
  assert.deepEqual(computeBrandWarnings({ workspaceRoot: root }), []);
});
