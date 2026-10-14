/**
 * Public Turnstile site keys (#35). Plain ESM so vite.config.ts, the client
 * and `node --test` share them. Site keys are public; the secret
 * (TURNSTILE_SECRET_KEY) is a Worker secret and never lives in the repo.
 */

/** The widget action (data-action); the server requires siteverify to echo it. */
export const TURNSTILE_ACTION = "chat";

/** The staging widget (hostname bica-staging.appelgriebsch.workers.dev). */
export const STAGING_TURNSTILE_SITE_KEY = "0x4AAAAAAFWlhnYXXvgEtMvS";

/**
 * Cloudflare's documented test keys (dev and tests only).
 * https://developers.cloudflare.com/turnstile/troubleshooting/testing/
 */
export const TURNSTILE_TEST_KEYS = Object.freeze({
  siteAlwaysPasses: "1x00000000000000000000AA",
  secretAlwaysPasses: "1x0000000000000000000000000000000AA",
  secretAlwaysFails: "2x0000000000000000000000000000000AA",
});

/**
 * The site key baked into a build: the staging widget for the Worker build
 * (DEPLOY_TARGET=cloudflare, i.e. `build:cf`, which is what staging ships),
 * Cloudflare's always-pass test key for dev and every other build.
 */
export function siteKeyForBuild(env = {}) {
  return env.DEPLOY_TARGET === "cloudflare"
    ? STAGING_TURNSTILE_SITE_KEY
    : TURNSTILE_TEST_KEYS.siteAlwaysPasses;
}
