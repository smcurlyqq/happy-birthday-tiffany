/**
 * Runs the screenshot classifier on the fixture images.
 *   node bot/test/image.mjs
 */
import { readFileSync } from "node:fs";
import { classifyImage } from "../src/classify.js";

const env = { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY };
if (!env.ANTHROPIC_API_KEY) { console.error("ANTHROPIC_API_KEY not set"); process.exit(2); }

const candidates = [{ id: "3d6b331a-3250-81df-9a00-f1dfbc1d655a", board: "ideas", title: "Gwangjang Market" }];
const fixtures = [
  ["fixtures/place.jpg", "image/jpeg", "idea"],     // a Naver-style cafe page: name, category, address
];

let bad = 0;
for (const [file, mediaType, want] of fixtures) {
  const data = readFileSync(new URL(file, import.meta.url)).toString("base64");
  const t0 = Date.now();
  const out = await classifyImage(env, { data, mediaType, senderName: "Amber", candidates });
  const ms = Date.now() - t0;
  const got = !out ? "null" : out.confidence < 0.7 ? `ignore(<0.7 ${out.intent})` : out.intent;
  const ok = got === want;
  if (!ok) bad++;
  console.log(`${ok ? "✓" : "✗"} ${want.padEnd(7)} got ${got.padEnd(7)} c=${out?.confidence ?? "-"} ${ms}ms  ${file} ${JSON.stringify(out?.idea || out?.vote || null)}`);
}
process.exit(bad ? 1 : 0);
