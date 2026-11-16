# 0010. Evaluation (#96): replace the Grok-generated app icon/mark with an original hand-authored SVG mark

- **Status**: Accepted — QC gate executed 2026-11-15 (programmatic + browser, see below)
- **Date**: 2026-11-15
- **Deciders**: Andreas Gerlach
- **Supersedes**: none (amends ADR 0008: when the replacement ships, the icon/mark files leave its attribution list)
- **Related issues**: #96 (this evaluation), epic #91; scene images were handled separately (ADR 0009, #93/#102)

## Scope

The app icon/mark only: `public/favicon.svg`, `public/icon-180.png`,
`public/icon-192.png`, `public/icon-512.png`, `public/icon-maskable-192.png`,
`public/icon-maskable-512.png` (6 files; `src/components/azulejo-mark.tsx`
just renders `/favicon.svg`, so it needs no change when the SVG is swapped).
Per #96 this ticket is **research + prototype only** — nothing in `public/`
changes here. `public/og.jpg` is out of scope (scene-image follow-up, ADR 0009).

## Context

ADR 0008 keeps the Grok-generated icon bytes plus their "Created with Grok"
attribution (THIRD-PARTY.md "App icon and mark" section, `about.tsx` credits,
`scripts/about.test.mjs` asserts). #96 asks for research + a prototype with two
acceptance criteria: the replacement mark passes visual QC at 180/192/512
including the maskable safe zone and the favicon in browser chrome, and the
recommendation is recorded as an ADR 0008 amendment. The current mark is a
cobalt/cream azulejo tile (four-petal florão) drawn as SVG by Grok Build and
rasterized to PNG; all 5 PNGs are square, opaque, corners filled with cobalt
`#1E4D73` (30,77,115), 8–24 KB.

## Options evaluated (research, 2026-11-15)

| Option                                                                                                           | Findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Verdict                                     |
| ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Original hand-written SVG mark + local rasterization** (`sharp` 0.35.5, already in the lockfile via miniflare) | Original work by the project — no AI output, so no attribution phrase is owed at all (the xAI obligation only attaches to Grok output). Vector-first: every size (16 px favicon to 512 px) is a crisp render of one source. $0, deterministic, runs offline, reproducible from `scripts/icon-regen/`. Palette locked to the manifest theme colors (cobalt `#1E4D73`, cream `#F6F1E8`).                                                                                                                                                                     | **Chosen** — prototyped and QC-passed below |
| **Mistral built-in `image_generation` tool** (BFL FLUX1.1 [pro] Ultra)                                           | Same path as ADR 0009 (verified live there on 2026-11-15): `POST /v1/chat/completions` with `tools:[{type:"image_generation"}]`, image URL in the `role:"tool"` message's JSON-string content. ~$0.10/image, 5–10 s. Note: #96 says "Agents API", but `/v1/agents` + `/v1/conversations` are deprecated and 404 — the chat-completions tool is the current path. Mistral ToS assigns output IP to the user, no attribution phrase. Needs `MISTRAL_API_KEY`; not executed here (no key in this environment), prompt is ready via `--via=mistral --dry-run`. | Fallback if a generated look is preferred   |

## Cost / latency estimate (recorded)

- **SVG arm (chosen)**: $0, milliseconds per size. Rasterization uses the
  lockfile's sharp; no network, no quota.
- **Mistral arm**: 1 master image ≈ **$0.10**, 5–10 s, then local downscales
  to the 5 PNG sizes (the runner does this in `--via=mistral` mode).

## Prototype (ready to review, not shipped)

- `scripts/icon-regen/mark.svg` — original hand-authored mark: framed azulejo
  tile with an eight-point star (4-point star + rotated square) and corner
  dots, cobalt `#1E4D73` on cream `#F6F1E8`. Geometry is original, not a copy
  of the Grok drawing.
- `scripts/icon-regen/mark-maskable.svg` — full-bleed maskable variant
  (inverted star + ring); all ink inside the 80% safe-zone circle.
- `scripts/icon-regen/regen-icons.mjs` — rasterizes the 5 PNGs + favicon into
  `icon-regen-out/` (gitignored), copies the current files for side-by-side,
  runs the programmatic QC (dimensions, opacity, byte size, maskable
  safe-zone scan), and writes `qc.html` + `regen-log.json`.
  `node scripts/icon-regen/regen-icons.mjs` (SVG arm);
  `node scripts/icon-regen/regen-icons.mjs --via=mistral --dry-run` prints the
  FLUX prompt; `--via=mistral` with `MISTRAL_API_KEY` generates the image.
- `scripts/icon-regen/qc.html` — visual QC harness (current vs prototype at
  180/192/512, favicon at 16–48 px in a simulated browser tab, maskable
  safe-zone overlay + OS mask previews, programmatic QC table).

## Visual QC gate (acceptance criterion 1 — executed 2026-11-15)

**Programmatic** (`icon-regen-out/regen-log.json`, all PASS):

- Dimensions exact: 180×180, 192×192, 512×512 square; regular PNGs opaque
  (no alpha channel, cobalt corners — same contract as the shipped files);
  4.4–17.7 KB, inside the current 8–24 KB ballpark.
- Maskable safe zone: max ink radius **198.9 px vs 204.8 px limit** at 512
  (74.9 vs 76.8 at 192) — all ink inside the 80% circle.

**Browser** (Chromium via Playwright, `icon-regen-out/qc.html` served over
HTTP on loopback; screenshots `screenshots/icon-regen-qc.png`,
`screenshots/icon-regen-tab.png`):

- `/favicon.svg` serves `200 image/svg+xml` (1079 bytes) via
  `<link rel="icon">`; the mark renders legibly at 16/24/32/48 px in the
  simulated tab strip. (Headless Chromium cannot capture the real OS tab
  strip, so browser-chrome rendering is evidenced by the served favicon plus
  the 16 px tab simulation, not by a native-chrome screenshot.)
- All QC-page images load, zero console/page errors.
- Maskable 512 with the 80% safe-zone overlay and circle/rounded/squircle
  mask previews: the star and ring survive every mask; nothing is clipped.
- 180/192/512 side-by-side vs current: same palette, distinct original
  geometry, reads clearly at all sizes.

## Recommendation

**Replace** the 6 icon/mark files with the hand-authored SVG mark from
`scripts/icon-regen/` (arm `svg`): original art, $0, deterministic,
license-clean with no attribution obligation, and crisp at every size because
it is vector-first. The Mistral/FLUX arm stays available
(`regen-icons.mjs --via=mistral`) if a generated look is ever preferred — it
is license-clean too, just non-deterministic and ~$0.10 per master image.

## Consequences (this change)

Prototype + QC tooling only: `scripts/icon-regen/*`, `docs/adr/0010`,
`icon-regen-out/` gitignored, QC screenshots under `screenshots/`.
`public/`, `THIRD-PARTY.md`, `about.tsx` and `about.test.mjs` are untouched —
the Grok attribution on the icon stays until the follow-up ships.

## Follow-up ticket (acceptance criterion 2)

One change, child of epic #91: copy `icon-regen-out/{favicon.svg,
icon-180/192/512.png, icon-maskable-192/512.png}` over the 6 files in
`public/` (same file names, so `manifest.webmanifest`, precache and
`azulejo-mark.tsx` are untouched), and in the same change update
`THIRD-PARTY.md` (icon/mark section: drop the "Created with Grok" list, record
the mark as original hand-authored SVG; the `og.jpg` share-card section keeps
its Grok attribution), `src/routes/about.tsx` (credits line), and
`scripts/about.test.mjs` (icon credit asserts; the `og.jpg` Grok asserts
stay). ADR 0008's attribution obligation for the icon/mark is discharged when
that change lands.

## Addendum 2026-11-16 (#104): illustrative azulejo redesign

Review on #104 found the first prototype (flat eight-point star in a plain
frame) did not read as an _illustrative_ azulejo tile. `mark.svg` /
`mark-maskable.svg` were redrawn as an illustrative tile: cobalt ceramic body,
cream glazed face, painted border moldura (double frame + diamond chain +
corner dots), a glaze highlight on the rim, and a centered eight-petal rosette
medallion with painted veins — flat editorial-illustration style, matching the
scene art (ADR 0009). Palette unchanged (`#1E4D73` / `#F6F1E8`). The
`--via=mistral` prompt in `regen-icons.mjs` was updated to the same art
direction.

QC gate re-executed 2026-11-16 (`icon-regen-out/regen-log.json`, all PASS):
exact 180/192/512 opaque PNGs (6.7–22.8 KB, cobalt corners), maskable max ink
radius **193.7 px vs 204.8 px limit** at 512 (73 vs 76.8 at 192); the 16 px
favicon render keeps the tile frame + rosette silhouette legible (pixel-level
check: cobalt corner ring, cobalt border ring, cream field, flower center).
Evidence screenshots re-rendered from the shipped bytes:
`screenshots/icon-regen-qc.png`, `screenshots/icon-regen-tab.png` (headless
Chromium cannot launch in the authoring sandbox — missing system libs — so
the QC pages were re-rendered as raster composites instead of browser
screenshots; the favicon `image/svg+xml` + built-output render checks run in
`hardening-built.test.mjs`).

The follow-up change above shipped in the #104 PR: the 6 `public/` files are
the prototype bytes, and `THIRD-PARTY.md` / `about.tsx` / `about.test.mjs`
record the mark as original hand-authored SVG (the `og.jpg` Grok attribution
stays).

## Addendum 2026-11-16 (#104 re-opened): azulejo-logo foundation

#104 was re-opened to re-found the mark on the **`azulejo-logo` asset of the
Bica library** (Mistral document library: `azulejo-logo.svg` /
`azulejo-logo.jpg`). The library SVG is vendored verbatim at
`scripts/icon-regen/azulejo-logo.svg`; `mark.svg` / `mark-maskable.svg` now
carry its geometry verbatim inside the 64-unit pipeline grid (framed tile,
four corner quarter-fans with dots, eight-petal rosette medallion — the
original's self-referential `rotate(45)` use expanded into explicit copies —
and four edge ticks), recolored to the unchanged palette (`#1E4D73` cobalt /
`#F6F1E8` cream). Still original owned artwork, not AI-generated; the `og.jpg`
Grok attribution is untouched.

QC gate re-executed 2026-11-16 (`icon-regen-out/regen-log.json`, all PASS):
exact 180/192/512 opaque PNGs (6.9–22.9 KB, cobalt corners after the full-bleed
flatten), maskable max ink radius **184.6 px vs 204.8 px limit** at 512
(69.3 vs 76.8 at 192); the 16 px favicon render keeps the tile frame, corner
fans and rosette silhouette legible (raster contact-sheet check from the
shipped bytes).

## Addendum 2026-11-16 (#104, detailed azulejo-logo): more detailed library logo

`scripts/icon-regen/azulejo-logo.svg` was replaced with the more detailed
`azulejo-logo` from the Bica library (1184x896 illustrative tile, single-ink
artwork). `mark.svg` / `mark-maskable.svg` now embed that artwork group
verbatim (same transform + path data) inside the 64-unit pipeline grid,
fitted into the framed tile with `translate(-5.5 8) scale(0.09375)` — a
cover fit of the 1184x896 viewBox into the 84x84 inner frame; the ink
bounding box (x 170-1011, y 27-870) sits fully inside the visible window, so
no artwork is cropped — and recolored to the unchanged palette (`#1E4D73`
cobalt / `#F6F1E8` cream). The 6 `public/` files were regenerated with
`node scripts/icon-regen/regen-icons.mjs` (SVG arm) and copied over; the QC
reference images `screenshots/icon-regen-qc.png` / `icon-regen-tab.png` were
re-rendered from the shipped bytes (raster composites, as before).

QC gate re-executed 2026-11-16 (`icon-regen-out/regen-log.json`, all PASS):
exact 180/192/512 opaque PNGs (15.9-56.5 KB, cobalt corners after the
full-bleed flatten), maskable max ink radius **184.6 px vs 204.8 px limit**
at 512 (69.3 vs 76.8 at 192 — frame-corner dominated, unchanged); the 16 px
favicon render keeps the tile frame and rosette silhouette legible (raster
contact-sheet check, see `screenshots/icon-regen-qc.png`).
