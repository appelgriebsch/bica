import type { SocialScene } from "./types";

/**
 * Social Scenes (#81, ADR 0021): scripted social situations offered from Practice.
 * Static data in the precached bundle, images under /scenes/ — text and audio
 * work offline; only `scenarioId` (Conversas) needs internet. Each scene links
 * to a matching lesson whose words feed Palavras when finished, and to the
 * Conversas partner that carries the same register. Lines are written in the
 * stated register; the setting says it in words ("Falam de tu." / "Falam de você.").
 * The three new situations use their own JPGs (family-lunch/friends/colleagues.jpg,
 * #136); until they are regenerated via scripts/scene-regen those files reuse the
 * dinner/terrace/office art.
 */
export const socialScenes: SocialScene[] = [
  {
    id: "social-almoco-familia",
    level: "A2",
    minutes: 10,
    title: "Family lunch",
    titlePt: "Almoço em família",
    setting:
      "Sunday lunch at Inês's parents' house in Almada. The table is full and the food is already on it. You are the guest. Falam de você.",
    partner: "Dona Celeste, Inês's mother",
    lines: [
      {
        speaker: "Host",
        pt: "Boa tarde! Entra, entra. Quer beber alguma coisa?",
        en: "Good afternoon! Come in, come in. Would you like something to drink?",
      },
      {
        speaker: "You",
        pt: "Boa tarde, dona Celeste. Obrigado. Um copo de água, por favor.",
        en: "Good afternoon, Dona Celeste. Thank you. A glass of water, please.",
      },
      { speaker: "Host", pt: "A sopa está na mesa. Sirva-se!", en: "The soup is on the table. Help yourself!" },
      {
        speaker: "You",
        pt: "Que bom aspeto! Quem cozinhou?",
        en: "It looks great! Who cooked?",
      },
      { speaker: "Host", pt: "Fui eu. A Inês ajudou um pouco.", en: "I did. Inês helped a little." },
      {
        speaker: "You",
        pt: "Então está deliciosa. Parabéns!",
        en: "Then it's delicious. Congratulations!",
      },
      {
        speaker: "Host",
        pt: "Ficamos contentes. Quando podem vir outra vez?",
        en: "We're glad. When can you come again?",
      },
      {
        speaker: "You",
        pt: "Daqui a duas semanas, se for possível.",
        en: "In two weeks, if that's possible.",
      },
    ],
    image: "/scenes/family-lunch.jpg",
    lessonId: "a1-familia",
    scenarioId: "almoco-familia",
  },
  {
    id: "social-amigos-da-ines",
    level: "A2",
    minutes: 10,
    title: "Meeting her friends",
    titlePt: "Conhecer os amigos",
    setting:
      "On a terrace in Bairro Alto, Inês introduces you to her friends. Drinks are on the table. Everyone uses tu. Falam de tu.",
    partner: "Marta and Pedro, friends of Inês",
    lines: [
      {
        speaker: "Marta",
        pt: "Olá! Eu sou a Marta. E tu és…?",
        en: "Hi! I'm Marta. And you are…?",
      },
      {
        speaker: "You",
        pt: "Olá, Marta! Sou o amigo da Inês. Prazer!",
        en: "Hi Marta! I'm Inês's friend. Nice to meet you!",
      },
      { speaker: "Pedro", pt: "O Pedro. Tu és de onde?", en: "Pedro. Where are you from?" },
      {
        speaker: "You",
        pt: "Sou da Alemanha. E vocês?",
        en: "I'm from Germany. And you?",
      },
      {
        speaker: "Marta",
        pt: "De Lisboa. Moras aqui há muito tempo?",
        en: "From Lisbon. Have you lived here long?",
      },
      { speaker: "You", pt: "Há três meses. Estou a adorar.", en: "Three months. I love it." },
      {
        speaker: "Pedro",
        pt: "Vamos pedir uma rodada. O que bebes?",
        en: "Let's get a round. What are you drinking?",
      },
      {
        speaker: "You",
        pt: "Uma imperial, por favor. E vocês?",
        en: "A small beer, please. And you?",
      },
    ],
    image: "/scenes/friends.jpg",
    lessonId: "a2-amigos",
    scenarioId: "amigos-da-ines",
  },
  {
    id: "social-cafe-colegas",
    level: "B1",
    minutes: 10,
    title: "Coffee with colleagues",
    titlePt: "Café com os colegas",
    setting:
      "Friday 16:00, the office kitchenette. The project is running late and everyone is a bit stressed. Colleagues use você. Falam de você.",
    partner: "Rita, a colleague",
    lines: [
      {
        speaker: "Rita",
        pt: "Boa tarde! Já bebeu o seu café hoje?",
        en: "Good afternoon! Have you had your coffee yet?",
      },
      {
        speaker: "You",
        pt: "Boa tarde, Rita. Ainda não. E você?",
        en: "Good afternoon, Rita. Not yet. And you?",
      },
      {
        speaker: "Rita",
        pt: "Já tomei dois. O projeto está atrasado.",
        en: "I've had two already. The project is behind schedule.",
      },
      {
        speaker: "You",
        pt: "Pois, eu também reparei. O que está em falta?",
        en: "Yes, I noticed too. What's missing?",
      },
      {
        speaker: "Rita",
        pt: "Falta a revisão do relatório. Você pode ajudar?",
        en: "The report review is missing. Can you help?",
      },
      {
        speaker: "You",
        pt: "Claro. Mande-me o ficheiro, por favor.",
        en: "Of course. Please send me the file.",
      },
      {
        speaker: "Rita",
        pt: "Obrigada! E o seu fim de semana, como foi?",
        en: "Thanks! And your weekend, how was it?",
      },
      {
        speaker: "You",
        pt: "Muito bom, obrigado. Fui à praia com a Inês.",
        en: "Very good, thanks. I went to the beach with Inês.",
      },
    ],
    image: "/scenes/colleagues.jpg",
    lessonId: "a2-trabalho",
    scenarioId: "cafe-colegas",
  },
  {
    id: "social-planos",
    level: "A2",
    minutes: 10,
    title: "Making dinner plans",
    titlePt: "Marcar jantar",
    setting:
      "You are texting — here, speaking — with a Portuguese friend. Propose dinner tomorrow. Negotiate time. One of you will book. Falam de tu.",
    partner: "Inês, a friend",
    lines: [
      {
        speaker: "Inês",
        pt: "Olá! Então, vais ter tempo amanhã à noite?",
        en: "Hi! So, will you have time tomorrow night?",
      },
      {
        speaker: "You",
        pt: "Olá! Sim, tenho. A que horas pensas?",
        en: "Hi! Yes, I do. What time are you thinking?",
      },
      {
        speaker: "Inês",
        pt: "Que tal às oito? Há um restaurante novo.",
        en: "How about eight? There's a new restaurant.",
      },
      { speaker: "You", pt: "Perfeito. Onde fica?", en: "Perfect. Where is it?" },
      {
        speaker: "Inês",
        pt: "Perto do metro. Eu mando-te a morada.",
        en: "Near the metro. I'll send you the address.",
      },
      { speaker: "You", pt: "Ótimo. Até amanhã!", en: "Great. See you tomorrow!" },
      { speaker: "Inês", pt: "Até! Combinado.", en: "See you! Deal." },
    ],
    image: "/scenes/phone.jpg",
    lessonId: "a2-planos",
    scenarioId: "planos",
  },
  {
    id: "social-marcar-encontro",
    level: "A2",
    minutes: 10,
    title: "Fixing a time over the phone",
    titlePt: "Marcar um encontro",
    setting:
      "You are on the phone with a Portuguese friend. Fix a day and a time to meet — propose, adjust, close. Falam de tu.",
    partner: "Inês, a friend",
    lines: [
      { speaker: "Inês", pt: "Alô? Sou a Inês. Tudo bem?", en: "Hello? It's Inês. All good?" },
      {
        speaker: "You",
        pt: "Olá, Inês! Tudo. Olha, vamos jantar na sexta-feira às oito?",
        en: "Hi Inês! Fine. Look, shall we have dinner on Friday at eight?",
      },
      { speaker: "Inês", pt: "Sexta às oito? Pode ser. Onde é que vamos?", en: "Friday at eight? Sure. Where are we going?" },
      {
        speaker: "You",
        pt: "Conheces aquele restaurante novo perto do metro?",
        en: "Do you know that new restaurant near the metro?",
      },
      {
        speaker: "Inês",
        pt: "Conheço, sim. Então ficamos às oito em frente a ele?",
        en: "I do. So, eight o'clock in front of it?",
      },
      { speaker: "You", pt: "Combinado! Até sexta-feira.", en: "Deal! See you Friday." },
      { speaker: "Inês", pt: "Até sexta! Beijinhos.", en: "See you Friday! Kisses." },
    ],
    image: "/scenes/phone.jpg",
    lessonId: "a1-dias",
    scenarioId: "marcar-encontro",
  },
  {
    id: "social-fim-de-semana",
    level: "A2",
    minutes: 10,
    title: "How was the weekend?",
    titlePt: "O fim de semana",
    setting:
      "Monday at a café with a colleague. They ask about your weekend. Tell a short story in the pretérito. Ask them back. Falam de você.",
    partner: "Rui, a colleague",
    lines: [
      {
        speaker: "Rui",
        pt: "Então, como correu o fim de semana?",
        en: "So, how was the weekend?",
      },
      {
        speaker: "You",
        pt: "Muito bem, obrigado. Fui ao cinema no sábado.",
        en: "Very well, thanks. I went to the cinema on Saturday.",
      },
      { speaker: "Rui", pt: "E no domingo?", en: "And on Sunday?" },
      {
        speaker: "You",
        pt: "No domingo almocei em casa dos meus sogros.",
        en: "On Sunday I had lunch at my in-laws'.",
      },
      { speaker: "Rui", pt: "Gostaram?", en: "Did they like it?" },
      {
        speaker: "You",
        pt: "Sim, correu muito bem. E o seu fim de semana?",
        en: "Yes, it went very well. And your weekend?",
      },
      { speaker: "Rui", pt: "Também foi bom. Descansei.", en: "It was good too. I rested." },
    ],
    image: "/scenes/cafe.jpg",
    lessonId: "a2-ontem",
    scenarioId: "fim-de-semana",
  },
  {
    id: "social-habitacao",
    level: "B2",
    minutes: 12,
    title: "Over dinner: the city",
    titlePt: "À mesa",
    setting:
      "A dinner in Arroios. The table is talking about tourism and housing in Lisbon. Take a nuanced position. Falam de tu.",
    partner: "Joana, a friend of a friend",
    lines: [
      {
        speaker: "Joana",
        pt: "E tu, o que achas? Esta cidade ainda é para quem cá vive?",
        en: "And you, what do you think? Is this city still for the people who live here?",
      },
      {
        speaker: "You",
        pt: "É uma boa pergunta. Por um lado, o turismo ajuda a economia.",
        en: "Good question. On one hand, tourism helps the economy.",
      },
      { speaker: "Joana", pt: "Mas as rendas sobem.", en: "But rents go up." },
      {
        speaker: "You",
        pt: "Isso é verdade. Diria que o problema é a falta de casas.",
        en: "That's true. I'd say the problem is the lack of housing.",
      },
      {
        speaker: "Joana",
        pt: "Exato. E tu, já pensaste em mudar de bairro?",
        en: "Exactly. Have you thought about moving neighbourhood?",
      },
      {
        speaker: "You",
        pt: "Às vezes. Mas gosto de viver aqui.",
        en: "Sometimes. But I like living here.",
      },
      { speaker: "Joana", pt: "Compreendo. Eu também.", en: "I understand. Me too." },
    ],
    image: "/scenes/dinner.jpg",
    lessonId: "b2-debate",
    scenarioId: "habitacao",
  },
  {
    id: "social-saudade-talk",
    level: "B2",
    minutes: 10,
    title: "Missing home, a little less",
    titlePt: "Saudades",
    setting:
      "A balcony at dusk after a month in Portugal. A host asks how you really are. Be precise about feeling. Falam de você.",
    partner: "Miguel, your host",
    lines: [
      {
        speaker: "Miguel",
        pt: "Já se sente à-vontade, ou ainda tem saudades de casa?",
        en: "Do you feel at ease yet, or do you still miss home?",
      },
      {
        speaker: "You",
        pt: "Um pouco de cada. Já me sinto melhor em Lisboa.",
        en: "A bit of both. I already feel better in Lisbon.",
      },
      {
        speaker: "Miguel",
        pt: "Isso é bom. A saudade passa com o tempo.",
        en: "That's good. Homesickness passes with time.",
      },
      {
        speaker: "You",
        pt: "Espero que sim. Obrigado por me receber em sua casa.",
        en: "I hope so. Thank you for having me in your home.",
      },
      {
        speaker: "Miguel",
        pt: "Faz parte. E você, o que mais gosta daqui?",
        en: "You're welcome. And what do you like most here?",
      },
      {
        speaker: "You",
        pt: "Gosto das pessoas e da comida.",
        en: "I like the people and the food.",
      },
    ],
    image: "/scenes/balcony.jpg",
    lessonId: "b2-saudade",
    scenarioId: "saudade-talk",
  },
  {
    id: "social-mesa-serio",
    level: "C1",
    minutes: 12,
    title: "The table, in earnest",
    titlePt: "A mesa, a sério",
    setting:
      "Dinner in Arroios. Housing again. Concede what is true. Keep a piece. Falam de tu.",
    partner: "Joana, a friend of a friend",
    lines: [
      {
        speaker: "Joana",
        pt: "Esta cidade já não é para quem cá vive. Ponto. Ou ainda achas que não?",
        en: "This city is no longer for the people who live here. Full stop. Or do you still think otherwise?",
      },
      {
        speaker: "You",
        pt: "Há quem diga isso. Mas eu ainda vejo muitos lisboetas no meu bairro.",
        en: "Some say that. But I still see many Lisboners in my neighbourhood.",
      },
      {
        speaker: "Joana",
        pt: "Vês, mas cada vez menos.",
        en: "You see them, but fewer and fewer.",
      },
      {
        speaker: "You",
        pt: "Ainda que seja difícil, a cidade pode mudar.",
        en: "Even if it's difficult, the city can change.",
      },
      { speaker: "Joana", pt: "Como?", en: "How?" },
      {
        speaker: "You",
        pt: "Com mais casas e menos alojamento local. Podemos ficar por aqui.",
        en: "With more housing and less short-term rentals. We can stop here.",
      },
      { speaker: "Joana", pt: "OK, aceito o ponto.", en: "OK, I accept the point." },
    ],
    image: "/scenes/dinner.jpg",
    lessonId: "c1-discussao",
    scenarioId: "mesa-serio",
  },
];
