/** Every feature that needs the network. Offline TTS (Web Speech) is deliberately absent. */
export type OnlineFeature = {
  id: string;
  name: { en: string; pt: string };
  reason: { en: string; pt: string };
  /** Where to go instead while offline; omitted when the reason says it all. */
  alternative?: { to: string; label: { en: string; pt: string } };
};

export const ONLINE_FEATURES = {
  conversas: {
    id: "conversas",
    name: { en: "Conversas", pt: "Conversas" },
    reason: {
      en: "Conversas talks to a live partner and needs internet. Palavras and Rádio work offline.",
      pt: "As Conversas usam um parceiro ao vivo e precisam de internet. Palavras e Rádio funcionam sem ligação.",
    },
    alternative: { to: "/review", label: { en: "Practise Palavras", pt: "Praticar Palavras" } },
  },
  // No UI and no /api/rtc route yet (src/lib/multiplayer/p2p.ts): registered so it gets marked once it ships.
  multiplayer: {
    id: "multiplayer",
    name: { en: "Multiplayer", pt: "Multijogador" },
    reason: {
      en: "Playing together needs internet.",
      pt: "Jogar em conjunto precisa de internet.",
    },
  },
} satisfies Record<string, OnlineFeature>;

export type OnlineFeatureId = keyof typeof ONLINE_FEATURES;
