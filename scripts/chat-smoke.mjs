/**
 * No-token chat probe (#55). The id is a content hash of sendChat; the body is
 * the seroval payload for one pastelaria turn. The built test and the staging
 * smoke both read them from here.
 */
import { pathToFileURL } from "node:url";

export const SEND_CHAT = "a6c1db121df31c780863651ffdf226f842441dec27cf2216ec61f708eb327331";

/** `{ data: { scenarioId: "pastelaria", messages: [{ role: "user", content: "Olá" }] } }`. */
export const CHAT_TURN =
  '{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":10,"i":1,"p":{"k":["scenarioId","messages"],"v":[{"t":1,"s":"pastelaria"},{"t":9,"i":2,"a":[{"t":10,"i":3,"p":{"k":["role","content"],"v":[{"t":1,"s":"user"},{"t":1,"s":"Olá"}]},"o":0}],"o":0}]},"o":0}]},"o":0},"f":127,"m":[]}';

/** Same-origin POST, no token. True only for 403 + challenge_required. */
export async function probeChatGate(url) {
  const origin = String(url ?? "").replace(/\/$/, "");
  const res = await fetch(`${origin}/_serverFn/${SEND_CHAT}`, {
    method: "POST",
    body: CHAT_TURN,
    headers: {
      "content-type": "application/json",
      "x-tsr-serverfn": "true",
      "sec-fetch-site": "same-origin",
      origin,
    },
  });
  const text = await res.text();
  if (res.status === 403 && text.includes("challenge_required")) {
    console.log("chat gate ok: 403 challenge_required");
    return true;
  }
  console.error(`chat gate: HTTP ${res.status}`);
  console.error(text.slice(0, 300));
  if (res.status === 404) console.error("unknown server fn id");
  return false;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd, url] = process.argv.slice(2);
  if (cmd === "id") process.stdout.write(SEND_CHAT);
  else if (cmd === "body") process.stdout.write(CHAT_TURN);
  else if (cmd === "probe") {
    if (!url) {
      console.error("usage: node scripts/chat-smoke.mjs probe <staging-url>");
      process.exit(2);
    }
    process.exit((await probeChatGate(url)) ? 0 : 1);
  } else {
    console.error("usage: node scripts/chat-smoke.mjs id|body|probe <url>");
    process.exit(2);
  }
}
