/**
 * The chat turn behind `sendChat` (#13): input caps, per-user limit, and an xAI
 * call with a deadline that never throws to the client.
 */
import { z } from "zod";
import { speakScenarios } from "@/data/curriculum";
import type { Verdict } from "@/lib/chat-limit";

export const MAX_TOTAL_CHARS = 8000;
export const XAI_TIMEOUT_MS = 20_000;
export const BUSY = "The conversation partner is busy. Try again.";
export const BAD_REPLY = "Unexpected reply. Try again.";

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
  })
  .refine(
    (d) => d.messages.reduce((n, m) => n + m.content.length, 0) <= MAX_TOTAL_CHARS,
    "Conversation too long.",
  );
export type ChatInput = z.infer<typeof chatInput>;

export type ChatResult =
  | { ok: true; text: string }
  | { ok: false; error: "rate_limited"; retryAfter: number }
  | { ok: false; error: string };

export async function chatTurn({
  data,
  apiKey,
  limit,
  fetch: f = fetch,
  timeoutMs = XAI_TIMEOUT_MS,
}: {
  data: ChatInput;
  apiKey: string | undefined;
  limit: () => Promise<Verdict>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}): Promise<ChatResult> {
  if (!apiKey) return { ok: false, error: "Practice chat is unavailable right now." };
  const scenario = speakScenarios.find((s) => s.id === data.scenarioId);
  if (!scenario) return { ok: false, error: "Unknown scene." };
  // Taken before the xAI call on purpose: a turn that then fails upstream still
  // counts, so retrying a timeout can't bypass the cap (each attempt may bill).
  const verdict = await limit();
  if (!verdict.ok) return { ok: false, error: "rate_limited", retryAfter: verdict.retryAfter };

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

  // The deadline covers the body too: res.json() aborts with it.
  const signal = AbortSignal.timeout(timeoutMs);
  let res: Response;
  try {
    res = await f("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "grok-4.5",
        max_tokens: 280,
        temperature: 0.7,
        messages: [
          { role: "system", content: system },
          ...data.messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      }),
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
  const content = body?.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content.trim() : "";
  if (!text) return { ok: false, error: "Empty reply. Try a shorter line." };
  return { ok: true, text };
}
