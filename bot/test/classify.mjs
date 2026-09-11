/**
 * Runs the classifier against a fixed set of messages and checks the intent.
 * Needs ANTHROPIC_API_KEY in the environment (the GitHub Action provides it).
 *
 *   node bot/test/classify.mjs
 */
import { classify } from "../src/classify.js";

const candidates = [
  { id: "3d6b331a-3250-81df-9a00-f1dfbc1d655a", board: "ideas", title: "Gwangjang Market" },
  { id: "3d6b331a-3250-81ab-a618-d915bcb2036d", board: "ideas", title: "Bukchon Hanok Village" },
  { id: "3d6b331a-3250-81bd-8342-fb33f6405279", board: "ideas", title: "Seongsu cafe hop" },
  { id: "3d6b331a-3250-81ed-a9e9-c26a3be6d6dd", board: "ideas", title: "N Seoul Tower" },
];

const cases = [
  // expenses
  ["Gigi",     "paid 45000 for dinner at Mangwon",                         "expense"],
  ["Amber",    "我付了計程車 18000",                                        "expense"],
  ["Akiha",    "夕食は私が払った、62,000ウォン。GigiとNadiaと割り勘で",     "expense"],
  ["Hye Yeon", "택시 15000원 내가 냈어",                                     "expense"],
  ["Nadia",    "aku bayar tiket museum Rp 300.000 buat semua",             "expense"],
  // ideas
  ["Nadia",    "we should try Tosokchon Samgyetang!! the ginseng chicken", "idea"],
  ["Amber",    "想去弘大的 Object 逛逛，文青雜貨店",                        "idea"],
  ["Akiha",    "聖水洞のOnion行きたい",                                      "idea"],
  ["Hye Yeon", "익선동 한옥 카페 가보자",                                     "idea"],
  // itinerary
  ["Amber",    "10/18 下午兩點景福宮，5號出口集合",                          "itinerary"],
  ["Gigi",     "Sunday morning 10am Bukchon, meet at Anguk exit 2",        "itinerary"],
  ["Akiha",    "最終日は朝ホテルをチェックアウトして空港へ",                 "itinerary"],
  // votes
  ["Hye Yeon", "I'm down for Gwangjang",                                    "vote"],
  ["Nadia",    "aku ikut ke N Seoul Tower",                                "vote"],
  ["Akiha",    "廣藏市場行きたい！",                                        "vote"],
  ["Amber",    "聖水咖啡 +1",                                               "vote"],
  // bind / help
  ["unknown",  "I am Gigi",                                                 "bind"],
  ["unknown",  "what can you do?",                                          "help"],
  // chatter that must be ignored
  ["Gigi",     "lol that dinner was so good",                               "ignore"],
  ["Nadia",    "hahaha",                                                    "ignore"],
  ["Amber",    "你們幾點到機場？",                                          "ignore"],
  ["Akiha",    "寒いらしいから上着持ってきてね",                             "ignore"],
  ["Hye Yeon", "ㅋㅋㅋㅋ 사진 보내줘",                                       "ignore"],
  ["Gigi",     "maybe we should think about where to stay at some point",   "ignore"],
  ["Nadia",    "omg the exchange rate went up again",                       "ignore"],
];

const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
if (!env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(2); }

let bad = 0;
for (const [sender, msg, want] of cases) {
  const t0 = Date.now();
  const out = await classify(env, { text: msg, senderName: sender === "unknown" ? null : sender, candidates });
  const ms = Date.now() - t0;
  const got = !out ? "null" : out.confidence < 0.7 ? `ignore(<0.7 ${out.intent})` : out.intent;
  const ok = got === want || (want === "ignore" && got.startsWith("ignore"));
  if (!ok) bad++;
  const detail = out?.[out.intent] ? " " + JSON.stringify(out[out.intent]) : "";
  console.log(`${ok ? "✓" : "✗"} ${want.padEnd(9)} got ${got.padEnd(9)} ${ms}ms  ${sender}: ${msg}${detail}`);
}
console.log(`\n${cases.length - bad}/${cases.length} as expected`);
process.exit(bad > 2 ? 1 : 0);   // allow a couple of judgement calls to differ
