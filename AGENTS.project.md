# Bica project rules (override AGENTS.md)

- **No sign-in, no accounts, no database (#33, ADR 0002 addendum).** Ignore the
  template's auth and D1 sections in AGENTS.md: there is no Better Auth, no
  `/login`, no `/api/auth/*`, no `DB` binding and no `@/lib/db`. Don't add them back.
- Progress is device-only: `src/lib/progress-store.ts` (zustand persist,
  localStorage). Export/import is #34.
- Conversas (`sendChat`) is off behind `CHAT_ENABLED` in
  `src/lib/chat-availability.ts` until #35 adds anonymous protection.
