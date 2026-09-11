/**
 * Resolves a couple of real links and runs describeLink on them.
 *   node bot/test/link.mjs
 */
import { resolve } from "../src/links.js";
import { describeLink } from "../src/classify.js";

const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
if (!env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(2); }
const candidates = [{ id: "3d6b331a-3250-81df-9a00-f1dfbc1d655a", board: "ideas", title: "Gwangjang Market (광장시장)" }];

const links = [
  ["https://naver.me/x9BNpU9t", "i wanna go this place"],
  ["https://www.airbnb.com/rooms/1147215226847926851", "this one looks nice"],
];
for (const [url, note] of links) {
  const page = await resolve(url);
  console.log("resolved:", JSON.stringify({ url: page.url, title: page.title, desc: page.desc.slice(0, 80), text: page.text.slice(0, 200) }));
  const t0 = Date.now();
  const out = await describeLink(env, { page, note, candidates });
  console.log("described:", Date.now() - t0 + "ms", JSON.stringify(out));
}
