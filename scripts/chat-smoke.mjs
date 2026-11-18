/**
 * No-token chat probes (#55, #132). Each id is a content hash of its server fn;
 * each body is the seroval payload for one pastelaria turn. The built test and
 * the staging smoke read them from here.
 */
import { pathToFileURL } from "node:url";

export const SEND_CHAT = "a6c1db121df31c780863651ffdf226f842441dec27cf2216ec61f708eb327331";
/** #132: content hash of the `reviewScene` server fn (#131, ADR 0017). */
export const REVIEW_SCENE = "47bfa4d47f930add1773dbb7b4fd0f204baf8c45697d0c1c02954f772426ea64";

/** `{ data: { scenarioId: "pastelaria", messages: [{ role: "user", content: "Olá" }] } }`. */
export const CHAT_TURN =
  '{"t":{"t":10,"i":0,"p":{"k":["data"],"v":[{"t":10,"i":1,"p":{"k":["scenarioId","messages"],"v":[{"t":1,"s":"pastelaria"},{"t":9,"i":2,"a":[{"t":10,"i":3,"p":{"k":["role","content"],"v":[{"t":1,"s":"user"},{"t":1,"s":"Olá"}]},"o":0}],"o":0}]},"o":0}]},"o":0},"f":127,"m":[]}';
/** Same envelope for reviewScene: a valid `reviewInput` (one user turn to review). */
export const REVIEW_TURN = CHAT_TURN;

/** Same-origin POST, no token. True only for 403 + challenge_required. */
async function probeGate(url, id, body, label) {
  const origin = String(url ?? "").replace(/\/$/, "");
  const res = await fetch(`${origin}/_serverFn/${id}`, {
    method: "POST",
    body,
    headers: {
      "content-type": "application/json",
      "x-tsr-serverfn": "true",
      "sec-fetch-site": "same-origin",
      origin,
    },
  });
  const text = await res.text();
  if (res.status === 403 && text.includes("challenge_required")) {
    console.log(`${label} ok: 403 challenge_required`);
    return true;
  }
  console.error(`${label}: HTTP ${res.status}`);
  console.error(text.slice(0, 300));
  if (res.status === 404) console.error("unknown server fn id");
  return false;
}

export async function probeChatGate(url) {
  return probeGate(url, SEND_CHAT, CHAT_TURN, "chat gate");
}

/** #132: same no-token probe for `reviewScene` — the review is gated like a chat turn. */
export async function probeReviewGate(url) {
  return probeGate(url, REVIEW_SCENE, REVIEW_TURN, "review gate");
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const [cmd, url] = process.argv.slice(2);
  if (cmd === "id") process.stdout.write(SEND_CHAT);
  else if (cmd === "body") process.stdout.write(CHAT_TURN);
  else if (cmd === "review-id") process.stdout.write(REVIEW_SCENE);
  else if (cmd === "review-body") process.stdout.write(REVIEW_TURN);
  else if (cmd === "probe" || cmd === "review-probe") {
    if (!url) {
      console.error("usage: node scripts/chat-smoke.mjs probe|review-probe <staging-url>");
      process.exit(2);
    }
    process.exit((await (cmd === "probe" ? probeChatGate(url) : probeReviewGate(url))) ? 0 : 1);
  } else {
    console.error(
      "usage: node scripts/chat-smoke.mjs id|body|review-id|review-body|probe|review-probe <url>",
    );
    process.exit(2);
  }
}
