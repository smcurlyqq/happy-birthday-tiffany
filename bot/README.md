# Seoul Loop — LINE collector bot

Lives in the trip's LINE group and files things into Notion so nobody has to open Notion mid-conversation.

```
Gigi:   this one looks nice https://www.airbnb.com/rooms/12345
bot:    🏠 Filed under Stays · Sunny Hanok Stay · airbnb.com
        [I’m in]  Wrong kind? [Food] [Cafe] [Sight] [Shop] [Night]

Nadia:  we should try Gwangjang Market!! the mung bean pancakes
bot:    🍽 Filed under Ideas › Food · Gwangjang Market
        [I’m in] …

Akiha:  廣藏市場行きたい！
bot:    ✓ Akiha is in · Gwangjang Market · 2 votes

Gigi:   paid 45000 for dinner at Mangwon
bot:    💸 45,000 KRW · dinner at Mangwon · paid by Gigi · split 5 ways

Amber:  10/18 下午兩點景福宮，5號出口集合
bot:    📅 Sun, Oct 18 · 14:00 · Gyeongbokgung Palace · meet at exit 5

Hye Yeon: ㅋㅋㅋㅋ 사진 보내줘
bot:    (nothing — it stays out of the conversation)
```

## How it decides

| Message | Path |
|---|---|
| Has a link | Deterministic: host rules (Airbnb → Stays, Tabelog → Food…), then the page's og tags, then whatever you typed next to the link. Naver Map links are resolved through the mobile place page for the name. No AI, no cost. |
| Is an image | Claude Haiku 4.5 looks at it: a shop / map / listing / review screenshot becomes an idea (or stay, or a vote if it's already listed); selfies, memes and chat screenshots are ignored. |
| No link | Claude Haiku 4.5 classifies it as expense / idea / itinerary / vote / bind / help / ignore. Anything unclear → ignore, silently. |

The classifier sees today's date (Seoul), the trip dates, the five names, and the current Ideas/Stays titles, so "I'm in for Gwangjang" resolves to the right row.

Every card has an **I'm in** button — that is the vote. Wrong category? Tap the right one.

## Commands (any of the five languages)

| Type | Effect |
|---|---|
| `I am Gigi` · `我是 Gigi` · `私は Gigi` · `저는 Gigi` · `saya Gigi` | Links your LINE account to the Crew row, once. Needed before expenses and votes are credited to you. |
| `help` · `說明` · `ヘルプ` · `도움말` · `bantuan` | Shows the help text again. |

Names must match the Crew table: Amber · Akiha · Hye Yeon · Gigi · Nadia.

## What gets written where

| Intent | Notion board | Fields |
|---|---|---|
| link / idea | Ideas (or Stays) | Place, Link, Kind, Area, Note, Added by, Status = Idea |
| expense | Expenses | Item, Amount, Currency (default KRW), Category, Date (today, Seoul), Paid by = you, Split with (everyone unless you name people) |
| itinerary | Itinerary | What, Date (10/17–20 only), Time, Where, Kind, Owner |
| vote | Ideas / Stays | adds you to Who's in |

## Only your group

`ALLOWED_GROUP_IDS` in `wrangler.toml` lists the LINE group IDs the bot serves. Leave it empty the first time: when the bot joins a group it replies with that group's ID. Paste the ID in, redeploy, and from then on the bot leaves any other group it is added to and never calls Claude or Notion for them. One-to-one chats are always ignored.

## Setup

Secrets in the repo (Settings → Secrets and variables → Actions):

| Secret | From |
|---|---|
| `CLOUDFLARE_API_TOKEN` | dash.cloudflare.com/profile/api-tokens → "Edit Cloudflare Workers" template. Account Resources and Zone Resources must both be filled in. |
| `CLOUDFLARE_ACCOUNT_ID` | the 32-char id in the dashboard URL |
| `LINE_CHANNEL_SECRET` | LINE Developers → channel → Basic settings |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE Developers → Messaging API → Issue |
| `NOTION_TOKEN` | notion.so/profile/integrations → the integration's secret. The integration must be connected to the Seoul Loop page. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API keys |

Then Actions → **Deploy LINE bot** → Run workflow. The Worker lands at `https://seoul-loop-bot.<account>.workers.dev`; the LINE webhook URL is that plus `/webhook`.

LINE side: Messaging API → Use webhook on, Allow bot to join group chats on, Auto-reply messages off, and in the Official Account Manager the chat mode must be **Bot**.

## Testing

Actions → **Test bot classifier** → Run workflow. Feeds ~25 messages in five languages through the real classifier and prints intent, confidence and latency for each. Costs a few cents.

## The web page's API

The same Worker serves `/api` for `korea/index.html`, so the page and the bot share one set of Notion boards:

| Route | Does |
|---|---|
| `GET /api/state` | everything the page needs — members, prefs, ideas (Stays included as `cat: stay`), slots, expenses |
| `PUT /api/:coll/:id` | upsert one document (`members`, `prefs`, `ideas`, `slots`, `expenses`) |
| `DELETE /api/:coll/:id` | archive it |

Only `https://smcurlyqq.github.io` (and localhost) may call it. Page ids are kept in each board's `Client ID` property. Field mappings are the tables at the top of `src/api.js`; if a Notion option is renamed, change it there too.

## Code

- `src/index.js` — webhook entry, routing, the intent handlers
- `src/classify.js` — the Claude call and the output schema
- `src/notion.js` — reads and writes for the five boards (English property names)
- `src/line.js` — replies, help text, the Flex card, leaving groups
- `src/links.js` — URL extraction, page metadata, host/word rules
- `src/api.js` — the web page's `/api` data layer over the same boards

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Bot never answers | Chat mode isn't Bot, or Use webhook is off |
| Verify fails | Webhook URL is missing `/webhook` |
| `notion 404` in logs | Integration not connected to the page |
| `notion 401` | Wrong NOTION_TOKEN |
| `classify failed` in logs | Wrong ANTHROPIC_API_KEY, or no credits |
| Filed but the title is a bare URL | That site blocks crawlers (Instagram, mostly). Fix the title in Notion. |
| Expense/vote answered "Tell me who you are first" | Type `I am <name>` once |

Logs: Cloudflare dashboard → Workers & Pages → seoul-loop-bot → Logs, or `npx wrangler tail` locally.
