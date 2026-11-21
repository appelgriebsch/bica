# 0024. Portugal notes on grammar drills: `ptNote` on `GrammarDrill`, first uses `gram-a1-enclise` and `gram-b2-cliticos`

- **Status**: Accepted
- **Date**: 2026-11-21
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; architecture pressure-tested via the domain-expert Consultant mode — web-frontend, ui-ux-design lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none (extends the ADR 0018 follow-up scope)
- **Related issues**: #160, #82

## Context

Issue #160 (gap-review row G1, RICE 128, release: Now): pronoun-after-verb (énclise) and reflexive verbs need a drill from A1. Today clitics appear only as examples inside lessons (`a1-ola` `chamo-me`, `a2-farmacia` `dói-me`, both already carrying a `ptNote`) and in the B2 drill `gram-b2-cliticos`.

ADR 0018 added `PtNote = { pt; br; en }` (`src/data/types.ts`) and the `PortugalNote` component (`src/components/portugal-note.tsx`) for **lessons only**, and explicitly deferred grammar drills ("Grammar drills, verb desks, readings and radio are a follow-up"). Current state: `GrammarDrill` (`src/data/types.ts`) has no `ptNote` field. `/grammar/$id` (`src/routes/grammar/$id.tsx`, `GrammarPlayer`) renders intro (body + examples, each with a `SpeakButton`) → `QuizBlock` (Play + Slower on `speak` lines) → `DoneCard`; all content is static bundled data, so it is offline by construction and the chunk-based precache needs no change. TTS is strictly pt-PT (`src/lib/tts.ts`), and the color token pairs are pinned by `scripts/contrast.test.mjs`.

Separately, the "three drills on every level" claim is hard-coded in three copy sites — `GLOSSARY.md`, the `/grammar` intro (`src/routes/grammar/index.tsx`), and the Practice card (`src/routes/practice.tsx`) — while `src/data/grammar.ts` currently has exactly 3 drills per level. Adding an A1 drill makes those lines stale. All other counts (Today, Path, Practice `gramDone/grammarDrills.length`) are dynamic, and level completion (`isLevelComplete`) is lessons-only, so mastery is unaffected by a 4th drill.

## Decision

- **Data**: add optional `ptNote?: PtNote` to `GrammarDrill` (`src/data/types.ts`), reusing the existing `PtNote` type. The note lives on the drill that teaches the form — the same placement rule as ADR 0018.
- **UI**: one render site in `src/routes/grammar/$id.tsx`, in the intro phase below the examples list and above "Start the drill": `{drill.ptNote && <PortugalNote note={drill.ptNote} />}` with the existing component. The `SpeakButton` plays only the European `pt` form; the Brazilian `br` row stays text with the non-interactive BR pill, so the pt-PT-only TTS rule is unchanged.
- **First uses** (#160): the new A1 drill `gram-a1-enclise` (énclise `chamo-me` / `dói-me` / `dá-me`, reflexives `levanto-me` / `chama-se`, plus the sentence-start/negation exception; 4th A1 drill, 8 minutes, 7 quiz questions of all existing kinds `choice`/`type`/`listen`/`truefalse`) carries a `ptNote` with the Brazilian order side by side (pt `Chamo-me Andreas. / Dói-me a cabeça.` vs br `Meu nome é Andreas. / Minha cabeça dói.`); `gram-b2-cliticos` is backfilled with a `ptNote` in the same PR.
- **Three-drill rule**: resolved by adding the 4th A1 drill and rewording the three hard-coded copy sites to "at least three drills on every level" — not by replacing an existing A1 drill.
- **Test**: new `scripts/grammar-notes.test.mjs` (same transpile-and-load pattern as `scripts/pt-notes.test.mjs`) pins the drill shape, the `ptNote` shape (non-empty `pt`/`br`/`en`, `pt !== br`), the single render site after the examples list, exactly one `SpeakButton` on `note.pt`, a per-level ≥3-drills guard, and the removal of the old "three on every level" phrasing from the three copy sites.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Optional `ptNote` on `GrammarDrill` + reuse `PortugalNote` in `grammar/$id.tsx` (chosen) | Smallest diff; note sits on the drill that teaches the form (ADR 0018 placement rule); accessibility and pinned contrast tokens come free | Grammar route gains one conditional render |
| A separate ptNote step in the drill flow | Very visible | Adds a phase and state to `GrammarPlayer`; more authoring |
| Drill-level note rendered only on the done screen | One field on the drill | Detached from the content that teaches the form |
| No note; prose contrast in the drill body only | Zero code | Issue #160 requires a side-by-side `ptNote`; Brazilian learners calque proclisis |
| Play the `br` form with a pt-BR voice when one exists | Symmetric audio | Contradicts the strict pt-PT-only rule in `src/lib/tts.ts`; rejected (same as ADR 0018) |
| Replace an existing A1 drill to keep exactly three | GLOSSARY line stays literally true | Loses existing A1 content; rejected in planning |
| Backfill `ptNote` on all Brazil-relevant drills now | Wider coverage | Larger diff and more copy to language-review; only `gram-b2-cliticos` backfilled |

## Consequences

- Offline behavior, the Speak button and Slow replay come free: static bundled data, existing `QuizBlock`/`SpeakButton`, precache unchanged (chunk-based). No new dependency, config, migration, or `wrangler.toml` change; deploys through the existing Cloudflare Workers workflow with the unchanged CI gates (`bun run test`, typecheck, lint, build, `BICA_BUILT=1 bun run test`, browser smoke on dev and served build at 390px).
- Accessibility: reusing `PortugalNote` keeps the aria-label, the accessible `SpeakButton` name, ≥44px targets and the `contrast.test.mjs`-pinned token pairs; rows stack at phone width and go `sm:grid-cols-2` above — verify no overflow at 390px in the browser smoke.
- `scripts/grammar-notes.test.mjs` mechanically enforces the note shape and the per-level ≥3-drills guard, so the reworded "at least three" copy cannot drift from the data.
- Risk accepted: the `pt`/`br`/`en` copy is hand-authored and needs a language review by the repo owner before merge (issue #160 acceptance criterion).
- Revisit when: notes are wanted in verb desks, readings or radio (the remaining ADR 0018 follow-up); if learners ask for the BR form to be playable (would require relaxing the pt-PT-only TTS rule).
