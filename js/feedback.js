// Student feedback on questions: "Report a problem" and "Explain in class" buttons under each question in a marked
// set, and the teacher's Student feedback page (also summarised on each assignment's Results page).
import { db, auth, api } from "./fb.js?v=202611141656";
import { collection, doc, getDocs, updateDoc, query, where, orderBy, limit, documentId, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, loading, toast, errMsg, fmtDate, chunk, typeset } from "./ui.js?v=202611141656";
import { getQuestions, renderQuestion, sourceLabel } from "./questions.js?v=202611141656";
import { attachRosters, studentLabel } from "./roster.js?v=202611141656";
import { setBadge } from "./chrome.js?v=202611141656";

export const ERROR_TYPES = [
  ["key", "Answer key may be wrong"],
  ["wording", "Typo or unclear wording"],
  ["figure", "Figure missing or wrong"],
  ["solution", "Solution wrong or unclear"],
  ["other", "Something else"],
];
const typeLabel = (t) => (ERROR_TYPES.find(([k]) => k === t) || [null, "Other"])[1];
const icon = (name) => el("i", { class: `ti ti-${name}`, "aria-hidden": "true" });

// ---------------------------------------------------------------- student side
/** The student's own feedback on these questions: Map "kind_qid" -> doc. */
async function myFeedback(qids) {
  const uid = auth.currentUser && auth.currentUser.uid;
  const out = new Map();
  if (!uid) return out;
  for (const part of chunk([...new Set(qids)], 30)) {
    const snap = await getDocs(query(collection(db, "feedback"), where("uid", "==", uid), where("qid", "in", part)));
    snap.forEach((d) => { const f = d.data(); out.set(`${f.kind}_${f.qid}`, f); });
  }
  return out;
}

/**
 * Add the feedback row under each question card of a marked set.
 * ctx: { attemptId, revealed, questions }. Cards must already be in the page (ids "q-<qid>").
 */
export async function attachFeedbackBars(page, ctx) {
  if (!ctx.attemptId) return;
  const bars = new Map();
  const cards = new Map([...page.querySelectorAll(".qcard")].map((c) => [c.id, c]));
  ctx.questions.forEach((q) => {
    const card = cards.get(`q-${q.id}`);
    if (!card) return;
    const bar = el("div", { class: "fbk" });
    card.append(bar);
    bars.set(q.id, bar);
    drawBar(bar, q.id, ctx, new Map());
  });
  try {
    const mine = await myFeedback([...bars.keys()]);
    if (mine.size) bars.forEach((bar, qid) => drawBar(bar, qid, ctx, mine));
  } catch (e) { console.warn("feedback", e); }
}

function drawBar(bar, qid, ctx, mine) {
  const ex = mine.get(`explain_${qid}`), er = mine.get(`error_${qid}`);
  const send = async (data) => {
    const r = await api.sendFeedback({ attemptId: ctx.attemptId, qid, ...data });
    if (r.feedback) mine.set(`${data.kind}_${qid}`, { ...r.feedback, qid });
    else mine.delete(`${data.kind}_${qid}`);
    drawBar(bar, qid, ctx, mine);
    return r;
  };
  const row = el("div", { class: "fbk-row" });
  const panel = el("div", { class: "fbk-panel", hidden: true });

  // Explain in class (only once the solutions are shown)
  if (ctx.revealed) {
    if (!ex) {
      const b = el("button", { type: "button", class: "btn small fbk-explain" }, [icon("hand-stop"), "Explain in class"]);
      b.title = "Ask your teacher to go through this question in the next lesson";
      b.addEventListener("click", async () => {
        b.disabled = true;
        try { await send({ kind: "explain" }); toast("Request sent — your teacher will see it before the lesson."); }
        catch (e) { toast(errMsg(e), "error"); b.disabled = false; }
      });
      row.append(b);
    } else if (ex.status === "done") {
      row.append(el("span", { class: "fbk-state good" }, [icon("check"), "Explained in class"]),
        el("button", { type: "button", class: "linkbtn", onclick: () => send({ kind: "explain", note: "" }).catch((e) => toast(errMsg(e), "error")) }, "Ask again"));
    } else {
      const noteBtn = el("button", { type: "button", class: "linkbtn" }, ex.note ? "Edit note" : "Add a note");
      noteBtn.addEventListener("click", () => openNote(panel, ex.note || "", "Which part should your teacher explain? (optional)",
        async (note) => { await send({ kind: "explain", note }); toast("Note saved."); }));
      row.append(el("span", { class: "fbk-state on" }, [icon("hand-stop"), "Explain in class: requested"]), noteBtn,
        el("button", { type: "button", class: "linkbtn", onclick: () => send({ kind: "explain", remove: true }).catch((e) => toast(errMsg(e), "error")) }, "Undo"));
    }
  }

  // Report a problem
  if (!er || er.status !== "open") {
    if (er && er.status === "done") row.append(el("span", { class: "fbk-state good" }, [icon("check"), "Your report was fixed — thank you!"]));
    else if (er && er.status === "dismissed") row.append(el("span", { class: "fbk-state" }, "Your teacher checked your report."));
    const b = el("button", { type: "button", class: "btn small fbk-report" }, [icon("flag"), er ? "Report another problem" : "Report a problem"]);
    b.addEventListener("click", () => openReport(panel, null, async (type, note) => { await send({ kind: "error", type, note }); toast("Thanks — your teacher will check it."); }));
    row.append(b);
  } else {
    row.append(el("span", { class: "fbk-state on" }, [icon("flag"), `Reported: ${typeLabel(er.type)}`]),
      el("button", { type: "button", class: "linkbtn", onclick: () => openReport(panel, er,
        async (type, note) => { await send({ kind: "error", type, note }); toast("Report updated."); }) }, "Edit"),
      el("button", { type: "button", class: "linkbtn", onclick: () => send({ kind: "error", remove: true }).catch((e) => toast(errMsg(e), "error")) }, "Withdraw"));
  }
  bar.replaceChildren(row, panel);
}

function openNote(panel, value, placeholder, onSave) {
  const input = el("textarea", { rows: 2, maxlength: 500, placeholder });
  input.value = value;
  const save = el("button", { type: "button", class: "btn small primary" }, "Save");
  save.addEventListener("click", async () => {
    save.disabled = true;
    try { await onSave(input.value.trim()); } catch (e) { toast(errMsg(e), "error"); save.disabled = false; }
  });
  panel.replaceChildren(input, el("div", { class: "row" }, [save, el("button", { type: "button", class: "btn small", onclick: () => { panel.hidden = true; } }, "Cancel")]));
  panel.hidden = false;
  input.focus();
}

function openReport(panel, cur, onSend) {
  const sel = el("select", {}, ERROR_TYPES.map(([k, l]) => el("option", { value: k, selected: cur && cur.type === k }, l)));
  const note = el("textarea", { rows: 2, maxlength: 500, placeholder: "What's wrong? (optional, e.g. \"option C should be 2.5 m\")" });
  note.value = (cur && cur.note) || "";
  const go = el("button", { type: "button", class: "btn small primary" }, cur ? "Update report" : "Send report");
  go.addEventListener("click", async () => {
    go.disabled = true;
    try { await onSend(sel.value, note.value.trim()); } catch (e) { toast(errMsg(e), "error"); go.disabled = false; }
  });
  panel.replaceChildren(el("label", {}, ["What's the problem?", sel]), note,
    el("div", { class: "row" }, [go, el("button", { type: "button", class: "btn small", onclick: () => { panel.hidden = true; } }, "Cancel")]));
  panel.hidden = false;
}

// ---------------------------------------------------------------- teacher side
/** Open feedback count on the Feedback nav item. */
export async function refreshFeedbackBadge() {
  try {
    const snap = await getDocs(query(collection(db, "feedback"), where("status", "==", "open")));
    setBadge("feedback", snap.size);
  } catch (e) { console.warn("feedback badge", e); }
}

const keyCache = new Map();
async function loadKeys(ids) {
  const missing = [...new Set(ids)].filter((id) => !keyCache.has(id));
  for (const part of chunk(missing, 30)) {
    const snap = await getDocs(query(collection(db, "answerKeys"), where(documentId(), "in", part)));
    part.forEach((id) => keyCache.set(id, null));
    snap.forEach((d) => keyCache.set(d.id, d.data()));
  }
}

function labelFor(f, classes, classId) {
  const cls = classes.find((c) => c.id === classId && (c.studentEmails || []).includes(f.email))
    || classes.find((c) => (f.classIds || []).includes(c.id) && (c.studentEmails || []).includes(f.email));
  return cls ? studentLabel(cls, f.email, f.name) : (f.name || f.email.split("@")[0]);
}
const whereFrom = (f) => f.mode === "assignment" ? `${f.title || "assignment"} Q${f.qnum}` : `${f.title || "practice"} (Q${f.qnum})`;

/** Teacher action: set the status of feedback docs. */
async function setStatus(user, items, status) {
  await Promise.all(items.map((f) => updateDoc(doc(db, "feedback", f.id), status === "open"
    ? { status: "open", handledBy: null, handledAt: null }
    : { status, handledBy: user.email, handledAt: serverTimestamp() })));
  refreshFeedbackBadge();
}

function questionDetails(q) {
  const k = keyCache.get(q.id) || {};
  const d = el("details", { class: "fbk-q" }, [el("summary", {}, "Show question, answer and solution")]);
  d.addEventListener("toggle", () => {
    if (!d.open || d.dataset.drawn) return;
    d.dataset.drawn = "1";
    const card = renderQuestion(q, { review: { teacher: true, answer: k.answer || null, correct: true, solution: k.solution || "" } });
    d.append(card);
    typeset(card);
  }, { once: false });
  return d;
}

export async function feedbackView(user) {
  mount(loading());
  const [classSnap, fbSnap] = await Promise.all([
    getDocs(collection(db, "classes")),
    getDocs(query(collection(db, "feedback"), orderBy("createdAt", "desc"), limit(1000))),
  ]);
  const classes = await attachRosters(classSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)));
  const all = fbSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const qmap = new Map((await getQuestions([...new Set(all.map((f) => f.qid))])).map((q) => [q.id, q]));
  await loadKeys([...qmap.keys()]);

  const st = { classId: sessionStorage.getItem("fbkClass") || "", status: "open" };
  const clsSel = el("select", {}, [el("option", { value: "" }, "All classes")].concat(classes.map((c) => el("option", { value: c.id, selected: c.id === st.classId }, c.name))));
  const stSel = el("select", {}, [["open", "Not dealt with yet"], ["closed", "Done / dismissed"], ["all", "Everything"]].map(([v, l]) => el("option", { value: v }, l)));
  const body = el("div", {});

  const draw = () => {
    const shown = all.filter((f) => (!st.classId || (f.classIds || []).includes(st.classId))
      && (st.status === "all" || (st.status === "open" ? f.status === "open" : f.status !== "open")));
    const explains = shown.filter((f) => f.kind === "explain"), errors = shown.filter((f) => f.kind === "error");
    body.replaceChildren();

    // Explain in class, grouped by question (most requested first)
    const groups = new Map();
    explains.forEach((f) => { if (!groups.has(f.qid)) groups.set(f.qid, []); groups.get(f.qid).push(f); });
    const exBox = el("div", { class: "panel" }, [el("h2", {}, [icon("hand-stop"), ` Explain in class (${explains.length})`])]);
    if (!groups.size) exBox.append(el("p", { class: "muted" }, "No requests."));
    [...groups.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([qid, list]) => {
      const q = qmap.get(qid);
      const open = list.filter((f) => f.status === "open");
      const btn = open.length
        ? el("button", { type: "button", class: "btn small primary", onclick: async () => {
            try { await setStatus(user, open, "done"); open.forEach((f) => { f.status = "done"; }); toast("Marked as explained. Students will see it."); draw(); }
            catch (e) { toast(errMsg(e), "error"); } } }, [icon("check"), " Mark as explained"])
        : el("button", { type: "button", class: "btn small", onclick: async () => {
            try { await setStatus(user, list, "open"); list.forEach((f) => { f.status = "open"; }); draw(); } catch (e) { toast(errMsg(e), "error"); } } }, "Reopen");
      const item = el("div", { class: "fbk-item" }, [
        el("div", { class: "fbk-head" }, [el("strong", {}, `${list.length} student${list.length > 1 ? "s" : ""}`),
          el("span", { class: "muted" }, q ? `${q.topic} · ${sourceLabel(q)}` : qid), btn]),
        el("ul", { class: "fbk-who" }, list.map((f) => el("li", {}, [labelFor(f, classes, st.classId),
          el("span", { class: "muted" }, ` · ${whereFrom(f)} · ${fmtDate(f.createdAt)}`),
          f.note ? el("div", { class: "fbk-note" }, `“${f.note}”`) : null]))),
        q ? questionDetails(q) : null,
      ]);
      exBox.append(item);
    });

    // Error reports, newest first
    const erBox = el("div", { class: "panel" }, [el("h2", {}, [icon("flag"), ` Problem reports (${errors.length})`]),
      el("p", { class: "muted" }, "Fix the question in the question bank app, re-export and import it (Admin), then mark the report as fixed. The student sees \"fixed\" or \"checked\".")]);
    if (!errors.length) erBox.append(el("p", { class: "muted" }, "No reports."));
    errors.forEach((f) => {
      const q = qmap.get(f.qid);
      const act = (status, label, cls = "btn small") => el("button", { type: "button", class: cls, onclick: async () => {
        try { await setStatus(user, [f], status); f.status = status; draw(); } catch (e) { toast(errMsg(e), "error"); } } }, label);
      erBox.append(el("div", { class: "fbk-item" }, [
        el("div", { class: "fbk-head" }, [el("strong", {}, typeLabel(f.type)),
          el("span", { class: "muted" }, q ? `${q.topic} · ${sourceLabel(q)}` : f.qid),
          f.status === "open" ? el("span", { class: "row" }, [act("done", "Mark fixed", "btn small primary"), act("dismissed", "Dismiss")])
            : el("span", { class: "row" }, [el("span", { class: "muted" }, f.status === "done" ? "Fixed" : "Dismissed"), act("open", "Reopen")])]),
        f.note ? el("div", { class: "fbk-note" }, `“${f.note}”`) : null,
        el("div", { class: "muted small" }, `${labelFor(f, classes, st.classId)} · ${whereFrom(f)} · ${fmtDate(f.createdAt)}`),
        q ? questionDetails(q) : null,
      ]));
    });
    body.append(exBox, erBox);
  };
  clsSel.addEventListener("change", () => { st.classId = clsSel.value; sessionStorage.setItem("fbkClass", st.classId); draw(); });
  stSel.addEventListener("change", () => { st.status = stSel.value; draw(); });
  draw();
  mount(el("section", {}, [
    el("h1", {}, "Student feedback"),
    el("p", { class: "muted" }, "After seeing the solutions, students can ask for a question to be explained in class, or report a problem with a question. Practice-set feedback is shown under all of the student's classes."),
    el("div", { class: "filters fbk-filters" }, [el("label", {}, ["Class", clsSel]), el("label", {}, ["Show", stSel])]),
    body,
  ]));
}

/** For the assignment Results page: feedback on this assignment's questions, by question id. */
export async function assignmentFeedback(assignmentId) {
  const snap = await getDocs(query(collection(db, "feedback"), where("assignmentId", "==", assignmentId)));
  const by = new Map();
  snap.forEach((d) => { const f = { id: d.id, ...d.data() }; if (!by.has(f.qid)) by.set(f.qid, []); by.get(f.qid).push(f); });
  return by;
}

/** A small box under a question on the Results page. */
export function feedbackSummary(list, cls) {
  if (!list || !list.length) return null;
  const ex = list.filter((f) => f.kind === "explain"), er = list.filter((f) => f.kind === "error");
  const who = (f) => [studentLabel(cls, f.email, f.name), f.note ? ` — “${f.note}”` : "", f.status !== "open" ? ` (${f.status === "done" ? (f.kind === "explain" ? "explained" : "fixed") : "dismissed"})` : ""].join("");
  return el("div", { class: "fbk-sum" }, [
    ex.length ? el("div", {}, [icon("hand-stop"), el("strong", {}, ` ${ex.length} asked to explain in class: `), ex.map(who).join("; ")]) : null,
    er.length ? el("div", {}, [icon("flag"), el("strong", {}, ` ${er.length} problem report${er.length > 1 ? "s" : ""}: `), er.map((f) => `${typeLabel(f.type)} · ${who(f)}`).join("; ")]) : null,
    el("a", { href: "#/t/feedback" }, "Deal with it on the Student feedback page"),
  ]);
}
