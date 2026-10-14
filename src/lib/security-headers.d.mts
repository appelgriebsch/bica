export declare const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>>;
export declare const CSP_REPORT_PATH: string;
export declare const CSP_HEADER: string;
export declare const CSP_REPORT_ONLY_HEADER: string;
export declare function cspHeaderName(enforce: unknown): string;
export declare function newNonce(): string;
export declare function buildCsp(nonce: string): string;
export declare function nonceFromCsp(value: string | null | undefined): string | undefined;
export declare function applyStaticSecurityHeaders(headers: Headers): Headers;
