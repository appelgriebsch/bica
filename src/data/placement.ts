import { cefrRank, levels } from "./curriculum";
import type { CefrLevel, QuizQuestion } from "./types";

export type PlacementBand = {
  level: CefrLevel;
  items: QuizQuestion[];
};

export const PLACEMENT_PER_BAND = 3;
export const CLEAR_THRESHOLD = 2;

export const placementBands: PlacementBand[] = [
  {
    level: "A1",
    items: [
      {
        id: "a1-q1",
        kind: "choice",
        prompt: "It's 10:00. How do you greet the baker?",
        options: ["Boa noite", "Bom dia", "Boa tarde", "Adeus"],
        answer: 1,
        explain: "Bom dia runs until lunch, roughly.",
      },
      {
        id: "a1-q2",
        kind: "listen",
        prompt: "What did you hear?",
        speak: "Chamo-me Rita.",
        options: ["My name is Rita.", "Good night, Rita.", "Thank you, Rita.", "See you, Rita."],
        answer: 0,
        explain: "Chamo-me = I call myself.",
      },
      {
        id: "a1-q3",
        kind: "type",
        prompt: "Type the Portuguese 'please' at the counter.",
        accept: ["se faz favor"],
        explain: "Se faz favor is the counter classic.",
      },
    ],
  },
  {
    level: "A2",
    items: [
      {
        id: "a2-q1",
        kind: "truefalse",
        prompt: "“Está chovendo” is the European Portuguese for 'it's raining'.",
        options: ["True", "False"],
        answer: 1,
        explain: "Está a chover in Portugal; -ndo is the Brazilian form.",
      },
      {
        id: "a2-q2",
        kind: "choice",
        prompt: "“Ontem fui à Belém” — 'fui' here means…",
        options: ["I go", "I went", "I was (for good)", "I will go"],
        answer: 1,
        explain: "Fui is the pretérito of ir: a finished 'went'.",
      },
      {
        id: "a2-q3",
        kind: "type",
        prompt: "Type 'I live in Lisbon'.",
        accept: ["vivo em lisboa", "moro em lisboa"],
        explain: "Vivo em… and moro em… both work.",
      },
    ],
  },
  {
    level: "B1",
    items: [
      {
        id: "b1-q1",
        kind: "choice",
        prompt: "“Ontem ___ ao mercado e ___ um café.”",
        options: ["fui, tomei", "ia, bebia", "tenho ido, tenho tomado", "vou, vou tomar"],
        answer: 0,
        explain: "Pretérito perfeito for the finished steps; imperfeito for background.",
      },
      {
        id: "b1-q2",
        kind: "choice",
        prompt: "“Espero que corra bem” — 'corra' is…",
        options: ["subjunctive", "indicative present", "imperative", "conditional"],
        answer: 0,
        explain: "Espero que + subjunctive.",
      },
      {
        id: "b1-q3",
        kind: "listen",
        prompt: "What did you hear?",
        speak: "Se não chover, vamos à praia.",
        options: [
          "If it doesn't rain, we go to the beach",
          "If it rains, we go to the beach",
          "We never go to the beach",
          "It rained, so we stayed in",
        ],
        answer: 0,
        explain: "Se + present tense: não chover.",
      },
    ],
  },
  {
    level: "B2",
    items: [
      {
        id: "b2-q1",
        kind: "choice",
        prompt: "“Há quem diga que a cidade está cara” — 'há quem diga' means…",
        options: ["Some say", "I say", "No one says", "Everyone agrees"],
        answer: 0,
        explain: "Reports a view without owning it.",
      },
      {
        id: "b2-q2",
        kind: "choice",
        prompt: "“Ainda que não concorde, fico” — 'ainda que' introduces…",
        options: ["a concession", "a cause", "a condition", "a result"],
        answer: 0,
        explain: "A concession: even if / even though.",
      },
      {
        id: "b2-q3",
        kind: "type",
        prompt: "Type 'I miss you' (to one person).",
        accept: ["tenho saudades tuas", "tenho saudades de ti"],
        explain: "Ter saudades de alguém.",
      },
    ],
  },
  {
    level: "C1",
    items: [
      {
        id: "c1-q1",
        kind: "choice",
        prompt: "“Mal cheguei, comecei a trabalhar” means…",
        options: [
          "As soon as I arrived, I started working",
          "Before I arrived, I was working",
          "I arrived late and left",
          "I will arrive and then start",
        ],
        answer: 0,
        explain: "Mal + present tense = as soon as.",
      },
      {
        id: "c1-q2",
        kind: "truefalse",
        prompt: "“Em certa medida, concordo” fully agrees.",
        options: ["True", "False"],
        answer: 1,
        explain: "Em certa medida = to some extent; it hedges the agreement.",
      },
      {
        id: "c1-q3",
        kind: "listen",
        prompt: "What did you hear?",
        speak: "A questão não é o preço, é a forma como se discute.",
        options: [
          "The issue is not the price but how it is discussed",
          "The price is too high",
          "They refuse to discuss it",
          "Money solves everything",
        ],
        answer: 0,
        explain: "Não é o preço, é a forma.",
      },
    ],
  },
];

export function recommendLevel(scores: Record<CefrLevel, number>): CefrLevel {
  const order = levels.map((l) => l.id);
  const cleared = order.filter((lv) => (scores[lv] ?? 0) >= CLEAR_THRESHOLD);
  if (cleared.length === 0) return "A1";
  const lowestFailed = order.find((lv) => (scores[lv] ?? 0) < CLEAR_THRESHOLD);
  if (!lowestFailed) return cleared[cleared.length - 1]!;
  const cap = cefrRank[lowestFailed];
  const below = cleared.filter((lv) => cefrRank[lv] < cap);
  return below.length > 0 ? below[below.length - 1]! : "A1";
}
