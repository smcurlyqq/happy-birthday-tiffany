/**
 * LINE Messaging API: replies, the help text, the Flex card, leaving groups.
 * Everything user-facing is English.
 */

const LINE = "https://api.line.me/v2/bot";

export const MEMBER_LIST = "Amber · Akiha · Hye Yeon · Gigi · Nadia";

export const PAGE_URL = "https://smcurlyqq.github.io/happy-birthday/korea/";

const HELP_EN = [
  "🇰🇷 Seoul Loop bot",
  "",
  "Everything you tell me lands on our trip page:",
  PAGE_URL,
  "",
  "Just type normally — I pick up:",
  "• A link → Ideas (hotels go to Stays)",
  "• “Let’s try Gwangjang Market” → Ideas",
  "• “I’m in for Gwangjang”, or tap I’m in on a card → your vote",
  "• “Paid 45,000 for dinner” → Expenses, in won, split 5 ways unless you name people",
  "• “Oct 18 2pm Gyeongbokgung, meet at exit 5” → Itinerary",
  "",
  `First, type “I am <your name>” once (${MEMBER_LIST}).`,
  "Type “help” to see this again. Otherwise I stay quiet.",
].join("\n");

const HELP_JA = [
  "🇰🇷 Seoul Loop bot",
  "",
  "ここで伝えたことは、旅のページにまとまります：",
  PAGE_URL,
  "",
  "普通に書くだけでOK。拾うのはこれ：",
  "• リンク → Ideas（ホテルは Stays）",
  "• 「広蔵市場行きたい」→ Ideas",
  "• 「広蔵市場、私も行く」またはカードの I’m in → 投票",
  "• 「夕食 45,000 払った」→ Expenses（ウォン。名前を書かなければ5人で割り勘）",
  "• 「10/18 14:00 景福宮、5番出口集合」→ Itinerary",
  "",
  `最初に一度「私は 名前」と送ってください（${MEMBER_LIST}）。`,
  "「ヘルプ」でこの説明を再表示。それ以外は黙っています。",
].join("\n");

const HELP_KO = [
  "🇰🇷 Seoul Loop bot",
  "",
  "여기서 말한 건 전부 여행 페이지에 정리돼요:",
  PAGE_URL,
  "",
  "그냥 평소처럼 쓰면 돼요. 제가 챙기는 것:",
  "• 링크 → Ideas (호텔은 Stays)",
  "• “광장시장 가보자” → Ideas",
  "• “광장시장 나도 갈래” 또는 카드의 I’m in → 투표",
  "• “저녁 45,000원 내가 냈어” → Expenses (원화, 이름을 안 쓰면 5명이 나눔)",
  "• “10/18 2시 경복궁, 5번 출구에서 만나” → Itinerary",
  "",
  `먼저 “저는 이름” 을 한 번 보내 주세요 (${MEMBER_LIST}).`,
  "“도움말” 을 치면 이 안내를 다시 볼 수 있어요. 그 외엔 조용히 있을게요.",
].join("\n");

const HELP_ID = [
  "🇰🇷 Seoul Loop bot",
  "",
  "Semua yang kamu tulis di sini masuk ke halaman trip kita:",
  PAGE_URL,
  "",
  "Tulis seperti biasa saja. Yang aku tangkap:",
  "• Tautan → Ideas (hotel masuk Stays)",
  "• “Ayo coba Gwangjang Market” → Ideas",
  "• “Aku ikut ke Gwangjang”, atau tekan I’m in di kartu → vote kamu",
  "• “Aku bayar makan malam 45.000” → Expenses, dalam won, dibagi 5 kecuali kamu sebut nama",
  "• “18 Okt jam 2 Gyeongbokgung, kumpul di exit 5” → Itinerary",
  "",
  `Pertama, ketik “saya <nama>” sekali (${MEMBER_LIST}).`,
  "Ketik “bantuan” untuk lihat ini lagi. Selain itu aku diam.",
].join("\n");

/** The welcome / help reply: four messages, one per language. */
export const HELP_MESSAGES = [HELP_EN, HELP_JA, HELP_KO, HELP_ID].map(t => ({ type: "text", text: t }));
export const HELP = HELP_EN;

export const BIND_FIRST = `Tell me who you are first — type “I am <your name>” (${MEMBER_LIST}).`;

export const text = t => ({ type: "text", text: t });

export async function reply(env, replyToken, messages) {
  if (!replyToken) return;
  const r = await fetch(LINE + "/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!r.ok) console.error("line reply", r.status, await r.text());
}

/** Leave a group or room we were not invited to. */
export async function leave(env, source) {
  const path = source.groupId ? `/group/${source.groupId}/leave`
             : source.roomId  ? `/room/${source.roomId}/leave` : null;
  if (!path) return;
  const r = await fetch(LINE + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}` },
  });
  if (!r.ok) console.error("line leave", r.status, await r.text());
}

/* ── the card ───────────────────────────────────────────────── */

export const KINDS = {
  stay:  { emoji: "🏠", label: "Stays",  short: "Stay",  board: "stays" },
  food:  { emoji: "🍽", label: "Food",   short: "Food",  board: "ideas", select: "Food" },
  cafe:  { emoji: "☕️", label: "Cafe",   short: "Cafe",  board: "ideas", select: "Cafe" },
  sight: { emoji: "⛩", label: "Sight",  short: "Sight", board: "ideas", select: "Sight" },
  shop:  { emoji: "🛍", label: "Shop",   short: "Shop",  board: "ideas", select: "Shop" },
  night: { emoji: "🍶", label: "Night",  short: "Night", board: "ideas", select: "Night" },
  other: { emoji: "📌", label: "Other",  short: "Other", board: "ideas", select: "Other" },
};
export const BUTTON_ORDER = ["stay", "food", "cafe", "sight", "shop", "night"];

/** Kind key from a Notion select name ("Food" → "food"). */
export const kindKey = name => Object.keys(KINDS).find(k => KINDS[k].select === name) || "other";

/**
 * Flex card confirming a filed Idea/Stay, with an "I'm in" vote button and
 * one-tap recategorisation.
 */
export function card({ title, host, kind, sure, pageId, notionUrl }) {
  const conf = KINDS[kind];
  const board = conf.board;
  const head = !sure ? "📥 Got it — which kind is this?"
             : board === "stays" ? "🏠 Filed under Stays"
             : `${conf.emoji} Filed under Ideas › ${conf.label}`;
  const pid = pageId.replace(/-/g, "");
  const targets = BUTTON_ORDER.filter(k => k !== kind);

  const btn = k => ({
    type: "button", style: "secondary", height: "sm", flex: 1,
    action: { type: "postback", label: KINDS[k].short, data: `a=rc&s=${board}&p=${pid}&k=${k}`, displayText: `Change to ${KINDS[k].short}` },
  });

  return {
    type: "flex",
    altText: `${head}: ${title}`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: head, size: "xs", color: sure ? "#8C1D18" : "#A67C2E", weight: "bold" },
          { type: "text", text: title.slice(0, 120), wrap: true, weight: "bold", size: "md" },
          ...(host ? [{ type: "text", text: host, size: "xs", color: "#8E877D" }] : []),
          { type: "text", text: "Open in Notion →", size: "xs", color: "#2B4562",
            action: { type: "uri", uri: notionUrl } },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "xs",
        contents: [
          { type: "button", style: "primary", height: "sm", color: "#8C1D18",
            action: { type: "postback", label: "I’m in", data: `a=in&b=${board}&p=${pid}`, displayText: "I’m in" } },
          { type: "text", text: "Wrong kind? Change to:", size: "xxs", color: "#8E877D", margin: "md" },
          { type: "box", layout: "horizontal", spacing: "xs", contents: targets.slice(0, 3).map(btn) },
          { type: "box", layout: "horizontal", spacing: "xs", contents: targets.slice(3).map(btn) },
        ],
      },
    },
  };
}
