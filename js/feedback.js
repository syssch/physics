// Student feedback on questions: "Report a problem" and "Request further explanation" buttons under each question in a marked
// set, and the teacher's Student feedback page (also summarised on each assignment's Results page).
import { db, auth, api } from "./fb.js?v=202611252235";
import { collection, doc, getDocs, updateDoc, query, where, orderBy, limit, documentId, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, loading, toast, errMsg, fmtDate, chunk, typeset } from "./ui.js?v=202611252235";
import { getQuestions, renderQuestion, sourceLabel, getLikeCounts, setLikeCount } from "./questions.js?v=202611252235";
import { attachRosters, studentLabel, rosterOf } from "./roster.js?v=202611252235";
import { setBadge } from "./chrome.js?v=202611252235";

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
 * My results → "My reports and requests": every problem report and further-explanation request the student has sent,
 * with its status and the teacher's note. Returns null when there are none.
 */
export async function myReportsPanel(user, { preview = false } = {}) {
  const uid = auth.currentUser && auth.currentUser.uid;
  if (!uid) return null;
  const snap = await getDocs(query(collection(db, "feedback"), where("uid", "==", uid)));
  const items = snap.docs.map((d) => d.data()).sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
  if (!items.length) return preview ? el("div", { class: "panel my-reports-panel" }, [
    el("div", { class: "panelhead" }, [el("h2", {}, "My reports and requests"), el("span", { class: "muted" }, "0 sent")]),
    el("p", { class: "muted" }, "Teacher preview: students see each problem report and further-explanation request they have sent here, with its status (waiting / fixed / checked / further explained) and your note. You haven't sent any yourself — use Report a problem under a question in one of your results to try it.")]) : null;
  const qs = new Map((await getQuestions([...new Set(items.map((f) => f.qid))]).catch(() => [])).map((q) => [q.id, q]));
  const status = (f) => {
    if (f.kind === "explain") return f.status === "done" ? el("span", { class: "fbk-state good" }, [icon("check"), "Further explained"])
      : el("span", { class: "fbk-state on" }, "Requested — waiting for your teacher");
    if (f.status === "done") return el("span", { class: "fbk-state good" }, [icon("check"), "Fixed — thank you!"]);
    if (f.status === "dismissed") return el("span", { class: "fbk-state" }, f.reply
      ? [icon("message"), "Checked by your teacher: ", el("em", { class: "fbk-reply" }, `“${f.reply}”`)] : "Checked by your teacher (no change needed)");
    return el("span", { class: "fbk-state on" }, "Waiting for your teacher");
  };
  const open = items.filter((f) => f.status === "open").length;
  const t = el("table", { class: "grid my-reports" }, [el("tr", {}, ["Date", "Question", "What", "Your note", "Teacher's response"].map((h) => el("th", {}, h)))]
    .concat(items.map((f) => {
      const q = qs.get(f.qid);
      const label = q ? sourceLabel(q) : `${f.title || "Practice"}${f.qnum ? ` · Q${f.qnum}` : ""}`;
      return el("tr", { class: f.status === "open" ? "" : "handled" }, [
        el("td", {}, fmtDate(f.createdAt)),
        el("td", {}, f.attemptId ? el("a", { href: `#/review/${f.attemptId}`, title: "Open the result with this question" }, label) : label),
        el("td", {}, f.kind === "explain" ? "Further explanation" : typeLabel(f.type)),
        el("td", { class: "muted" }, f.note || "—"),
        el("td", {}, status(f))]);
    })));
  return el("div", { class: "panel my-reports-panel" }, [
    el("div", { class: "panelhead" }, [el("h2", {}, "My reports and requests"),
      el("span", { class: "muted" }, `${items.length} sent · ${open} waiting`)]),
    el("div", { class: "scroll" }, t)]);
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
  if (ctx.canLike) {
    try { [ctx.counts, ctx.liked] = await Promise.all([getLikeCounts(true), myLikes([...bars.keys()])]); } catch (e) { console.warn("likes", e); }
  }
  let mine = new Map();
  try { mine = await myFeedback([...bars.keys()]); } catch (e) { console.warn("feedback", e); }
  bars.forEach((bar, qid) => drawBar(bar, qid, ctx, mine));
}

/** Questions this student has liked (of these): Set of qids. */
async function myLikes(qids) {
  const uid = auth.currentUser && auth.currentUser.uid;
  const out = new Set();
  if (!uid) return out;
  for (const part of chunk([...new Set(qids)], 30)) {
    const snap = await getDocs(query(collection(db, "likes"), where("uid", "==", uid), where("qid", "in", part)));
    snap.forEach((d) => out.add(d.data().qid));
  }
  return out;
}

/** 👍 Like toggle for one question (students only). */
function likeButton(qid, ctx) {
  const liked = () => !!(ctx.liked && ctx.liked.has(qid));
  const n = () => (ctx.counts && ctx.counts[qid]) || 0;
  const b = el("button", { type: "button", class: "btn small fbk-like" });
  const paint = () => {
    b.classList.toggle("on", liked());
    b.setAttribute("aria-pressed", liked() ? "true" : "false");
    b.title = liked() ? "You like this question — click to undo" : "Like this question (a good one to practise)";
    b.replaceChildren(icon("thumb-up"), liked() ? " Liked" : " Like", n() ? el("span", { class: "fbk-like-n" }, ` ${n()}`) : "");
  };
  b.addEventListener("click", async () => {
    b.disabled = true;
    try {
      const r = await api.toggleLike({ attemptId: ctx.attemptId, qid, like: !liked() });
      ctx.liked = ctx.liked || new Set(); ctx.counts = ctx.counts || {};
      if (r.liked) ctx.liked.add(qid); else ctx.liked.delete(qid);
      ctx.counts[qid] = r.count; setLikeCount(qid, r.count);
      paint();
    } catch (e) { toast(errMsg(e), "error"); }
    b.disabled = false;
  });
  paint();
  return b;
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
  if (ctx.canLike) row.append(likeButton(qid, ctx));

  // Request further explanation (only once the solutions are shown)
  if (ctx.revealed) {
    if (!ex) {
      const b = el("button", { type: "button", class: "btn small fbk-explain" }, [icon("hand-stop"), "Request further explanation"]);
      b.title = "Ask your teacher to explain this question further (in class or by email)";
      b.addEventListener("click", async () => {
        b.disabled = true;
        try { await send({ kind: "explain" }); toast("Request sent — your teacher will explain it further."); }
        catch (e) { toast(errMsg(e), "error"); b.disabled = false; }
      });
      row.append(b);
    } else if (ex.status === "done") {
      row.append(el("span", { class: "fbk-state good" }, [icon("check"), "Further explained"]),
        el("button", { type: "button", class: "linkbtn", onclick: () => send({ kind: "explain", note: "" }).catch((e) => toast(errMsg(e), "error")) }, "Ask again"));
    } else {
      const noteBtn = el("button", { type: "button", class: "linkbtn" }, ex.note ? "Edit note" : "Add a note");
      noteBtn.addEventListener("click", () => openNote(panel, ex.note || "", "Which part should your teacher explain? (optional)",
        async (note) => { await send({ kind: "explain", note }); toast("Note saved."); }));
      row.append(el("span", { class: "fbk-state on" }, [icon("hand-stop"), "Further explanation: requested"]), noteBtn,
        el("button", { type: "button", class: "linkbtn", onclick: () => send({ kind: "explain", remove: true }).catch((e) => toast(errMsg(e), "error")) }, "Undo"));
    }
  }

  // Report a problem
  if (!er || er.status !== "open") {
    if (er && er.status === "done") row.append(el("span", { class: "fbk-state good" }, [icon("check"), "Your report was fixed — thank you!"]));
    else if (er && er.status === "dismissed") row.append(el("span", { class: "fbk-state" }, er.reply
      ? [icon("message"), "Your teacher checked your report: ", el("em", { class: "fbk-reply" }, `“${er.reply}”`)] : "Your teacher checked your report."));
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

/** The student's full name: the English name on a class list, else their Google name, else the email's user part. */
function fullNameOf(f, classes = []) {
  const mine = classes.filter((c) => !(f.classIds || []).length || (f.classIds || []).includes(c.id));
  for (const c of mine.concat(classes)) {
    const r = rosterOf(c).find((x) => x.email === f.email);
    if (r && r.name) return r.name;
  }
  return String(f.name || "").trim() || String(f.email || "").split("@")[0] || "there";
}
/** Ready-made message to a student about their "Request further explanation". */
function contactText(f, q, classes) {
  const first = fullNameOf(f, classes);
  const where = q ? sourceLabel(q) : f.qid;
  return `Hi ${first}, about the question you asked me to explain further: ${where}${f.title ? ` (${f.title}${f.qnum ? `, Q${f.qnum}` : ""})` : ""}.`
    + (f.note ? ` You wrote: "${f.note}".` : "") + " ";
}
async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch (e) { return false; }
}
/** "Chat" (opens Google Chat in a new tab, copies the student's email; then copy the message) and "Email" (Gmail draft). */
function contactLinks(user, f, q, classes) {
  const msg = contactText(f, q, classes);
  const auth = encodeURIComponent(user.email || "");
  const box = el("div", { class: "fbk-chat-help", hidden: true });
  const chat = el("button", { type: "button", class: "linkbtn", title: "Open Google Chat and copy the student's email" }, [icon("message-circle"), " Chat"]);
  chat.addEventListener("click", async () => {
    const ok = await copyText(f.email);
    window.open(`https://mail.google.com/chat/u/0/?authuser=${auth}#chat/home`, "_blank", "noopener");
    const copyMsg = el("button", { type: "button", class: "btn small" }, "Copy message");
    copyMsg.addEventListener("click", async () => toast((await copyText(msg)) ? "Message copied — paste it into the chat." : "Copy the message above by hand."));
    box.replaceChildren(el("span", {}, ok ? `Email copied (${f.email}). In Google Chat click New chat, paste, then: ` : `In Google Chat click New chat and enter ${f.email}, then: `),
      copyMsg, el("div", { class: "muted small" }, msg));
    box.hidden = false;
  });
  const mail = el("a", { class: "linkbtn", target: "_blank", rel: "noopener", title: "Open a Gmail draft to the student",
    href: `https://mail.google.com/mail/?authuser=${auth}&view=cm&fs=1&to=${encodeURIComponent(f.email)}`
      + `&su=${encodeURIComponent("Physics: the question you asked me to explain further")}&body=${encodeURIComponent(msg)}` }, [icon("mail"), " Email"]);
  return [el("span", { class: "fbk-contact" }, [chat, mail]), box];
}

function labelFor(f, classes, classId) {
  const cls = classes.find((c) => c.id === classId && (c.studentEmails || []).includes(f.email))
    || classes.find((c) => (f.classIds || []).includes(c.id) && (c.studentEmails || []).includes(f.email));
  return cls ? studentLabel(cls, f.email, f.name) : (f.name || f.email.split("@")[0]);
}
const whereFrom = (f) => f.mode === "assignment" ? `${f.title || "assignment"} Q${f.qnum}` : `${f.title || "practice"} (Q${f.qnum})`;

/** Teacher action: set the status of feedback docs. */
async function setStatus(user, items, status, reply) {
  await Promise.all(items.map((f) => updateDoc(doc(db, "feedback", f.id), status === "open"
    ? { status: "open", handledBy: null, handledAt: null, reply: null }
    : { status, handledBy: user.email, handledAt: serverTimestamp(), ...(reply !== undefined ? { reply: reply || null } : {}) })));
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

    // Further-explanation requests, grouped by question (most requested first)
    const groups = new Map();
    explains.forEach((f) => { if (!groups.has(f.qid)) groups.set(f.qid, []); groups.get(f.qid).push(f); });
    const exBox = el("div", { class: "panel" }, [el("h2", {}, [icon("hand-stop"), ` Further explanation requests (${explains.length})`])]);
    if (!groups.size) exBox.append(el("p", { class: "muted" }, "No requests."));
    [...groups.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([qid, list]) => {
      const q = qmap.get(qid);
      const open = list.filter((f) => f.status === "open");
      const btn = open.length
        ? el("button", { type: "button", class: "btn small primary", onclick: async () => {
            try { await setStatus(user, open, "done"); open.forEach((f) => { f.status = "done"; }); toast("Marked as further explained. Students will see it."); draw(); }
            catch (e) { toast(errMsg(e), "error"); } } }, [icon("check"), " Mark as further explained"])
        : el("button", { type: "button", class: "btn small", onclick: async () => {
            try { await setStatus(user, list, "open"); list.forEach((f) => { f.status = "open"; }); draw(); } catch (e) { toast(errMsg(e), "error"); } } }, "Reopen");
      const item = el("div", { class: "fbk-item" }, [
        el("div", { class: "fbk-head" }, [el("strong", {}, `${list.length} student${list.length > 1 ? "s" : ""}`),
          el("span", { class: "muted" }, q ? `${q.topic} · ${sourceLabel(q)}` : qid), btn]),
        el("ul", { class: "fbk-who" }, list.map((f) => el("li", {}, [labelFor(f, classes, st.classId),
          el("span", { class: "muted" }, ` · ${whereFrom(f)} · ${fmtDate(f.createdAt)}`), ...contactLinks(user, f, q, classes),
          f.note ? el("div", { class: "fbk-note" }, `“${f.note}”`) : null]))),
        q ? questionDetails(q) : null,
      ]);
      exBox.append(item);
    });

    // Error reports, newest first
    const erBox = el("div", { class: "panel" }, [el("h2", {}, [icon("flag"), ` Problem reports (${errors.length})`]),
      el("p", { class: "muted" }, "Fix the question in the question bank app, re-export and import it (Admin), then mark the report as fixed. If nothing needs fixing, Dismiss it — you can leave a short note that the student will see. The student sees \"fixed\" or \"checked\" (with your note).")]);
    if (!errors.length) erBox.append(el("p", { class: "muted" }, "No reports."));
    errors.forEach((f) => {
      const q = qmap.get(f.qid);
      const act = (status, label, cls = "btn small") => el("button", { type: "button", class: cls, onclick: async () => {
        try { await setStatus(user, [f], status); f.status = status; if (status === "open") f.reply = null; draw(); } catch (e) { toast(errMsg(e), "error"); } } }, label);
      // Dismiss: optional short note for the student (e.g. why the key is right)
      const dismissForm = el("div", { class: "fbk-dismiss", hidden: true });
      const replyIn = el("textarea", { rows: 2, maxlength: 300, placeholder: "Note to the student (optional), e.g. \"The key is correct: the ball is still accelerating at Q.\"" });
      const doDismiss = el("button", { type: "button", class: "btn small primary" }, "Dismiss");
      doDismiss.addEventListener("click", async () => {
        doDismiss.disabled = true;
        const reply = replyIn.value.trim().slice(0, 300);
        try { await setStatus(user, [f], "dismissed", reply); f.status = "dismissed"; f.reply = reply || null; toast(reply ? "Dismissed — the student will see your note." : "Dismissed."); draw(); }
        catch (e) { toast(errMsg(e), "error"); doDismiss.disabled = false; }
      });
      dismissForm.append(replyIn, el("div", { class: "row" }, [doDismiss,
        el("button", { type: "button", class: "linkbtn", onclick: () => { dismissForm.hidden = true; } }, "Cancel")]));
      const openDismiss = el("button", { type: "button", class: "btn small", onclick: () => { dismissForm.hidden = false; replyIn.focus(); } }, "Dismiss…");
      erBox.append(el("div", { class: "fbk-item" }, [
        el("div", { class: "fbk-head" }, [el("strong", {}, typeLabel(f.type)),
          el("span", { class: "muted" }, q ? `${q.topic} · ${sourceLabel(q)}` : f.qid),
          f.status === "open" ? el("span", { class: "row" }, [act("done", "Mark fixed", "btn small primary"), openDismiss])
            : el("span", { class: "row" }, [el("span", { class: "muted" }, f.status === "done" ? "Fixed" : "Dismissed"), act("open", "Reopen")])]),
        f.note ? el("div", { class: "fbk-note" }, `“${f.note}”`) : null,
        f.status === "open" ? dismissForm : null,
        f.status === "dismissed" && f.reply ? el("div", { class: "fbk-reply" }, [el("strong", {}, "Your note: "), f.reply]) : null,
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
    el("p", { class: "muted" }, "After seeing the solutions, students can request further explanation of a question (in class or by email), or report a problem with a question. Practice-set feedback is shown under all of the student's classes."),
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
  const who = (f) => [studentLabel(cls, f.email, f.name), f.note ? ` — “${f.note}”` : "", f.status !== "open" ? ` (${f.status === "done" ? (f.kind === "explain" ? "further explained" : "fixed") : "dismissed"})` : ""].join("");
  return el("div", { class: "fbk-sum" }, [
    ex.length ? el("div", {}, [icon("hand-stop"), el("strong", {}, ` ${ex.length} requested further explanation: `), ex.map(who).join("; ")]) : null,
    er.length ? el("div", {}, [icon("flag"), el("strong", {}, ` ${er.length} problem report${er.length > 1 ? "s" : ""}: `), er.map((f) => `${typeLabel(f.type)} · ${who(f)}`).join("; ")]) : null,
    el("a", { href: "#/t/feedback" }, "Deal with it on the Student feedback page"),
  ]);
}
