// "Explain" cards: Paper 1B explanation questions with marking scheme, teaching notes and examiners' comments.
// Students read one card a day (or any card they like, by textbook chapter) and mark cards as read.
// Cards carry book / chapter tags (Book 1–7, Ch 1–27 …); older bundles without them fall back to topics.
import { db } from "./fb.js";
import { doc, getDoc, setDoc, getDocs, collection, query, where, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, loading, toast, errMsg, fmtDate, chunk } from "./ui.js";
import { studentLabel, sortByRoster, attachRosters } from "./roster.js";

let bundleCache = null;
export async function getCards() {
  if (!bundleCache) {
    const s = await getDoc(doc(db, "meta", "explainCards"));
    const d = s.exists() ? s.data() : {};
    bundleCache = { topics: d.topics || [], books: d.books || [], cards: d.cards || [] };
    bundleCache.groups = groupsOf(bundleCache);
  }
  return bundleCache;
}

// ---------------------------------------------------------------- chapters
/** The key a card is chosen by: its chapter id (e.g. "9"), or its topic for older bundles. */
export const keyOf = (c) => c.chapter || c.topic;
/** "Ch 9 Momentum 動量" (or the topic name for older bundles). */
export const chLabel = (c) => c.chapter ? `Ch ${c.chapterNo} ${c.chapterEn} ${c.chapterZh || ""}`.trim() : c.topic;
const bookLabel = (b) => `Book ${b.book} ${b.en} ${b.zh || ""}`.trim();
/** [{ title, items: [{ key, label, short }] }] — books with their chapters, or one group of topics. */
function groupsOf({ topics, books, cards }) {
  if (books.length && cards.some((c) => c.chapter))
    return books.map((b) => ({ title: bookLabel(b), items: b.chapters.map((ch) => ({ key: ch.id, short: `Ch ${ch.no}`, label: `Ch ${ch.no} ${ch.en} ${ch.zh || ""}`.trim() })) }));
  return [{ title: "Topics", items: topics.map((t) => ({ key: t, short: t, label: t })) }];
}
const allKeys = (groups) => groups.flatMap((g) => g.items.map((i) => i.key));
/** The student's chosen chapter keys; saved choices that no longer exist (e.g. old topic names) count as "everything". */
function chosenKeys(groups, p) {
  const all = allKeys(groups), mine = (p.topics || []).filter((k) => all.includes(k));
  return mine.length ? mine : all;
}

// ---------------------------------------------------------------- progress (one doc per student)
const progressRef = (uid) => doc(db, "explainProgress", uid);
async function loadProgress(user) {
  const s = await getDoc(progressRef(user.uid));
  const d = s.exists() ? s.data() : {};
  return { read: d.read || {}, topics: d.topics || null, today: d.today || null };
}
async function saveProgress(user, p) {
  await setDoc(progressRef(user.uid), {
    email: user.email, name: user.name, read: p.read, topics: p.topics || null, today: p.today || null,
    updatedAt: serverTimestamp(),
  });
}

export function todayStr(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today's card: fixed for the whole day; the first unread card (chapter order) in the student's chosen chapters. */
function pickToday({ cards, groups }, p) {
  const chosen = chosenKeys(groups, p);
  const pool = cards.filter((c) => chosen.includes(keyOf(c)));
  if (p.today && p.today.date === todayStr() && pool.some((c) => c.id === p.today.cardId)) return { card: pool.find((c) => c.id === p.today.cardId), changed: false };
  const next = pool.find((c) => !p.read[c.id]) || null;
  return { card: next, changed: true };
}

async function todayCard(user, bundle, p) {
  const { card, changed } = pickToday(bundle, p);
  if (changed && card) {
    p.today = { date: todayStr(), cardId: card.id };
    try { await saveProgress(user, p); } catch (e) { console.warn(e); }
  }
  return card;
}

const label = (c) => `${c.year} ${c.qref}`;
const snip = (h, n) => { const t = plain(h); return t.length <= n ? t : t.slice(0, n).replace(/\s+\S*$/, "") + "…"; };
const plain = (h) => (h || "").replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ---------------------------------------------------------------- home-page panel
export async function explainPanel(user) {
  const box = el("div", { class: "panel" }, [el("h2", {}, "Explain card of the day")]);
  try {
    const bundle = await getCards(), { cards } = bundle;
    if (!cards.length) { box.append(el("p", { class: "muted" }, "Coming soon.")); return box; }
    const p = await loadProgress(user);
    const c = await todayCard(user, bundle, p);
    const total = cards.length, done = cards.filter((x) => p.read[x.id]).length;
    if (!c) box.append(el("p", {}, "You've read every card in your chosen chapters. Well done! Pick more chapters on the Explain page."));
    else box.append(
      el("p", {}, [el("strong", {}, `${chLabel(c)} · ${label(c)}`), ` (${c.marks} mark${c.marks > 1 ? "s" : ""}) — ${c.pattern}`]),
      el("p", { class: "muted" }, snip(c.questionHtml, 160)),
      el("div", { class: "row" }, [
        el("a", { class: "btn primary", href: `#/explain/${c.id}` }, p.read[c.id] ? "Read again ✓" : "Read today's card"),
        el("a", { class: "btn", href: "#/explain" }, "Choose chapters / all cards"),
        el("span", { class: "muted" }, `${done} of ${total} read`),
      ]));
  } catch (e) { box.append(el("p", { class: "error" }, errMsg(e))); }
  return box;
}

// ---------------------------------------------------------------- library (choose chapters, list cards)
export async function explainLibrary(user) {
  mount(loading());
  const [bundle, p] = await Promise.all([getCards(), loadProgress(user)]);
  const { cards, groups } = bundle;
  if (!cards.length) return mount(el("p", { class: "muted" }, "The Explain cards haven't been loaded yet."));
  const page = el("section", {});
  const today = await todayCard(user, bundle, p);
  page.append(el("h1", {}, "Explain it! — Paper 1B explanation questions"));
  page.append(el("p", { class: "muted" },
    "Each card is a past DSE \"explain\" question with the marking scheme, teaching notes and what examiners said. Read one a day — your daily card comes from the chapters you tick below."));
  if (today) page.append(el("div", { class: "panel today" }, [
    el("strong", {}, "Today: "), `${chLabel(today)} · ${label(today)} — ${today.pattern} `,
    el("a", { class: "btn small primary", href: `#/explain/${today.id}` }, p.read[today.id] ? "Read again ✓" : "Read now"),
  ]));

  // chapter chooser, one block per book
  const keys = allKeys(groups);
  const chosen = new Set(chosenKeys(groups, p));
  const chooser = el("div", {});
  const listBox = el("div", {});
  const inKey = (k) => cards.filter((c) => keyOf(c) === k);
  async function save() {
    p.topics = keys.filter((k) => chosen.has(k));
    if (p.today && !chosen.has(keyOf(cards.find((c) => c.id === p.today.cardId) || {}))) p.today = null;
    try { await saveProgress(user, p); } catch (e) { toast(errMsg(e), "error"); }
    drawList();
  }
  const drawChooser = () => chooser.replaceChildren(...groups.map((g) => {
    const gKeys = g.items.map((i) => i.key), allOn = gKeys.every((k) => chosen.has(k));
    const toggleAll = el("button", { class: "btn small", type: "button" }, allOn ? "Untick all" : "Tick all");
    toggleAll.addEventListener("click", () => {
      if (allOn) { gKeys.forEach((k) => chosen.delete(k)); if (!chosen.size) { gKeys.forEach((k) => chosen.add(k)); return toast("Keep at least one chapter ticked.", "error"); } }
      else gKeys.forEach((k) => chosen.add(k));
      save();
    });
    return el("div", { class: "bookbox" }, [
      el("div", { class: "row" }, [el("strong", {}, g.title), groups.length > 1 ? toggleAll : null]),
      el("div", { class: "chips" }, g.items.map((it) => {
        const inK = inKey(it.key), n = inK.filter((c) => p.read[c.id]).length;
        const cb = el("input", { type: "checkbox", checked: chosen.has(it.key) });
        cb.addEventListener("change", () => {
          if (cb.checked) chosen.add(it.key); else chosen.delete(it.key);
          if (!chosen.size) { chosen.add(it.key); cb.checked = true; return toast("Keep at least one chapter ticked.", "error"); }
          save();
        });
        return el("label", { class: `chip ${chosen.has(it.key) ? "on" : ""}`, title: it.label }, [cb, ` ${it.label} `, el("span", { class: "muted" }, `${n}/${inK.length}`)]);
      })),
    ]);
  }));
  function drawList() {
    drawChooser();
    const panels = [];
    for (const g of groups) for (const it of g.items.filter((i) => chosen.has(i.key))) {
      const box = el("div", { class: "panel" }, [el("h2", {}, it.label)]);
      for (const c of inKey(it.key)) box.append(el("a", { class: `cardrow ${p.read[c.id] ? "done" : ""}`, href: `#/explain/${c.id}` }, [
        el("span", { class: "tick" }, p.read[c.id] ? "✓" : ""),
        el("span", { class: "ref" }, `${label(c)} (${c.marks})`),
        el("span", { class: "snip" }, [snip(c.questionHtml, 110), " ", el("span", { class: "tag" }, c.pattern)]),
      ]));
      panels.push(box);
    }
    listBox.replaceChildren(...panels);
  }
  page.append(el("h2", {}, "Your chapters"), el("p", { class: "muted" }, "Tick the chapters you have learnt. Numbers show cards read."), chooser, listBox);
  drawList();
  mount(page);
}

// ---------------------------------------------------------------- one card
export async function explainCard(user, id) {
  mount(loading());
  const [{ cards }, p] = await Promise.all([getCards(), loadProgress(user)]);
  const c = cards.find((x) => x.id === id);
  if (!c) return mount(el("p", { class: "error" }, "Card not found."));
  const sameTopic = cards.filter((x) => keyOf(x) === keyOf(c));
  const nextUnread = sameTopic.find((x) => x.order > c.order && !p.read[x.id]) || sameTopic.find((x) => !p.read[x.id] && x.id !== c.id);
  const section = (title, htmlStr, cls = "") => htmlStr ? el("div", { class: `xsec ${cls}` }, [el("h3", {}, title), el("div", { html: htmlStr })]) : null;

  const btn = el("button", { class: "btn primary", type: "button" });
  const drawBtn = () => { btn.textContent = p.read[c.id] ? "✓ Read — tap to undo" : "Mark as read"; btn.className = p.read[c.id] ? "btn done" : "btn primary"; };
  drawBtn();
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    if (p.read[c.id]) delete p.read[c.id]; else p.read[c.id] = new Date().toISOString();
    try { await saveProgress(user, p); drawBtn(); if (p.read[c.id]) toast("Marked as read."); }
    catch (e) { toast(errMsg(e), "error"); }
    btn.disabled = false;
  });

  mount(el("article", { class: "xcard" }, [
    el("p", { class: "muted" }, [el("a", { href: "#/explain" }, "Explain"),
      c.chapter ? ` › Book ${c.book} ${c.topic} › ${chLabel(c)} › ${c.pattern}` : ` › ${c.topic} › ${c.pattern}`]),
    el("h1", {}, `DSE ${c.year} Paper 1B ${c.qref}`),
    el("p", { class: "muted" }, `${c.marks} mark${c.marks > 1 ? "s" : ""}`),
    section("Context", c.context),
    section("Question (exact wording)", c.questionHtml, "q"),
    section("Marking-scheme answer", c.answerHtml, "ans"),
    section("Teaching notes", c.notesHtml),
    section("Examiners' comments (HKEAA)", c.examinerHtml, "exam"),
    el("div", { class: "row" }, [btn,
      nextUnread ? el("a", { class: "btn", href: `#/explain/${nextUnread.id}` }, `Next unread in ${c.chapter ? "this chapter" : c.topic} →`) : el("span", { class: "muted" }, `All cards in ${c.chapter ? "this chapter" : c.topic} read!`),
      el("a", { class: "btn", href: "#/explain" }, "All cards")]),
  ]));
}

// ---------------------------------------------------------------- teacher: reading progress by class
export async function explainProgressView(user) {
  mount(loading());
  const [{ cards, groups }, clsSnap] = await Promise.all([getCards(), getDocs(collection(db, "classes"))]);
  const keys = allKeys(groups), shortOf = new Map(groups.flatMap((g) => g.items.map((i) => [i.key, i.short])));
  const chosenText = (d) => { const k = d ? chosenKeys(groups, d) : keys; return k.length === keys.length ? "all" : k.map((x) => shortOf.get(x)).join(", "); };
  const classes = await attachRosters(clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)));
  const page = el("section", {}, [el("h1", {}, "Explain cards — reading progress"),
    el("p", { class: "muted" }, `${cards.length} cards on the platform. "Last 7 days" counts cards marked read in the past week.`)]);
  const weekAgo = Date.now() - 7 * 864e5;
  for (const c of classes) {
    const emails = c.studentEmails || [];
    const prog = new Map();
    for (const part of chunk(emails, 30)) {
      const s = await getDocs(query(collection(db, "explainProgress"), where("email", "in", part)));
      s.forEach((d) => prog.set(d.data().email, d.data()));
    }
    const t = el("table", { class: "grid" }, [el("tr", {}, ["Student", "Cards read", "Last 7 days", "Last read", "Chapters chosen"].map((h) => el("th", {}, h)))]);
    sortByRoster(c, emails, (e) => prog.get(e)?.name).forEach((e) => {
      const d = prog.get(e), times = Object.values((d && d.read) || {}).map((x) => Date.parse(x)).filter(Boolean);
      t.append(el("tr", { class: d ? "" : "missing" }, [
        el("td", { class: "nowrap" }, studentLabel(c, e, d && d.name)),
        el("td", {}, String(times.length)), el("td", {}, String(times.filter((x) => x >= weekAgo).length)),
        el("td", {}, times.length ? fmtDate(new Date(Math.max(...times))) : "—"),
        el("td", { class: "muted" }, chosenText(d)),
      ]));
    });
    page.append(el("div", { class: "panel" }, [el("h2", {}, c.name), emails.length ? el("div", { class: "scroll" }, t) : el("p", { class: "muted" }, "No students.")]));
  }
  if (!classes.length) page.append(el("p", { class: "muted" }, "No classes yet."));
  mount(page);
}

// ---------------------------------------------------------------- admin import
export async function importExplainBundle(file) {
  const b = JSON.parse(await file.text());
  if (b.kind !== "explainCards" || !Array.isArray(b.cards)) throw new Error("This is not an explain_bundle.json file.");
  await setDoc(doc(db, "meta", "explainCards"), { topics: b.topics || [], books: b.books || [], cards: b.cards, updatedAt: serverTimestamp() });
  bundleCache = null;
  return b.cards.length;
}
