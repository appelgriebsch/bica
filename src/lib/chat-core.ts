/**
 * The chat turn behind `sendChat` (#13, #35): input caps, the Turnstile gate,
 * per-IP and daily limits, and a Mistral AI call (ADR 0006) with a deadline
 * that never throws to the client.
 */
import { z } from "zod";
import { speakScenarios } from "@/data/curriculum";
import type { SpeakScenario } from "@/data/types";
import { checkGate, parseHostnames, sessionSecretOk } from "@/lib/chat-gate";
import {
  chatLimiter,
  checkChatLimit,
  ipKey,
  type LimitScope,
  type Verdict,
} from "@/lib/chat-limit";

export const MAX_TOTAL_CHARS = 8000;
export const CHAT_TIMEOUT_MS = 20_000;
/** Mistral global endpoint (ADR 0006); the plain var MISTRAL_API_BASE overrides it. */
export const CHAT_API_BASE = "https://api.mistral.ai/v1";
/** ADR 0006; the plain var MISTRAL_MODEL overrides it. */
export const CHAT_MODEL = "mistral-small-latest";

/**
 * Vendored from hiato (ADR 0006): `choices[0].message.content` may be a string
 * or an array of blocks; join the text blocks and ignore the rest.
 */
export function messageContentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((b) => b && typeof b === "object" && (b as { type?: unknown }).type === "text")
    .map((b) => String((b as { text?: unknown }).text ?? ""))
    .join("");
}

/**
 * Only Mistral hosts may receive `Authorization: Bearer …` (ADR 0006): a
 * mis-set MISTRAL_API_BASE must never leak the key to another origin.
 */
function mistralApiBaseOk(apiBase: string): boolean {
  try {
    const host = new URL(apiBase).hostname;
    return host === "mistral.ai" || host.endsWith(".mistral.ai");
  } catch {
    return false;
  }
}

export const BUSY = "The conversation partner is busy. Try again.";
export const BAD_REPLY = "Unexpected reply. Try again.";
export const UNAVAILABLE = "Practice chat is unavailable right now.";
/** The client answers this by running the Turnstile challenge (403). */
export const CHALLENGE_REQUIRED = "challenge_required";

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(2000),
});

export const chatInput = z
  .object({
    scenarioId: z
      .string()
      .refine((id) => speakScenarios.some((s) => s.id === id), "Unknown scene."),
    messages: z.array(messageSchema).max(16),
    /** Turnstile token: the first turn, and when the server asks again. */
    turnstileToken: z.string().min(1).max(2048).optional(),
  })
  .refine(
    (d) => d.messages.reduce((n, m) => n + m.content.length, 0) <= MAX_TOTAL_CHARS,
    "Conversation too long.",
  );
export type ChatInput = z.infer<typeof chatInput>;

/** A refusal every chat-like turn can return (#131: review shares it with chat). */
export type TurnRefusal =
  | { ok: false; error: "rate_limited"; retryAfter: number; scope: LimitScope }
  | { ok: false; error: string };

export type ChatResult =
  | { ok: true; text: string }
  | TurnRefusal;

/** One reviewed learner line (#131, ADR 0017): the European Portuguese form. */
const correctionSchema = z.object({
  youSaid: z.string().min(1).max(300),
  pt: z.string().min(1).max(300),
  note: z.string().max(200).default(""),
  brazilian: z.boolean().default(false),
});
export type Correction = z.infer<typeof correctionSchema>;
export const MAX_CORRECTIONS = 12;
/** The review reply is model output: parse it, then validate it — never trust it. */
export const reviewOutputSchema = z.object({
  corrections: z.array(correctionSchema).transform((a) => a.slice(0, MAX_CORRECTIONS)),
});

export const reviewInput = z
  .object({
    scenarioId: z
      .string()
      .refine((id) => speakScenarios.some((s) => s.id === id), "Unknown scene."),
    messages: z.array(messageSchema).max(16),
    /** Turnstile token: the first turn, and when the server asks again. */
    turnstileToken: z.string().min(1).max(2048).optional(),
  })
  .refine((d) => d.messages.some((m) => m.role === "user"), "No learner turn to review.")
  .refine(
    (d) => d.messages.reduce((n, m) => n + m.content.length, 0) <= MAX_TOTAL_CHARS,
    "Conversation too long.",
  );
export type ReviewInput = z.infer<typeof reviewInput>;

export type ReviewResult =
  | { ok: true; corrections: Correction[] }
  | TurnRefusal;

type TurnInput = {
  scenarioId: string;
  messages: { role: "user" | "assistant"; content: string }[];
};

/**
 * The preamble every chat-like turn shares (#131, ADR 0017): fail closed without
 * a key or against a non-Mistral base, resolve the scenario, then the gate,
 * then the limit — before any upstream call, so a retry can't bypass a cap.
 */
async function prelude(
  data: TurnInput,
  {
    apiKey,
    apiBase,
    gate,
    limit,
  }: {
    apiKey: string | undefined;
    apiBase: string;
    gate: () => Promise<boolean>;
    limit: () => Promise<Verdict>;
  },
): Promise<{ scenario: SpeakScenario; apiKey: string } | { refusal: TurnRefusal }> {
  if (!apiKey) return { refusal: { ok: false, error: UNAVAILABLE } };
  // Fails closed before the gate and limiter: a bad base is a config error and
  // must neither spend a turn nor send the key anywhere but a Mistral host.
  if (!mistralApiBaseOk(apiBase)) return { refusal: { ok: false, error: UNAVAILABLE } };
  const scenario = speakScenarios.find((s) => s.id === data.scenarioId);
  if (!scenario) return { refusal: { ok: false, error: "Unknown scene." } };
  // Before the limiter: an unverified caller can't use up an IP's turns.
  if (!(await gate())) return { refusal: { ok: false, error: CHALLENGE_REQUIRED } };
  // Taken before the upstream call on purpose: a turn that then fails upstream
  // still counts, so retrying a timeout can't bypass the cap (each attempt may bill).
  const verdict = await limit();
  if (!verdict.ok) {
    return {
      refusal: {
        ok: false,
        error: "rate_limited",
        retryAfter: verdict.retryAfter,
        scope: verdict.scope,
      },
    };
  }
  return { scenario, apiKey };
}

/**
 * One Mistral chat completion call (ADR 0006). The deadline covers the body
 * too: res.json() aborts with it. Returns the raw content string, untrimmed.
 */
async function mistralChat({
  apiKey,
  apiBase,
  model,
  request,
  f,
  timeoutMs,
}: {
  apiKey: string;
  apiBase: string;
  model: string;
  request: Record<string, unknown>;
  f: typeof fetch;
  timeoutMs: number;
}): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const signal = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await f(`${apiBase.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, ...request }),
      signal,
    });
  } catch {
    return { ok: false, error: BUSY };
  }
  if (!res.ok) return { ok: false, error: BUSY };
  // An HTML or otherwise non-JSON body fails here, whatever its content-type says.
  let body: { choices?: { message?: { content?: unknown } }[] } | null;
  try {
    body = await res.json();
  } catch {
    return { ok: false, error: signal.aborted ? BUSY : BAD_REPLY };
  }
  return { ok: true, text: messageContentToString(body?.choices?.[0]?.message?.content) };
}

export async function chatTurn({
  data,
  apiKey,
  apiBase = CHAT_API_BASE,
  model = CHAT_MODEL,
  gate,
  limit,
  fetch: f = fetch,
  timeoutMs = CHAT_TIMEOUT_MS,
}: {
  data: ChatInput;
  /** Undefined (no key, or no Turnstile secret) refuses before anything else. */
  apiKey: string | undefined;
  /**
   * Endpoint base; MISTRAL_API_BASE overrides the global default (ADR 0006).
   * Must be a `mistral.ai`/`*.mistral.ai` host, else the turn fails closed.
   */
  apiBase?: string;
  /** Model; MISTRAL_MODEL overrides the default (ADR 0006). */
  model?: string;
  /** Turnstile token or session cookie; false → challenge_required, no limiter, no upstream. */
  gate: () => Promise<boolean>;
  limit: () => Promise<Verdict>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const pre = await prelude(data, { apiKey, apiBase, gate, limit });
  if ("refusal" in pre) return pre.refusal;
  const { scenario } = pre;

  const system = [
    `You are ${scenario.partner}, a native speaker from Portugal (European Portuguese, never Brazilian).`,
    `Scene: ${scenario.setting}`,
    `CEFR level of the learner: ${scenario.level}. Keep your Portuguese at or just above that level.`,
    "Stay in character. Keep replies to 1–3 short sentences of Portuguese.",
    "After the Portuguese, on a new line, add a plain English gloss in parentheses.",
    "If the learner uses Brazilian Portuguese, recast once into European Portuguese without shaming.",
    "If they make a grammar or word error, recast the correct form naturally in your next line.",
    "Do not break character to lecture. Do not use markdown. Do not use emoji.",
    `Learner goals: ${scenario.goals.join("; ")}.`,
  ].join(" ");

  const res = await mistralChat({
    apiKey: pre.apiKey,
    apiBase,
    model,
    request: {
      max_tokens: 280,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        ...data.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    },
    f,
    timeoutMs,
  });
  if (!res.ok) return { ok: false, error: res.error };
  const text = res.text.trim();
  if (!text) return { ok: false, error: "Empty reply. Try a shorter line." };
  return { ok: true, text };
}

/** JSON mode returns a bare object; strip ``` fences if a model adds them anyway. */
function stripJsonFences(text: string): string {
  const t = text.trim();
  const m = /^```[a-z]*\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1] : t;
}

/**
 * The end-of-scene review (#131, ADR 0017): one JSON-mode Mistral call over the
 * transcript. Same preamble as a chat turn, so the Turnstile gate, the burst and
 * the daily caps all apply unchanged; the reply is parsed and zod-validated.
 */
export async function reviewTurn({
  data,
  apiKey,
  apiBase = CHAT_API_BASE,
  model = CHAT_MODEL,
  gate,
  limit,
  fetch: f = fetch,
  timeoutMs = CHAT_TIMEOUT_MS,
}: {
  data: ReviewInput;
  apiKey: string | undefined;
  apiBase?: string;
  model?: string;
  gate: () => Promise<boolean>;
  limit: () => Promise<Verdict>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<ReviewResult> {
  const pre = await prelude(data, { apiKey, apiBase, gate, limit });
  if ("refusal" in pre) return pre.refusal;
  const { scenario } = pre;

  const system = [
    "You are reviewing a learner's Portuguese conversation after a role-play scene.",
    `Scene: ${scenario.setting}`,
    `CEFR level of the learner: ${scenario.level}.`,
    `Learner goals: ${scenario.goals.join("; ")}.`,
    "Review only the learner's own lines. For each line that needed a fix — grammar, word choice, or a Brazilian form — add one entry to \"corrections\".",
    'Return ONLY a JSON object: {"corrections":[{"youSaid":"the learner\'s line","pt":"the European Portuguese form","note":"one short English line saying why","brazilian":true}]}.',
    '"pt" is always European Portuguese, never Brazilian. Set "brazilian" to true only when "youSaid" used Brazilian forms.',
    'If nothing needed a fix, return {"corrections":[]}. Do not invent errors. Do not write anything outside the JSON object.',
  ].join(" ");

  const res = await mistralChat({
    apiKey: pre.apiKey,
    apiBase,
    model,
    request: {
      max_tokens: 600,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        ...data.messages.map((m) => ({ role: m.role, content: m.content })),
      ],
    },
    f,
    timeoutMs,
  });
  if (!res.ok) return { ok: false, error: res.error };
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFences(res.text));
  } catch {
    return { ok: false, error: BAD_REPLY };
  }
  const out = reviewOutputSchema.safeParse(parsed);
  if (!out.success) return { ok: false, error: BAD_REPLY };
  return { ok: true, corrections: out.data.corrections };
}

/** The request side of a sendChat call (chat-request.server.ts on the server). */
export type ChatRequest = {
  /** cf-connecting-ip only (#17). */
  ip: string | undefined;
  /** The CHAT_COOKIE value, if any. */
  cookie: string | undefined;
  setCookie(value: string): void;
  setStatus(status: number, headers?: Record<string, string>): void;
};

/**
 * The request wrapper behind `sendChat` and `reviewScene` (#131, ADR 0017).
 * Fails closed without MISTRAL_API_KEY or TURNSTILE_SECRET_KEY, or with a
 * CHAT_SESSION_SECRET under 32 bytes. TURNSTILE_HOSTNAMES lists the hostnames
 * siteverify may report (empty → every token fails). 403 without a valid token
 * or session cookie, 429 (with retry-after) from the per-IP burst or a daily
 * cap; neither reaches Mistral.
 */
/** Cookie + status side effects of a finished turn, shared by chat and review. */
function applyTurnOutcome(
  result: ChatResult | ReviewResult,
  pendingCookie: string | undefined,
  req: ChatRequest,
): void {
  const refusedByLimit = !result.ok && "retryAfter" in result;
  if (pendingCookie && !refusedByLimit) req.setCookie(pendingCookie);
  if (!result.ok && result.error === CHALLENGE_REQUIRED) req.setStatus(403);
  if (!result.ok && "retryAfter" in result) {
    req.setStatus(429, { "retry-after": String(result.retryAfter) });
  }
}

async function chatRequestTurn<R extends ChatResult | ReviewResult>(
  data: TurnInput & { turnstileToken?: string },
  req: ChatRequest,
  now: number,
  env: Record<string, string | undefined>,
  run: (core: {
    data: TurnInput;
    apiKey: string | undefined;
    apiBase?: string;
    model?: string;
    gate: () => Promise<boolean>;
    limit: () => Promise<Verdict>;
  }) => Promise<R>,
): Promise<R> {
  const secret = env.TURNSTILE_SECRET_KEY;
  const sessionSecret = env.CHAT_SESSION_SECRET;
  const key = ipKey(req.ip);
  const { turnstileToken, ...input } = data;
  // Set only once the turn gets past the limiter (S4): a refused turn neither
  // renews the cookie nor spends one of its turns.
  let pendingCookie: string | undefined;
  const result = await run({
    data: input,
    // Fails closed without the Turnstile secret or a 32-byte session secret.
    apiKey: secret && sessionSecretOk(sessionSecret) ? env.MISTRAL_API_KEY : undefined,
    // ADR 0006: optional plain vars override endpoint and model.
    apiBase: env.MISTRAL_API_BASE,
    model: env.MISTRAL_MODEL,
    gate: async () => {
      const g = await checkGate({
        token: turnstileToken,
        cookie: req.cookie,
        firstTurn: input.messages.filter((m) => m.role === "user").length <= 1,
        secret: secret!,
        sessionSecret,
        ip: req.ip && req.ip !== "unknown" ? req.ip : undefined,
        bind: key,
        hostnames: parseHostnames(env.TURNSTILE_HOSTNAMES),
        now,
      });
      pendingCookie = g.cookie;
      return g.ok;
    },
    limit: () => checkChatLimit(key, now, chatLimiter(env)),
  });
  applyTurnOutcome(result, pendingCookie, req);
  return result;
}

export async function sendChatHandler(
  data: ChatInput,
  req: ChatRequest,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
): Promise<ChatResult> {
  return chatRequestTurn(data, req, now, env, (core) => chatTurn(core));
}

/** #131 (ADR 0017): the end-of-scene review behind the `reviewScene` server fn. */
export async function sendReviewHandler(
  data: ReviewInput,
  req: ChatRequest,
  now = Date.now(),
  env: Record<string, string | undefined> = process.env,
): Promise<ReviewResult> {
  return chatRequestTurn(data, req, now, env, (core) => reviewTurn(core));
}
