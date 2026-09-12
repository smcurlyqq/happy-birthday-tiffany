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

import { TRIP, MEMBER_NAMES, DAYS, TRIP_SPAN, GROUP_SIZE } from "./config.js";
export const MEMBERS = MEMBER_NAMES;
export const TRIP_DATES = DAYS;

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

/** Today's date in the trip's time zone as YYYY-MM-DD. */
export function seoulToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TRIP.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

function systemPrompt(candidates) {
  const list = candidates.length
    ? candidates.map(c => `${c.id} | ${c.board} | ${c.title}`).join("\n")
    : "(none yet)";
  return [
    `You are the quiet collector bot in a LINE group chat for a ${GROUP_SIZE}-person trip to ${TRIP.city}, ${TRIP_SPAN}.`,
    `Members: ${MEMBERS.join(", ")}. Messages arrive in Chinese, Japanese, Korean, English or Indonesian.`,
    `Today in ${TRIP.city}: ${seoulToday()}.`,
    "",
    "Classify ONE message into exactly one intent:",
    "- expense: the sender says they paid for something (amount + what). Currency defaults to KRW when unstated; ₩/원 → KRW, NT$/台幣 → TWD, ¥/円 → JPY, HK$ → HKD, Rp → IDR. split_with lists member names explicitly mentioned as sharing the cost; empty array means everyone.",
    "- idea: the sender proposes a place or activity for the trip that is NOT already in the candidate list. Any explicit proposal counts — “let’s try X”, “let’s go to X”, “we should do X”, “想去 X”, “X 行きたい”, “X 가보자”, “ayo ke X” — even when X is a name you don’t recognise, a nickname, a placeholder, or a vague reference like “the cafe from that video”: file it anyway with the text as the title and kind Other if unsure. Title format: English name, then the Korean name in parentheses whenever you know or can infer it — “Gwangjang Market (광장시장)”, “Onion Seongsu (어니언 성수)”, “Bukchon Hanok Village (북촌한옥마을)”. The Korean is what people paste into Naver Map, so include it whenever the place has a Korean name; leave it out only for non-Korean names. Put any other detail in note. Do NOT ignore a proposal just because you can’t identify the place.",
    "- itinerary: the sender states a settled plan for a specific trip date (optionally a time / meeting point) — e.g. “Oct 18 2pm Gyeongbokgung, meet at exit 5”. `what` uses the same “English (Korean)” format as ideas — “Gyeongbokgung Palace (경복궁)”. A question or a tentative suggestion about timing (“wanna grab coffee on the 18th?”, “should we do Bukchon Sunday?”, “maybe…”) is NOT itinerary: it is still being discussed, so ignore it.",
    "- vote: the sender says they want to join / are in for a candidate that already exists in the list below. Use its id. If the place is mentioned but not in the list, that is an idea, not a vote.",
    `- bind: the sender states their own name ("I am ${MEMBER_NAMES[0]}", "我是 ${MEMBER_NAMES[0]}", "私は ${MEMBER_NAMES[0]}", "저는 ${MEMBER_NAMES[0]}", "saya ${MEMBER_NAMES[0]}"). Return the member name as written in the members list.`,
    "- help: the sender asks what the bot can do.",
    "- ignore: everything else — chit-chat, reactions, questions to the group, jokes, replies, proposals phrased as questions, plans that are not settled, anything you are unsure about. When in doubt, ignore. Being silent is always safe; filing chatter is not.",
    "",
    "Set confidence honestly (0–1). Fill only the object that matches the intent; set the others to null.",
    "Every string you output (item, title, note, what, where) must be in English — translate or romanise; never copy Chinese, Japanese or Indonesian text through. The one exception is the Korean name of a place, which goes in parentheses after the English name in title / what.",
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
    `You are the quiet collector bot in a LINE group chat for a ${GROUP_SIZE}-person trip to ${TRIP.city}, ${TRIP_SPAN}.`,
    "Someone shared an image. Decide whether it shows ONE specific place worth saving for the trip:",
    "- A map pin, a shop / restaurant / cafe / bar page, a hotel or Airbnb listing, a screenshot of a review or a social post about a venue → idea. Extract the place name as the title in the format “English (Korean)” — “Onion Seongsu (어니언 성수)” — the Korean part is what people paste into Naver Map, so copy it exactly as shown. kind: Food, Cafe, Sight, Shop, Night, Stay (hotels, guesthouses, apartments) or Other. Put the address, station, price or anything useful you can read in note.",
    "- If the place is already in the candidate list below → vote for it instead (use its id).",
    "- A selfie, a meme, a chat screenshot without a venue, a photo with no identifiable place, a flight ticket, a generic landscape → ignore.",
    "Only write down what you can actually read in the image — never guess an address, station or price. If the name is legible but nothing else is, a short note is fine. Romanise Korean names carefully, character by character.",
    "When in doubt, ignore. Every string you output must be in English, except the Korean place name kept in parentheses in the title.",
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


/* ── links: turn what the page says into a tidy row ─────────── */

export const LinkIntent = z.object({
  title: z.string(),
  kind: z.enum(["Food", "Cafe", "Sight", "Shop", "Night", "Stay", "Other"]),
  area: Area.nullable(),
  note: z.string(),
  duplicate_of: z.string().nullable(),
});

function linkPrompt(candidates) {
  const list = candidates.length ? candidates.map(c => `${c.id} | ${c.board} | ${c.title}`).join("\n") : "(none yet)";
  return [
    `You tidy up a link someone dropped in a LINE group for a ${GROUP_SIZE}-person trip to ${TRIP.city}, ${TRIP_SPAN}.`,
    "You get the page's title, description and some of its visible text, plus what the sender typed next to the link.",
    "Return one row for the trip's Ideas list:",
    "- title: “English (Korean)” — e.g. “Cheonggye Plaza (청계광장)”. Copy the Korean exactly as the page shows it; never invent it. If the place has no Korean name, English only.",
    "- kind: Food, Cafe, Sight, Shop, Night, Stay (hotels, guesthouses, apartments) or Other.",
    "- area: one of the listed areas if the address or text places it there, else null.",
    "- note: the useful facts you can actually read — category, address, nearest station, hours, price range, what it is known for, what the sender said. Short. Never guess.",
    "- duplicate_of: the id of a candidate that is clearly the same place, else null.",
    "Every string in English except the Korean name in the title and in the address.",
    "",
    "Current candidates (id | board | title):",
    list,
  ].join("\n");
}

export async function describeLink(env, { page, note, candidates }) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, timeout: 20_000, maxRetries: 1 });
  try {
    const res = await client.messages.parse({
      model: MODEL,
      max_tokens: 800,
      system: linkPrompt(candidates),
      messages: [{ role: "user", content: [
        `URL: ${page.url}`, `Host: ${page.host}`, `Title: ${page.title}`, `Description: ${page.desc}`,
        `Sender said: ${note || "(nothing)"}`, "", "Visible text:", page.text || "(none)",
      ].join("\n") }],
      output_config: { format: zodOutputFormat(LinkIntent) },
    });
    if (res.stop_reason === "refusal") return null;
    return res.parsed_output ?? null;
  } catch (err) {
    console.error("describeLink failed", String(err));
    return null;
  }
}
