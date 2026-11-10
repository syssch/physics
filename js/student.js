import { db, api } from "./fb.js";
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, loading, toast, errMsg, fmtDate, toDate } from "./ui.js";
import { getQuestions, getBooks, syllabusFilters, skillFilter } from "./questions.js";
import { runQuiz, showReview } from "./quiz.js";
import { explainPanel } from "./explain.js";
import { setDue, setChip } from "./chrome.js";

async function myClasses(user) {
  const snap = await getDocs(query(collection(db, "classes"), where("studentEmails", "array-contains", user.email)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function myAttempts(user, n = 100) {
  const snap = await getDocs(query(collection(db, "attempts"), where("uid", "==", user.uid), orderBy("submittedAt", "desc"), limit(n)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function studentHome(user) {
  mount(loading());
  const page = el("section", {});
  page.append(el("h1", {}, `Hello, ${user.name.split(" ")[0] || "there"}`));

  // Assignments
  const asg = el("div", { class: "panel" }, [el("h2", {}, "Assignments")]);
  page.append(asg);
  page.append(await explainPanel(user));
  // History
  const hist = el("div", { class: "panel" }, [el("h2", {}, "Recent results")]);
  page.append(hist);
  mount(page);

  try {
    const [classes, attempts] = await Promise.all([myClasses(user), myAttempts(user)]);
    const done = new Map(attempts.filter((a) => a.mode === "assignment").map((a) => [a.assignmentId, a]));
    const rows = [];
    for (const c of classes) {
      const s = await getDocs(query(collection(db, "classes", c.id, "assignments"), orderBy("dueAt", "desc")));
      s.forEach((d) => rows.push({ cls: c, id: d.id, ...d.data() }));
    }
    setDue(rows.filter((a) => !done.has(a.id)).length);
    if (!rows.length) asg.append(el("p", { class: "muted" }, classes.length ? "No assignments yet." : "You are not in any class yet. Your teacher will add you."));
    else {
      const t = el("table", { class: "grid" }, [el("tr", {}, ["Assignment", "Class", "Due", "Status"].map((h) => el("th", {}, h)))]);
      rows.forEach((a) => {
        const at = done.get(a.id);
        const overdue = toDate(a.dueAt) < new Date();
        const status = at ? el("a", { href: `#/review/${at.id}` }, `Done: ${at.score}/${at.total}`)
          : el("a", { class: "btn small primary", href: `#/do/${a.cls.id}/${a.id}` }, overdue ? "Start (late)" : "Start");
        t.append(el("tr", {}, [el("td", {}, a.title), el("td", {}, a.cls.name), el("td", { class: overdue && !at ? "late" : "" }, fmtDate(a.dueAt)), el("td", {}, status)]));
      });
      asg.append(t);
    }
    const practice = attempts.slice(0, 10);
    if (!practice.length) hist.append(el("p", { class: "muted" }, "Nothing yet."));
    else {
      const t = el("table", { class: "grid" }, [el("tr", {}, ["Date", "Set", "Score"].map((h) => el("th", {}, h)))]);
      practice.forEach((a) => t.append(el("tr", {}, [
        el("td", {}, fmtDate(a.submittedAt)), el("td", {}, el("a", { href: `#/review/${a.id}` }, a.title || "Practice")),
        el("td", {}, `${a.score}/${a.total}`)])));
      hist.append(t);
    }
  } catch (e) {
    asg.append(el("p", { class: "error" }, errMsg(e)));
  }
}

async function practicePanel() {
  const syl = syllabusFilters(await getBooks());
  const sk = skillFilter();
  const countSel = el("select", {}, [5, 10, 15, 20].map((n) => el("option", { value: n, selected: n === 10 }, `${n} questions`)));
  const go = el("button", { class: "btn primary", type: "button" }, "Start practice");
  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      const r = await api.startPractice({ topic: syl.book || null, chapter: syl.chapter || null, subtopic: syl.subtopic || null, skill: sk.skill || null, count: Number(countSel.value) });
      sessionStorage.setItem(`session-${r.sessionId}`, JSON.stringify(r.questionIds));
      location.hash = `#/practice/${r.sessionId}`;
    } catch (e) { toast(errMsg(e), "error"); go.disabled = false; }
  });
  return el("div", { class: "panel" }, [el("h2", {}, "Practise"),
    el("p", { class: "muted" }, "Pick a book, chapter, subtopic or skill (or leave them on \"All\") and get a random set of questions. You'll see the answers when you submit."),
    el("div", { class: "row" }, [...syl.nodes, sk.node, countSel, go])]);
}

/** Practise page: a random set by book / chapter / subtopic / skill, and "Redo my mistakes". */
export async function practisePage(user) {
  mount(loading());
  const page = el("section", {}, [el("h1", {}, "Practise"), await practicePanel(), mistakesPanel()]);
  mount(page);
}

/** Leaderboard page for the student's form. */
export async function leaderboardPage(user) {
  mount(el("section", {}, [el("h1", {}, "Leaderboard"), leaderboardPanel()]));
}

/** Top-bar status for students: assignments waiting, and "4A · 132 pts". */
export async function refreshStudentStatus(user) {
  try {
    const [classes, attempts] = await Promise.all([myClasses(user), myAttempts(user)]);
    const done = new Set(attempts.filter((a) => a.mode === "assignment").map((a) => a.assignmentId));
    let due = 0;
    for (const c of classes) {
      const s = await getDocs(query(collection(db, "classes", c.id, "assignments"), orderBy("dueAt", "desc")));
      s.forEach((d) => { if (!done.has(d.id)) due++; });
    }
    setDue(due);
    const cls = (classes.map((c) => (c.name || "").trim()).find((n) => /^\s*(?:F\.?\s*)?[1-6]/i.test(n)) || (classes[0] && classes[0].name) || "").split(/\s+/)[0];
    const lb = await api.getLeaderboard({ period: "all" }).catch(() => null);
    const pts = lb && lb.me ? lb.me.pts : 0;
    setChip([cls, lb && lb.form ? `${pts} pts` : ""].filter(Boolean).join(" · "));
  } catch (e) { console.warn(e); }
}

const PERIODS = [["week", "This week"], ["month", "This month"], ["all", "All time"]];
export const POINTS_HELP = "Points come from practice sets (including Redo my mistakes): 1 point per correct answer, plus a bonus for sets of 5 or more questions — +5 for 90% or more correct, +2 for 75–89%. Assignments don't count.";

/** Leaderboard for the student's form: top 10 and their own rank, for this week / this month / all time. */
function leaderboardPanel() {
  const head = el("h2", {}, "Leaderboard");
  const tabs = el("div", { class: "tabs" });
  const body = el("div", {}, el("p", { class: "muted" }, "Loading…"));
  const panel = el("div", { class: "panel leaderboard" }, [head, tabs, body, el("p", { class: "muted small" }, POINTS_HELP)]);
  async function show(period) {
    [...tabs.children].forEach((b) => b.classList.toggle("on", b.dataset.p === period));
    body.replaceChildren(el("p", { class: "muted" }, "Loading…"));
    try {
      const r = await api.getLeaderboard({ period });
      if (!r.form) { panel.remove(); return; }
      head.textContent = `${r.form} leaderboard`;
      if (!r.rows.length) { body.replaceChildren(el("p", { class: "muted" }, period === "all" ? "No points yet — finish a practice set to get on the board!" : `No points yet ${period === "week" ? "this week" : "this month"} — be the first!`)); return; }
      const t = el("table", { class: "grid board" }, [el("tr", {}, ["#", "Student", "Points"].map((h) => el("th", {}, h)))]);
      r.rows.forEach((x) => t.append(el("tr", { class: x.me ? "me" : "" }, [el("td", {}, String(x.rank)), el("td", {}, x.label), el("td", {}, String(x.pts))])));
      const mine = r.me ? (r.rows.some((x) => x.me) ? null : el("p", {}, `You: #${r.me.rank} of ${r.total}, ${r.me.pts} points`))
        : el("p", { class: "muted" }, "You have no points in this period yet.");
      body.replaceChildren(t, ...(mine ? [mine] : []));
    } catch (e) { body.replaceChildren(el("p", { class: "error" }, errMsg(e))); }
  }
  PERIODS.forEach(([p, label]) => { const b = el("button", { class: "tab", type: "button", "data-p": p, onclick: () => show(p) }, label); tabs.append(b); });
  show("week");
  return panel;
}

/** "Redo my mistakes": a practice set of questions answered wrongly (or left blank) last time. */
function mistakesPanel() {
  const info = el("p", { class: "muted" }, "Checking your past answers…");
  const bookSel = el("select", {}, [el("option", { value: "" }, "All books")]);
  const countSel = el("select", {}, [5, 10, 15, 20].map((n) => el("option", { value: n, selected: n === 10 }, `${n} questions`)));
  const go = el("button", { class: "btn primary", type: "button", disabled: true }, "Redo my mistakes");
  const row = el("div", { class: "row" }, [bookSel, countSel, go]);
  row.style.display = "none";
  api.startMistakes({ preview: true }).then((r) => {
    if (!r.available) { info.textContent = "No mistakes to redo right now. Questions you get wrong in practice (and in assignments, once their answers are shown) will appear here."; return; }
    info.textContent = `${r.available} question${r.available === 1 ? "" : "s"} you got wrong (or left blank) last time. A question leaves this list once you answer it correctly.`;
    Object.entries(r.byTopic || {}).sort().forEach(([t, n]) => bookSel.append(el("option", { value: t }, `${t} (${n})`)));
    row.style.display = ""; go.disabled = false;
  }).catch((e) => { info.textContent = errMsg(e); });
  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      const r = await api.startMistakes({ topic: bookSel.value || null, count: Number(countSel.value) });
      sessionStorage.setItem(`session-${r.sessionId}`, JSON.stringify(r.questionIds));
      sessionStorage.setItem(`session-title-${r.sessionId}`, "Redo my mistakes");
      location.hash = `#/practice/${r.sessionId}`;
    } catch (e) { toast(errMsg(e), "error"); go.disabled = false; }
  });
  return el("div", { class: "panel mistakes" }, [el("h2", {}, "Redo my mistakes"), info, row]);
}

export async function practiceView(user, sessionId) {
  mount(loading());
  let ids = null, title = sessionStorage.getItem(`session-title-${sessionId}`) || "Practice";
  try { ids = JSON.parse(sessionStorage.getItem(`session-${sessionId}`)); } catch {}
  if (!ids) {
    const s = await getDoc(doc(db, "sessions", sessionId));
    if (!s.exists()) return mount(el("p", { class: "error" }, "Practice set not found."));
    if (s.data().submitted) { location.hash = `#/review/practice_${sessionId}`; return; }
    ids = s.data().questionIds;
    if (s.data().title) title = s.data().title;
  }
  await runQuiz({
    title, questionIds: ids, saveKey: `resp-practice-${sessionId}`,
    submit: async (responses) => { const r = await api.submitAnswers({ sessionId, responses }); if (!user.isTeacher) refreshStudentStatus(user); return r; },
  });
}

export async function doAssignment(user, classId, assignmentId) {
  mount(loading());
  const a = await getDoc(doc(db, "classes", classId, "assignments", assignmentId));
  if (!a.exists()) return mount(el("p", { class: "error" }, "Assignment not found."));
  const data = a.data();
  await runQuiz({
    title: data.title, subtitle: `Due ${fmtDate(data.dueAt)}`, questionIds: data.questionIds,
    showSource: false, saveKey: `resp-asg-${assignmentId}`,
    submit: async (responses) => { const r = { ...(await api.submitAnswers({ classId, assignmentId, responses })), dueAt: toDate(data.dueAt) }; if (!user.isTeacher) refreshStudentStatus(user); return r; },
  });
}

export async function reviewView(user, attemptId) {
  mount(loading());
  try {
    const r = await api.getReview({ attemptId });
    const questions = await getQuestions(r.questionIds);
    showReview({ title: r.title || "Review", questions, responses: r.responses, result: r });
  } catch (e) {
    mount(el("p", { class: "error" }, errMsg(e)));
  }
}

export async function historyView(user) {
  mount(loading());
  const attempts = await myAttempts(user, 200);
  const page = el("section", {}, [el("h1", {}, "My results")]);
  if (!attempts.length) page.append(el("p", { class: "muted" }, "Nothing yet."));
  else {
    const del = async (ids) => {
      try { for (const id of ids) await deleteDoc(doc(db, "attempts", id)); toast(`Deleted ${ids.length} result(s).`); historyView(user); }
      catch (e) { toast(errMsg(e), "error"); }
    };
    const t = el("table", { class: "grid" }, [el("tr", {}, ["Date", "Set", "Score", "%", user.isTeacher ? "" : null].filter((h) => h !== null).map((h) => el("th", {}, h)))]);
    attempts.forEach((a) => t.append(el("tr", {}, [el("td", {}, fmtDate(a.submittedAt)),
      el("td", {}, el("a", { href: `#/review/${a.id}` }, a.title || "Practice")),
      el("td", {}, `${a.score}/${a.total}`), el("td", {}, a.total ? `${Math.round((100 * a.score) / a.total)}%` : ""),
      user.isTeacher ? el("td", {}, el("button", { class: "linkbtn", type: "button", onclick: () => confirm("Delete this result?") && del([a.id]) }, "delete")) : null])));
    page.append(t);
    if (user.isTeacher) page.append(el("p", {}, el("button", { class: "btn small danger", type: "button",
      onclick: () => confirm(`Delete all ${attempts.length} of your results? This can't be undone.`) && del(attempts.map((a) => a.id)) }, "Delete all my results")));
  }
  mount(page);
}
