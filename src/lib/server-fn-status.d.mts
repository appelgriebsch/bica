export declare const INVALID_INPUT: "invalid_input";
export declare function classifyServerFnError(
  err: unknown,
): { status: 400; error: unknown } | null;
export declare function isUndecodablePayloadError(body: unknown): boolean;
