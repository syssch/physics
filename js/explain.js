// "Explain" cards: Paper 1B explanation questions with marking scheme, teaching notes and examiners' comments.
// Students read one card a day (or any card they like, by topic) and mark cards as read.
import { db } from "./fb.js";
import { doc, getDoc, setDoc, getDocs, collection, query, where, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, loading, toast, errMsg, fmtDate, chunk } from "./ui.js";

let bundleCache = null;
export async function getCards() {
  if (!bundleCache) {
    const s = await getDoc(doc(db, "meta", "explainCards"));
    bundleCache = s.exists() ? { topics: s.data().topics || [], cards: s.data().cards || [] } : { topics: [], cards: [] };
  }
  return bundleCache;
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

/** Today's card: fixed for the whole day; the first unread card (booklet order) in the student's chosen topics. */
function pickToday(cards, p) {
  const chosen = p.topics && p.topics.length ? p.topics : null;
  const pool = cards.filter((c) => !chosen || chosen.includes(c.topic));
  if (p.today && p.today.date === todayStr() && pool.some((c) => c.id === p.today.cardId)) return { card: pool.find((c) => c.id === p.today.cardId), changed: false };
  const next = pool.find((c) => !p.read[c.id]) || null;
  return { card: next, changed: true };
}

async function todayCard(user, cards, p) {
  const { card, changed } = pickToday(cards, p);
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
    const { cards } = await getCards();
    if (!cards.length) { box.append(el("p", { class: "muted" }, "Coming soon.")); return box; }
    const p = await loadProgress(user);
    const c = await todayCard(user, cards, p);
    const total = cards.length, done = cards.filter((x) => p.read[x.id]).length;
    if (!c) box.append(el("p", {}, "You've read every card in your chosen topics. Well done! Pick more topics on the Explain page."));
    else box.append(
      el("p", {}, [el("strong", {}, `${c.topic} · ${label(c)}`), ` (${c.marks} mark${c.marks > 1 ? "s" : ""}) — ${c.pattern}`]),
      el("p", { class: "muted" }, snip(c.questionHtml, 160)),
      el("div", { class: "row" }, [
        el("a", { class: "btn primary", href: `#/explain/${c.id}` }, p.read[c.id] ? "Read again ✓" : "Read today's card"),
        el("a", { class: "btn", href: "#/explain" }, "Choose topics / all cards"),
        el("span", { class: "muted" }, `${done} of ${total} read`),
      ]));
  } catch (e) { box.append(el("p", { class: "error" }, errMsg(e))); }
  return box;
}

// ---------------------------------------------------------------- library (choose topics, list cards)
export async function explainLibrary(user) {
  mount(loading());
  const [{ topics, cards }, p] = await Promise.all([getCards(), loadProgress(user)]);
  if (!cards.length) return mount(el("p", { class: "muted" }, "The Explain cards haven't been loaded yet."));
  const page = el("section", {});
  const today = await todayCard(user, cards, p);
  page.append(el("h1", {}, "Explain it! — Paper 1B explanation questions"));
  page.append(el("p", { class: "muted" },
    "Each card is a past DSE \"explain\" question with the marking scheme, teaching notes and what examiners said. Read one a day — your daily card comes from the topics you tick below."));
  if (today) page.append(el("div", { class: "panel today" }, [
    el("strong", {}, "Today: "), `${today.topic} · ${label(today)} — ${today.pattern} `,
    el("a", { class: "btn small primary", href: `#/explain/${today.id}` }, p.read[today.id] ? "Read again ✓" : "Read now"),
  ]));

  // topic chooser
  const chosen = new Set(p.topics && p.topics.length ? p.topics : topics);
  const chips = el("div", { class: "chips" });
  const listBox = el("div", {});
  const drawChips = () => chips.replaceChildren(...topics.map((t) => {
    const inT = cards.filter((c) => c.topic === t), n = inT.filter((c) => p.read[c.id]).length;
    const cb = el("input", { type: "checkbox", checked: chosen.has(t) });
    cb.addEventListener("change", async () => {
      if (cb.checked) chosen.add(t); else chosen.delete(t);
      if (!chosen.size) { chosen.add(t); cb.checked = true; return toast("Keep at least one topic ticked.", "error"); }
      p.topics = topics.filter((x) => chosen.has(x));
      if (p.today && !p.topics.includes((cards.find((c) => c.id === p.today.cardId) || {}).topic)) p.today = null;
      try { await saveProgress(user, p); } catch (e) { toast(errMsg(e), "error"); }
      drawList();
    });
    return el("label", { class: `chip ${chosen.has(t) ? "on" : ""}` }, [cb, ` ${t} `, el("span", { class: "muted" }, `${n}/${inT.length}`)]);
  }));
  function drawList() {
    drawChips();
    const groups = [];
    for (const t of topics.filter((x) => chosen.has(x))) {
      const inT = cards.filter((c) => c.topic === t);
      const g = el("div", { class: "panel" }, [el("h2", {}, t)]);
      let pat = null;
      for (const c of inT) {
        if (c.pattern !== pat) { pat = c.pattern; g.append(el("h3", { class: "pattern" }, pat)); }
        g.append(el("a", { class: `cardrow ${p.read[c.id] ? "done" : ""}`, href: `#/explain/${c.id}` }, [
          el("span", { class: "tick" }, p.read[c.id] ? "✓" : ""),
          el("span", { class: "ref" }, `${label(c)} (${c.marks})`),
          el("span", { class: "snip" }, snip(c.questionHtml, 110)),
        ]));
      }
      groups.push(g);
    }
    listBox.replaceChildren(...groups);
  }
  page.append(el("h2", {}, "Your topics"), el("p", { class: "muted" }, "Tick the topics you have learnt. Numbers show cards read."), chips, listBox);
  drawList();
  mount(page);
}

// ---------------------------------------------------------------- one card
export async function explainCard(user, id) {
  mount(loading());
  const [{ cards }, p] = await Promise.all([getCards(), loadProgress(user)]);
  const c = cards.find((x) => x.id === id);
  if (!c) return mount(el("p", { class: "error" }, "Card not found."));
  const sameTopic = cards.filter((x) => x.topic === c.topic);
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
    el("p", { class: "muted" }, [el("a", { href: "#/explain" }, "Explain"), ` › ${c.topic} › ${c.pattern}`]),
    el("h1", {}, `DSE ${c.year} Paper 1B ${c.qref}`),
    el("p", { class: "muted" }, `${c.marks} mark${c.marks > 1 ? "s" : ""}`),
    section("Context", c.context),
    section("Question (exact wording)", c.questionHtml, "q"),
    section("Marking-scheme answer", c.answerHtml, "ans"),
    section("Teaching notes", c.notesHtml),
    section("Examiners' comments (HKEAA)", c.examinerHtml, "exam"),
    el("div", { class: "row" }, [btn,
      nextUnread ? el("a", { class: "btn", href: `#/explain/${nextUnread.id}` }, `Next unread in ${c.topic} →`) : el("span", { class: "muted" }, `All ${c.topic} cards read!`),
      el("a", { class: "btn", href: "#/explain" }, "All cards")]),
  ]));
}

// ---------------------------------------------------------------- teacher: reading progress by class
export async function explainProgressView(user) {
  mount(loading());
  const [{ cards }, clsSnap] = await Promise.all([getCards(), getDocs(collection(db, "classes"))]);
  const classes = clsSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
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
    const t = el("table", { class: "grid" }, [el("tr", {}, ["Student", "Cards read", "Last 7 days", "Last read", "Topics chosen"].map((h) => el("th", {}, h)))]);
    emails.forEach((e) => {
      const d = prog.get(e), times = Object.values((d && d.read) || {}).map((x) => Date.parse(x)).filter(Boolean);
      t.append(el("tr", { class: d ? "" : "missing" }, [
        el("td", {}, d && d.name ? `${d.name} (${e.split("@")[0]})` : e.split("@")[0]),
        el("td", {}, String(times.length)), el("td", {}, String(times.filter((x) => x >= weekAgo).length)),
        el("td", {}, times.length ? fmtDate(new Date(Math.max(...times))) : "—"),
        el("td", { class: "muted" }, d && d.topics ? d.topics.join(", ") : "all"),
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
  await setDoc(doc(db, "meta", "explainCards"), { topics: b.topics, cards: b.cards, updatedAt: serverTimestamp() });
  bundleCache = null;
  return b.cards.length;
}
