/**
 * Claude classifier for messages that carry no link.
 *
 * One call per message. Returns a parsed Intent or null when the call
 * fails — the caller treats null exactly like "ignore" and stays silent.
 */

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

export const MODEL = "claude-haiku-4-5";
export const CONFIDENCE_FLOOR = 0.7;

export const MEMBERS = ["Amber", "Akiha", "Hye Yeon", "Gigi", "Nadia"];
export const TRIP_DATES = ["2026-10-17", "2026-10-18", "2026-10-19", "2026-10-20"];

const Currency = z.enum(["KRW", "TWD", "JPY", "HKD", "IDR", "USD"]);
const IdeaKind = z.enum(["Food", "Cafe", "Sight", "Shop", "Night", "Other"]);
const Area = z.enum(["Hongdae", "Myeongdong", "Gangnam", "Seongsu", "Ikseon", "Other"]);

export const Intent = z.object({
  intent: z.enum(["expense", "idea", "itinerary", "vote", "bind", "help", "ignore"]),
  confidence: z.number().min(0).max(1),
  expense: z.object({
    amount: z.number(),
    currency: Currency,
    item: z.string(),
    category: z.enum(["Food", "Transport", "Stay", "Tickets", "Shopping", "Other"]),
    split_with: z.array(z.string()),
  }).nullable(),
  idea: z.object({
    title: z.string(),
    kind: IdeaKind,
    area: Area.nullable(),
    note: z.string(),
  }).nullable(),
  itinerary: z.object({
    date: z.enum(TRIP_DATES),
    time: z.string().nullable(),
    what: z.string(),
    where: z.string().nullable(),
    kind: z.enum(["Transit", "Eat", "Do", "Shop", "Stay", "Free time"]),
  }).nullable(),
  vote: z.object({
    target_id: z.string(),
    board: z.enum(["ideas", "stays"]),
  }).nullable(),
  bind: z.object({ name: z.string() }).nullable(),
});

/** Today's date in Seoul as YYYY-MM-DD. */
export function seoulToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function systemPrompt(candidates) {
  const list = candidates.length
    ? candidates.map(c => `${c.id} | ${c.board} | ${c.title}`).join("\n")
    : "(none yet)";
  return [
    "You are the quiet collector bot in a LINE group chat for a five-person trip to Seoul, 2026-10-17 (Sat) to 2026-10-20 (Tue).",
    `Members: ${MEMBERS.join(", ")}. Messages arrive in Chinese, Japanese, Korean, English or Indonesian.`,
    `Today in Seoul: ${seoulToday()}.`,
    "",
    "Classify ONE message into exactly one intent:",
    "- expense: the sender says they paid for something (amount + what). Currency defaults to KRW when unstated; ₩/원 → KRW, NT$/台幣 → TWD, ¥/円 → JPY, HK$ → HKD, Rp → IDR. split_with lists member names explicitly mentioned as sharing the cost; empty array means everyone.",
    "- idea: the sender proposes a place or activity for the trip that is NOT already in the candidate list. Any explicit proposal counts — “let’s try X”, “let’s go to X”, “we should do X”, “想去 X”, “X 行きたい”, “X 가보자”, “ayo ke X” — even when X is a name you don’t recognise, a nickname, a placeholder, or a vague reference like “the cafe from that video”: file it anyway with the text as the title and kind Other if unsure. Title in English (romanised Korean names are fine); put the original-language name and any detail in note. Do NOT ignore a proposal just because you can’t identify the place.",
    "- itinerary: the sender states a settled plan for a specific trip date (optionally a time / meeting point) — e.g. “Oct 18 2pm Gyeongbokgung, meet at exit 5”. A question or a tentative suggestion about timing (“wanna grab coffee on the 18th?”, “should we do Bukchon Sunday?”, “maybe…”) is NOT itinerary: it is still being discussed, so ignore it.",
    "- vote: the sender says they want to join / are in for a candidate that already exists in the list below. Use its id. If the place is mentioned but not in the list, that is an idea, not a vote.",
    "- bind: the sender states their own name (\"I am Gigi\", \"我是 Gigi\", \"私は Gigi\", \"저는 Gigi\", \"saya Gigi\"). Return the member name as written in the members list.",
    "- help: the sender asks what the bot can do.",
    "- ignore: everything else — chit-chat, reactions, questions to the group, jokes, replies, proposals phrased as questions, plans that are not settled, anything you are unsure about. When in doubt, ignore. Being silent is always safe; filing chatter is not.",
    "",
    "Set confidence honestly (0–1). Fill only the object that matches the intent; set the others to null.",
    "Every string you output (item, title, note, what, where) must be in English — translate or romanise; never copy Chinese, Japanese, Korean or Indonesian text through.",
    "",
    "Current candidates (id | board | title):",
    list,
  ].join("\n");
}

/**
 * @param env  Worker env with ANTHROPIC_API_KEY
 * @param opts { text, senderName, candidates: [{id, board, title}] }
 * @returns parsed Intent, or null on any failure
 */
export async function classify(env, { text, senderName, candidates }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 1 });
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt(candidates),
      messages: [{ role: "user", content: `Sender: ${senderName || "unknown (not bound yet)"}\nMessage: ${text}` }],
      output_config: { format: zodOutputFormat(Intent) },
    });
    if (res.stop_reason === "refusal") return null;
    return res.parsed_output ?? null;
  } catch (err) {
    console.error("classify failed", String(err));
    return null;
  }
}


/* ── screenshots ─────────────────────────────────────────────── */

export const ImageIntent = z.object({
  intent: z.enum(["idea", "vote", "ignore"]),
  confidence: z.number().min(0).max(1),
  idea: z.object({
    title: z.string(),
    kind: z.enum(["Food", "Cafe", "Sight", "Shop", "Night", "Stay", "Other"]),
    area: Area.nullable(),
    note: z.string(),
  }).nullable(),
  vote: z.object({ target_id: z.string(), board: z.enum(["ideas", "stays"]) }).nullable(),
});

function imagePrompt(candidates) {
  const list = candidates.length ? candidates.map(c => `${c.id} | ${c.board} | ${c.title}`).join("\n") : "(none yet)";
  return [
    "You are the quiet collector bot in a LINE group chat for a five-person trip to Seoul, 2026-10-17 to 2026-10-20.",
    "Someone shared an image. Decide whether it shows ONE specific place worth saving for the trip:",
    "- A map pin, a shop / restaurant / cafe / bar page, a hotel or Airbnb listing, a screenshot of a review or a social post about a venue → idea. Extract the place name as the title (English or romanised; keep the original script in note). kind: Food, Cafe, Sight, Shop, Night, Stay (hotels, guesthouses, apartments) or Other. Put the address, station, price or anything useful you can read in note.",
    "- If the place is already in the candidate list below → vote for it instead (use its id).",
    "- A selfie, a meme, a chat screenshot without a venue, a photo with no identifiable place, a flight ticket, a generic landscape → ignore.",
    "When in doubt, ignore. Every string you output must be in English (romanise Korean names).",
    "",
    "Current candidates (id | board | title):",
    list,
  ].join("\n");
}

/**
 * @param opts { data: base64 string, mediaType: "image/jpeg" | "image/png" | …, senderName, candidates }
 * @returns parsed ImageIntent, or null on failure
 */
export async function classifyImage(env, { data, mediaType, senderName, candidates }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 });
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 1024,
      system: imagePrompt(candidates),
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data } },
          { type: "text", text: `Shared by: ${senderName || "unknown (not bound yet)"}` },
        ],
      }],
      output_config: { format: zodOutputFormat(ImageIntent) },
    });
    if (res.stop_reason === "refusal") return null;
    return res.parsed_output ?? null;
  } catch (err) {
    console.error("classifyImage failed", String(err));
    return null;
  }
}
