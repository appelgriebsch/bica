interface ImportMetaEnv {
  /** "1" only on `DEPLOY_TARGET=cloudflare` builds. Empty in dev and on Vercel. */
  readonly BICA_CLOUDFLARE_BUILD?: string;
}
