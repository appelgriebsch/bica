/**
 * Prompt table for regenerating the 20 scene illustrations in public/scenes/
 * with a non-xAI provider (issue #93). One prompt per scene, derived from the
 * settings mapped in src/lib/scene-image.ts and from visual QC of the current
 * Grok-generated JPGs.
 *
 * The shared STYLE prefix locks the art direction across all 20 scenes so the
 * set reads as one photo series: warm photoreal Lisbon, golden-hour or soft
 * daylight, azulejo/cobblestone cues, muted cream-terracotta-ochre palette with
 * azulejo blue accents.
 */

export const STYLE =
  "Photorealistic photograph, 16:9 landscape composition, subject centered with safe margins for a 16:9 center crop. " +
  "Lisbon, Portugal setting. Warm golden-hour or soft natural daylight, subtle film grain, shallow depth of field in the background. " +
  "Muted warm palette: cream, terracotta, ochre, weathered wood, with blue-and-white azulejo tile accents. " +
  "No watermark, no logo, no border, no text unless the scene description explicitly names a sign. " +
  "No cartoon, illustration, 3D render, or HDR look.";

export const NEGATIVE =
  "watermark, signature, logo, text artifacts, gibberish lettering, distorted hands, extra limbs, blurry faces, " +
  "cartoon, anime, illustration, 3D render, oversaturated colors, cold blue lighting";

/**
 * Illustrative alternative (issue #93 option c, AI-generated): flat editorial
 * illustration that leans on the app's azulejo brand mark — limited warm
 * palette with recurring blue-and-white tile patterns instead of photos.
 */
export const ILLUSTRATION_STYLE =
  "Flat editorial illustration, 16:9 landscape composition, subject centered with safe margins for a 16:9 center crop. " +
  "Lisbon, Portugal setting. Limited palette of cream, terracotta, ochre, weathered wood and azulejo blue, with bold " +
  "Portuguese azulejo tile patterns as a recurring motif, clean vector-like shapes, flat color blocks suggesting warm " +
  "golden-hour light, subtle paper grain. No photorealism, no 3D, no heavy gradients. " +
  "No watermark, no logo, no border, no text unless the scene description explicitly names a sign.";

export const ILLUSTRATION_NEGATIVE =
  "photograph, photorealistic, 3D render, HDR, watermark, signature, logo, text artifacts, gibberish lettering, " +
  "distorted hands, extra limbs, blurry faces, anime, oversaturated colors, cold blue lighting";

export const STYLES = {
  photo: { label: "photoreal (current look)", prefix: STYLE, negative: NEGATIVE },
  illustration: { label: "flat illustration (azulejo)", prefix: ILLUSTRATION_STYLE, negative: ILLUSTRATION_NEGATIVE },
};

/**
 * scene file name (without .jpg) -> scene description.
 * Keys must match the files in public/scenes/ exactly.
 */
export const SCENES = {
  balcony:
    "A small Lisbon apartment balcony at dusk: terracotta pots with green plants, ornate wrought-iron railing, " +
    "view over terracotta rooftops toward the river, a lit wall lantern casting warm light, pink-orange sunset sky.",
  books:
    "A cozy home library corner: floor-to-ceiling dark wooden bookshelves packed with old books, a worn upholstered armchair " +
    "with a cushion, a brass table lamp glowing warm, patterned rug on the floor, soft window light.",
  cafe:
    "Close-up of a white cup of espresso on a saucer on a polished marble café counter, blue-and-white azulejo tile wall behind, " +
    "a glass sugar dispenser, soft morning light through a window, shallow depth of field.",
  dinner:
    "A Portuguese dinner table set for two: red wine glasses, a basket of crusty bread, a bowl of olives, a small dish of olive oil, " +
    "speckled ceramic plates and linen napkins, open French doors behind showing Lisbon rooftops at dusk, warm lamplight.",
  doorway:
    "Entrance of a Lisbon apartment building: a heavy wooden door standing open revealing a lift, cream azulejo tiles with a blue " +
    "floral pattern on the façade, a stone street plaque beside an intercom and a wall lantern, a potted plant, overcast daylight.",
  farmacia:
    "Bright modern Portuguese pharmacy interior: a white service counter with a green cross symbol, shelves stocked with medicine " +
    "boxes, large windows, clean white and grey surfaces with green accents, daylight.",
  "kitchen-radio":
    "A vintage brown bakelite radio on a worn kitchen counter in Lisbon: azulejo tile backsplash, a window with a lace curtain and " +
    "a potted herb on the sill, a marble countertop with an enamel mug, warm morning sunlight.",
  market:
    "A vegetable and olive stall at Mercado da Ribeira market in Lisbon: black bowls of green and black olives, crates of tomatoes, " +
    "garlic and leafy greens, small chalk price signs, the iron roof structure above, blurred shoppers in the background.",
  miradouro:
    "A stone bench at a Lisbon miradouro viewpoint at golden hour: panoramic view over whitewashed buildings with terracotta roofs " +
    "down to the Tagus river and the 25 de Abril bridge in the haze, soft warm light, ivy on the wall.",
  office:
    "A bright modern office kitchenette: light wood cabinets and white countertop, a black electric kettle, a pour-over coffee maker " +
    "and a manual grinder, two mugs, potted plants, large windows with daylight, clean minimal.",
  padaria:
    "Traditional Lisbon bakery interior: tall wooden shelves stacked with crusty round bread loaves and baguettes, a marble counter " +
    "with a blue-and-white azulejo tile front, a glass display with pastries, a chalkboard menu, warm pendant light.",
  pastelaria:
    "A classic Lisbon pastelaria counter: a curved glass display case full of golden pastel de nata tarts, a dark marble counter with " +
    "price tags, a chrome espresso machine, azulejo tile walls, hanging pendant lamps, warm inviting light.",
  phone:
    "A smartphone lying on a café table showing a messaging app chat, next to a dark ceramic cup of espresso on a saucer, " +
    "granite tabletop, blurred Lisbon street in the background with a yellow tram passing, soft daylight.",
  radio:
    "A vintage wooden radio on a windowsill, the window open with a lace curtain, panoramic view over Lisbon's terracotta rooftops " +
    "and the Tagus river at golden hour, warm backlight through the window.",
  stairwell:
    "An old Lisbon building stairwell: a worn wooden staircase with turned balusters climbing upward, blue-and-white azulejo tiles " +
    "on the walls, a green apartment door, stone tile floor, soft light from a window above.",
  street:
    "A narrow steep cobblestone street in Alfama, Lisbon: whitewashed and yellow buildings with wrought-iron balconies, azulejo tile " +
    "panels on the walls, a potted plant on the sill, overcast soft daylight, empty street.",
  tasca:
    "A small traditional Portuguese tasca interior: wooden tables with white lace tablecloths, wine glasses, an olive oil bottle and " +
    "a metal cup, blue-and-white azulejo dado on the walls, framed pictures and menus, dark wooden ceiling beams, warm dim light.",
  terrace:
    "A café terrace on a Lisbon street at golden hour: a round marble table with two glasses of red wine, metal café chairs, " +
    "a cobblestone street and ochre buildings behind a wrought-iron railing, warm low sunlight.",
  ticket:
    "A museum ticket office: a wooden counter with a service bell and a tray of tickets, a glass partition behind it with a desk " +
    "and computer inside, framed signage on the beige wall, soft daylight.",
  tram:
    "A vintage yellow tram (elétrico 28) on a narrow cobblestone street in Lisbon, an azulejo-tiled building wall right beside it, " +
    "overhead electric wires, golden-hour sunlight, empty tram.",
};

/** Build the full prompt for one scene in one style ("photo" | "illustration"). */
export function promptFor(name, style = "photo") {
  const scene = SCENES[name];
  const s = STYLES[style];
  if (!scene) throw new Error(`no prompt for scene "${name}"`);
  if (!s) throw new Error(`unknown style "${style}"; known: ${Object.keys(STYLES).join(", ")}`);
  return `${s.prefix} Scene: ${scene} Avoid: ${s.negative}.`;
}
