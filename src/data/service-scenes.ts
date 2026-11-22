import type { ServiceScene } from "./types";

/**
 * Service Scenes (#173, ADR 0032): scripted public-service situations offered from
 * Practice. Static data in the precached bundle, images under /scenes/ — text and
 * audio work offline; only `scenarioId` (Conversas) needs internet. Each scene links
 * to a matching lesson whose words feed Palavras when finished, and 1:1 to a
 * Conversas partner that carries the register. Lines are written in the stated
 * register; the setting says it in words ("Falam de você.").
 */
export const serviceScenes: ServiceScene[] = [
  {
    id: "service-marcar-consulta",
    level: "A2",
    minutes: 8,
    title: "Booking a consulta",
    titlePt: "Marcar consulta",
    setting:
      "You are on the phone with the receção of the centro de saúde, weekday morning. Book a consulta with o médico de família and confirm the time. Falam de você.",
    partner: "The receptionist at the centro de saúde",
    lines: [
      {
        speaker: "You",
        pt: "Bom dia. Estou — posso falar com a receção, por favor?",
        en: "Good morning. Speaking — may I speak with reception, please?",
      },
      { speaker: "Receptionist", pt: "Sim, diga. Em que posso ajudar?", en: "Yes, go ahead. How can I help?" },
      {
        speaker: "You",
        pt: "Queria marcar uma consulta com o médico de família, se faz favor.",
        en: "I'd like to book an appointment with the family doctor, please.",
      },
      {
        speaker: "Receptionist",
        pt: "É utente deste centro? Tem o número de utente?",
        en: "Are you registered at this centre? Do you have your utente number?",
      },
      { speaker: "You", pt: "Sim, sou utente. Tenho o número aqui.", en: "Yes, I'm registered. I have the number here." },
      {
        speaker: "Receptionist",
        pt: "Para quando? Temos quinta-feira às dez ou às quinze.",
        en: "For when? We have Thursday at ten or at three.",
      },
      { speaker: "You", pt: "Quinta-feira às dez fica bem. Obrigado!", en: "Thursday at ten is fine. Thank you!" },
      { speaker: "Receptionist", pt: "Está marcado. Até quinta-feira!", en: "It's booked. See you Thursday!" },
    ],
    image: "/scenes/centro-saude.jpg",
    lessonId: "a2-saude",
    scenarioId: "marcar-consulta",
  },
];
