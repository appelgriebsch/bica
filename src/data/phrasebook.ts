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
 * The phrases are derived from the seven Travel Scenes (#76, #167): every "You" line
 * is a phrase a traveller actually says, plus the "anywhere" staples below
 * (lifted from vetted A1 lesson entries where possible), all deduped by
 * normalizePt. The id is `travel:<situation>:<normalised pt>` — the same shape
 * as lesson vocab card ids, so the encrypted QR transfer accepts saved phrase
 * cards unchanged.
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

/** Cross-situational staples (#126): pt/en lifted from vetted A1 lesson entries where possible. */
const STAPLES: ReadonlyArray<Omit<TravelPhrase, "id">> = [
  { situation: "anywhere", level: "A1", pt: "Tudo bem?", en: "All good?" },
  { situation: "anywhere", level: "A1", pt: "Desculpe, pode ajudar?", en: "Excuse me, can you help?" },
  { situation: "anywhere", level: "A1", pt: "Onde fica…?", en: "Where is… located?" },
  { situation: "anywhere", level: "A1", pt: "Mais devagar, se faz favor.", en: "More slowly, please." },
  { situation: "anywhere", level: "A1", pt: "Com licença.", en: "Excuse me (passing through)." },
  { situation: "anywhere", level: "A1", pt: "Não percebi.", en: "I didn't get that." },
  { situation: "anywhere", level: "A1", pt: "Aceitam cartão?", en: "Do you take card?" },
  { situation: "anywhere", level: "A1", pt: "Onde é a casa de banho?", en: "Where is the toilet?" },
];

export const travelPhrases: TravelPhrase[] = (() => {
  const out = deriveFromScenes();
  const seen = new Set(out.map((p) => p.id));
  for (const staple of STAPLES) {
    const id = `travel:anywhere:${normalizePt(staple.pt)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...staple, id });
  }
  return out;
})();

export type PhraseGroup = {
  situation: PhraseSituation;
  labelPt: string;
  labelEn: string;
  phrases: TravelPhrase[];
};

const ANYWHERE_LABEL = { pt: "Qualquer lado", en: "Anywhere" } as const;

/** Groups in display order: the "anywhere" staples first, then the seven situations. */
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
