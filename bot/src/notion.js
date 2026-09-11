/**
 * Notion access for the five Seoul Loop boards. Property names are the
 * English ones set on 2026-09-11; change them here if the schema moves.
 */

const NOTION = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";

export async function notion(env, path, method = "GET", body) {
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
export const plainTitle = p => (p?.title || []).map(t => t.plain_text).join("") || "";
export const plainText = p => (p?.rich_text || []).map(t => t.plain_text).join("") || "";

/* ── crew ───────────────────────────────────────────────────── */

/** All members: [{ id, name, lineId }]. Five rows; one query. */
export async function members(env) {
  const r = await notion(env, `/databases/${env.NOTION_MEMBERS_DB}/query`, "POST", { page_size: 20 });
  return r.results.map(p => ({
    id: p.id,
    name: plainTitle(p.properties["Name"]),
    lineId: plainText(p.properties["LINE ID"]),
  }));
}

export async function memberByLineId(env, lineId) {
  if (!lineId) return null;
  return (await members(env)).find(m => m.lineId === lineId) || null;
}

export async function memberByName(env, name) {
  const want = name.trim().toLowerCase();
  return (await members(env)).find(m => m.name.toLowerCase() === want)
      || (await members(env)).find(m => m.name.toLowerCase().includes(want))
      || null;
}

export async function bindLineId(env, memberId, lineId) {
  await notion(env, `/pages/${memberId}`, "PATCH", {
    properties: { "LINE ID": { rich_text: rich(lineId) } },
  });
}

/* ── candidates for voting ──────────────────────────────────── */

/** Titles + ids of every Idea and Stay, for the classifier. */
export async function candidates(env) {
  const [ideas, stays] = await Promise.all([
    notion(env, `/databases/${env.NOTION_IDEAS_DB}/query`, "POST", { page_size: 100 }),
    notion(env, `/databases/${env.NOTION_STAYS_DB}/query`, "POST", { page_size: 100 }),
  ]);
  return [
    ...ideas.results.map(p => ({ id: p.id, board: "ideas", title: plainTitle(p.properties["Place"]) })),
    ...stays.results.map(p => ({ id: p.id, board: "stays", title: plainTitle(p.properties["Place"]) })),
  ];
}

/* ── create rows ────────────────────────────────────────────── */

export async function createIdea(env, { title: name, url, note, area, byId, kind }) {
  const props = {
    "Place": { title: title(name) },
    "Kind": { select: { name: kind } },
    "Status": { select: { name: "Idea" } },
  };
  if (url) props["Link"] = { url };
  if (note) props["Note"] = { rich_text: rich(note) };
  if (area) props["Area"] = { select: { name: area } };
  if (byId) props["Added by"] = { relation: [{ id: byId }] };
  return notion(env, "/pages", "POST", { parent: { database_id: env.NOTION_IDEAS_DB }, properties: props });
}

export async function createStay(env, { title: name, url, note, area, byId }) {
  const props = {
    "Place": { title: title(name) },
    "Status": { select: { name: "Idea" } },
  };
  if (url) props["Link"] = { url };
  if (note) props["Note"] = { rich_text: rich(note) };
  if (area) props["Area"] = { select: { name: area } };
  if (byId) props["Added by"] = { relation: [{ id: byId }] };
  return notion(env, "/pages", "POST", { parent: { database_id: env.NOTION_STAYS_DB }, properties: props });
}

export async function createItinerary(env, { what, date, time, where, kind, ownerId, note }) {
  const props = {
    "What": { title: title(what) },
    "Date": { date: { start: date } },
    "Kind": { select: { name: kind } },
  };
  if (time) props["Time"] = { rich_text: rich(time) };
  if (where) props["Where"] = { rich_text: rich(where) };
  if (note) props["Note"] = { rich_text: rich(note) };
  if (ownerId) props["Owner"] = { relation: [{ id: ownerId }] };
  return notion(env, "/pages", "POST", { parent: { database_id: env.NOTION_ITINERARY_DB }, properties: props });
}

export async function createExpense(env, { item, amount, currency, category, date, paidById, splitIds }) {
  const props = {
    "Item": { title: title(item) },
    "Amount": { number: amount },
    "Currency": { select: { name: currency } },
    "Category": { select: { name: category } },
    "Date": { date: { start: date } },
    "Paid by": { relation: [{ id: paidById }] },
    "Split with": { relation: splitIds.map(id => ({ id })) },
  };
  return notion(env, "/pages", "POST", { parent: { database_id: env.NOTION_EXPENSES_DB }, properties: props });
}

/* ── read / update rows ─────────────────────────────────────── */

export async function findByUrl(env, dbId, url) {
  try {
    const r = await notion(env, `/databases/${dbId}/query`, "POST", {
      filter: { property: "Link", url: { equals: url } }, page_size: 1,
    });
    return r.results[0] || null;
  } catch { return null; }
}

export const getPage = (env, pageId) => notion(env, `/pages/${pageId}`);

export const setKind = (env, pageId, kind) =>
  notion(env, `/pages/${pageId}`, "PATCH", { properties: { "Kind": { select: { name: kind } } } });

export const archive = (env, pageId) =>
  notion(env, `/pages/${pageId}`, "PATCH", { archived: true });

/**
 * Add a member to "Who's in" on an Idea or Stay. Idempotent.
 * @returns { count, added, title }
 */
export async function addVote(env, pageId, memberId) {
  const page = await getPage(env, pageId);
  const have = (page.properties["Who's in"]?.relation || []).map(r => r.id);
  const added = !have.includes(memberId);
  const next = added ? [...have, memberId] : have;
  if (added) {
    await notion(env, `/pages/${pageId}`, "PATCH", {
      properties: { "Who's in": { relation: next.map(id => ({ id })) } },
    });
  }
  return { count: next.length, added, title: plainTitle(page.properties["Place"]), url: page.url };
}
