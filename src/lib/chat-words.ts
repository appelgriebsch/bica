/**
 * Helpers for saving a word/phrase from a Conversas reply to Palavras
 * (#80, ADR 0019). Pure functions so `node --test` can load them.
 */
import { normalizePt } from "@/lib/utils";

/** Card-id prefix for words saved from a Conversas reply. */
export const CHAT_CARD_PREFIX = "chat";
/** CARD_ID in transfer-schema.ts caps the normalized text at 120 chars. */
export const MAX_CHAT_TEXT = 120;

/** Global dedup id: the same word saved in two scenes is one card. */
export function chatCardId(pt: string): string {
  return `${CHAT_CARD_PREFIX}:${normalizePt(pt)}`;
}

/** A reply is `pt line\n(English gloss)` — the gloss without its parens; missing/odd second line → "". */
export function glossOf(content: string): string {
  const second = (content.split("\n")[1] ?? "").trim();
  const m = /^\(([\s\S]*)\)$/.exec(second);
  return m?.[1]?.trim() ?? "";
}

/** The text to save: the selection when usable, else the whole first line. */
export function clampSelection(selection: string | null | undefined, fullLine: string): string {
  const text = (selection ?? "").trim();
  return text || fullLine;
}

/** True when the saved text is a sub-phrase, so the whole-reply gloss needs a caveat. */
export function needsGlossCaveat(selection: string | null | undefined, fullLine: string): boolean {
  return clampSelection(selection, fullLine) !== fullLine;
}
