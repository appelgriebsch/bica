/**
 * Conversas is off until #35 (Turnstile, per-IP and global caps) lands: with
 * sign-in gone (#33) nothing identifies the caller, so `sendChat` must not reach
 * XAI_API_KEY. A code constant, not an env var, so no deploy setting can open it.
 * #35 deletes this flag.
 */
export const CHAT_ENABLED: boolean = false;

export const CHAT_UNAVAILABLE = "Conversas is temporarily unavailable.";
