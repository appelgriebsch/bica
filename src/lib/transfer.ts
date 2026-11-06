/**
 * Progress transfer over QR frames (#36, ADR 0005). No network: the sender
 * shows BQ1 frames, the receiver scans them and unlocks with the transfer code.
 *
 * Blob = salt16 | iv12 | AES-GCM(deflate-raw(JSON)) incl. the 16-byte tag, with
 * PBKDF2-SHA256 (600k) from the code and AAD "BQ1|<n>". Encrypted once, base45
 * encoded once, then cut into frames "BQ1:<SID>:<i>/<n>:<payload>".
 * Self-contained (no `@/` imports) so `node --test` can load it.
 */

export const VERSION = "BQ1";
/** Sender alphabet: A-Z without I, L, O, plus 2-9 (31 symbols, ~40 bits for 8). */
export const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const CODE_LENGTH = 8;
export const PBKDF2_ITERATIONS = 600_000;
export const SALT_BYTES = 16;
export const IV_BYTES = 12;
export const TAG_BYTES = 16;
export const OVERHEAD_BYTES = SALT_BYTES + IV_BYTES + TAG_BYTES; // 44
export const PAYLOAD_CHARS = 480;
export const MAX_PARTS = 16;
export const MAX_FRAME_CHARS = 600;
export const MAX_INFLATED_BYTES = 256 * 1024;
export const SESSION_MS = 5 * 60 * 1000;
export const MAX_UNLOCK_ATTEMPTS = 5;

// JSON.parse keeps "__proto__" as an own key that schema libraries may skip silently.
const PROTO_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const SID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Unbiased random string: rejection sampling over crypto.getRandomValues. */
export function randomString(alphabet: string, length: number): string {
  const limit = 256 - (256 % alphabet.length);
  let out = "";
  while (out.length < length) {
    for (const b of crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out += alphabet[b % alphabet.length];
    }
  }
  return out;
}

export const newCode = () => randomString(CODE_ALPHABET, CODE_LENGTH);
export const newSid = () => randomString(SID_ALPHABET, 4);
export const formatCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Uppercase, drop spaces/hyphens; null unless 8 characters of the sender alphabet. */
export function normalizeCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[\s-]/g, "");
  if (code.length !== CODE_LENGTH) return null;
  return [...code].every((c) => CODE_ALPHABET.includes(c)) ? code : null;
}

// RFC 9285 base45. Its alphabet is exactly the QR alphanumeric set.
const B45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function base45Encode(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i + 1 < bytes.length; i += 2) {
    const n = bytes[i]! * 256 + bytes[i + 1]!;
    out += B45[n % 45]! + B45[Math.floor(n / 45) % 45]! + B45[Math.floor(n / 2025)]!;
  }
  if (bytes.length % 2) {
    const n = bytes[bytes.length - 1]!;
    out += B45[n % 45]! + B45[Math.floor(n / 45)]!;
  }
  return out;
}

/** Throws on characters outside the alphabet, a dangling char, or out-of-range groups. */
export function base45Decode(text: string): Uint8Array {
  if (text.length % 3 === 1) throw new Error("base45: bad length");
  const out = new Uint8Array(Math.floor(text.length / 3) * 2 + (text.length % 3 ? 1 : 0));
  let o = 0;
  for (let i = 0; i < text.length; i += 3) {
    const group = text.slice(i, i + 3);
    let n = 0;
    for (let j = group.length - 1; j >= 0; j--) {
      const v = B45.indexOf(group[j]!);
      if (v < 0) throw new Error("base45: bad character");
      n = n * 45 + v;
    }
    if (group.length === 3) {
      if (n > 0xffff) throw new Error("base45: group out of range");
      out[o++] = n >> 8;
      out[o++] = n & 0xff;
    } else {
      if (n > 0xff) throw new Error("base45: group out of range");
      out[o++] = n;
    }
  }
  return out;
}

export const base45Length = (bytes: number) => Math.floor(bytes / 2) * 3 + (bytes % 2) * 2;
/** Frame count for a compressed payload, known before encryption (it goes into the AAD). */
export const partsFor = (compressedBytes: number) =>
  Math.ceil(base45Length(compressedBytes + OVERHEAD_BYTES) / PAYLOAD_CHARS);
const aad = (n: number) => new TextEncoder().encode(`${VERSION}|${n}`);

/** deflate-raw in both directions, or the transfer can't run on this browser. */
export function codecSupported(): boolean {
  try {
    new CompressionStream("deflate-raw");
    new DecompressionStream("deflate-raw");
    return typeof crypto?.subtle?.deriveKey === "function";
  } catch {
    return false;
  }
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Streaming inflate that stops as soon as the output passes `cap` bytes. */
export async function inflateCapped(
  bytes: Uint8Array,
  cap = MAX_INFLATED_BYTES,
): Promise<Uint8Array> {
  const reader = new Blob([bytes as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > cap) {
      await reader.cancel().catch(() => {});
      throw new TransferError("too-large");
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    out.set(c, o);
    o += c.length;
  }
  return out;
}

async function deriveKey(code: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(code),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type TransferErrorKind = "too-large" | "unlock" | "malformed" | "discarded";
export class TransferError extends Error {
  constructor(readonly kind: TransferErrorKind) {
    super(kind);
  }
}

/** Encrypt once and cut into BQ1 frames. Throws "too-large" past MAX_PARTS; never truncates. */
export async function encodeTransfer(
  payload: unknown,
  code: string,
  sid = newSid(),
): Promise<string[]> {
  const compressed = await deflate(new TextEncoder().encode(JSON.stringify(payload)));
  const n = partsFor(compressed.length);
  if (n > MAX_PARTS) throw new TransferError("too-large");
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(code, salt);
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource, additionalData: aad(n) },
      key,
      compressed as BufferSource,
    ),
  );
  const blob = new Uint8Array(SALT_BYTES + IV_BYTES + sealed.length);
  blob.set(salt);
  blob.set(iv, SALT_BYTES);
  blob.set(sealed, SALT_BYTES + IV_BYTES);
  const text = base45Encode(blob);
  const frames: string[] = [];
  for (let i = 0; i < n; i++) {
    frames.push(
      `${VERSION}:${sid}:${i + 1}/${n}:${text.slice(i * PAYLOAD_CHARS, (i + 1) * PAYLOAD_CHARS)}`,
    );
  }
  return frames;
}

/**
 * Authenticate first, then inflate (capped), then JSON.parse. A wrong code and
 * corrupt ciphertext both throw "unlock"; the caller can't and mustn't tell them apart.
 */
export async function decodeTransfer(text: string, n: number, code: string): Promise<unknown> {
  // Corrupt frames read the same as a wrong code.
  let blob: Uint8Array;
  try {
    blob = base45Decode(text);
  } catch {
    throw new TransferError("unlock");
  }
  if (blob.length < OVERHEAD_BYTES + 1) throw new TransferError("unlock");
  const key = await deriveKey(code, blob.subarray(0, SALT_BYTES));
  let compressed: Uint8Array;
  try {
    compressed = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: blob.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES) as BufferSource,
          additionalData: aad(n),
        },
        key,
        blob.subarray(SALT_BYTES + IV_BYTES) as BufferSource,
      ),
    );
  } catch {
    throw new TransferError("unlock");
  }
  let json: string;
  try {
    json = new TextDecoder("utf-8", { fatal: true }).decode(await inflateCapped(compressed));
  } catch (err) {
    throw err instanceof TransferError ? err : new TransferError("malformed");
  }
  try {
    return JSON.parse(json, (k, v) => {
      if (PROTO_KEYS.has(k)) throw new Error("prototype key");
      return v;
    });
  } catch {
    throw new TransferError("malformed");
  }
}

// --- Receiver: frame parsing and collection -----------------------------------

export type Frame = { sid: string; i: number; n: number; payload: string };
const FRAME = /^BQ1:([A-Z0-9]{4}):([1-9]\d?)\/([1-9]\d?):([0-9A-Z $%*+\-./:]+)$/;

/** A BQ1 frame, "version" for another BQ format, or null for anything else (ignored). */
export function parseFrame(text: string): Frame | "version" | null {
  if (text.length > MAX_FRAME_CHARS) return null;
  const m = FRAME.exec(text);
  if (!m) return /^BQ(?!1:)\d+:/.test(text) ? "version" : null;
  const i = Number(m[2]);
  const n = Number(m[3]);
  if (n > MAX_PARTS || i > n) return null;
  return { sid: m[1]!, i, n, payload: m[4]! };
}

export type Collection = { sid: string; n: number; parts: (string | undefined)[] };
export type CollectResult = "new" | "duplicate" | "conflict" | "foreign" | "version" | "ignored";

/**
 * Add one scanned text. Locks to the first SID; parts of another session are
 * "foreign" and never mixed in. Same SID with another n, or another payload for
 * a part already held, is a "conflict" and is dropped. Mutates `c`.
 */
export function collect(
  c: Collection | null,
  text: string,
): { result: CollectResult; collection: Collection | null } {
  const f = parseFrame(text);
  if (f === "version") return { result: "version", collection: c };
  if (!f) return { result: "ignored", collection: c };
  if (!c) c = { sid: f.sid, n: f.n, parts: Array(f.n).fill(undefined) };
  if (f.sid !== c.sid) return { result: "foreign", collection: c };
  if (f.n !== c.n) return { result: "conflict", collection: c };
  const held = c.parts[f.i - 1];
  if (held !== undefined)
    return { result: held === f.payload ? "duplicate" : "conflict", collection: c };
  c.parts[f.i - 1] = f.payload;
  return { result: "new", collection: c };
}

export const received = (c: Collection) => c.parts.filter((p) => p !== undefined).length;
export const missingParts = (c: Collection) =>
  c.parts.flatMap((p, i) => (p === undefined ? [i + 1] : []));
export const isComplete = (c: Collection) => received(c) === c.n;
export const joined = (c: Collection) => c.parts.join("");

/**
 * The receiver's transient session: collected parts and unlock attempts, in
 * memory only. Five failed unlocks or five minutes discard it. A UX guard, not
 * protection for ciphertext someone already captured.
 */
export class ReceiveSession {
  collection: Collection | null = null;
  failures = 0;
  readonly expiresAt: number;
  constructor(now = Date.now()) {
    this.expiresAt = now + SESSION_MS;
  }
  add(text: string): CollectResult {
    const { result, collection } = collect(this.collection, text);
    this.collection = collection;
    return result;
  }
  /** Decrypted JSON, or throws: "unlock" (try again), "discarded" (5th failure), "malformed". */
  async unlock(code: string): Promise<unknown> {
    const c = this.collection;
    if (!c || !isComplete(c)) throw new TransferError("malformed");
    try {
      return await decodeTransfer(joined(c), c.n, code);
    } catch (err) {
      if (!(err instanceof TransferError) || err.kind !== "unlock") throw err;
      if (++this.failures >= MAX_UNLOCK_ATTEMPTS) {
        this.clear();
        throw new TransferError("discarded");
      }
      throw err;
    }
  }
  clear() {
    this.collection = null;
  }
}
