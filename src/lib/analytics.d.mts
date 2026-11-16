export const CF_BEACON_SRC: string;

export interface BeaconScript {
  defer: boolean;
  src: string;
  setAttribute(name: string, value: string): void;
}

export interface BeaconDocument {
  querySelector(sel: string): unknown;
  createElement(tag: string): BeaconScript;
  head: { appendChild(el: unknown): unknown };
}

export interface AnalyticsDeps {
  token?: string;
  health?: () => Promise<{ stage?: string } | undefined>;
  doc?: BeaconDocument;
}

export function loadBeacon(doc: BeaconDocument, token: string): boolean;
export function initAnalytics(deps?: AnalyticsDeps): Promise<void>;
export function resetAnalyticsForTest(): void;
