import type { ChatResult } from "@/lib/chat-core";

/** Friendly text for a refused chat turn (#35). */
export function chatErrorMessage(
  res: Extract<ChatResult, { ok: false }>,
  now = Date.now(),
): string {
  if (res.error === "challenge_required") {
    return "Please solve the quick check above, then send your line again.";
  }
  if (!("retryAfter" in res)) return res.error;
  if (res.scope === "burst") return "Slow down a little: try again in a minute.";
  const at = new Date(now + res.retryAfter * 1000).toISOString().slice(11, 16);
  return res.scope === "global_day"
    ? `Today's chat budget is used up for everyone. It resets at ${at} UTC.`
    : `You've used today's chat budget. It resets at ${at} UTC.`;
}
