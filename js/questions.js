import { db, storage } from "./fb.js";
import { collection, getDocs, query, where, documentId, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js";
import { el, chunk } from "./ui.js";
import { SYLLABUS } from "./syllabus.js";

const cache = new Map();
let allLoaded = false;

export async function getQuestions(ids) {
  const missing = ids.filter((id) => !cache.has(id));
  for (const part of chunk(missing, 30)) {
    const snap = await getDocs(query(collection(db, "questions"), where(documentId(), "in", part)));
    snap.forEach((d) => cache.set(d.id, { id: d.id, ...d.data() }));
  }
  return ids.map((id) => cache.get(id)).filter(Boolean);
}

export async function getAllQuestions() {
  if (!allLoaded) {
    const snap = await getDocs(query(collection(db, "questions"), where("active", "==", true)));
    snap.forEach((d) => cache.set(d.id, { id: d.id, ...d.data() }));
    allLoaded = true;
  }
  return [...cache.values()].filter((q) => q.active !== false).sort(byPaper);
}

export function byPaper(a, b) { return a.id.localeCompare(b.id, "en", { numeric: true }); }

let topicsCache = null;
// ---------------------------------------------------------------- syllabus: Book -> Chapter -> Subtopic
// meta/topics.books = [{ book, en, zh, chapters: [{ id, no, en, zh, subtopics: [...] }] }] (from the question bank's
// config/chapters.json). Each subtopic sits in one chapter; a question's chapters and topic (= book name) follow from it.
let booksCache = null;
/** Books for the menus: the list saved by the last import; if that is missing, the built-in syllabus trimmed to the
 *  chapters/subtopics that have questions (from meta/questionIndex), or the whole syllabus as a last resort. */
export async function getBooks() {
  if (!booksCache) {
    let books = [];
    try {
      const s = await getDoc(doc(db, "meta", "topics"));
      books = (s.exists() && s.data().books) || [];
    } catch (e) { console.warn(e); }
    if (!books.length) {
      books = SYLLABUS;
      try {
        const ix = await getDoc(doc(db, "meta", "questionIndex"));
        const qs = ix.exists() ? Object.values(ix.data().questions || {}) : [];
        if (qs.length) {
          const ch = new Set(qs.flatMap((q) => q.c || [])), sub = new Set(qs.flatMap((q) => q.s || []));
          books = SYLLABUS.map((b) => ({ ...b, chapters: b.chapters.filter((c) => ch.has(c.id))
            .map((c) => ({ ...c, subtopics: (c.subtopics || []).filter((t) => sub.has(t)) })) })).filter((b) => b.chapters.length);
        }
      } catch (e) { console.warn(e); }
    }
    booksCache = books;
  }
  return booksCache;
}
const chapterInfo = new Map();
const rememberBooks = (books) => books.forEach((b) => b.chapters.forEach((c) => chapterInfo.set(c.id, { ...c, book: b.book })));
/** "Ch 9" (Books 1–5) or "B6 Ch 1" (Books 6–7). */
export const chapterShort = (id) => { const c = chapterInfo.get(id); return c ? (c.book > 5 ? `B${c.book} Ch ${c.no}` : `Ch ${c.no}`) : id; };
/** Fallback when meta has no book list: group the questions' own topic -> chapters -> subtopics. */
export function booksFromQuestions(questions) {
  const order = (id) => (/^\d+$/.test(id) ? Number(id) : id[0] === "A" ? 100 + Number(id.slice(1)) : 200 + Number(id.slice(1)));
  const books = new Map();
  for (const q of questions) for (const id of q.chapters || []) {
    if (!books.has(q.topic)) books.set(q.topic, { book: 0, en: q.topic, zh: "", chapters: new Map() });
    const chs = books.get(q.topic).chapters;
    if (!chs.has(id)) chs.set(id, { id, no: id, en: "", zh: "", subtopics: new Set() });
    (q.subtopics || []).forEach((s) => chs.get(id).subtopics.add(s));
  }
  return [...books.values()].map((b) => ({ ...b, chapters: [...b.chapters.values()].sort((x, y) => order(x.id) - order(y.id)).map((c) => ({ ...c, subtopics: [...c.subtopics] })) }));
}
const opt = (label, value) => { const o = document.createElement("option"); o.value = value; o.textContent = label; return o; };
const bookTitle = (b) => (b.book ? `Book ${b.book} ${b.en} ${b.zh || ""}`.trim() : b.en);
const chTitle = (c) => `Ch ${c.no} ${c.en} ${c.zh || ""}`.trim();
/**
 * Three linked dropdowns: Book -> Chapter -> Subtopic ("" = all). Choosing a book narrows the chapters,
 * choosing a chapter narrows the subtopics. Returns { nodes, book, chapter, subtopic, matches(q) }.
 */
export function syllabusFilters(books, onChange = () => {}) {
  rememberBooks(books);
  const bookSel = document.createElement("select"), chSel = document.createElement("select"), subSel = document.createElement("select");
  bookSel.append(opt("All books", ""), ...books.map((b) => opt(bookTitle(b), b.en)));
  const fill = () => {
    const keepCh = chSel.value, keepSub = subSel.value;
    const shown = bookSel.value ? books.filter((b) => b.en === bookSel.value) : books;
    chSel.replaceChildren(opt("All chapters", ""));
    for (const b of shown) {
      const g = document.createElement("optgroup"); g.label = bookTitle(b);
      b.chapters.forEach((c) => g.append(opt(chTitle(c), c.id)));
      chSel.append(g);
    }
    chSel.value = [...chSel.options].some((o) => o.value === keepCh) ? keepCh : "";
    subSel.replaceChildren(opt("All subtopics", ""));
    for (const b of shown) for (const c of b.chapters) {
      if (chSel.value && c.id !== chSel.value) continue;
      const g = document.createElement("optgroup"); g.label = chTitle(c);
      (c.subtopics || []).forEach((s) => g.append(opt(s, s)));
      subSel.append(g);
    }
    subSel.value = [...subSel.options].some((o) => o.value === keepSub) ? keepSub : "";
  };
  fill();
  bookSel.addEventListener("change", () => { fill(); onChange(); });
  chSel.addEventListener("change", () => { fill(); onChange(); });
  subSel.addEventListener("change", onChange);
  if (!books.length) [bookSel, chSel, subSel].forEach((s) => { s.hidden = true; });
  const f = {
    nodes: [bookSel, chSel, subSel], bookSel, chSel, subSel,
    get book() { return bookSel.value; }, get chapter() { return chSel.value; }, get subtopic() { return subSel.value; },
    matches: (q) => (!bookSel.value || q.topic === bookSel.value) &&
      (!chSel.value || (q.chapters || []).includes(chSel.value)) &&
      (!subSel.value || (q.subtopics || []).includes(subSel.value)),
  };
  return f;
}

export async function getTopics() {
  if (!topicsCache) {
    const s = await getDoc(doc(db, "meta", "topics"));
    topicsCache = s.exists() ? s.data().topics || {} : {};
  }
  return topicsCache;
}

const figUrls = new Map();
function figureImg(name) {
  const img = el("img", { class: "figure", alt: "Figure for this question" });
  const url = figUrls.get(name) || getDownloadURL(ref(storage, `figures/${name}`));
  figUrls.set(name, url);
  Promise.resolve(url).then((u) => (img.src = u)).catch(() => img.replaceWith(el("p", { class: "muted" }, "(Figure could not be loaded.)")));
  return img;
}

export function sourceLabel(q) {
  return `${q.year} ${q.form} ${q.paper} Q${q.questionNumber}`;
}

/**
 * Render one question.
 * opts: { number, selected, onSelect(letter), review: { answer, correct } | null, showSource }
 */
export function renderQuestion(q, opts = {}) {
  const { number, selected, onSelect, review, showSource = true } = opts;
  const card = el("article", { class: "qcard", id: `q-${q.id}` });
  card.append(el("div", { class: "qhead" }, [
    el("span", { class: "qnum" }, number ? `Question ${number}` : ""),
    showSource ? el("span", { class: "qsrc" }, `${q.topic} · ${sourceLabel(q)}`) : null,
  ]));
  card.append(el("div", { class: "qtext", html: q.textHtml || "" }));
  (q.figures || []).forEach((f) => card.append(figureImg(f)));

  const keys = q.optionKeys || ["A", "B", "C", "D"];
  const state = (k) => {
    const cls = ["opt"];
    if (selected === k) cls.push("selected");
    if (review && review.answer) {
      if (k === review.answer) cls.push("right");
      else if (k === selected) cls.push("wrong");
    }
    return cls.join(" ");
  };
  const pick = (k) => onSelect && !review ? () => onSelect(k) : undefined;

  if (q.optionsType === "table" && q.optionsHtml && q.optionsHtml.rows) {
    const t = el("table", { class: "opttable" });
    t.append(el("tr", {}, [el("th", {}, "")].concat((q.optionsHtml.headers || []).map((h) => el("th", { html: h })))));
    keys.forEach((k) => {
      const cells = (q.optionsHtml.rows || {})[k] || [];
      const tr = el("tr", { class: state(k), onclick: pick(k), tabindex: onSelect && !review ? 0 : undefined },
        [el("td", { class: "optkey" }, k)].concat(cells.map((c) => el("td", { html: c }))));
      t.append(tr);
    });
    card.append(t);
  } else {
    const list = el("div", { class: "optlist" });
    keys.forEach((k) => {
      list.append(el("button", { type: "button", class: state(k), onclick: pick(k), disabled: review ? true : undefined }, [
        el("span", { class: "optkey" }, k),
        el("span", { class: "opttext", html: (q.optionsHtml || {})[k] || "" }),
      ]));
    });
    card.append(list);
  }

  if (review) {
    let msg;
    if (!review.answer) msg = el("p", { class: "muted" }, selected ? `Your answer: ${selected}` : "Not answered");
    else if (review.correct) msg = el("p", { class: "fb good" }, `Correct (${review.answer})`);
    else msg = el("p", { class: "fb bad" }, `${selected ? `Your answer: ${selected}. ` : "Not answered. "}Correct answer: ${review.answer}`);
    card.append(msg);
  }
  return card;
}
