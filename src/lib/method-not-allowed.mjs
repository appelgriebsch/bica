/** 405 for a method this route does not implement. Explicit handlers still win over ANY. */
export function methodNotAllowed(allow) {
  return new Response(null, {
    status: 405,
    headers: { allow, "cache-control": "no-store" },
  });
}
