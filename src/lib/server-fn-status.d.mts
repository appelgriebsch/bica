export declare const INVALID_INPUT: "invalid_input";
export declare function classifyServerFnError(
  err: unknown,
): { status: 400 | 401 | 403; error: unknown } | null;
export declare function isUndecodablePayloadError(body: unknown): boolean;
export declare function isInvalidInputError(err: unknown): boolean;
