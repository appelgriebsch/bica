/**
 * Map a dialogue / scenario setting string to a local scene illustration under /scenes/*.
 * Images are AI-generated illustrations (Mistral AI, ADR 0009) — not the old Grok photos.
 */
export function sceneImageFor(setting: string): string {
  const s = setting.toLowerCase();

  // Food & drink counters
  if (
    s.includes("pastelaria") ||
    (s.includes("bar") && (s.includes("rain") || s.includes("bica"))) ||
    (s.includes("counter") && s.includes("pastel"))
  ) {
    return "/scenes/pastelaria.jpg";
  }
  if (s.includes("padaria") || s.includes("bakery")) {
    return "/scenes/padaria.jpg";
  }
  if (s.includes("sharing a table")) {
    return "/scenes/shared-table.jpg";
  }
  if (s.includes("tasca")) {
    return "/scenes/tasca.jpg";
  }
  if (
    s.includes("dinner") ||
    s.includes("jantar") ||
    s.includes("arroios") ||
    (s.includes("table") &&
      (s.includes("vinho") || s.includes("housing") || s.includes("lisbon is")))
  ) {
    return "/scenes/dinner.jpg";
  }
  if (
    (s.includes("table") && s.includes("outside")) ||
    s.includes("terrace") ||
    (s.includes("glasses") && s.includes("vinho"))
  ) {
    return "/scenes/terrace.jpg";
  }

  // Shops & services
  if (
    s.includes("farmácia") ||
    s.includes("farmacia") ||
    s.includes("pharmacist") ||
    s.includes("chemist")
  ) {
    return "/scenes/farmacia.jpg";
  }
  if (
    s.includes("mercado") ||
    s.includes("stall") ||
    s.includes("olives") ||
    s.includes("ribeira")
  ) {
    return "/scenes/market.jpg";
  }
  if (
    s.includes("ticket") ||
    s.includes("museum") ||
    s.includes("bilhete") ||
    (s.includes("desk") && !s.includes("office"))
  ) {
    return "/scenes/ticket.jpg";
  }
  if (
    s.includes("book") ||
    s.includes("novel") ||
    s.includes("page") ||
    s.includes("bookshop")
  ) {
    return "/scenes/books.jpg";
  }

  // Home / building
  if (
    s.includes("stairwell") ||
    s.includes("neighbour") ||
    s.includes("next door")
  ) {
    return "/scenes/stairwell.jpg";
  }
  if (
    s.includes("doorway") ||
    s.includes("lift") ||
    s.includes("viewing") ||
    s.includes("santos")
  ) {
    return "/scenes/doorway.jpg";
  }
  if (s.includes("balcony")) {
    return "/scenes/balcony.jpg";
  }

  // Streets, transport, viewpoints
  if (
    s.includes("eléctrico") ||
    s.includes("eletrico") ||
    s.includes("tram") ||
    s.includes("28") ||
    s.includes("shelter") ||
    s.includes("castelo") ||
    s.includes("castle")
  ) {
    return "/scenes/tram.jpg";
  }
  if (s.includes("miradouro") || (s.includes("bench") && s.includes("chat"))) {
    return "/scenes/miradouro.jpg";
  }
  if (s.includes("street") || s.includes("steep") || s.includes("alfama")) {
    return "/scenes/street.jpg";
  }

  // Work & media
  if (
    s.includes("office") ||
    s.includes("kitchenette") ||
    s.includes("colleague") ||
    (s.includes("lunch") && s.includes("colleague"))
  ) {
    return "/scenes/office.jpg";
  }
  if (s.includes("texting")) {
    return "/scenes/texting.jpg";
  }
  if (s.includes("centro de saúde") || s.includes("centro de saude")) {
    return "/scenes/centro-saude.jpg";
  }
  if (
    s.includes("phone") ||
    s.includes("voice note") ||
    s.includes("interview") ||
    s.includes("saudade")
  ) {
    return "/scenes/phone-call.jpg";
  }
  if (
    s.includes("radio") ||
    s.includes("bulletin") ||
    s.includes("kitchen radio") ||
    s.includes("news")
  ) {
    return "/scenes/kitchen-radio.jpg";
  }
  if (s.includes("café") || s.includes("cafe") || s.includes("column")) {
    return "/scenes/cafe.jpg";
  }

  // Generic fallback
  return "/scenes/street.jpg";
}
