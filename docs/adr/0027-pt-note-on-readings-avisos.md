# 0027. `ptNote` on reading pieces + three A1–A2 aviso notices (gap P2): reuse the ADR 0018/0024 pattern, no route or precache change

- **Status**: Accepted
- **Date**: 2026-11-22
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; pressure-tested via the domain-expert Consultant mode — bun, web-frontend lenses; UI reviewed via the ui-ux-expert skill)
- **Supersedes**: none (extends ADR 0018 ptNote scope to readings, following the ADR 0024 drill precedent)
- **Related issues**: #164, #86

## Context

Issue #164 (gap-review row P2, RICE 48, release: Now): CIPLE A2 reading opens with public notices (avisos); bica has exactly one (`read-aviso`, A1) plus `read-talho` (A2). Movers and travellers both read avisos — obras, horários, êxtase — and this is the cheap on-ramp to #86.

Current state: `ReadingPiece` (`src/data/types.ts`) has `paragraphs`, `notes`, `image`, `quiz` but **no `ptNote`** — ADR 0018 added `PtNote`/`PortugalNote` for lessons only and ADR 0024 extended it to `GrammarDrill`; readings were the remaining content type. Rendering is otherwise fully generic: `src/routes/practice.tsx` maps `readingPieces`, `src/routes/read/$id.tsx` renders each paragraph with tap-for-English and a `SpeakButton` (slow replay included, on-device pt-PT TTS per `src/lib/tts.ts`), then Notes, then `QuizBlock`; completion persists via `persistCompletion(piece.id)`. No code references individual read ids, and all images come from the recursively precached `/scenes/` pool (`scripts/precache.mjs` scans `public/`), so new pieces need no wiring, route, image, or precache change. "Next page" follows authored array order in `reading.ts`.

## Decision

- **ptNote on readings**: add optional `ptNote?: PtNote` to `ReadingPiece` (`src/data/types.ts`), reusing the existing `PtNote` type. One render site in `src/routes/read/$id.tsx`, in the read phase after the Notes section and above the "Check what stuck" button: `{piece.ptNote && <PortugalNote note={piece.ptNote} />}`, exactly the ADR 0024 placement rule. `SpeakButton` plays only the European `pt` form; the `br` row stays text-only (unchanged pt-PT-only TTS rule).
- **Test**: new `scripts/reading-notes.test.mjs` (same transpile-and-load pattern as `pt-notes.test.mjs`/`grammar-notes.test.mjs`; auto-included by `node --test scripts/*.test.mjs` in normal and `BICA_BUILT=1` runs) pinning: ptNote shape (non-empty `pt`/`br`/`en`, `pt !== br`), exactly one render site in `read/$id.tsx` passing `note.pt`, and a guard that any reading whose paragraphs/quiz mention Brazil carries a ptNote.
- **Three new pieces** in `src/data/reading.ts`, appended in authored order, all `kind: "notice"`, 8 min each, each with `notes` and a 3–4-question quiz of existing kinds:
  - `read-aviso-obras` — A1, image `/scenes/street.jpg`. Imperative-heavy roadworks sign ("Atenção — obras na rua… contorne pela… pedimos desculpa pelo incómodo").
  - `read-aviso-horario` — A2, image `/scenes/padaria.jpg`. Shop-hours change; carries the ptNote PT `encerrado` vs BR `fechado`.
  - `read-aviso-evento` — A2, image `/scenes/terrace.jpg`. Street-festival notice with rua encerrada hours.
- No new route, component (beyond the one conditional render), dependency, image, or precache change. Deploys via the existing Cloudflare Workers workflow.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Optional `ptNote` on `ReadingPiece` + one render site + reading-notes test (chosen) | Mirrors ADR 0024; smallest diff; note sits on the piece that teaches the form; accessibility/contrast tokens come free with `PortugalNote` | Read route gains one conditional render |
| PT×BR contrast inside the existing `notes` list only | Zero code | Not a side-by-side `ptNote`; issue #164 AC explicitly says "a ptNote where relevant"; rejected by the user in planning |
| A dedicated ptNote step/phase in the read flow | Very visible | Adds state to `ReadPlayer`; more authoring; rejected (same as ADR 0024) |
| New scene images for the avisos | Thematic | `/scenes/` pool is already precached; issue says reuse; regeneration is a separate pipeline |
| Insert the new pieces mid-list to group notices | Nicer grouping | Reorders "Next page" chain for existing users mid-progress; appending is safer; rejected |
| Play the `br` form with a pt-BR voice when one exists | Symmetric audio | Contradicts the strict pt-PT-only rule in `src/lib/tts.ts`; rejected (same as ADR 0018/0024) |

## Consequences

- Offline behavior, Speak + Slow replay, Practice listing, and progress persistence come free: static bundled data, existing components, recursive precache unchanged. No new dependency, config, migration, or `wrangler.toml` change.
- Gates per #164 and the repo bar: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`, `BICA_BUILT=1 bun run test`, browser smoke on dev and the served build (Practice + the three new `/read/$id` pages), 390px check.
- Accessibility: reusing `PortugalNote` keeps the aria-label, accessible `SpeakButton` name, ≥44px targets and the `contrast.test.mjs`-pinned token pairs; verify no overflow at 390px in the smoke.
- Notice-register pt-PT wording remains a human gate: language review by the repo owner (#164 AC).
- Revisit when: the remaining content types (radio bulletins, verb desks) get ptNotes, or #86 CIPLE practice lands and avisos need linking.
