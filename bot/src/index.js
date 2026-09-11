/**
 * Seoul Loop — LINE collector bot (v2)
 *
 * Links are filed deterministically (see links.js). Everything else goes
 * through Claude (classify.js), which decides whether the message is an
 * expense, an idea, an itinerary item, a vote, a bind, a help request —
 * or chatter, in which case the bot says nothing.
 *
 * The bot only works inside groups listed in ALLOWED_GROUP_IDS; it leaves
 * any other group it is added to and never calls Claude for them.
 *
 * /api/* is the web page's data layer (see api.js) — same Notion boards.
 */

import { classify, CONFIDENCE_FLOOR, seoulToday } from "./classify.js";
import * as db from "./notion.js";
import { reply, leave, text, card, HELP_MESSAGES, BIND_FIRST, KINDS, kindKey, PAGE_URL } from "./line.js";
import { extractUrls, resolve, classifyLink, guessArea } from "./links.js";
import { handleApi } from "./api.js";

/* ── worker entry ───────────────────────────────────────────── */
export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api")) return handleApi(req, env);
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

/* ── routing ────────────────────────────────────────────────── */
async function handle(ev, env) {
  const src = ev.source || {};
  const gid = src.groupId || src.roomId;
  if (!gid) return;                                   // 1:1 chats: ignore entirely

  const allowed = (env.ALLOWED_GROUP_IDS || "").split(",").map(s => s.trim()).filter(Boolean);
  const setupMode = allowed.length === 0;
  if (!setupMode && !allowed.includes(gid)) {
    console.log("uninvited group, leaving", gid);
    if (ev.type === "join") await leave(env, src);
    return;
  }

  if (ev.type === "join") {
    console.log("joined group", gid, setupMode ? "(setup mode — add this id to ALLOWED_GROUP_IDS)" : "");
    return reply(env, ev.replyToken, HELP_MESSAGES);
  }
  if (ev.type === "postback") return onPostback(ev, env);
  if (ev.type === "message" && ev.message?.type === "text") return onText(ev, env);
}

/* ── text messages ──────────────────────────────────────────── */
async function onText(ev, env) {
  const msg = (ev.message.text || "").trim();
  if (!msg) return;

  // Setup only: reveal the group id so it can go into ALLOWED_GROUP_IDS. Dead once the list is set.
  if (/^(group ?id|群組 ?id)$/i.test(msg)) {
    const allowed = (env.ALLOWED_GROUP_IDS || "").trim();
    return allowed ? undefined : reply(env, ev.replyToken, [text(`Group ID: ${ev.source?.groupId || ev.source?.roomId}`)]);
  }

  // Fast paths that need no AI.
  if (/^(help|說明|使用說明|ヘルプ|도움말|bantuan)$/i.test(msg))
    return reply(env, ev.replyToken, HELP_MESSAGES);

  const bind = msg.match(/^(?:i\s*am|i'm|我是|我叫|私は|저는|saya)\s*(.{1,24})$/i);
  if (bind) return onBind(bind[1].trim(), ev, env);

  const links = extractUrls(msg);
  if (links.length) {
    const link = links[0];
    const note = msg.replace(link, "").trim().slice(0, 300);
    return collectLink(link, note, ev, env);
  }

  // Everything else: ask Claude what this is.
  const [me, cands] = await Promise.all([
    db.memberByLineId(env, ev.source?.userId),
    db.candidates(env),
  ]);
  const out = await classify(env, { text: msg, senderName: me?.name, candidates: cands });
  if (!out || out.intent === "ignore" || out.confidence < CONFIDENCE_FLOOR) {
    console.log("ignored", JSON.stringify({ msg: msg.slice(0, 80), intent: out?.intent, c: out?.confidence }));
    return;
  }
  console.log("intent", out.intent, out.confidence, msg.slice(0, 80));

  try {
    switch (out.intent) {
      case "help":      return reply(env, ev.replyToken, HELP_MESSAGES);
      case "bind":      return onBind(out.bind?.name || "", ev, env);
      case "expense":   return onExpense(out.expense, me, ev, env);
      case "idea":      return onIdea(out.idea, me, ev, env);
      case "itinerary": return onItinerary(out.itinerary, me, ev, env);
      case "vote":      return onVote(out.vote?.target_id, me, ev, env);
    }
  } catch (err) {
    console.error("handler failed", out.intent, String(err));
    return reply(env, ev.replyToken, [text("Couldn't save that — try again in a minute.")]);
  }
}

async function onBind(name, ev, env) {
  const userId = ev.source?.userId;
  if (!userId) return reply(env, ev.replyToken, [text("I can't read your LINE ID here — a group setting may be blocking it.")]);
  const m = await db.memberByName(env, name);
  if (!m) return reply(env, ev.replyToken, [text(`No member called “${name}”. Use one of: ${"Amber · Akiha · Hye Yeon · Gigi · Nadia"}`)]);
  await db.bindLineId(env, m.id, userId);
  return reply(env, ev.replyToken, [text(`✓ Linked — you're ${m.name}. Links, expenses and votes will be credited to you.`)]);
}

/* ── links (no AI) ──────────────────────────────────────────── */
async function collectLink(link, note, ev, env) {
  const page = await resolve(link);
  const { kind, sure } = classifyLink(page, note);
  const conf = KINDS[kind];

  const dupe = await db.findByUrl(env, conf.board === "stays" ? env.NOTION_STAYS_DB : env.NOTION_IDEAS_DB, page.url);
  if (dupe) return reply(env, ev.replyToken, [text(`Already on the list → ${PAGE_URL}`)]);

  const me = await db.memberByLineId(env, ev.source?.userId);
  const area = guessArea(`${page.title} ${page.desc} ${note}`);
  const row = { title: page.title, url: page.url, note, area, byId: me?.id, kind: conf.select };
  const created = conf.board === "stays" ? await db.createStay(env, row) : await db.createIdea(env, row);

  return reply(env, ev.replyToken, [card({ title: page.title, host: page.host, kind, sure, pageId: created.id })]);
}

/* ── AI-classified intents ──────────────────────────────────── */
async function onExpense(x, me, ev, env) {
  if (!x) return;
  if (!me) return reply(env, ev.replyToken, [text(BIND_FIRST)]);
  const all = await db.members(env);
  const named = x.split_with.map(n => all.find(m => m.name.toLowerCase() === n.toLowerCase())).filter(Boolean);
  const split = named.length ? named : all;
  await db.createExpense(env, {
    item: x.item, amount: x.amount, currency: x.currency, category: x.category,
    date: seoulToday(), paidById: me.id, splitIds: split.map(m => m.id),
  });
  const who = named.length ? `split with ${named.map(m => m.name).join(", ")}` : `split ${all.length} ways`;
  return reply(env, ev.replyToken, [text(`💸 ${fmtAmount(x.amount, x.currency)} · ${x.item} · paid by ${me.name} · ${who}`)]);
}

async function onIdea(x, me, ev, env) {
  if (!x) return;
  const kind = kindKey(x.kind);
  const created = await db.createIdea(env, { title: x.title, note: x.note, area: x.area, byId: me?.id, kind: x.kind });
  return reply(env, ev.replyToken, [card({ title: x.title, host: "", kind, sure: true, pageId: created.id })]);
}

async function onItinerary(x, me, ev, env) {
  if (!x) return;
  await db.createItinerary(env, { what: x.what, date: x.date, time: x.time, where: x.where, kind: x.kind, ownerId: me?.id });
  const bits = [`📅 ${fmtDay(x.date)}`, x.time, x.what, x.where ? `meet at ${x.where}` : null].filter(Boolean);
  return reply(env, ev.replyToken, [text(bits.join(" · "))]);
}

async function onVote(pageId, me, ev, env) {
  if (!pageId) return;
  if (!me) return reply(env, ev.replyToken, [text(BIND_FIRST)]);
  const v = await db.addVote(env, pageId, me.id);
  const n = `${v.count} vote${v.count === 1 ? "" : "s"}`;
  return reply(env, ev.replyToken, [text(v.added ? `✓ ${me.name} is in · ${v.title} · ${n}` : `You're already in for ${v.title} · ${n}`)]);
}

/* ── postbacks: vote button, recategorise ───────────────────── */
async function onPostback(ev, env) {
  const q = new URLSearchParams(ev.postback?.data || "");
  const pageId = q.get("p");
  if (!pageId) return;

  if (q.get("a") === "in") {
    const me = await db.memberByLineId(env, ev.source?.userId);
    return onVote(pageId, me, ev, env);
  }

  if (q.get("a") !== "rc") return;
  const from = q.get("s"), to = q.get("k");
  if (!KINDS[to]) return;
  const conf = KINDS[to];

  const page = await db.getPage(env, pageId);
  const props = page.properties || {};
  const name = db.plainTitle(props["Place"]);
  const url = props["Link"]?.url || "";
  const note = db.plainText(props["Note"]);
  const area = props["Area"]?.select?.name || null;
  const byId = props["Added by"]?.relation?.[0]?.id || null;

  if ((from === "stays") === (conf.board === "stays")) {
    if (conf.board === "ideas") await db.setKind(env, pageId, conf.select);
    return reply(env, ev.replyToken, [text(`${conf.emoji} Changed to ${conf.label}`)]);
  }

  // Different board — Notion can't move a page, so re-create and archive.
  const row = { title: name, url, note, area, byId, kind: conf.select };
  const made = conf.board === "stays" ? await db.createStay(env, row) : await db.createIdea(env, row);
  await db.archive(env, pageId);
  return reply(env, ev.replyToken, [text(`${conf.emoji} Moved to ${conf.board === "stays" ? "Stays" : `Ideas › ${conf.label}`}`)]);
}

/* ── formatting ─────────────────────────────────────────────── */
function fmtAmount(n, cur) {
  const digits = cur === "KRW" || cur === "JPY" || cur === "IDR" ? 0 : 2;
  return `${Number(n).toLocaleString("en-US", { maximumFractionDigits: digits })} ${cur}`;
}
function fmtDay(iso) {
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
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
