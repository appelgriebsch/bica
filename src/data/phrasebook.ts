import { normalizePt } from "@/lib/utils";
import { travelScenes } from "./travel-scenes";
import {
  TRAVEL_SITUATIONS,
  type PhraseSituation,
  type TravelPhrase,
} from "./types";

/**
 * Travel Phrasebook (#77, ADR 0015): trip phrases by situation, shown on You
 * before any Lesson is finished. Static data in the precached bundle, so the
 * list works offline; audio is the shared on-device pt-PT SpeakButton.
 *
 * The phrases are derived from the six Travel Scenes (#76): every "You" line
 * is a phrase a traveller actually says, deduped by normalizePt. The id is
 * `travel:<situation>:<normalised pt>` — the same shape as lesson vocab card
 * ids, so the encrypted QR transfer accepts saved phrase cards unchanged.
 * T2 (#126) appends the "anywhere" staples to `travelPhrases`.
 */

function deriveFromScenes(): TravelPhrase[] {
  const out: TravelPhrase[] = [];
  const seen = new Set<string>();
  for (const scene of travelScenes) {
    for (const line of scene.lines) {
      if (line.speaker !== "You") continue;
      const id = `travel:${scene.situation}:${normalizePt(line.pt)}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({
        id,
        situation: scene.situation,
        level: scene.level,
        pt: line.pt,
        en: line.en,
      });
    }
  }
  return out;
}

export const travelPhrases: TravelPhrase[] = [...deriveFromScenes()];

export type PhraseGroup = {
  situation: PhraseSituation;
  labelPt: string;
  labelEn: string;
  phrases: TravelPhrase[];
};

const ANYWHERE_LABEL = { pt: "Qualquer lado", en: "Anywhere" } as const;

/** Groups in display order: the "anywhere" staples first, then the six situations. */
export function phraseGroups(): PhraseGroup[] {
  const groups: PhraseGroup[] = [];
  const anywhere = travelPhrases.filter((p) => p.situation === "anywhere");
  if (anywhere.length > 0) {
    groups.push({
      situation: "anywhere",
      labelPt: ANYWHERE_LABEL.pt,
      labelEn: ANYWHERE_LABEL.en,
      phrases: anywhere,
    });
  }
  for (const situation of TRAVEL_SITUATIONS) {
    const phrases = travelPhrases.filter((p) => p.situation === situation);
    if (phrases.length === 0) continue;
    const scene = travelScenes.find((s) => s.situation === situation);
    groups.push({
      situation,
      labelPt: scene?.titlePt ?? situation,
      labelEn: scene?.title ?? situation,
      phrases,
    });
  }
  return groups;
}
