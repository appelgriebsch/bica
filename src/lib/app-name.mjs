/**
 * The app's one name (#28). The page title, the apple meta, the PWA manifest and
 * the install page all use it, so a workers.dev or custom host never shows the
 * platform default ("Grok App"). Plain ESM so vite.config.ts, the Nitro
 * middleware and `node --test` can import it.
 */
export const APP_NAME = "Bica";
