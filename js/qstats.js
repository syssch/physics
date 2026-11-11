// First-attempt choice statistics: for each question, how students answered it the FIRST time they met it
// (in practice, Redo my mistakes or an assignment). Built in the teacher's browser from `attempts` (teachers may read
// them), cached for the session. Staff accounts (@singyin.edu.hk) are left out.
import { db } from "./fb.js?v=202611112229";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, toDate } from "./ui.js?v=202611112229";

let cache = null;
const ms = (ts) => (!ts ? 0 : ts.toMillis ? ts.toMillis() : +toDate(ts));
const isStudent = (email) => /@syss\.edu\.hk$/i.test(email || "");
const formOf = (name) => { const m = /^\s*(?:F\.?\s*)?([1-6])/i.exec(name || ""); return m ? `F${m[1]}` : null; };

/** { firsts: Map(qid -> [{ email, r }]), classes: [{ id, name, studentEmails }], at } */
export async function loadFirstAttempts(force = false, maxAgeMs = 5 * 60000) {
  if (cache && !force && Date.now() - cache.at < maxAgeMs) return cache;
  const [aSnap, cSnap] = await Promise.all([getDocs(collection(db, "attempts")), getDocs(collection(db, "classes"))]);
  const atts = aSnap.docs.map((d) => d.data()).filter((a) => isStudent(a.email)).sort((a, b) => ms(a.submittedAt) - ms(b.submittedAt));
  const firsts = new Map(), seen = new Set();
  for (const a of atts) {
    for (const qid of a.questionIds || []) {
      const k = `${a.email}|${qid}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (!firsts.has(qid)) firsts.set(qid, []);
      firsts.get(qid).push({ email: a.email, r: (a.responses || {})[qid] || "" });
    }
  }
  const classes = cSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name));
  cache = { firsts, classes, at: Date.now() };
  return cache;
}

/** "All students" / a form / a class. value(): "" | "form:F4" | "class:<id>"; emails(): Set or null (= everyone). */
export function studentFilter(classes, onChange, initial = "") {
  const forms = [...new Set(classes.map((c) => formOf(c.name)).filter(Boolean))].sort();
  const sel = el("select", { "aria-label": "Students" }, [el("option", { value: "" }, "All students")]
    .concat(forms.map((f) => el("option", { value: `form:${f}`, selected: initial === `form:${f}` }, `All ${f}`)))
    .concat(classes.map((c) => el("option", { value: `class:${c.id}`, selected: initial === `class:${c.id}` }, c.name))));
  sel.addEventListener("change", onChange);
  const emails = () => {
    const v = sel.value;
    if (!v) return null;
    const pick = v.startsWith("form:") ? classes.filter((c) => formOf(c.name) === v.slice(5)) : classes.filter((c) => `class:${c.id}` === v);
    return new Set(pick.flatMap((c) => (c.studentEmails || []).map((e) => e.toLowerCase())));
  };
  return { node: sel, emails, value: () => sel.value };
}

/** Summary of first attempts for one question: { n, counts: {A: 3, ...}, blank, correct, pct } (pct null if no key). */
export function summarise(entries, emails, key, optionKeys = ["A", "B", "C", "D"]) {
  const counts = Object.fromEntries(optionKeys.map((k) => [k, 0]));
  let n = 0, blank = 0;
  for (const e of entries || []) {
    if (emails && !emails.has(e.email)) continue;
    n++;
    if (!e.r) blank++; else counts[e.r] = (counts[e.r] || 0) + 1;
  }
  const correct = key ? counts[key] || 0 : null;
  return { n, counts, blank, correct, pct: key && n ? Math.round((100 * correct) / n) : null };
}

/** A one-line bar of first-attempt choices for a question card or table. */
export function statsLine(s, key) {
  if (!s.n) return el("div", { class: "qstat muted small" }, "First attempts: none yet.");
  const opts = Object.entries(s.counts).map(([k, c]) => el("span", { class: `qs-opt${k === key ? " key" : ""}`, title: `${c} of ${s.n} chose ${k}` }, [
    el("b", {}, k), ` ${c}`, el("span", { class: "qs-bar" }, el("span", { style: `width:${Math.round((100 * c) / s.n)}%` })),
  ]));
  if (s.blank) opts.push(el("span", { class: "qs-opt" }, [el("b", {}, "blank"), ` ${s.blank}`]));
  return el("div", { class: "qstat" }, [
    el("span", { class: "qs-head" }, [`First attempts: ${s.n} student${s.n > 1 ? "s" : ""}`,
      s.pct === null ? "" : el("strong", { class: s.pct < 50 ? "qs-low" : s.pct < 75 ? "qs-mid" : "qs-high" }, ` · ${s.pct}% correct`)]),
    ...opts,
  ]);
}
