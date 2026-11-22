import type { VerbDesk, VerbEntry, VerbTense } from "./types";

const PERSONS = ["eu", "tu", "ele/você", "nós", "eles/vocês"] as const;

function tense(
  label: string,
  labelEn: string,
  forms: [string, string, string, string, string],
): VerbTense {
  return {
    label,
    labelEn,
    forms: PERSONS.map((person, i) => ({ person, form: forms[i]! })),
  };
}

function verb(
  inf: string,
  en: string,
  tenses: VerbTense[],
  note?: string,
): VerbEntry {
  return { inf, en, tenses, note };
}

const present = {
  ser: tense("Presente", "present", ["sou", "és", "é", "somos", "são"]),
  estar: tense("Presente", "present", ["estou", "estás", "está", "estamos", "estão"]),
  ter: tense("Presente", "present", ["tenho", "tens", "tem", "temos", "têm"]),
  ir: tense("Presente", "present", ["vou", "vais", "vai", "vamos", "vão"]),
  querer: tense("Presente", "present", ["quero", "queres", "quer", "queremos", "querem"]),
  poder: tense("Presente", "present", ["posso", "podes", "pode", "podemos", "podem"]),
  fazer: tense("Presente", "present", ["faço", "fazes", "faz", "fazemos", "fazem"]),
};

const pret = {
  ser: tense("Pretérito", "simple past", ["fui", "foste", "foi", "fomos", "foram"]),
  estar: tense("Pretérito", "simple past", ["estive", "estiveste", "esteve", "estivemos", "estiveram"]),
  ter: tense("Pretérito", "simple past", ["tive", "tiveste", "teve", "tivemos", "tiveram"]),
  ir: tense("Pretérito", "simple past", ["fui", "foste", "foi", "fomos", "foram"]),
  querer: tense("Pretérito", "simple past", ["quis", "quiseste", "quis", "quisemos", "quiseram"]),
  poder: tense("Pretérito", "simple past", ["pude", "pudeste", "pôde", "pudemos", "puderam"]),
  fazer: tense("Pretérito", "simple past", ["fiz", "fizeste", "fez", "fizemos", "fizeram"]),
};

const impf = {
  ser: tense("Imperfeito", "used to / was", ["era", "eras", "era", "éramos", "eram"]),
  estar: tense("Imperfeito", "used to / was", ["estava", "estavas", "estava", "estávamos", "estavam"]),
  ter: tense("Imperfeito", "used to / was", ["tinha", "tinhas", "tinha", "tínhamos", "tinham"]),
  ir: tense("Imperfeito", "used to / was", ["ia", "ias", "ia", "íamos", "iam"]),
  fazer: tense("Imperfeito", "used to / was", ["fazia", "fazias", "fazia", "fazíamos", "faziam"]),
};

const fut = {
  ir: tense("Futuro", "will", ["irei", "irás", "irá", "iremos", "irão"]),
  ter: tense("Futuro", "will", ["terei", "terás", "terá", "teremos", "terão"]),
  fazer: tense("Futuro", "will", ["farei", "farás", "fará", "faremos", "farão"]),
  poder: tense("Futuro", "will", ["poderei", "poderás", "poderá", "poderemos", "poderão"]),
};

const cond = {
  ser: tense("Condicional", "would", ["seria", "serias", "seria", "seríamos", "seriam"]),
  estar: tense("Condicional", "would", ["estaria", "estarias", "estaria", "estaríamos", "estariam"]),
  ir: tense("Condicional", "would", ["iria", "irias", "iria", "iríamos", "iriam"]),
  ter: tense("Condicional", "would", ["teria", "terias", "teria", "teríamos", "teriam"]),
  fazer: tense("Condicional", "would", ["faria", "farias", "faria", "faríamos", "fariam"]),
  querer: tense("Condicional", "would", ["queria", "querias", "queria", "queríamos", "queriam"]),
  poder: tense("Condicional", "would", ["poderia", "poderias", "poderia", "poderíamos", "poderiam"]),
};

/** #176 (gap G7): the conditional of courtesy at a counter — queria um café, podia ajudar? */
const cortesia = {
  ser: tense("Cond. de cortesia", "polite would", ["seria", "serias", "seria", "seríamos", "seriam"]),
  estar: tense("Cond. de cortesia", "polite would", ["estaria", "estarias", "estaria", "estaríamos", "estariam"]),
  querer: tense("Cond. de cortesia", "polite would", ["queria", "querias", "queria", "queríamos", "queriam"]),
  poder: tense("Cond. de cortesia", "polite would", ["podia", "podias", "podia", "podíamos", "podiam"]),
};

const futConj = {
  ser: tense("Fut. conjuntivo", "when / if it happens", ["for", "fores", "for", "formos", "forem"]),
  ter: tense("Fut. conjuntivo", "when / if it happens", ["tiver", "tiveres", "tiver", "tivermos", "tiverem"]),
  fazer: tense("Fut. conjuntivo", "when / if it happens", ["fizer", "fizeres", "fizer", "fizermos", "fizerem"]),
  querer: tense("Fut. conjuntivo", "when / if it happens", ["quiser", "quiseres", "quiser", "quisermos", "quiserem"]),
  poder: tense("Fut. conjuntivo", "when / if it happens", ["puder", "puderes", "puder", "pudermos", "puderem"]),
};

export const verbDesks: VerbDesk[] = [
  {
    id: "verb-a1-presente",
    level: "A1",
    minutes: 12,
    title: "The counter verbs — present",
    titlePt: "Presente",
    focus: "Ser, estar, ter, ir, querer — right now",
    body: "These five open every door in Portugal. European você takes the same form as ele: o senhor é, a senhora tem, você vai. Tu is for friends: tu és, tu tens. Tap a line, say it back.",
    verbs: [
      verb("ser", "to be (the long story)", [present.ser]),
      verb("estar", "to be (right now)", [present.estar]),
      verb("ter", "to have", [present.ter], "Têm (they have) keeps the circumflex."),
      verb("ir", "to go", [present.ir]),
      verb("querer", "to want", [present.querer]),
    ],
    quiz: [
      { id: "q1", kind: "choice", prompt: "Eu ___ de Frankfurt. (ser)", options: ["estou", "sou", "tenho", "vou"], answer: 1, explain: "Origin is ser: sou." },
      { id: "q2", kind: "choice", prompt: "Tu, to a friend: you have…", options: ["tem", "tens", "têm", "tenho"], answer: 1, explain: "Tu tens." },
      { id: "q3", kind: "type", prompt: "Type 'I go' (present).", accept: ["vou", "eu vou"], explain: "Eu vou." },
      { id: "q4", kind: "truefalse", prompt: "Você uses the same verb form as ele / ela.", options: ["True", "False"], answer: 0, explain: "O senhor vai, ela vai, você vai." },
      { id: "q5", kind: "choice", prompt: "Nós, of ser…", options: ["são", "somos", "estamos", "vamos"], answer: 1, explain: "Nós somos." },
      { id: "q6", kind: "listen", prompt: "Which person of ir?", speak: "Vais à pastelaria?", options: ["eu", "tu", "nós", "eles"], answer: 1, explain: "Vais = tu." },
      { id: "q7", kind: "choice", prompt: "They want (eles)…", options: ["quer", "quero", "querem", "queremos"], answer: 2, explain: "Eles querem." },
    ],
  },
  {
    id: "verb-a2-preterito",
    level: "A2",
    minutes: 16,
    title: "Pasts and the polite would",
    titlePt: "Passados e cortesia",
    focus: "Pretérito, imperfeito, and the conditional of courtesy: queria, podia",
    body: "Pretérito is a closed door: it happened, it's done — fui, estive, fiz. Imperfeito paints the scene: era tarde, chovia, eu ia de elétrico — habits and background (the full pretérito-vs-imperfeito contrast waits for B1). And the polite would at any counter: queria um café, podia ajudar? The conditional of courtesy is how Portugal softens a request.",
    verbs: [
      verb("ser", "to be — I was (identity, event)", [pret.ser, impf.ser, cortesia.ser], "Same pretérito forms as ir. Context decides: fui professor vs fui ao café. Seria = polite 'would be'."),
      verb("ir", "to go — I went", [pret.ir, impf.ir], "Ia todos os dias = I used to go every day."),
      verb("estar", "to be — I was (state, place)", [pret.estar, impf.estar, cortesia.estar], "Estava = I was (state); estaria = polite 'would be'."),
      verb("ter", "to have — I had", [pret.ter, impf.ter], "Tinha = I had (habit/state)."),
      verb("fazer", "to do / make — I did", [pret.fazer, impf.fazer], "Fazia = I used to do."),
      verb("querer", "to want — polite would", [cortesia.querer], "Queria um café, por favor — the polite order. A1-level survival at a Portuguese counter."),
      verb("poder", "to be able — polite would", [cortesia.poder], "Podia ajudar-me? — could you help me (polite)."),
    ],
    quiz: [
      { id: "q1", kind: "choice", prompt: "I went to Lisbon yesterday…", options: ["Ia a Lisboa", "Fui a Lisboa", "Vou a Lisboa", "Era a Lisboa"], answer: 1, explain: "Finished trip = pretérito fui." },
      { id: "q2", kind: "choice", prompt: "Tu, pretérito of ir / ser…", options: ["foste", "fui", "esteve", "eras"], answer: 0, explain: "Tu foste." },
      { id: "q3", kind: "type", prompt: "Type 'I did' (fazer, pretérito).", accept: ["fiz", "eu fiz"], explain: "Eu fiz." },
      { id: "q4", kind: "truefalse", prompt: "Ser and ir share fui / foste / foi in the pretérito.", options: ["True", "False"], answer: 0, explain: "Same set. The rest of the sentence tells you which." },
      { id: "q5", kind: "choice", prompt: "Ele, pretérito of estar…", options: ["estava", "esteve", "está", "estive"], answer: 1, explain: "Ele esteve." },
      { id: "q6", kind: "listen", prompt: "Which verb?", speak: "Ontem tive uma reunião.", options: ["ter", "ir", "ser", "estar"], answer: 0, explain: "Tive = I had." },
      { id: "q7", kind: "choice", prompt: "Right now, in Portugal, 'I'm ordering' is…", options: ["Estou pedindo", "Estou a pedir", "Pedi agora ser", "Estava a pedir ontem"], answer: 1, explain: "Estar a + infinitive. Pretérito is yesterday." },
      { id: "q8", kind: "choice", prompt: "Imperfeito of ser, eu…", options: ["era", "fui", "sou", "seria"], answer: 0, explain: "Eu era — background/habit, not a closed event." },
      { id: "q9", kind: "listen", prompt: "What does the customer order politely?", speak: "Queria um café, por favor.", options: ["A blunt 'quero'", "A coffee, politely (queria)", "A tea", "The bill at once"], answer: 1, explain: "Queria um café — the conditional of courtesy." },
      { id: "q10", kind: "type", prompt: "Type 'could you help me?' (polite, poder).", accept: ["podia ajudar-me", "podia ajudar-me?", "podia me ajudar"], explain: "Podia ajudar-me?" },
    ],
  },
  {
    id: "verb-b1-passados",
    level: "B1",
    minutes: 14,
    title: "Two pasts, and going to",
    titlePt: "Dois passados",
    focus: "Pretérito vs imperfeito, plus vou + infinitive",
    body: "Pretérito cuts: ontem fui, ela ligou, o comboio chegou. Imperfeito paints: era tarde, chovia, eu ia de eléctrico. Side by side below. For the future in the mouth, European Portuguese prefers ir + infinitive: vou telefonar, vais ver. The written -ei futuro can wait until B2.",
    verbs: [
      verb("ser", "to be", [pret.ser, impf.ser], "Fui once. Era the weather of the past."),
      verb("ir", "to go", [pret.ir, impf.ir], "Fui ao médico. Ia todos os dias."),
      verb("estar", "to be (state)", [pret.estar, impf.estar]),
      verb("ter", "to have", [pret.ter, impf.ter]),
      verb("fazer", "to do", [pret.fazer, impf.fazer]),
    ],
    quiz: [
      { id: "q1", kind: "choice", prompt: "Background: it was raining…", options: ["Choveu (only, as a scene)", "Chovia", "Vai chover as past", "Choverei"], answer: 1, explain: "Scene-setting = imperfeito." },
      { id: "q2", kind: "choice", prompt: "The phone rang (a single event)…", options: ["O telefone tocava", "O telefone tocou", "O telefone ia tocar sempre", "Toca ontem"], answer: 1, explain: "One ring that happened = pretérito." },
      { id: "q3", kind: "type", prompt: "Type 'I used to go' / 'I was going' (eu, ir).", accept: ["ia", "eu ia"], explain: "Eu ia." },
      { id: "q4", kind: "truefalse", prompt: "“Vou telefonar amanhã” is the usual spoken future.", options: ["True", "False"], answer: 0, explain: "Ir + infinitive. Telefonarei is more formal or written." },
      { id: "q5", kind: "choice", prompt: "Nós, imperfeito of ser…", options: ["fomos", "éramos", "somos", "iremos"], answer: 1, explain: "Nós éramos." },
      { id: "q6", kind: "listen", prompt: "Finished or a scene?", speak: "Quando era miúdo, ia de eléctrico.", options: ["A single finished trip", "A past habit / scene", "Tomorrow's plan", "A command"], answer: 1, explain: "Era + ia = imperfeito." },
      { id: "q7", kind: "choice", prompt: "Tu, spoken future of ver…", options: ["verás", "vais ver", "viste", "vias"], answer: 1, explain: "Vais ver." },
    ],
  },
  {
    id: "verb-b2-futuro",
    level: "B2",
    minutes: 14,
    title: "Will, would, if I could",
    titlePt: "Futuro e condicional",
    focus: "Written future, conditional, se + imperfect subjunctive",
    body: "The -ei future shows up in print and pledges: farei, terás, poderão. The mouth still likes vou / vais. Condicional is the polite and the hypothetical: gostaria, poderia, faria. Real 'if' in European Portuguese often takes the imperfect subjunctive: se pudesse, se fosse, se tivesse tempo. Pair them: se pudesse, iria.",
    verbs: [
      verb("ir", "to go", [fut.ir, cond.ir]),
      verb("ter", "to have", [fut.ter, cond.ter]),
      verb("fazer", "to do", [fut.fazer, cond.fazer]),
      verb("poder", "to be able", [fut.poder, cond.poder], "Se pudesse = if I could. Pudesse is imperfect subjunctive, not this table."),
    ],
    quiz: [
      { id: "q1", kind: "choice", prompt: "Written 'I will do'…", options: ["vou fazer only", "farei", "fazia", "faria always"], answer: 1, explain: "Farei. Spoken still often vou fazer." },
      { id: "q2", kind: "choice", prompt: "I would go…", options: ["irei", "iria", "fui", "ia only as habit"], answer: 1, explain: "Iria." },
      { id: "q3", kind: "type", prompt: "Type 'I would like' (eu, gostar, conditional).", accept: ["gostaria", "eu gostaria"], explain: "Gostaria — the polite counter verb." },
      { id: "q4", kind: "truefalse", prompt: "“Se pudesse, ia” / “se pudesse, iria” is the natural if-clause shape.", options: ["True", "False"], answer: 0, explain: "Se + imperfect subjunctive, then imperfeito or condicional." },
      { id: "q5", kind: "choice", prompt: "Tu, future of ter…", options: ["terás", "tinhas", "tiveste", "terias"], answer: 0, explain: "Tu terás." },
      { id: "q6", kind: "listen", prompt: "Will or would?", speak: "Poderia repetir, se faz favor?", options: ["A hard future", "A polite would / could", "Yesterday", "A command"], answer: 1, explain: "Poderia = conditional, the soft ask." },
      { id: "q7", kind: "choice", prompt: "Nós, conditional of fazer…", options: ["faremos", "faríamos", "fazíamos", "fizemos"], answer: 1, explain: "Nós faríamos." },
    ],
  },
  {
    id: "verb-c1-conjuntivo",
    level: "C1",
    minutes: 14,
    title: "When it happens, if I can, I would have",
    titlePt: "Quando for",
    focus: "Futuro do conjuntivo, and teria + participle",
    body: "English uses a present after when: when I arrive. European Portuguese inflects: quando chegar, se quiseres, assim que soubermos. Ser and ir share for / fores / for. Ter: tiver. The other half of C1 is the compound: teria dito, teria ido — rumour and regret. Terá dito is the news, not the dinner table.",
    verbs: [
      verb("ser / ir", "to be / to go — when it is, when you go", [futConj.ser], "Quando for preciso. Quando fores a Lisboa. Same set."),
      verb("ter", "to have — when I have", [futConj.ter], "Quando tiver tempo. Se tiveres dúvidas."),
      verb("fazer", "to do — when I do", [futConj.fazer]),
      verb("querer", "to want — if you want", [futConj.querer], "Se quiseres, fico. Se quiser, fico (você)."),
      verb("poder", "to be able — if I can", [futConj.poder], "Se puder, ligo. Compound: teria podido."),
    ],
    quiz: [
      { id: "q1", kind: "choice", prompt: "When the train arrives (future event)…", options: ["Quando o comboio chega sempre", "Quando chegar o comboio", "Quando chegou", "Quando vai chegar, nós vamos"], answer: 1, explain: "Quando chegar." },
      { id: "q2", kind: "choice", prompt: "If you (tu) want…", options: ["se queres", "se quiseres", "se querias", "se quererás"], answer: 1, explain: "Se quiseres." },
      { id: "q3", kind: "type", prompt: "Type 'when I have time'.", accept: ["quando tiver tempo", "quando eu tiver tempo"], explain: "Quando tiver." },
      { id: "q4", kind: "truefalse", prompt: "Ser and ir share for / fores / for in the future subjunctive.", options: ["True", "False"], answer: 0, explain: "Quando for; quando fores." },
      { id: "q5", kind: "choice", prompt: "A rumour in the news: the minister is said to have said…", options: ["O ministro disse, tape in hand", "O ministro terá dito", "O ministro dizia sempre", "O ministro faria"], answer: 1, explain: "Terá dito — report, not a recording." },
      { id: "q6", kind: "listen", prompt: "What is the condition?", speak: "Se puder, ligo à tarde.", options: ["If I can, I'll call", "I already called", "I would have called", "Never call"], answer: 0, explain: "Se puder = if I can (future subjunctive)." },
      { id: "q7", kind: "choice", prompt: "I would have gone…", options: ["iria", "teria ido", "fui", "tinha ido only as pluperfect scene"], answer: 1, explain: "Teria ido — conditional perfect. Tinha ido is the pluperfect ('I had gone')." },
    ],
  },
];
