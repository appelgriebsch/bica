export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1";

export type Skill = "speak" | "listen" | "read" | "mix";

export type VocabItem = {
  pt: string;
  hint: string;
  en: string;
  examplePt: string;
  exampleEn: string;
};

export type QuizQuestion = {
  id: string;
  kind: "choice" | "truefalse" | "listen" | "type";
  prompt: string;
  speak?: string;
  options?: string[];
  answer?: number;
  accept?: string[];
  explain: string;
};

/** Portugal × Brasil note (#82, ADR 0018): both forms of a contrast, side by side. */
export type PtNote = {
  pt: string;
  br: string;
  en: string;
};

export type LessonSection =
  | {
      type: "intro";
      kicker: string;
      title: string;
      body: string;
      phrase: { pt: string; en: string };
      ptNote?: PtNote;
    }
  | { type: "vocab"; items: VocabItem[]; ptNote?: PtNote }
  | {
      type: "grammar";
      title: string;
      body: string;
      examples: { pt: string; en: string }[];
      ptNote?: PtNote;
    }
  | {
      type: "dialogue";
      setting: string;
      lines: DialogueLine[];
      ptNote?: PtNote;
    }
  | { type: "culture"; title: string; body: string; ptNote?: PtNote };

export type Lesson = {
  id: string;
  level: CefrLevel;
  unitId: string;
  unit: string;
  order: number;
  minutes: number;
  title: string;
  titlePt: string;
  skill: Skill;
  summary: string;
  goals: string[];
  image: string;
  sections: LessonSection[];
  quiz: QuizQuestion[];
};

export type Unit = {
  id: string;
  level: CefrLevel;
  title: string;
  titlePt: string;
  blurb: string;
  image: string;
};

/** Social Scenes (#81, ADR 0021): the register the partner addresses the learner with. */
export type Register = "tu" | "você";

/** Conversas topics (#154, ADR 0022): fixed set in display order, inner groups on /speak. */
export const SCENARIO_TOPICS = [
  "social",
  "travel",
  "food",
  "shopping",
  "health",
  "work",
  "home",
  "leisure",
] as const;

export type ScenarioTopic = (typeof SCENARIO_TOPICS)[number];

export const topicLabels: Record<ScenarioTopic, string> = {
  social: "Social",
  travel: "Travel",
  food: "Food",
  shopping: "Shopping",
  health: "Health",
  work: "Work",
  home: "Home",
  leisure: "Leisure",
};

export type SpeakScenario = {
  id: string;
  level: CefrLevel;
  minutes: number;
  title: string;
  titlePt: string;
  setting: string;
  partner: string;
  openerPt: string;
  openerEn: string;
  goals: string[];
  image: string;
  /** Topic group on /speak (#154, ADR 0022); "social" keeps the ADR 0021 register contract. */
  topic: ScenarioTopic;
  /** Register the partner keeps to; server-side data only, never client input (#81, ADR 0021). */
  register?: Register;
};

export type DialogueLine = { speaker: string; pt: string; en: string };

export const TRAVEL_SITUATIONS = [
  "cafe",
  "restaurant",
  "transport",
  "accommodation",
  "chemist",
  "directions",
  "market",
] as const;

export type TravelSituation = (typeof TRAVEL_SITUATIONS)[number];

export type TravelScene = {
  id: string;
  situation: TravelSituation;
  level: "A1" | "A2";
  minutes: number;
  title: string;
  titlePt: string;
  setting: string;
  partner: string;
  lines: DialogueLine[];
  image: string;
  /** Matching lesson; its words feed Palavras when finished (ADR 0016). */
  lessonId: string;
  /** Conversas partner, online-only (ADR 0016/0014). */
  scenarioId?: string;
};

/**
 * Social Scenes (#81, ADR 0021): scripted social situations on Practice — family,
 * friends, colleagues. Unlike TravelScene there is no `situation` field: the
 * phrasebook derives from `travelScenes` only and stays travel-only.
 */
export type SocialScene = {
  id: string;
  level: CefrLevel;
  minutes: number;
  title: string;
  titlePt: string;
  setting: string;
  partner: string;
  lines: DialogueLine[];
  image: string;
  /** Matching lesson; its words feed Palavras when finished (ADR 0021). */
  lessonId: string;
  /** Conversas partner, online-only; carries the register (ADR 0021). */
  scenarioId: string;
};

/** Travel Phrasebook (#77, ADR 0015): a trip situation, or "anywhere" for the staples group. */
export type PhraseSituation = TravelSituation | "anywhere";

export type TravelPhrase = {
  id: string;
  situation: PhraseSituation;
  level: "A1" | "A2";
  pt: string;
  en: string;
};

export type RadioBulletin = {
  id: string;
  level: CefrLevel;
  minutes: number;
  station: string;
  title: string;
  titlePt: string;
  kicker: string;
  script: string;
  translation: string;
  image: string;
  quiz: QuizQuestion[];
};

export type ReadingPiece = {
  id: string;
  level: CefrLevel;
  minutes: number;
  kind: "notice" | "message" | "news" | "page" | "column";
  source: string;
  title: string;
  titlePt: string;
  paragraphs: { pt: string; en: string }[];
  notes: { pt: string; en: string }[];
  /** Portugal × Brasil note (#164, ADR 0027), rendered below the notes on /read/$id. */
  ptNote?: PtNote;
  image: string;
  quiz: QuizQuestion[];
};

export type GrammarDrill = {
  id: string;
  level: CefrLevel;
  minutes: number;
  title: string;
  titlePt: string;
  focus: string;
  body: string;
  examples: { pt: string; en: string }[];
  /** Portugal × Brasil note (#160, ADR 0024), rendered below the examples on /grammar/$id. */
  ptNote?: PtNote;
  quiz: QuizQuestion[];
};

export type VerbForm = {
  person: string;
  form: string;
};

export type VerbTense = {
  label: string;
  labelEn: string;
  forms: VerbForm[];
};

export type VerbEntry = {
  inf: string;
  en: string;
  note?: string;
  tenses: VerbTense[];
};

export type VerbDesk = {
  id: string;
  level: CefrLevel;
  minutes: number;
  title: string;
  titlePt: string;
  focus: string;
  body: string;
  verbs: VerbEntry[];
  quiz: QuizQuestion[];
};
