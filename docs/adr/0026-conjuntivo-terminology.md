# 0026. One mood term app-wide: "conjuntivo" (Camões); lesson/drill ids `b1-subjuntivo` / `gram-b1-subjuntivo` stay stable

- **Status**: Accepted
- **Date**: 2026-11-22
- **Deciders**: Andreas Gerlach with the user (plan produced via the solution-engineer skill; copy change pressure-tested via the domain-expert Consultant mode — bun, web-frontend lenses; displayed titles reviewed via the ui-ux-expert skill)
- **Supersedes**: none
- **Related issues**: #163

## Context

Issue #163 (gap-review row G5, RICE 54, release: Now): terminology is split. The B1 Lesson and drill say "Subjuntivo" (`b1-subjuntivo` `titlePt: "Subjuntivo"`, `gram-b1-subjuntivo` `titlePt: "O subjuntivo"`), while C1 and the Verbos desk say "conjuntivo" (`Futuro do conjuntivo`, `verb-c1-conjuntivo`). Camões uses **conjuntivo**; the app should use one term.

Verified inventory (case-insensitive, whole repo): the Portuguese string `subjuntivo` appears in exactly four places — the two ids above plus the two `titlePt` fields. GLOSSARY.md, README.md, `docs/adr/` and `public/` have zero hits, so the acceptance-criteria sweep there is a no-op. The English string `subjunctive` appears ~55 times in content copy (`grammar.ts`, `b1.ts`, `verbs.ts`, `c1.ts`, `b2.ts`, `placement.ts`, `scenarios.ts`, `radio.ts`, `level-mastery.ts`, `curriculum.ts`) and once in an assert message (`scripts/grammar-notes.test.mjs:124`). No scene, scenario, route, or test references the two ids, so keeping them stable loses no progress and touches no wiring. Titles render generically (`src/routes/path.tsx` shows `titlePt` plus the English `title` suffix after "—"; `src/routes/grammar/$id.tsx` shows drill `titlePt`/`title`), so the rename needs no component change.

## Decision

- **Titles only + PT sweep.** `src/data/b1.ts`: `titlePt: "Subjuntivo"` → `"Conjuntivo"`, `title: "Espero que — a first subjunctive"` → `"Espero que — the conjuntivo"`. `src/data/grammar.ts`: `titlePt: "O subjuntivo"` → `"O conjuntivo"`, `title: "The first subjunctive"` → `"The first conjuntivo"`.
- **Ids unchanged**: `b1-subjuntivo`, `gram-b1-subjuntivo` keep their ids so stored progress (keyed by lesson/drill id in `progress-store`) is not lost.
- **English gloss unchanged**: body copy, quiz options and explains keep the English term "subjunctive"; the app term shown to learners in titles is "conjuntivo".
- **Guard test**: new `scripts/terminology.test.mjs` (same transpile-and-load pattern as `scripts/pt-notes.test.mjs`/`grammar-notes.test.mjs`, auto-included by `node --test scripts/*.test.mjs`) asserting: no lesson or grammar-drill `title`/`titlePt` matches `/subjuntivo/i`; both ids still exist; both `titlePt` fields contain "conjuntivo".
- GLOSSARY.md, README.md, `docs/adr/`: verified zero hits — no change.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Titles + PT-string sweep only; English "subjunctive" stays as gloss (chosen) | Matches AC bullet 1 (titlePt/title copy); minimal diff; English copy keeps the standard English grammatical term | English body text still says "subjunctive" — deliberate: it is the English name of the mood |
| Full app-wide sweep of English "subjunctive" → "conjunctive" (~55 hits incl. placement options, radio, level-mastery, test message) | Literal "one term across the app" in English copy too | Large copy churn; "conjunctive" is not the standard English term; language review load; rejected by the user in planning |
| Minimal: only the two `titlePt` strings | Smallest possible diff | Path card would render "Conjuntivo — a first subjunctive" — still inconsistent; rejected |
| Rename the ids too | Fully consistent strings | AC forbids it; progress stored under the old ids would be orphaned; rejected |
| No guard test, grep evidence in the PR only | Zero test code | Issue AC asks for tests updated against the old term; a regression could reintroduce "subjuntivo" silently; rejected |

## Consequences

- No runtime, component, route, precache, dependency, or config change; pure data-copy edit plus one new test file. Deploys via the existing Cloudflare Workers workflow.
- Gates per #163 and the repo bar: `bun run test`, `bun run typecheck`, `bun run lint`, `bun run build`, `BICA_BUILT=1 bun run test`, plus browser smoke on dev and the served build (titles on `/path` B1 unit and `/grammar` B1) at 390px.
- Display: `/path` cards render `titlePt` + the English title suffix ("Conjuntivo · the conjuntivo"); lengths are comparable to existing titles, so the existing truncation pattern holds — verify at 390px in the smoke.
- Progress safety: ids unchanged, so `progress-store`, SRS cards and Palavras entries keyed by `b1-subjuntivo` / `gram-b1-subjuntivo` are untouched.
- Revisit when: the English copy is ever aligned to "conjunctive" wholesale, or new mood terminology is introduced (then update the guard test).
