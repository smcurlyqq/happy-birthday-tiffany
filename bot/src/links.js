/**
 * Link handling: pull URLs out of a message, fetch the page's own metadata,
 * and guess a category from host + words. No AI here — a booking site is a
 * booking site, and this path must stay fast and free.
 */

const UA = "Mozilla/5.0 (compatible; SeoulLoopBot/2.0)";

export function extractUrls(text) {
  return (text.match(/https?:\/\/[^\s<>"']+/g) || []).map(u => u.replace(/[),.。、]+$/, ""));
}

/* Host is the strongest signal we get. */
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
  [/弘大|홍대|ホンデ|hongdae/i, "Hongdae"],
  [/明洞|명동|myeongdong/i, "Myeongdong"],
  [/江南|강남|gangnam/i, "Gangnam"],
  [/聖水|성수|seongsu/i, "Seongsu"],
  [/益善洞|鍾路|익선동|종로|ikseon|jongno/i, "Ikseon"],
];

export function classifyLink(page, note) {
  const score = { stay: 0, food: 0, cafe: 0, sight: 0, shop: 0, night: 0, other: 0 };
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

export function guessArea(text) {
  for (const [re, name] of AREAS) if (re.test(text)) return name;
  return null;
}

export async function resolve(link) {
  const out = { url: link, title: "", desc: "", host: "", text: "" };
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(link, {
      redirect: "follow", signal: ctl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "en,ko;q=0.9,ja;q=0.8,zh-TW;q=0.7,id;q=0.6" },
    });
    clearTimeout(timer);
    out.url = r.url || link;
    if ((r.headers.get("content-type") || "").includes("text/html")) {
      const html = (await r.text()).slice(0, 300000);
      const m = metaTags(html);
      out.title = m["og:title"] || m["twitter:title"] || htmlTitle(html) || "";
      out.desc = m["og:description"] || m["description"] || "";
      out.text = visibleText(html);
    }
  } catch (e) {
    console.log("resolve failed", link, String(e));   // blocked or slow — the buttons cover us
  }
  try { out.host = new URL(out.url).hostname.replace(/^www\./, ""); } catch {}
  await naverPlace(out);
  if (!out.title) out.title = out.host || link;
  return out;
}

/* Naver Map links (naver.me/… → map.naver.com/p/entry/place/<id>) land on a JS-only page
   with no title. The mobile place page is server-rendered and carries the name. */
async function naverPlace(out) {
  const m = out.url.match(/(?:map|place)\.naver\.com\/(?:p\/entry\/place|place|v5\/entry\/place)\/(\d+)/)
         || out.url.match(/m\.place\.naver\.com\/(?:place|restaurant|cafe|accommodation|hairshop|hospital)\/(\d+)/);
  if (!m) return;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    const r = await fetch(`https://m.place.naver.com/place/${m[1]}/home`, {
      signal: ctl.signal, headers: { "User-Agent": UA, "Accept-Language": "ko,en;q=0.8" },
    });
    clearTimeout(timer);
    const html = await r.text();                     // ~600 KB; the facts we want are in embedded JSON
    const meta = metaTags(html.slice(0, 100000));
    const name = (meta["og:title"] || "").replace(/\s*:\s*네이버\s*$/, "").trim();
    if (name) out.title = name;
    if (meta["og:description"]) out.desc = meta["og:description"];
    out.text = naverFacts(html);                     // the rendered body is JS-only, so skip visibleText
    out.host = "map.naver.com";
  } catch (e) {
    console.log("naver place lookup failed", String(e));
  }
}

/* Roughly what a person would see: tags stripped, scripts/styles dropped, whitespace folded. */
function visibleText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/[^\s{}]+\{[^{}]*\}/g, " ")          // stray CSS rules some pages leave in the body
    .replace(/(?:^|\s)[.#][\w-]+(?:\[[^\]]*\])?(?=\s|$)/g, " ")   // bare selectors
    .replace(/@[a-z-]+[^{]*\{[^{}]*\}/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 3500);
}

/* Naver's place page embeds its data as JSON; pull the few fields that matter. */
function naverFacts(html) {
  const all = key => [...html.matchAll(new RegExp('"' + key + '":"([^"]{1,200})"', "g"))].map(m => m[1]);
  const first = (key, skip = []) => all(key).find(v => !skip.includes(v)) || "";
  const facts = {
    category: first("category"),
    address: first("roadAddress") || first("address", ["주소"]),
    phone: first("phone") || first("virtualPhone"),
    hours: first("businessHours"),
  };
  // review tags like "뷰가 좋아요" — the quickest read on what a place is like
  const tags = [...new Set(all("name").filter(v => /요$/.test(v) && v.length <= 14))].slice(0, 6);
  if (tags.length) facts.people_say = tags.join(", ");
  return Object.entries(facts).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(" · ");
}

function metaTags(html) {
  const out = {};
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const k = (tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i) || [])[1];
    const v = (tag.match(/content\s*=\s*["']([^"']*)["']/i) || [])[1];
    if (k && v != null && out[k.toLowerCase()] === undefined) out[k.toLowerCase()] = decode(v).replace(/[\x00-\x1F\x7F]+/g, "").trim();
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
