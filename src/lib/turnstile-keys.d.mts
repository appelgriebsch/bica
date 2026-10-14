export const TURNSTILE_ACTION: "chat";
export const STAGING_TURNSTILE_SITE_KEY: string;
export const TURNSTILE_TEST_KEYS: Readonly<{
  siteAlwaysPasses: string;
  secretAlwaysPasses: string;
  secretAlwaysFails: string;
}>;
export function siteKeyForBuild(env?: Record<string, string | undefined>): string;
