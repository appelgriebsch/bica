import type { TravelScene } from "./types";

/**
 * Travel Scenes (#76, ADR 0013): scripted trip situations offered from Practice.
 * Static data in the precached bundle, images under /scenes/ — text and audio
 * work offline; only `scenarioId` (Conversas) needs internet. Each scene links
 * to a matching A1/A2 lesson whose words feed Palavras when finished.
 */
export const travelScenes: TravelScene[] = [
  {
    id: "scene-cafe",
    situation: "cafe",
    level: "A1",
    minutes: 8,
    title: "At the café",
    titlePt: "No café",
    setting:
      "Standing at the bar of a café in Campo de Ourique, 08:40, rain on the window. Order, ask the price, choose for here or to go, then ask for the bill.",
    partner: "Teresa, behind the bar",
    lines: [
      {
        speaker: "Clerk",
        pt: "Bom dia. Então, o que vai ser?",
        en: "Good morning. So, what will it be?",
      },
      {
        speaker: "You",
        pt: "Uma bica e um pastel de nata, se faz favor.",
        en: "An espresso and a custard tart, please.",
      },
      { speaker: "Clerk", pt: "O pastel quente?", en: "The tart warm?" },
      {
        speaker: "You",
        pt: "Sim, quente. E uma água sem gás. Quanto custa?",
        en: "Yes, warm. And a still water. How much is it?",
      },
      {
        speaker: "Clerk",
        pt: "Fica em quatro euros e cinquenta.",
        en: "That comes to four fifty.",
      },
      { speaker: "Clerk", pt: "Para aqui ou para levar?", en: "For here or to go?" },
      { speaker: "You", pt: "Para aqui, se faz favor.", en: "For here, please." },
      { speaker: "You", pt: "A conta, por favor. Obrigado.", en: "The bill, please. Thank you." },
    ],
    image: "/scenes/pastelaria.jpg",
    lessonId: "a1-bica",
    scenarioId: "pastelaria",
  },
];
