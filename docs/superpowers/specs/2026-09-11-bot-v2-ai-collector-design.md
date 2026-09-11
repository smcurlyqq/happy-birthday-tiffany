# Seoul Loop bot v2 — AI collector, English Notion

Date: 2026-09-11. Approved by Amber in conversation; this is the written record.

## Goal

The LINE bot currently files only messages that contain a link. v2 also collects expenses, itinerary items, votes, and link-less recommendations, all in English, into a Notion workspace whose schema is renamed to plain English.

## 1. Message routing

| Message | Path |
|---|---|
| Contains a URL | Existing deterministic path (host rules → og tags → user note). Unchanged. |
| No URL | Sent to Claude (`claude-haiku-4-5`) with structured output. The result's `intent` is one of `expense`, `idea`, `itinerary`, `vote`, `bind`, `help`, `ignore`. |
| `join` event | Reply with the English help text. |
| Postback | Recategorise (existing) or `I'm in` vote (new). |

Bias to silence: `ignore` or `confidence < 0.7` → no reply at all. The bot never speaks unprompted.

The classifier prompt includes: today's date in Asia/Seoul, the trip dates (2026-10-17 to 2026-10-20), the five member names, and the current titles of every row in Ideas and Stays (so a vote like "I'm down for Gwangjang" resolves to a page id). The Ideas/Stays lists are fetched per message; at this scale (tens of rows) that is one Notion query each.

Classifier is called with the raw Anthropic SDK (`@anthropic-ai/sdk`) via `client.messages.parse` and `zodOutputFormat`. `max_tokens` 1024. Thinking off (Haiku 4.5 needs `budget_tokens` for thinking; not needed for classification).

## 2. Structured output schema

```
intent: "expense" | "idea" | "itinerary" | "vote" | "bind" | "help" | "ignore"
confidence: number 0–1
expense?: { amount: number, currency: "KRW"|"TWD"|"JPY"|"HKD"|"IDR"|"USD", item: string, category: "Food"|"Transport"|"Stay"|"Tickets"|"Shopping"|"Other", split_with: string[] /* member names; empty = everyone */ }
idea?: { title: string, kind: "Food"|"Cafe"|"Sight"|"Shop"|"Night"|"Other", area: "Hongdae"|"Myeongdong"|"Gangnam"|"Seongsu"|"Ikseon"|"Other"|null, note: string }
itinerary?: { date: "2026-10-17"|"2026-10-18"|"2026-10-19"|"2026-10-20", time: string|null, what: string, where: string|null, kind: "Transit"|"Eat"|"Do"|"Shop"|"Stay"|"Free time" }
vote?: { target_id: string /* Notion page id from the supplied list */, board: "ideas"|"stays" }
bind?: { name: string }
```

## 3. Behaviour per intent

- **expense** — Payer = sender (looked up by LINE userId). If sender is not bound → reply asking them to type `I am <name>` first, do not write. Date = today in Asia/Seoul. Split with = named members, or all five if empty. Write to Expenses. Reply: `💸 45,000 KRW · dinner · paid by Gigi · split 5 ways`.
- **idea** — Write to Ideas with Status `Idea`, Added by = sender if bound. Reply with the existing Flex card plus an `I'm in` button (postback `a=in&b=ideas&p=<id>`).
- **itinerary** — Write to Itinerary. Owner = sender if bound. Reply: `📅 Sat 10/18 · 14:00 · Gyeongbokgung · meet at exit 5`.
- **vote** — Add sender to `Who's in` on the target page (relation append, idempotent). Requires bound sender. Reply: `✓ Akiha is in · 2 votes` (count = relation length after write).
- **bind / help** — As today, English only.
- **ignore** — Silent.

Link cards also get the `I'm in` button.

## 4. Notion schema (all English)

Database titles: `Crew`, `Ideas`, `Itinerary`, `Expenses`, `Stays`. Page title: `Seoul Loop · Oct 17–20`. Page body rewritten in English.

Property renames (old → new) — every property in all five databases loses its Chinese half, e.g. `地點 Place` → `Place`, `想去的人 Who is in` → `Who's in`, `提案人 Added by` → `Added by`, `類型 Kind` → `Kind`, `狀態 Status` → `Status`, `區域 Area` → `Area`, `備註 Note` → `Note`, `連結 Link` → `Link`, `名字 Name` → `Name`, `付款人 Paid by` → `Paid by`, `分攤 Split with` → `Split with`, `金額 Amount` → `Amount`, `幣別 Currency` → `Currency`, `日期 Date` → `Date`, `項目 Item` → `Item`, `類別 Category` → `Category`, `行程 What` → `What`, `時間 Time` → `Time`, `地點/集合 Where` → `Where`, `負責人 Owner` → `Owner`, `住宿 Place` → `Place`, `每晚 Per night` → `Per night`, `可住人數 Sleeps` → `Sleeps`, `含早餐 Breakfast` → `Breakfast`, `免費取消到 Free cancel until` → `Free cancel until`, `離地鐵 Metro` → `Metro`, formula columns `票數 Votes` → `Votes`, `韓元 W` → `KRW`, `每人 W Each` → `Each (KRW)`, `分攤人數 Heads` → `Heads`, `三晚總價` → `3 nights (KRW)`, `每人分攤` → `Per person (KRW)`, `每晚韓元` → `Per night (KRW)`, `預算 ₩` → `Budget (KRW)`.

Select options lose their Chinese half too: `美食 Food` → `Food`, `咖啡 Café` → `Cafe`, `候補 Idea` → `Idea`, `排進行程 Scheduled` → `Scheduled`, `弘大 Hongdae` → `Hongdae`, `益善洞·鍾路 Ikseon` → `Ikseon`, `🇹🇼 台灣` → `🇹🇼 Taiwan`, etc.

Risk: formula properties reference other properties by name. After renaming, each formula (`Votes` ×2, `KRW`, `Each (KRW)`, `Heads`, `3 nights (KRW)`, `Per person (KRW)`, `Per night (KRW)`, `Budget (KRW)`) is re-read and, if broken, rewritten with the new names.

The web page `korea/index.html` does not touch Notion; it is unchanged.

## 5. Bot text

All user-facing strings English only. Join/help message is English only. Command words still accepted in zh/ja/ko/en/id (`我是`, `私は`, `저는`, `saya`, `I am`; `說明`, `ヘルプ`, `도움말`, `bantuan`, `help`) because the AI path handles these anyway; the regex fast path stays for speed.

## 6. Configuration

New secret `ANTHROPIC_API_KEY` (GitHub Actions secret → Worker secret via `deploy-bot.yml`). New `wrangler.toml` vars: `NOTION_ITINERARY_DB`, `NOTION_EXPENSES_DB`, `ALLOWED_GROUP_IDS`. `bot/package.json` gains `@anthropic-ai/sdk` and `zod` as dependencies; the deploy workflow runs `npm ci` before wrangler.

### Group allow-list (added after Amber asked how to stop strangers using her API key)

`ALLOWED_GROUP_IDS` is a comma-separated list of LINE group/room IDs. Empty = setup mode: the bot works anywhere and, on join, replies with the group's ID so it can be pasted into the var. Once set, the bot leaves any other group it is added to (`POST /group/{id}/leave`) and ignores every event from them — no Notion or Claude call is ever made for an unlisted group. One-to-one chats are ignored regardless.

Code layout: `src/index.js` (routing + handlers), `src/classify.js` (Claude), `src/notion.js`, `src/line.js` (replies, help, card), `src/links.js` (URL path).

## 7. Errors

- Claude call fails or returns unparseable → treat as `ignore` (silent) and `console.error`.
- Notion write fails → reply `Couldn't save that — try again in a minute.` and log.
- Unbound sender on expense/vote → ask to bind, nothing written.

## 8. Testing

- `node --check` on every file, plus `bot/test/classify.mjs`: ~25 sample messages in five languages (including chatter that must be ignored) through the real classifier, printing intent, confidence and latency. The key lives only in GitHub secrets, so this runs as the manual workflow `.github/workflows/test-bot.yml`.
- Deploy via Actions, then in the real group: one link, one expense, one idea, one itinerary, one vote, one piece of chatter.

## Out of scope

Settle-up math, edit/delete commands, proactive reminders, the web page.
