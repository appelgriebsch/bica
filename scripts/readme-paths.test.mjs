import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readme = readFileSync(join(root, "README.md"), "utf8");

/** Backticked tokens that look like repo paths (contain a slash or a dotfile/ext). */
export function readmePaths(md) {
  return [...md.matchAll(/`([^`\s]+)`/g)]
    .map((m) => m[1])
    .filter((p) =>
      /^(?:\.?[\w-]+\/)+[\w.*-]*$|^\.?[\w-]+\.(?:md|mjs|ts|tsx|js|json|toml|yml)$|^\.(?:nvmrc|prettierrc)$/.test(
        p,
      ),
    )
    .filter((p) => !p.includes("*") && !/^https?:/.test(p));
}

/** Relative markdown link targets (anchors and a leading ./ stripped; http(s), mailto, # and // skipped). */
export function readmeLinks(md) {
  return [...md.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((m) => m[1].replace(/^<|>$/g, ""))
    .filter((t) => !/^(?:https?:|mailto:|#|\/\/)/i.test(t))
    .map((t) => t.replace(/^\.\//, "").split("#")[0])
    .filter(Boolean);
}

/** The README text with only the one allowed link target removed. */
export function scrubAllowedLinks(md) {
  return md.replaceAll(/\]\((?:\.\/)?<?docs\/adr\/0002-d1-database\.md>?\)/g, "]");
}

const FORBIDDEN = /verc[e]l|better.?auth|sign-?in|\bD1\b/i;

test("#43: every relative markdown link in README.md resolves", () => {
  const links = readmeLinks(readme);
  assert.ok(links.length >= 4, String(links.length));
  assert.deepEqual(
    links.filter((t) => !existsSync(join(root, t))),
    [],
  );
  // mutants: a dead link is caught; anchors are stripped; external links skipped
  const dead = readmeLinks("[x](docs/nope.md#a) [y](https://example.com) [z](mailto:a@b.c)");
  assert.deepEqual(dead, ["docs/nope.md"]);
  assert.deepEqual(readmeLinks("[a](./docs/x.md) [b](//cdn.example/a) [c](<docs/y.md#z>)"), [
    "docs/x.md",
    "docs/y.md",
  ]);
  assert.equal(existsSync(join(root, dead[0])), false);
});

test("#43: every backticked repo path in README.md exists", () => {
  const paths = readmePaths(readme);
  assert.ok(paths.length >= 15, String(paths.length));
  const missing = paths.filter((p) => !existsSync(join(root, p)));
  assert.deepEqual(missing, []);
  // mutant: a bogus path is caught
  assert.deepEqual(readmePaths("see `src/lib/nope.ts`"), ["src/lib/nope.ts"]);
});

test("#43: README has no sign-in, D1, Better Auth or old-host claims, and no secret values", () => {
  assert.doesNotMatch(scrubAllowedLinks(readme), FORBIDDEN);
  // mutants: only the exact ADR 0002 link target is exempt
  assert.doesNotMatch(scrubAllowedLinks("[a](docs/adr/0002-d1-database.md)"), FORBIDDEN);
  assert.match(scrubAllowedLinks("[a](https://verc" + "el.com)"), FORBIDDEN);
  assert.match(scrubAllowedLinks("[a](docs/sign-in.md)"), FORBIDDEN);
  assert.match(scrubAllowedLinks("[a](docs/adr/0002-d1-database.md#x)"), FORBIDDEN);
  assert.doesNotMatch(scrubAllowedLinks("[a](./docs/adr/0002-d1-database.md)"), FORBIDDEN);
  assert.doesNotMatch(scrubAllowedLinks("[a](<docs/adr/0002-d1-database.md>)"), FORBIDDEN);
  assert.doesNotMatch(readme, /0x4AAAA|1x0000|xai-[A-Za-z0-9]/);
  const secretValue = /\b[\w-]*SECRET[\w-]*\s*=\s*\S+/i;
  assert.doesNotMatch(readme, secretValue);
  assert.match("TURNSTILE_SECRET_KEY=abc", secretValue);
});

// SPDX MIT, copyright line kept as the template placeholder.
const SPDX_MIT = `MIT License

Copyright (c) <year> <copyright holders>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

test("#43: MIT license file and package.json field", () => {
  const lic = readFileSync(join(root, "LICENSE"), "utf8");
  const normalized = lic.replace(
    /^Copyright \(c\) .+$/m,
    "Copyright (c) <year> <copyright holders>",
  );
  assert.equal(normalized, SPDX_MIT);
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  assert.equal(pkg.license, "MIT");
  assert.equal(pkg.private, true);
});
