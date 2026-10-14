/**
 * Shared test helpers. Not a test file (`npm test` runs `scripts/*.test.mjs`).
 */

/**
 * Replace `globalThis.navigator`. Since Node 21 it is a built-in getter-only
 * accessor, so plain assignment throws in ESM strict mode. The replacement is
 * a plain, writable, configurable value: `navigator.onLine = …` and
 * `delete globalThis.navigator` both work afterwards.
 */
export function setNavigator(value) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}
