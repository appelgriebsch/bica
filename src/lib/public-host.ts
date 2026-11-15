import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";

/** Share-card path. `ogImageUrl` / `hostFromOgImage` are the only readers. */
const OG_IMAGE_PATH = "/og.jpg";

/** Hostname suitable for absolute og:image URLs. Preview guests (X-Forwarded-Host) are allowed. */
function publicAppHost(hostHeader: string | null | undefined): string {
  const host = String(hostHeader ?? "")
    .split(",")[0]
    .trim()
    .split(":")[0]
    .toLowerCase();
  if (!host || !/^[a-z0-9.-]+$/.test(host) || !host.includes(".")) return "";
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return "";
  return host;
}

/**
 * Worker var PUBLIC_HOSTNAME wins (staging / production). Local preview has
 * none, so fall back to the request host / X-Forwarded-Host.
 */
function resolvePublicHost(hostHeader: string): string {
  const env = (globalThis as { __env__?: Record<string, string | undefined> }).__env__;
  const configured =
    publicAppHost(env?.PUBLIC_HOSTNAME) ||
    publicAppHost(typeof process !== "undefined" ? process.env?.PUBLIC_HOSTNAME : undefined);
  return configured || publicAppHost(hostHeader);
}

/** `https://<host>/og.jpg`, or undefined when there is no host. */
export function ogImageUrl(host: string): string | undefined {
  return host ? `https://${host}${OG_IMAGE_PATH}` : undefined;
}

/** Inverse of `ogImageUrl`. "" for anything that function did not produce. */
function hostFromOgImage(content: string): string {
  const value = String(content ?? "");
  const prefix = "https://";
  if (!value.startsWith(prefix)) return "";
  const rest = value.slice(prefix.length);
  const slash = rest.indexOf("/");
  if (slash <= 0) return "";
  const host = rest.slice(0, slash);
  const after = rest.slice(slash);
  if (after !== OG_IMAGE_PATH && !after.startsWith(`${OG_IMAGE_PATH}?`)) return "";
  return host;
}

/**
 * Public host for share tags. On the server: wrangler var PUBLIC_HOSTNAME,
 * else the request host. In the browser: the og:image the server rendered,
 * so a refetch still agrees.
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
    // Inverse of ogImageUrl.
    const content =
      document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content ?? "";
    return hostFromOgImage(content);
  });
