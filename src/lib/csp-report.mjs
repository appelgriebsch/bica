/**
 * /api/csp-report logic (#28). Plain ESM so `node --test` can drive it.
 * Reports are logged to Workers observability, never stored. Capped per
 * isolate (20 per 60 s) so a noisy page can't flood the logs, and the body is
 * capped at 8 KB: 413 on a larger content-length, and the stream is read only
 * until it passes the cap (a missing or lying content-length can't make us
 * buffer more). The logged text is cut to 2 KB.
 */
export const WINDOW_MS = 60_000;
export const MAX_PER_WINDOW = 20;
export const MAX_BODY_BYTES = 8 * 1024;

const noContent = () =>
  new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
const tooLarge = () =>
  new Response(null, { status: 413, headers: { "cache-control": "no-store" } });

/** Body text, or null once it passes `max` bytes (reading stops there). */
export async function readCapped(request, max = MAX_BODY_BYTES) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let off = 0;
  for (const c of chunks) {
    all.set(c, off);
    off += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

export function createCspReportHandler({ log = console.warn, now = Date.now } = {}) {
  let windowStart = 0;
  let count = 0;
  return async function handle(request) {
    const length = Number(request.headers.get("content-length"));
    if (length > MAX_BODY_BYTES) return tooLarge();
    const t = now();
    if (t - windowStart > WINDOW_MS) {
      windowStart = t;
      count = 0;
    }
    if (++count > MAX_PER_WINDOW) return noContent();
    const body = await readCapped(request).catch(() => "");
    if (body === null) return tooLarge();
    log("[bica] csp-report", body.slice(0, 2048));
    return noContent();
  };
}
