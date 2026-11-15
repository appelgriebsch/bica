# 0008. Keep the Grok-generated images (with attribution) while replacements are evaluated

- **Status**: Accepted
- **Date**: 2026-11-15
- **Deciders**: Andreas Gerlach
- **Supersedes**: none
- **Related issues**: epic "Remove xAI/Grok from Bica; Conversas chat moves to Mistral AI" (image follow-up tickets)

## Context

21 image files were generated with Grok Imagine and are shipped by the app: 20
scene illustrations in `public/scenes/*.jpg`, `public/og.jpg`, and the app
icon/mark (`public/favicon.svg`, `public/icon-*.png`,
`src/components/azulejo-mark.tsx`). `THIRD-PARTY.md` records that the xAI Brand
Guidelines and Consumer ToS §4 require a legible "Created with Grok" /
"Written with Grok" attribution wherever that output is published. Removing the
xAI **API** dependency (ADR 0006) and the builder chrome (ADR 0007) does not
remove this obligation while these bytes ship. Mistral, by contrast, assigns
output to the user and requires no attribution phrase (only an AI-generated
disclosure, which Bica keeps per EU AI Act Art. 50).

## Decision

1. **Keep the image bytes and their "Created with Grok" attribution** in
   `about.tsx` and `THIRD-PARTY.md` for now. Only the Conversas chat credit
   changes to Mistral AI (ADR 0006).
2. Open **follow-up tickets** to evaluate replacing (a) the 20 scene images +
   `og.jpg` and (b) the icon/mark, with non-xAI-generated art (e.g. Mistral
   Agents API `image_generation` = BFL FLUX, processed in the EU) or original
   hand-authored SVG. Until a replacement ships, the attribution stays.
3. Do not remove a Grok watermark where one exists; do not claim the images are
   human-made.

## Options Considered

| Option | Pros | Cons |
| --- | --- | --- |
| Keep files + keep attribution (chosen, interim) | zero risk, legally clean today | Grok reference remains in credits until follow-ups land |
| Regenerate everything now via Mistral/FLUX | removes xAI output entirely | one-off generation effort + visual QC; deferred to follow-up tickets |
| Replace scenes with hand-authored SVG/CSS | original art, no AI credit | changes the product look (photos were a deliberate choice); high effort |

## Consequences

- `THIRD-PARTY.md` keeps its xAI attribution section for the images; the
  Conversas line changes to Mistral.
- `scripts/about.test.mjs` keeps the `Created with Grok` assertions and gains
  one `AI-generated.*Mistral AI` assertion for the Conversas line.
- When a follow-up replaces an asset class, update the file list and attribution
  in the same change.
