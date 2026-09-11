/**
 * Seoul Loop — LINE collector bot
 *
 * Someone drops a link in the LINE group; this files it into the right
 * Notion board. Accommodation links go to "住宿候選 Stays", everything
 * else to "口袋名單 Ideas" under the matching 類型. The bot guesses the
 * category from the host, the page's own metadata and whatever the
 * person typed alongside the link — and always offers one-tap
 * correction, because Instagram and friends serve bots nothing.
 *
 * Every other message in the group is ignored.
 */

const NOTION = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const LINE = "https://api.line.me/v2/bot";
const UA = "Mozilla/5.0 (compatible; SeoulLoopBot/1.0)";

/* ── categories ─────────────────────────────────────────────── */
const KINDS = {
  stay:  { emoji: "🏠", label: "住宿候選 Stays",  board: "stays" },
  food:  { emoji: "🍽", label: "美食 Food",       board: "ideas", select: "美食 Food" },
  cafe:  { emoji: "☕️", label: "咖啡 Café",       board: "ideas", select: "咖啡 Café" },
  sight: { emoji: "⛩", label: "景點 Sight",      board: "ideas", select: "景點 Sight" },
  shop:  { emoji: "🛍", label: "購物 Shop",       board: "ideas", select: "購物 Shop" },
  night: { emoji: "🍶", label: "夜生活 Night",    board: "ideas", select: "夜生活 Night" },
  other: { emoji: "📌", label: "其他 Other",      board: "ideas", select: "其他 Other" },
};
const BUTTON_ORDER = ["stay", "food", "cafe", "sight", "shop", "night"];
const SHORT = { stay: "住宿", food: "美食", cafe: "咖啡", sight: "景點", shop: "購物", night: "夜生活", other: "其他" };

/* Host is the strongest signal we get — a booking site is a booking site. */
const HOST_RULES = [
  [/airbnb\./i, "stay"], [/booking\.com/i, "stay"], [/agoda\./i, "stay"],
  [/hotels?\.com/i, "stay"], [/expedia\./i, "stay"], [/trip\.com/i, "stay"],
  [/hostelworld/i, "stay"], [/yanolja/i, "stay"], [/goodchoice/i, "stay"],
  [/stayfolio/i, "stay"], [/hotelscombined/i, "stay"], [/travel\.rakuten|jalan\.net/i, "stay"],
  [/tabelog/i, "food"], [/mangoplate/i, "food"], [/opentable/i, "food"],
  [/inline\.app/i, "food"], [/foodpanda|ubereats/i, "food"],
  [/klook|kkday|getyourguide|viator/i, "sight"],
  [/oliveyoung|musinsa|coupang|gmarket|shopee/i, "shop"],
];

/* Words people actually use, in the five languages of this group. */
const WORD_RULES = [
  [/民宿|飯店|酒店|旅館|住宿|訂房|ホテル|旅館|ゲストハウス|民泊|호텔|게스트하우스|숙소|펜션|모텔|hotel|hostel|guest ?house|apartment|penginapan|villa/i, "stay"],
  [/咖啡|珈琲|カフェ|카페|cafe|café|coffee|roaster|espresso|kopi/i, "cafe"],
  [/餐廳|餐酒|美食|小吃|烤肉|燒肉|맛집|식당|고깃집|국밥|グルメ|レストラン|焼肉|restaurant|diner|bbq|noodle|kuliner|makan|resto/i, "food"],
  [/購物|免稅|百貨|商圈|쇼핑|면세|백화점|ショッピング|shopping|mall|outlet|belanja/i, "shop"],
  [/酒吧|居酒屋|夜生活|포차|술집|클럽|bar\b|pub\b|club\b|izakaya|nightlife/i, "night"],
  [/景點|宮|寺|公園|博物館|展望|명소|궁|공원|박물관|전망대|타워|名所|宮殿|神社|palace|museum|park|tower|temple|observatory|shrine|wisata/i, "sight"],
];

const AREAS = [
  [/弘大|홍대|ホンデ|hongdae/i, "弘大 Hongdae"],
  [/明洞|명동|myeongdong/i, "明洞 Myeongdong"],
  [/江南|강남|gangnam/i, "江南 Gangnam"],
  [/聖水|성수|seongsu/i, "聖水 Seongsu"],
  [/益善洞|鍾路|익선동|종로|ikseon|jongno/i, "益善洞·鍾路 Ikseon"],
];

/* ── worker entry ───────────────────────────────────────────── */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (req.method === "GET") return new Response("Seoul Loop bot is awake 🇰🇷", { status: 200 });
    if (req.method !== "POST" || url.pathname !== "/webhook") return new Response("not found", { status: 404 });

    const raw = await req.text();
    if (!(await validSignature(raw, req.headers.get("x-line-signature"), env.LINE_CHANNEL_SECRET)))
      return new Response("bad signature", { status: 401 });

    let body;
    try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

    // LINE wants a 200 straight away; the work continues in the background.
    ctx.waitUntil(Promise.all((body.events || []).map(ev => handle(ev, env).catch(err => console.error("event failed", err)))));
    return new Response("ok");
  },
};

async function handle(ev, env) {
  if (ev.type === "join") return reply(env, ev.replyToken, [{ type: "text", text: HELP }]);
  if (ev.type === "postback") return onPostback(ev, env);
  if (ev.type === "message" && ev.message?.type === "text") return onText(ev, env);
}

/* ── text messages ──────────────────────────────────────────── */
const HELP = [
  "🇰🇷 Seoul Loop 收集機器人",
  "",
  "把連結貼進群裡就好，我會自動收到 Notion：",
  "  住宿 → 住宿候選　其他 → 口袋名單",
  "猜錯的話按一下卡片上的按鈕就能改。",
  "",
  "打「我是 你的名字」綁定一次，之後你貼的連結會記上提案人。",
  "打「說明」可以再看到這段。",
].join("\n");

async function onText(ev, env) {
  const text = (ev.message.text || "").trim();

  if (/^(說明|help|使用說明|ヘルプ|도움말|bantuan)$/i.test(text))
    return reply(env, ev.replyToken, [{ type: "text", text: HELP }]);

  const bind = text.match(/^(?:我是|我叫|i\s*am|私は|저는|saya)\s*(.{1,24})$/i);
  if (bind) return onBind(bind[1].trim(), ev, env);

  const links = extractUrls(text);
  if (!links.length) return;                      // stay out of the conversation

  const link = links[0];
  const note = text.replace(link, "").trim().slice(0, 300);
  return collect(link, note, ev, env);
}

async function onBind(name, ev, env) {
  const userId = ev.source?.userId;
  if (!userId) return reply(env, ev.replyToken, [{ type: "text", text: "抓不到你的 LINE ID，可能是群組設定擋住了。" }]);

  const page = await findMemberByName(env, name);
  if (!page) return reply(env, ev.replyToken, [{ type: "text", text: `Notion 的成員表裡沒有「${name}」。先去成員表把名字改好，再打一次。` }]);

  await notion(env, `/pages/${page.id}`, "PATCH", {
    properties: { "LINE ID": { rich_text: [{ text: { content: userId } }] } },
  });
  return reply(env, ev.replyToken, [{ type: "text", text: `✓ 綁好了，${name}。之後你貼的連結會記上你。` }]);
}

/* ── the actual job ─────────────────────────────────────────── */
async function collect(link, note, ev, env) {
  const page = await resolve(link);
  const { kind, sure } = classify(page, note);
  const conf = KINDS[kind];

  const dupe = await findByUrl(env, conf.board === "stays" ? env.NOTION_STAYS_DB : env.NOTION_IDEAS_DB, page.url);
  if (dupe) {
    return reply(env, ev.replyToken, [{ type: "text", text: `這個已經有人收過了 → ${dupe.url}` }]);
  }

  const by = ev.source?.userId ? await findMemberByLineId(env, ev.source.userId) : null;
  const area = guessArea(`${page.title} ${page.desc} ${note}`);
  const created = conf.board === "stays"
    ? await createStay(env, page, note, area, by)
    : await createIdea(env, page, note, area, by, conf.select);

  return reply(env, ev.replyToken, [card(page, kind, sure, created.id, conf.board, created.url)]);
}

function classify(page, note) {
  const score = Object.fromEntries(Object.keys(KINDS).map(k => [k, 0]));

  for (const [re, kind] of HOST_RULES) if (re.test(page.host)) score[kind] += 10;
  for (const [re, kind] of WORD_RULES) {
    if (re.test(page.title)) score[kind] += 3;
    if (re.test(note)) score[kind] += 3;        // what the person said counts as much as the title
    if (re.test(page.desc)) score[kind] += 1;
  }

  let best = "other", top = 0;
  for (const [kind, n] of Object.entries(score)) if (n > top) { top = n; best = kind; }
  return { kind: top > 0 ? best : "other", sure: top >= 3 };
}

function guessArea(text) {
  for (const [re, name] of AREAS) if (re.test(text)) return name;
  return null;
}

/* ── Notion ─────────────────────────────────────────────────── */
async function notion(env, path, method = "GET", body) {
  const r = await fetch(NOTION + path, {
    method,
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`notion ${method} ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

const title = t => [{ text: { content: String(t).slice(0, 1900) } }];
const rich = t => (t ? [{ text: { content: String(t).slice(0, 1900) } }] : []);

async function createIdea(env, page, note, area, by, select) {
  const props = {
    "地點 Place": { title: title(page.title) },
    "連結 Link": { url: page.url },
    "類型 Kind": { select: { name: select } },
    "狀態 Status": { select: { name: "候補 Idea" } },
  };
  if (note) props["備註 Note"] = { rich_text: rich(note) };
  if (area) props["區域 Area"] = { select: { name: area } };
  if (by) props["提案人 Added by"] = { relation: [{ id: by.id }] };
  return notion(env, "/pages", "POST", { parent: { database_id: env.NOTION_IDEAS_DB }, properties: props });
}

async function createStay(env, page, note, area, by) {
  const props = {
    "住宿 Place": { title: title(page.title) },
    "連結 Link": { url: page.url },
    "狀態 Status": { select: { name: "候補 Idea" } },
  };
  if (note) props["備註 Note"] = { rich_text: rich(note) };
  if (area) props["區域 Area"] = { select: { name: area } };
  if (by) props["提案人 Added by"] = { relation: [{ id: by.id }] };
  return notion(env, "/pages", "POST", { parent: { database_id: env.NOTION_STAYS_DB }, properties: props });
}

async function findByUrl(env, dbId, url) {
  try {
    const r = await notion(env, `/databases/${dbId}/query`, "POST", {
      filter: { property: "連結 Link", url: { equals: url } }, page_size: 1,
    });
    return r.results[0] || null;
  } catch { return null; }
}

async function findMemberByLineId(env, lineId) {
  try {
    const r = await notion(env, `/databases/${env.NOTION_MEMBERS_DB}/query`, "POST", {
      filter: { property: "LINE ID", rich_text: { equals: lineId } }, page_size: 1,
    });
    return r.results[0] || null;
  } catch { return null; }
}

async function findMemberByName(env, name) {
  const r = await notion(env, `/databases/${env.NOTION_MEMBERS_DB}/query`, "POST", {
    filter: { property: "名字 Name", title: { contains: name } }, page_size: 1,
  });
  return r.results[0] || null;
}

/* ── re-filing when the guess was wrong ─────────────────────── */
async function onPostback(ev, env) {
  const q = new URLSearchParams(ev.postback?.data || "");
  if (q.get("a") !== "rc") return;
  const pageId = q.get("p"), from = q.get("s"), to = q.get("k");
  if (!pageId || !KINDS[to]) return;

  const conf = KINDS[to];
  const toBoard = conf.board;
  const page = await notion(env, `/pages/${pageId}`);
  const props = page.properties || {};
  const name = plainTitle(props["地點 Place"] || props["住宿 Place"]);
  const url = props["連結 Link"]?.url || "";
  const note = plainText(props["備註 Note"]);
  const area = props["區域 Area"]?.select?.name || null;
  const by = props["提案人 Added by"]?.relation?.[0] || null;

  if ((from === "stays") === (toBoard === "stays")) {
    // same board — just switch the 類型
    if (toBoard === "ideas") {
      await notion(env, `/pages/${pageId}`, "PATCH", { properties: { "類型 Kind": { select: { name: conf.select } } } });
    }
    return reply(env, ev.replyToken, [{ type: "text", text: `${conf.emoji} 改成「${SHORT[to]}」了` }]);
  }

  // different board — Notion can't move a page, so re-create and archive
  const fresh = { title: name, url, host: "", desc: "" };
  const made = toBoard === "stays"
    ? await createStay(env, fresh, note, area, by)
    : await createIdea(env, fresh, note, area, by, conf.select);
  await notion(env, `/pages/${pageId}`, "PATCH", { archived: true });

  return reply(env, ev.replyToken, [{ type: "text", text: `${conf.emoji} 搬到「${conf.label}」了\n${made.url}` }]);
}

const plainTitle = p => (p?.title || []).map(t => t.plain_text).join("") || "";
const plainText = p => (p?.rich_text || []).map(t => t.plain_text).join("") || "";

/* ── LINE ───────────────────────────────────────────────────── */
async function reply(env, replyToken, messages) {
  if (!replyToken) return;
  const r = await fetch(LINE + "/message/reply", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.LINE_CHANNEL_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ replyToken, messages }),
  });
  if (!r.ok) console.error("line reply", r.status, await r.text());
}

function card(page, kind, sure, pageId, board, notionUrl) {
  const conf = KINDS[kind];
  const head = sure ? `${conf.emoji} 已收進「${conf.label}」` : "📥 收到了 — 這是哪一類？";
  const targets = BUTTON_ORDER.filter(k => k !== kind);

  const btn = k => ({
    type: "button", style: "secondary", height: "sm", flex: 1,
    action: { type: "postback", label: SHORT[k], data: `a=rc&s=${board}&p=${pageId.replace(/-/g, "")}&k=${k}`, displayText: `改成${SHORT[k]}` },
  });

  return {
    type: "flex",
    altText: `${head}：${page.title}`,
    contents: {
      type: "bubble",
      body: {
        type: "box", layout: "vertical", spacing: "sm",
        contents: [
          { type: "text", text: head, size: "xs", color: sure ? "#8C1D18" : "#A67C2E", weight: "bold" },
          { type: "text", text: page.title.slice(0, 120), wrap: true, weight: "bold", size: "md" },
          ...(page.host ? [{ type: "text", text: page.host, size: "xs", color: "#8E877D" }] : []),
          { type: "text", text: "在 Notion 打開 →", size: "xs", color: "#2B4562",
            action: { type: "uri", uri: notionUrl } },
        ],
      },
      footer: {
        type: "box", layout: "vertical", spacing: "xs",
        contents: [
          { type: "text", text: "不對的話改成：", size: "xxs", color: "#8E877D" },
          { type: "box", layout: "horizontal", spacing: "xs", contents: targets.slice(0, 3).map(btn) },
          { type: "box", layout: "horizontal", spacing: "xs", contents: targets.slice(3).map(btn) },
        ],
      },
    },
  };
}

/* ── link handling ──────────────────────────────────────────── */
function extractUrls(text) {
  return (text.match(/https?:\/\/[^\s<>"']+/g) || []).map(u => u.replace(/[),.。、]+$/, ""));
}

async function resolve(link) {
  const out = { url: link, title: "", desc: "", host: "" };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(link, {
      redirect: "follow", signal: ctl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8,ko;q=0.7,ja;q=0.6" },
    });
    clearTimeout(timer);
    out.url = r.url || link;
    if ((r.headers.get("content-type") || "").includes("text/html")) {
      const html = (await r.text()).slice(0, 300000);
      const m = metaTags(html);
      out.title = m["og:title"] || m["twitter:title"] || htmlTitle(html) || "";
      out.desc = m["og:description"] || m["description"] || "";
    }
  } catch (e) {
    console.log("resolve failed", link, String(e));   // blocked or slow — the buttons cover us
  }
  try { out.host = new URL(out.url).hostname.replace(/^www\./, ""); } catch {}
  if (!out.title) out.title = out.host || link;
  return out;
}

function metaTags(html) {
  const out = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const k = (tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const v = (tag.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (k && v != null && out[k.toLowerCase()] === undefined) out[k.toLowerCase()] = decode(v.trim());
  }
  return out;
}
function htmlTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? decode(m[1].replace(/\s+/g, " ").trim()) : "";
}
function decode(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

/* ── signature ──────────────────────────────────────────────── */
async function validSignature(raw, sig, secret) {
  if (!sig || !secret) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const mine = btoa(String.fromCharCode(...new Uint8Array(mac)));
  let diff = mine.length ^ sig.length;
  for (let i = 0; i < mine.length; i++) diff |= mine.charCodeAt(i) ^ sig.charCodeAt(i % sig.length);
  return diff === 0;
}
