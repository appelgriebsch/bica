import { a1Lessons } from "./a1";
import { a2Lessons } from "./a2";
import { b1Lessons } from "./b1";
import { b2Lessons } from "./b2";
import { c1Lessons } from "./c1";
import { grammarDrills } from "./grammar";
import { radioBulletins } from "./radio";
import { readingPieces } from "./reading";
import { speakScenarios } from "./scenarios";
import { serviceScenes } from "./service-scenes";
import { socialScenes } from "./social-scenes";
import { travelScenes } from "./travel-scenes";
import { phraseGroups, travelPhrases } from "./phrasebook";
import { verbDesks } from "./verbs";
import { SCENARIO_TOPICS, topicLabels } from "./types";
import type {
  CefrLevel,
  GrammarDrill,
  Lesson,
  RadioBulletin,
  ReadingPiece,
  ScenarioTopic,
  ServiceScene,
  SocialScene,
  SpeakScenario,
  TravelScene,
  Unit,
  VerbDesk,
  VocabItem,
} from "./types";
import type { SavedWord } from "@/lib/progress-store";
import type { SrsCard } from "@/lib/srs";
import { isDue } from "@/lib/srs";
import { normalizePt } from "@/lib/utils";

export const cefrRank: Record<CefrLevel, number> = {
  A1: 0,
  A2: 1,
  B1: 2,
  B2: 3,
  C1: 4,
};

export const levels: { id: CefrLevel; title: string; blurb: string }[] = [
  {
    id: "A1",
    title: "Survive the counter",
    blurb: "Greet, order, count, and ask where you are. The first week in Portugal.",
  },
  {
    id: "A2",
    title: "Hold a small talk",
    blurb: "Weather, yesterday, plans, the chemist, the market — conversations that last two minutes.",
  },
  {
    id: "B1",
    title: "Follow the country",
    blurb: "Stories with two pasts, a news paragraph, the radio, a page of a book, a first subjunctive.",
  },
  {
    id: "B2",
    title: "Stay in the room",
    blurb: "Feeling, literature, disagreement, and the queue that turns into a chat.",
  },
  {
    id: "C1",
    title: "The country at speed",
    blurb: "A bulletin without the glossary, a column, an argument you don't leave.",
  },
];

export const units: Unit[] = [
  {
    id: "a1-first",
    level: "A1",
    title: "First words",
    titlePt: "Primeiras palavras",
    blurb: "Hello, names, numbers, first and second.",
    image: "/scenes/cafe.jpg",
  },
  {
    id: "a1-city",
    level: "A1",
    title: "In the city",
    titlePt: "Na cidade",
    blurb: "Coffee, streets, time, tickets, a table.",
    image: "/scenes/tram.jpg",
  },
  {
    id: "a2-talk",
    level: "A2",
    title: "Daily talk",
    titlePt: "Conversas do dia",
    blurb: "Weather, the past, opinions.",
    image: "/scenes/cafe.jpg",
  },
  {
    id: "a2-life",
    level: "A2",
    title: "Out in life",
    titlePt: "Ir à vida",
    blurb: "Plans, health, shopping.",
    image: "/scenes/tram.jpg",
  },
  {
    id: "b1-listen-read",
    level: "B1",
    title: "Listen & read",
    titlePt: "Ouvir e ler",
    blurb: "Stories, news, radio, books.",
    image: "/scenes/radio.jpg",
  },
  {
    id: "b1-nuance",
    level: "B1",
    title: "Nuance",
    titlePt: "Matizes",
    blurb: "Hope, doubt, the subjunctive.",
    image: "/scenes/books.jpg",
  },
  {
    id: "b1-work",
    level: "B1",
    title: "Work",
    titlePt: "O trabalho",
    blurb: "The interview, the CV, the contract, the formal email.",
    image: "/scenes/office.jpg",
  },
  {
    id: "b2-fluent",
    level: "B2",
    title: "Fluency",
    titlePt: "Fluência",
    blurb: "Feeling, pages, argument, the street.",
    image: "/scenes/books.jpg",
  },
  {
    id: "c1-speed",
    level: "C1",
    title: "At speed",
    titlePt: "Em velocidade",
    blurb: "Radio, a column, the table that turns political.",
    image: "/scenes/radio.jpg",
  },
];

export const lessons: Lesson[] = [
  ...a1Lessons,
  ...a2Lessons,
  ...b1Lessons,
  ...b2Lessons,
  ...c1Lessons,
];

export {
  speakScenarios,
  travelScenes,
  socialScenes,
  serviceScenes,
  radioBulletins,
  readingPieces,
  grammarDrills,
  verbDesks,
  travelPhrases,
  phraseGroups,
};

export type SpeakScenarioTopicGroup = {
  topic: ScenarioTopic;
  label: string;
  scenarios: SpeakScenario[];
};

export type SpeakScenarioLevelGroup = {
  level: CefrLevel;
  title: string;
  topics: SpeakScenarioTopicGroup[];
};

/** #154 (ADR 0022): /speak grouping — one group per level in cefrRank order (titles from
 * `levels`), inside it one sub-group per topic in SCENARIO_TOPICS order; authored array
 * order is kept within a sub-group and empty groups are dropped. */
export function speakScenarioGroups(): SpeakScenarioLevelGroup[] {
  return levels
    .map((lv) => ({
      level: lv.id,
      title: lv.title,
      topics: SCENARIO_TOPICS.map((topic) => ({
        topic,
        label: topicLabels[topic],
        scenarios: speakScenarios.filter((s) => s.level === lv.id && s.topic === topic),
      })).filter((g) => g.scenarios.length > 0),
    }))
    .filter((g) => g.topics.length > 0);
}

export type CatalogVocab = VocabItem & {
  id: string;
  lessonId: string;
  level: CefrLevel;
};

export function catalogVocab(): CatalogVocab[] {
  const out: CatalogVocab[] = [];
  const seen = new Set<string>();
  for (const lesson of lessons) {
    for (const section of lesson.sections) {
      if (section.type !== "vocab") continue;
      for (const item of section.items) {
        const id = `${lesson.id}:${normalizePt(item.pt)}`;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push({ ...item, id, lessonId: lesson.id, level: lesson.level });
      }
    }
  }
  return out;
}

export function vocabFromCompleted(completedIds: string[]): CatalogVocab[] {
  const done = new Set(completedIds);
  return catalogVocab().filter((item) => done.has(item.lessonId));
}

/** One row of the Palavras pile: lesson vocab, a saved Travel Phrasebook phrase (#77, ADR 0015), or a saved Conversas word (#80, ADR 0019). */
export type ReviewItem = {
  id: string;
  pt: string;
  en: string;
  level: CefrLevel;
  hint?: string;
  examplePt?: string;
  exampleEn?: string;
};

/** Lesson vocab from completed lessons plus saved phrases/chat words (they join only once they have a card). */
export function reviewPool(
  completedIds: string[],
  cards: Record<string, SrsCard>,
  savedWords: Record<string, SavedWord> = {},
): ReviewItem[] {
  const chat: ReviewItem[] = Object.entries(savedWords)
    .filter(([id]) => Boolean(cards[id]))
    .map(([id, w]) => ({ id, pt: w.pt, en: w.en, level: w.level }));
  return [
    ...vocabFromCompleted(completedIds),
    ...travelPhrases.filter((p) => cards[p.id]),
    ...chat,
  ];
}

export function dueVocab(
  completedIds: string[],
  cards: Record<string, SrsCard>,
  today: string,
  level?: CefrLevel,
  savedWords: Record<string, SavedWord> = {},
): ReviewItem[] {
  return reviewPool(completedIds, cards, savedWords).filter((item) => {
    if (level && item.level !== level) return false;
    return isDue(cards[item.id], today);
  });
}

export function getLesson(id: string): Lesson | undefined {
  return lessons.find((l) => l.id === id);
}

export function getBulletin(id: string): RadioBulletin | undefined {
  return radioBulletins.find((b) => b.id === id);
}

export function getReading(id: string): ReadingPiece | undefined {
  return readingPieces.find((p) => p.id === id);
}

export function getGrammar(id: string): GrammarDrill | undefined {
  return grammarDrills.find((d) => d.id === id);
}

export function getVerbDesk(id: string): VerbDesk | undefined {
  return verbDesks.find((d) => d.id === id);
}

export function getTravelScene(id: string): TravelScene | undefined {
  return travelScenes.find((s) => s.id === id);
}

export function getSocialScene(id: string): SocialScene | undefined {
  return socialScenes.find((s) => s.id === id);
}

export function getServiceScene(id: string): ServiceScene | undefined {
  return serviceScenes.find((s) => s.id === id);
}

/** One scripted scene of any kind (#81, ADR 0021; #173, ADR 0032): travel, social or service. */
export function getScriptedScene(
  id: string,
): { scene: TravelScene | SocialScene | ServiceScene; kind: "travel" | "social" | "service" } | undefined {
  const travel = getTravelScene(id);
  if (travel) return { scene: travel, kind: "travel" };
  const social = getSocialScene(id);
  if (social) return { scene: social, kind: "social" };
  const service = getServiceScene(id);
  if (service) return { scene: service, kind: "service" };
  return undefined;
}

export function verbsForLevel(level: CefrLevel): VerbDesk[] {
  return verbDesks.filter((d) => d.level === level);
}

export function grammarForLevel(level: CefrLevel): GrammarDrill[] {
  return grammarDrills.filter((d) => d.level === level);
}

export function lessonsForLevel(level: CefrLevel): Lesson[] {
  return lessons.filter((l) => l.level === level);
}

export function nextLesson(id: string): Lesson | undefined {
  const i = lessons.findIndex((l) => l.id === id);
  if (i < 0 || i === lessons.length - 1) return undefined;
  return lessons[i + 1];
}

export function firstLessonOf(level: CefrLevel): Lesson | undefined {
  return lessons.find((l) => l.level === level);
}

export function nextCefr(level: CefrLevel): CefrLevel | undefined {
  return levels[cefrRank[level] + 1]?.id;
}

export function isLevelComplete(
  completed: Set<string> | Record<string, unknown>,
  level: CefrLevel,
): boolean {
  const has =
    completed instanceof Set
      ? (id: string) => completed.has(id)
      : (id: string) => Boolean((completed as Record<string, unknown>)[id]);
  const inLevel = lessonsForLevel(level);
  return inLevel.length > 0 && inLevel.every((l) => has(l.id));
}

/** True when this lesson is the one that just closed its CEFR band. */
export function newlyCompletedLevel(
  itemId: string,
  completedBefore: Record<string, unknown>,
): CefrLevel | null {
  const lesson = getLesson(itemId);
  if (!lesson) return null;
  if (isLevelComplete(completedBefore, lesson.level)) return null;
  const after = { ...completedBefore, [itemId]: true };
  return isLevelComplete(after, lesson.level) ? lesson.level : null;
}

export function firstIncomplete(completedIds: Set<string>, floor: CefrLevel = "A1"): Lesson {
  const min = cefrRank[floor];
  const pool = lessons.filter((l) => cefrRank[l.level] >= min);
  return pool.find((l) => !completedIds.has(l.id)) ?? pool[pool.length - 1] ?? lessons[lessons.length - 1]!;
}

export function workingLevel(completedIds: Set<string>, floor: CefrLevel = "A1"): CefrLevel {
  if (completedIds.size === 0) return floor;
  const est = estimatedLevel(completedIds);
  return cefrRank[est] >= cefrRank[floor] ? est : floor;
}

export function firstIncompleteOf<T extends { id: string; level: CefrLevel }>(
  items: T[],
  completedIds: Set<string>,
  prefer?: CefrLevel,
): T {
  if (prefer) {
    const inLevel = items.find((i) => i.level === prefer && !completedIds.has(i.id));
    if (inLevel) return inLevel;
  }
  return items.find((i) => !completedIds.has(i.id)) ?? items[items.length - 1]!;
}

export function estimatedLevel(completedIds: Set<string>): CefrLevel {
  const found = [...levels].reverse().find((lv) => {
    const inLevel = lessons.filter((l) => l.level === lv.id);
    const done = inLevel.filter((l) => completedIds.has(l.id)).length;
    return done >= Math.ceil(inLevel.length * 0.5);
  });
  return found?.id ?? "A1";
}

export const totalMinutes = lessons.reduce((n, l) => n + l.minutes, 0);
