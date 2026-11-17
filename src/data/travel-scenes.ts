import type { TravelScene } from "./types";

/**
 * Travel Scenes (#76, ADR 0016): scripted trip situations offered from Practice.
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
  {
    id: "scene-restaurant",
    situation: "restaurant",
    level: "A1",
    minutes: 8,
    title: "At the restaurant",
    titlePt: "No restaurante",
    setting:
      "A tasca in Bairro Alto on a Saturday evening, 20:30. Paper tablecloths. Ask for a table, check the ementa, order, then ask for the bill.",
    partner: "The waiter",
    lines: [
      {
        speaker: "You",
        pt: "Boa noite. Uma mesa para dois, se faz favor.",
        en: "Good evening. A table for two, please.",
      },
      { speaker: "Waiter", pt: "Por aqui. A ementa.", en: "This way. The menu." },
      { speaker: "You", pt: "Qual é o prato do dia?", en: "What's today's dish?" },
      { speaker: "Waiter", pt: "Bacalhau com broa.", en: "Cod with cornbread." },
      {
        speaker: "You",
        pt: "Queria o prato do dia, para mim, e um vinho da casa.",
        en: "I'd like today's dish, for me, and a house wine.",
      },
      { speaker: "Waiter", pt: "Água com gás ou sem?", en: "Sparkling or still water?" },
      {
        speaker: "You",
        pt: "Sem gás, se faz favor. O couvert está incluído?",
        en: "Still, please. Is the couvert included?",
      },
      {
        speaker: "You",
        pt: "A conta, se faz favor. Estava muito bom.",
        en: "The bill, please. It was very good.",
      },
    ],
    image: "/scenes/tasca.jpg",
    lessonId: "a1-mesa",
    scenarioId: "restaurante",
  },
  {
    id: "scene-transport",
    situation: "transport",
    level: "A1",
    minutes: 8,
    title: "Buying a ticket",
    titlePt: "O bilhete",
    setting:
      "Cais do Sodré station, morning. You need a return ticket to Cascais for today. Ask at the window about the price, the next train, and the platform.",
    partner: "The clerk at the window",
    lines: [
      {
        speaker: "You",
        pt: "Bom dia. Um bilhete de ida e volta para Cascais, se faz favor.",
        en: "Good morning. A return ticket to Cascais, please.",
      },
      { speaker: "Clerk", pt: "Ida e volta, para hoje?", en: "Return, for today?" },
      { speaker: "You", pt: "Sim. Quanto custa?", en: "Yes. How much is it?" },
      { speaker: "Clerk", pt: "Oito euros e cinquenta.", en: "Eight fifty." },
      {
        speaker: "You",
        pt: "A que horas sai o próximo comboio?",
        en: "What time does the next train leave?",
      },
      {
        speaker: "Clerk",
        pt: "Às nove e quinze, plataforma três.",
        en: "Nine fifteen, platform three.",
      },
      {
        speaker: "You",
        pt: "Este comboio vai para Cascais?",
        en: "Does this train go to Cascais?",
      },
      { speaker: "Clerk", pt: "Sim, sentido Cascais.", en: "Yes, direction Cascais." },
    ],
    image: "/scenes/ticket.jpg",
    lessonId: "a1-metro",
    scenarioId: "bilhete",
  },
  {
    id: "scene-accommodation",
    situation: "accommodation",
    level: "A2",
    minutes: 10,
    title: "Checking in",
    titlePt: "O alojamento",
    setting:
      "The receção of a small guesthouse in Alfama, late afternoon. You have a reservation for two nights. Confirm the room, ask about breakfast and the Wi-Fi, then report what does not work.",
    partner: "The host at the desk",
    lines: [
      {
        speaker: "You",
        pt: "Boa tarde. Tenho uma reserva em nome de Silva, para duas noites.",
        en: "Good afternoon. I have a reservation under Silva, for two nights.",
      },
      {
        speaker: "Host",
        pt: "Sim. Quarto doze, segundo andar. A chave?",
        en: "Yes. Room twelve, second floor. The key?",
      },
      {
        speaker: "You",
        pt: "Sim, por favor. O pequeno-almoço está incluído?",
        en: "Yes, please. Is breakfast included?",
      },
      { speaker: "Host", pt: "Sim, das oito às dez.", en: "Yes, from eight to ten." },
      { speaker: "You", pt: "Qual é a palavra-passe do Wi-Fi?", en: "What's the Wi-Fi password?" },
      {
        speaker: "Host",
        pt: "Está no quadro atrás de si. 'Lisboa2026'.",
        en: "It's on the board behind you. 'Lisboa2026'.",
      },
      {
        speaker: "You",
        pt: "O ar condicionado não funciona.",
        en: "The air conditioning doesn't work.",
      },
      {
        speaker: "Host",
        pt: "Já vou ver isso. Obrigado por dizer. Boa estadia!",
        en: "I'll see to that. Thanks for saying. Enjoy your stay!",
      },
    ],
    image: "/scenes/doorway.jpg",
    lessonId: "a2-hotel",
    scenarioId: "alojamento",
  },
  {
    id: "scene-chemist",
    situation: "chemist",
    level: "A2",
    minutes: 8,
    title: "At the chemist",
    titlePt: "Na farmácia",
    setting:
      "A neighbourhood farmácia, late afternoon, the green cross lit. Describe your symptoms, ask whether you need a doctor, and buy something sem receita.",
    partner: "The pharmacist",
    lines: [
      {
        speaker: "You",
        pt: "Boa tarde. Dói-me a cabeça e estou constipado.",
        en: "Good afternoon. My head hurts and I have a cold.",
      },
      { speaker: "Pharmacist", pt: "Há quanto tempo?", en: "For how long?" },
      { speaker: "You", pt: "Desde ontem. Não tenho febre.", en: "Since yesterday. No fever." },
      {
        speaker: "Pharmacist",
        pt: "Tome um comprimido de oito em oito horas.",
        en: "Take one tablet every eight hours.",
      },
      { speaker: "You", pt: "Isto é sem receita?", en: "Is this over the counter?" },
      {
        speaker: "Pharmacist",
        pt: "Sim. Se não melhorar, vá ao médico.",
        en: "Yes. If it doesn't improve, go to the doctor.",
      },
      { speaker: "You", pt: "Quanto custa?", en: "How much is it?" },
      {
        speaker: "Pharmacist",
        pt: "Três euros e cinquenta. Se piorar, vá ao médico.",
        en: "Three fifty. If it gets worse, see a doctor.",
      },
    ],
    image: "/scenes/farmacia.jpg",
    lessonId: "a2-farmacia",
    scenarioId: "farmacia",
  },
  {
    id: "scene-directions",
    situation: "directions",
    level: "A1",
    minutes: 8,
    title: "Asking the way",
    titlePt: "As direções",
    setting:
      "A steep Alfama street at dusk. You are looking for the castle entrance or tram 28. Ask a neighbour where it is, left or right, near or far.",
    partner: "Sr. António, a neighbour",
    lines: [
      {
        speaker: "You",
        pt: "Boa noite. Desculpe, onde fica o Castelo de São Jorge?",
        en: "Good evening. Excuse me, where is São Jorge Castle?",
      },
      {
        speaker: "Local",
        pt: "Siga sempre em frente, depois à direita.",
        en: "Go straight on, then right.",
      },
      { speaker: "You", pt: "É longe?", en: "Is it far?" },
      { speaker: "Local", pt: "Não. Cinco minutos a pé.", en: "No. Five minutes on foot." },
      { speaker: "You", pt: "E o elétrico 28?", en: "And tram 28?" },
      {
        speaker: "Local",
        pt: "A paragem fica à esquerda, em frente do miradouro.",
        en: "The stop is on the left, opposite the viewpoint.",
      },
      { speaker: "You", pt: "Pode repetir, se faz favor?", en: "Can you repeat, please?" },
      { speaker: "You", pt: "Muito obrigado.", en: "Thank you very much." },
    ],
    image: "/scenes/street.jpg",
    lessonId: "a1-onde-fica",
    scenarioId: "direcoes",
  },
];
