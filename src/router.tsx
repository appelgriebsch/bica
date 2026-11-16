import { createRouter } from "@tanstack/react-router";
import { NotFound } from "@/components/not-found";
import { cspNonce } from "@/lib/csp-nonce";
import { AppErrorComponent } from "@/lib/error-component";
import { initAnalytics } from "@/lib/analytics.mjs";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  if (!import.meta.env.SSR) {
    // ADR 0011: cookieless visit counts on production only; offline fails closed.
    void initAnalytics({ token: __BICA_WEB_ANALYTICS_TOKEN__ });
  }
  return createRouter({
    routeTree,
    defaultErrorComponent: AppErrorComponent,
    defaultNotFoundComponent: NotFound,
    ssr: { nonce: cspNonce() },
  });
}
