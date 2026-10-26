import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { resolvePublicHost } from "../../scripts/grok-pwa-shared.mjs";

/**
 * Public host for share tags. On the server: wrangler var PUBLIC_HOSTNAME,
 * else the request host (same order as the PWA middleware). In the browser:
 * the og:image the server rendered, so a refetch still agrees.
 */
export const shareHost = createIsomorphicFn()
  .server((): string => {
    try {
      return resolvePublicHost(getRequestHost({ xForwardedHost: true }));
    } catch {
      return resolvePublicHost("");
    }
  })
  .client((): string => {
    const content =
      document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? "";
    return /^https:\/\/([^/]+)\/og\.jpg(?:\?|$)/.exec(content)?.[1] ?? "";
  });
