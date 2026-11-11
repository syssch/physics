// Teacher pages for individual students: a class's student list with a short summary each (#/t/students/<classId>)
// and one student's full record (#/t/student/<classId>/<email>): every attempt (practice, Redo my mistakes,
// assignments) with a review of each, % correct by book and chapter, questions currently wrong, and their feedback.
import { db } from "./fb.js?v=202611112229";
import { collection, doc, getDoc, getDocs, query, where, orderBy, documentId }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, loading, fmtDate, toDate, pct, chunk, typeset } from "./ui.js?v=202611112229";
import { getQuestions, getBooks, renderQuestion, sourceLabel } from "./questions.js?v=202611112229";
import { attachRoster, attachRosters, studentLabel, sortByRoster } from "./roster.js?v=202611112229";
import { ERROR_TYPES } from "./feedback.js?v=202611112229";
import { getCards, readStats } from "./explain.js?v=202611112229";

const ms = (ts) => (!ts ? 0 : ts.toMillis ? ts.toMillis() : +toDate(ts));
const DAY = 86400000;
const kindOf = (a) => a.mode === "assignment" ? "Assignment" : a.kind === "mistakes" ? "Redo my mistakes" : "Practice";
const recordHref = (classId, email) => `#/t/student/${classId}/${encodeURIComponent(email)}`;
export { recordHref };

async function loadClass(classId) {
  const s = await getDoc(doc(db, "classes", classId));
  if (!s.exists()) return null;
  return attachRoster({ id: classId, ...s.data() }, classId);
}
async function classAssignments(classId) {
  const snap = await getDocs(query(collection(db, "classes", classId, "assignments"), orderBy("dueAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}
async function attemptsOf(emails) {
  const out = [];
  for (const part of chunk([...new Set(emails)], 30)) {
    const snap = await getDocs(query(collection(db, "attempts"), where("email", "in", part)));
    snap.forEach((d) => out.push({ id: d.id, ...d.data() }));
  }
  return out.sort((a, b) => ms(b.submittedAt) - ms(a.submittedAt));
}
/** explainProgress docs by email (each student keeps one; teachers may read all). */
async function explainOf(emails) {
  const out = new Map();
  for (const part of chunk([...new Set(emails)], 30)) {
    const snap = await getDocs(query(collection(db, "explainProgress"), where("email", "in", part)));
    snap.forEach((d) => out.set(d.data().email, d.data()));
  }
  return out;
}
async function answerKeys(ids) {
  const keys = new Map();
  for (const part of chunk([...new Set(ids)], 30)) {
    (await getDocs(query(collection(db, "answerKeys"), where(documentId(), "in", part)))).forEach((d) => keys.set(d.id, d.data()));
  }
  return keys;
}
function card(label, value, sub) {
  return el("div", { class: "statcard" }, [el("div", { class: "statval" }, String(value)), el("div", { class: "statlabel" }, label),
    sub ? el("div", { class: "muted small" }, sub) : null]);
}

// ---------------------------------------------------------------- class list
export async function studentsView(user, classId) {
  mount(loading());
  const classes = await attachRosters((await getDocs(collection(db, "classes"))).docs.map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.name.localeCompare(b.name)));
  if (!classes.length) return mount(el("p", { class: "muted" }, "No classes yet."));
  const cls = classes.find((c) => c.id === classId) || classes[0];
  const emails = cls.studentEmails || [];
  const [atts, asg, exp, bundle] = await Promise.all([attemptsOf(emails), classAssignments(cls.id),
    explainOf(emails).catch(() => new Map()), getCards().catch(() => ({ cards: [] }))]);
  const by = new Map(emails.map((e) => [e, []]));
  atts.forEach((a) => { if (by.has(a.email)) by.get(a.email).push(a); });
  const now = Date.now(), asgIds = new Set(asg.map((a) => a.id));

  const pick = el("select", { "aria-label": "Class" }, classes.map((c) => el("option", { value: c.id, selected: c.id === cls.id }, c.name)));
  pick.addEventListener("change", () => { location.hash = `#/t/students/${pick.value}`; });
  const head = el("tr", {}, ["Student", "Sets", "Last 7 days", "Questions", "% correct", "Assignments", "Explain cards", "Last active"].map((h) => el("th", {}, h)));
  const table = el("table", { class: "grid students" }, [head]);
  for (const email of sortByRoster(cls, emails, (e) => (by.get(e)[0] || {}).name)) {
    const list = by.get(email);
    const q = list.reduce((s, a) => s + (a.total || 0), 0), c = list.reduce((s, a) => s + (a.score || 0), 0);
    const week = list.filter((a) => now - ms(a.submittedAt) < 7 * DAY).length;
    const done = new Set(list.filter((a) => asgIds.has(a.assignmentId)).map((a) => a.assignmentId)).size;
    const ex = readStats(exp.get(email), bundle.cards);
    const lastAt = Math.max(list.length ? ms(list[0].submittedAt) : 0, ex.last || 0);
    table.append(el("tr", { class: list.length || ex.n ? "" : "missing" }, [
      el("td", { class: "nowrap" }, el("a", { href: recordHref(cls.id, email) }, studentLabel(cls, email, (list[0] || {}).name))),
      el("td", {}, String(list.length)), el("td", {}, week ? String(week) : "—"), el("td", {}, String(q)),
      el("td", {}, q ? `${pct(c, q)}%` : "—"), el("td", {}, asg.length ? `${done}/${asg.length}` : "—"),
      el("td", {}, ex.n ? `${ex.n}${ex.week ? ` (${ex.week} this week)` : ""}` : "—"),
      el("td", { class: "nowrap" }, lastAt ? fmtDate(lastAt) : "never"),
    ]));
  }
  mount(el("section", {}, [
    el("h1", {}, "Students"),
    el("div", { class: "row" }, [el("label", {}, ["Class ", pick]), el("a", { class: "btn small", href: "#/t" }, "Back")]),
    el("p", { class: "muted" }, "Practice sets, Redo my mistakes and assignments for each student. Click a name for their full record."),
    emails.length ? el("div", { class: "scroll" }, table) : el("p", { class: "muted" }, "No students in this class."),
  ]));
}

// ---------------------------------------------------------------- one student
export async function studentRecordView(user, classId, emailEnc) {
  mount(loading());
  const email = decodeURIComponent(emailEnc || "").toLowerCase();
  const cls = await loadClass(classId);
  if (!cls) return mount(el("p", { class: "error" }, "Class not found."));
  const [atts, asg, fbSnap, books, exp, bundle] = await Promise.all([
    attemptsOf([email]), classAssignments(classId),
    getDocs(query(collection(db, "feedback"), where("email", "==", email))).catch(() => ({ docs: [] })),
    getBooks().catch(() => []),
    explainOf([email]).catch(() => new Map()), getCards().catch(() => ({ cards: [] })),
  ]);
  const ex = readStats(exp.get(email), bundle.cards);
  const name = (atts[0] || {}).name;
  const label = studentLabel(cls, email, name);
  const qids = [...new Set(atts.flatMap((a) => a.questionIds || []))];
  const [questions, keys] = await Promise.all([getQuestions(qids), answerKeys(qids)]);
  const qmap = new Map(questions.map((q) => [q.id, q]));
  const key = (id) => (keys.get(id) || {}).answer || null;
  const chName = new Map();
  (books || []).forEach((b) => (b.chapters || []).forEach((c) => chName.set(c.id, `${b.book > 5 ? `B${b.book} ` : ""}Ch ${c.no} ${c.en || ""}`.trim())));

  // per-answer statistics (marked against the current answer keys)
  const byBook = new Map(), byCh = new Map();
  let answered = 0, right = 0;
  const add = (m, k, ok) => { const r = m.get(k) || { n: 0, ok: 0 }; r.n++; if (ok) r.ok++; m.set(k, r); };
  atts.forEach((a) => (a.questionIds || []).forEach((id) => {
    const k = key(id), q = qmap.get(id);
    if (!k) return;
    const ok = (a.responses || {})[id] === k;
    answered++; if (ok) right++;
    if (q) { add(byBook, q.topic || "Other", ok); (q.chapters || []).forEach((c) => add(byCh, c, ok)); }
  }));
  // questions whose most recent answer is wrong or blank
  const latest = new Map();
  [...atts].reverse().forEach((a) => (a.questionIds || []).forEach((id) => latest.set(id, { r: (a.responses || {})[id] || "", a })));
  const wrongNow = [...latest.entries()].filter(([id, v]) => key(id) && v.r !== key(id));

  const counts = { Practice: 0, "Redo my mistakes": 0, Assignment: 0 };
  atts.forEach((a) => counts[kindOf(a)]++);
  const asgIds = new Set(asg.map((a) => a.id));
  const doneAsg = new Map(atts.filter((a) => asgIds.has(a.assignmentId)).map((a) => [a.assignmentId, a]));
  const now = Date.now();
  const overdue = asg.filter((a) => !doneAsg.has(a.id) && ms(a.dueAt) < now);
  const late = [...doneAsg.values()].filter((a) => a.late).length;

  const page = el("section", { class: "record" });
  page.append(el("h1", {}, label), el("p", { class: "muted" }, `${email} · ${cls.name}`),
    el("div", { class: "row" }, [el("a", { class: "btn small", href: `#/t/students/${classId}` }, `All students in ${cls.name}`),
      el("a", { class: "btn small", href: "#/t" }, "Dashboard")]));
  page.append(el("div", { class: "statgrid" }, [
    card("sets done", atts.length, `${counts.Practice} practice · ${counts["Redo my mistakes"]} redo · ${counts.Assignment} assignment`),
    card("questions answered", answered, answered ? `${right} correct` : ""),
    card("correct overall", answered ? `${pct(right, answered)}%` : "—"),
    card("assignments", asg.length ? `${doneAsg.size}/${asg.length}` : "—", [late ? `${late} late` : "", overdue.length ? `${overdue.length} overdue` : ""].filter(Boolean).join(" · ")),
    card("Explain cards read", bundle.cards.length ? `${ex.n}/${bundle.cards.length}` : ex.n,
      ex.n ? `${ex.week} in the last 7 days · last ${fmtDate(ex.last).split(",")[0]}` : ""),
    card("last active", atts.length ? fmtDate(atts[0].submittedAt).split(",")[0] : "never", atts.length ? `${atts.filter((a) => now - ms(a.submittedAt) < 7 * DAY).length} sets in the last 7 days` : ""),
  ]));
  if (!atts.length) {
    page.append(el("p", { class: "muted" }, "No practice or assignments submitted yet."));
    return mount(page);
  }

  // weak areas
  const areaTable = (rows, title) => {
    const t = el("table", { class: "grid areas" }, [el("tr", {}, [el("th", {}, title), el("th", {}, "Answered"), el("th", {}, "Correct"), el("th", {}, "")])]);
    rows.forEach(([k, r]) => {
      const p = pct(r.ok, r.n);
      t.append(el("tr", {}, [el("td", {}, k), el("td", {}, String(r.n)), el("td", {}, `${p}%`),
        el("td", { class: "barcell" }, el("span", { class: `bar ${p < 50 ? "low" : p < 75 ? "mid" : "high"}`, style: `width:${Math.max(p, 2)}%` }))]));
    });
    return t;
  };
  const chRows = [...byCh.entries()].filter(([, r]) => r.n >= 3).map(([id, r]) => [chName.get(id) || `Ch ${id}`, r]).sort((a, b) => pct(a[1].ok, a[1].n) - pct(b[1].ok, b[1].n));
  const bookRows = [...byBook.entries()].sort((a, b) => pct(a[1].ok, a[1].n) - pct(b[1].ok, b[1].n));
  page.append(el("div", { class: "panel" }, [el("h2", {}, "Strengths and weak areas"),
    el("p", { class: "muted small" }, "Every answer in every set, marked against the current answer keys; weakest first. Chapters with at least 3 answers."),
    el("div", { class: "areas2" }, [el("div", { class: "scroll" }, areaTable(bookRows, "Book")),
      chRows.length ? el("div", { class: "scroll" }, areaTable(chRows, "Chapter")) : null])]));

  // attempts
  const at = el("table", { class: "grid attempts" }, [el("tr", {}, ["Date", "Type", "Title", "Score", ""].map((h) => el("th", {}, h)))]);
  atts.forEach((a) => {
    const view = el("button", { type: "button", class: "linkbtn" }, "View");
    const detail = el("tr", { class: "attempt-detail", hidden: true }, el("td", { colspan: 5 }));
    view.addEventListener("click", () => {
      detail.hidden = !detail.hidden;
      view.textContent = detail.hidden ? "View" : "Hide";
      if (detail.hidden || detail.dataset.drawn) return;
      detail.dataset.drawn = "1";
      const box = el("div", { class: "attempt-review" });
      (a.questionIds || []).forEach((id, i) => {
        const q = qmap.get(id);
        if (!q) { box.append(el("p", { class: "muted" }, `Q${i + 1}: question ${id} is no longer on the platform.`)); return; }
        const k = keys.get(id) || {}, r = (a.responses || {})[id];
        const c = renderQuestion(q, { number: i + 1, selected: r, review: { answer: k.answer || null, correct: !!r && r === k.answer, solution: k.solution || "" } });
        c.querySelectorAll("p.fb, p.muted").forEach((n) => { n.textContent = n.textContent.replace(/^Your answer/, "Student's answer"); });
        c.querySelector(".solution")?.removeAttribute("open");
        box.append(c);
      });
      detail.firstChild.append(box);
      typeset(box);
    });
    const asgLink = a.mode === "assignment" && asgIds.has(a.assignmentId) ? [" · ", el("a", { href: `#/t/results/${classId}/${a.assignmentId}` }, "class results")] : [];
    at.append(el("tr", {}, [el("td", { class: "nowrap" }, fmtDate(a.submittedAt)), el("td", {}, kindOf(a)),
      el("td", {}, [a.title || "", a.late ? el("span", { class: "late" }, " (late)") : ""]),
      el("td", { class: "nowrap" }, `${a.score}/${a.total} (${pct(a.score, a.total)}%)`), el("td", { class: "nowrap" }, [view, ...asgLink])]), detail);
  });
  const csv = el("button", { class: "btn small", type: "button" }, "Download CSV");
  csv.addEventListener("click", () => {
    const rows = [["date", "type", "title", "score", "total", "late"], ...atts.map((a) => [fmtDate(a.submittedAt), kindOf(a), a.title || "", a.score, a.total, a.late ? "yes" : ""])];
    const blob = new Blob(["﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    el("a", { href: URL.createObjectURL(blob), download: `${label.replace(/[^\w-]+/g, "_")}_results.csv` }).click();
  });
  page.append(el("div", { class: "panel" }, [el("div", { class: "panelhead" }, [el("h2", {}, `All sets (${atts.length})`), csv]),
    el("div", { class: "scroll" }, at)]));

  // overdue assignments
  if (overdue.length) {
    page.append(el("div", { class: "panel" }, [el("h2", {}, "Not submitted (past due)"),
      el("ul", {}, overdue.map((a) => el("li", {}, [el("a", { href: `#/t/results/${classId}/${a.id}` }, a.title), el("span", { class: "muted" }, ` · due ${fmtDate(a.dueAt)}`)])))]));
  }

  // currently wrong
  const wBox = el("div", { class: "panel" }, [el("h2", {}, `Currently wrong (${wrongNow.length})`),
    el("p", { class: "muted small" }, "Questions whose most recent answer was wrong or blank. They leave this list once answered correctly (e.g. in Redo my mistakes).")]);
  if (!wrongNow.length) wBox.append(el("p", { class: "muted" }, "None — every question's latest answer is correct."));
  else {
    const t = el("table", { class: "grid" }, [el("tr", {}, ["Question", "Topic", "Last answer", "Key", "When"].map((h) => el("th", {}, h)))]);
    wrongNow.sort((x, y) => ms(y[1].a.submittedAt) - ms(x[1].a.submittedAt)).forEach(([id, v]) => {
      const q = qmap.get(id);
      t.append(el("tr", {}, [el("td", { class: "nowrap" }, q ? sourceLabel(q) : id), el("td", {}, q ? q.topic : ""),
        el("td", { class: "cell no" }, v.r || "blank"), el("td", {}, key(id)), el("td", { class: "nowrap" }, fmtDate(v.a.submittedAt))]));
    });
    wBox.append(el("div", { class: "scroll" }, t));
  }
  page.append(wBox);

  // feedback
  const fbs = fbSnap.docs.map((d) => d.data()).sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
  if (fbs.length) {
    const tl = (t) => (ERROR_TYPES.find(([k]) => k === t) || [null, "Other"])[1];
    page.append(el("div", { class: "panel" }, [el("h2", {}, "Feedback sent"), el("ul", {}, fbs.map((f) => {
      const q = qmap.get(f.qid);
      return el("li", {}, [el("strong", {}, f.kind === "explain" ? "Explain in class" : `Problem: ${tl(f.type)}`),
        ` · ${q ? sourceLabel(q) : f.qid} · ${f.status === "open" ? "open" : f.status === "done" ? (f.kind === "explain" ? "explained" : "fixed") : "dismissed"}`,
        f.note ? el("span", { class: "fbk-note" }, ` “${f.note}”`) : null, el("span", { class: "muted" }, ` · ${fmtDate(f.createdAt)}`)]);
    })), el("a", { href: "#/t/feedback" }, "Student feedback page")]));
  }
  mount(page);
}
