import { db, storage } from "./fb.js";
import { collection, getDocs, query, where, documentId, doc, getDoc }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { ref, getDownloadURL } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js";
import { el, chunk } from "./ui.js";

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
