import { db, api, auth } from "./fb.js?v=202611121731";
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, loading, toast, errMsg, fmtDate, toDate } from "./ui.js?v=202611121731";
import { getQuestions, getBooks, syllabusFilters, skillFilter } from "./questions.js?v=202611121731";
import { runQuiz, showReview } from "./quiz.js?v=202611121731";
import { explainPanel, getCards, readStats } from "./explain.js?v=202611121731";
import { setDue, setChip } from "./chrome.js?v=202611121731";

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
  page.append(pointsPanel());
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
  const countSel = el("select", {}, [3, 5, 10, 15, 20].map((n) => el("option", { value: n, selected: n === 3 }, `${n} questions`)));
  const go = el("button", { class: "btn primary", type: "button" }, "Start practice");
  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      const r = await api.startPractice({ topic: syl.book || null, chapter: syl.chapter || null, subtopic: syl.subtopic || null, skill: sk.skill || null, count: Number(countSel.value) });
      sessionStorage.setItem(`session-${r.sessionId}`, JSON.stringify(r.questionIds));
      location.hash = `#/practice/${r.sessionId}`;
    } catch (e) { toast(errMsg(e), "error"); go.disabled = false; }
  });
  return el("div", { class: "panel" }, [el("h2", {}, "Random practice set"),
    el("p", { class: "muted" }, "Pick a book, chapter, subtopic or skill (or leave them on \"All\") and get a random set of questions. You'll see the answers when you submit."),
    el("div", { class: "row" }, [...syl.nodes, sk.node, countSel, go])]);
}

/** Home: how leaderboard points are earned. */
function pointsPanel() {
  const item = (icon, pts, what) => el("div", { class: "pt-item" }, [
    el("i", { class: `ti ti-${icon}`, "aria-hidden": "true" }), el("strong", {}, pts), el("span", {}, what)]);
  return el("div", { class: "panel points-panel" }, [
    el("div", { class: "panelhead" }, [el("h2", {}, "Earn leaderboard points"), el("a", { class: "btn small", href: "#/leaderboard" }, "See leaderboard")]),
    el("div", { class: "pt-grid" }, [
      item("pencil", "100", "for each correct answer in practice (including Redo my mistakes) and assignments"),
      item("target-arrow", "+500 / +200", "accuracy bonus for 90%+ / 75–89% correct in a set of 5 or more questions"),
      item("book", "300", "for reading your Explain card of the day (once a day)"),
      item("calendar-check", "+500", "check-in bonus when you practise, do an assignment or read your card on 3 different days in a week (Mon–Sun)"),
    ]),
    el("p", { class: "muted small" }, "Each assignment counts once. Rankings are by form, for this week, this month and all time."),
  ]);
}

/** Practise page: a random set by book / chapter / subtopic / skill, and "Redo my mistakes". */
export async function practisePage(user) {
  mount(loading());
  const page = el("section", {}, [el("h1", {}, "Practise"), await practicePanel(), mistakesPanel()]);
  mount(page);
}

/** Leaderboard page for the student's form. */
export async function leaderboardPage(user) {
  mount(el("section", {}, [el("h1", {}, "Leaderboard"), leaderboardPanel(user)]));
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
export const POINTS_HELP = "How to earn points: 100 per correct answer in practice (including Redo my mistakes) and assignments, plus +500 for 90%+ or +200 for 75–89% in sets of 5 or more questions · 300 for reading your Explain card of the day (once a day) · +500 check-in bonus once a week when you practise, do an assignment or read your card on 3 different days (Monday–Sunday).";

/** Leaderboard for the student's form: top 10 and their own rank, for this week / this month / all time. */
function leaderboardPanel(user) {
  const head = el("h2", {}, "Leaderboard");
  const tabs = el("div", { class: "tabs" });
  const body = el("div", {}, el("p", { class: "muted" }, "Loading…"));
  // teachers previewing the student view have no form of their own: let them pick one
  const formSel = user && user.isTeacher
    ? el("select", { "aria-label": "Form" }, ["F3", "F4", "F5", "F6"].map((f) => el("option", { value: f, selected: f === (localStorage.getItem("lbForm") || "F4") }, f)))
    : null;
  const panel = el("div", { class: "panel leaderboard" }, [head, el("div", { class: "row" }, [tabs, formSel]), body, el("p", { class: "muted small" }, POINTS_HELP)]);
  let period = "week";
  async function show(p) {
    period = p;
    [...tabs.children].forEach((b) => b.classList.toggle("on", b.dataset.p === period));
    body.replaceChildren(el("p", { class: "muted" }, "Loading…"));
    try {
      if (formSel) { try { localStorage.setItem("lbForm", formSel.value); } catch (e) {} }
      const r = await api.getLeaderboard(formSel ? { period, form: formSel.value } : { period });
      if (!r.form) {
        head.textContent = "Leaderboard";
        body.replaceChildren(el("p", { class: "muted" }, "The leaderboard is by form (F3–F6), worked out from your class name — but none of your classes starts with a form number (like 4A). Ask your physics teacher to check your class."));
        return;
      }
      head.textContent = `${r.form} leaderboard` + (formSel ? " (teacher preview: what students see)" : "");
      const rows = r.rows.slice(0, 10);
      if (!rows.length) {
        const when = period === "all" ? "yet" : period === "week" ? "this week" : "this month";
        body.replaceChildren(el("p", { class: "muted" }, formSel
          ? `No ${r.form} student has practice points ${when}. Try another form or "All time". If students practised before the leaderboard was switched on, click "Recount from results" on the teacher Leaderboard page.`
          : period === "all" ? "No points yet — finish a practice set to get on the board!" : `No points yet ${when} — be the first!`));
        return;
      }
      const t = el("table", { class: "grid board" }, [el("tr", {}, ["#", "Student", "Points"].map((h) => el("th", {}, h)))]);
      rows.forEach((x) => t.append(el("tr", { class: x.me ? "me" : "" }, [el("td", {}, String(x.rank)), el("td", {}, x.label), el("td", {}, String(x.pts))])));
      const mine = formSel ? null : r.me ? (rows.some((x) => x.me) ? null : el("p", {}, `You: #${r.me.rank} of ${r.total}, ${r.me.pts} points`))
        : el("p", { class: "muted" }, "You have no points in this period yet.");
      body.replaceChildren(t, ...(mine ? [mine] : []));
    } catch (e) { body.replaceChildren(el("p", { class: "error" }, errMsg(e))); }
  }
  PERIODS.forEach(([p, label]) => tabs.append(el("button", { class: "tab", type: "button", "data-p": p, onclick: () => show(p) }, label)));
  if (formSel) formSel.addEventListener("change", () => show(period));
  show("week");
  return panel;
}

/** "Redo my mistakes": a practice set of questions answered wrongly (or left blank) last time. */
function mistakesPanel() {
  const info = el("p", { class: "muted" }, "Checking your past answers…");
  const bookSel = el("select", {}, [el("option", { value: "" }, "All books")]);
  const countSel = el("select", {}, [3, 5, 10, 15, 20].map((n) => el("option", { value: n, selected: n === 3 }, `${n} questions`)));
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
  if (attempts.length) page.append(await progressPanel());
  if (!attempts.length) page.append(el("p", { class: "muted" }, "Nothing yet."));
  else {
    const del = async (ids) => {
      try { for (const id of ids) await deleteDoc(doc(db, "attempts", id)); toast(`Deleted ${ids.length} result(s).`); historyView(user); }
      catch (e) { toast(errMsg(e), "error"); }
    };
    const t = el("table", { class: "grid history" }, [el("tr", {}, ["Date", "Set", "Score", "%", user.isTeacher ? "" : null].filter((h) => h !== null).map((h) => el("th", {}, h)))]);
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

// ---------------------------------------------------------------- My progress (top of My results)
async function progressPanel() {
  const box = el("div", { class: "panel progress" }, [el("h2", {}, "My progress")]);
  let p, books = [];
  let ex = null;
  try {
    [p, books, ex] = await Promise.all([api.myProgress({}), getBooks().catch(() => []),
      Promise.all([getDoc(doc(db, "explainProgress", auth.currentUser.uid)), getCards()])
        .then(([d, b]) => readStats(d.exists() ? d.data() : {}, b.cards)).catch(() => null)]);
  }
  catch (e) { box.append(el("p", { class: "muted" }, errMsg(e))); return box; }
  const pc = (ok, n) => (n ? Math.round((100 * ok) / n) : 0);
  const card = (label, value, sub) => el("div", { class: "statcard" }, [el("div", { class: "statval" }, String(value)),
    el("div", { class: "statlabel" }, label), sub ? el("div", { class: "muted small" }, sub) : null]);
  box.append(el("div", { class: "statgrid" }, [
    card("sets done", p.sets, `${p.practice} practice · ${p.mistakes} redo · ${p.assignments} assignment${p.assignments === 1 ? "" : "s"}`),
    card("questions answered", p.answered, p.answered ? `${p.correct} correct` : ""),
    card("correct overall", p.answered ? `${pc(p.correct, p.answered)}%` : "—"),
    card("this week", p.week, "sets in the last 7 days"),
    ex ? card("Explain cards read", ex.total ? `${ex.n}/${ex.total}` : ex.n, `${ex.week} in the last 7 days`) : null,
  ]));
  if (p.hidden) box.append(el("p", { class: "muted small" }, `${p.hidden} assignment${p.hidden > 1 ? "s are" : " is"} not counted yet — the answers haven't been released.`));
  if (p.wrongNow) {
    box.append(el("p", { class: "notice" }, [`${p.wrongNow} question${p.wrongNow > 1 ? "s" : ""} you got wrong last time ${p.wrongNow > 1 ? "are" : "is"} waiting. `,
      el("a", { href: "#/practise" }, "Redo my mistakes")]));
  }
  const chName = new Map();
  books.forEach((b) => (b.chapters || []).forEach((c) => chName.set(c.id, `${b.book > 5 ? `B${b.book} ` : ""}Ch ${c.no} ${c.en || ""}`.trim())));
  const table = (rows, title, chapterIds) => {
    const t = el("table", { class: "grid areas" }, [el("tr", {}, [el("th", {}, title), el("th", {}, "Answered"), el("th", {}, "Correct"), el("th", {}, ""), chapterIds ? el("th", {}, "") : null])]);
    rows.forEach(([k, n, ok]) => {
      const v = pc(ok, n);
      const prac = chapterIds ? el("button", { type: "button", class: "btn small" }, "Practise 5") : null;
      if (prac) prac.addEventListener("click", async () => {
        prac.disabled = true;
        try {
          const r = await api.startPractice({ chapter: k, count: 5 });
          sessionStorage.setItem(`session-${r.sessionId}`, JSON.stringify(r.questionIds));
          location.hash = `#/practice/${r.sessionId}`;
        } catch (e) { toast(errMsg(e), "error"); prac.disabled = false; }
      });
      t.append(el("tr", {}, [el("td", {}, chapterIds ? chName.get(k) || `Ch ${k}` : k), el("td", {}, String(n)), el("td", {}, `${v}%`),
        el("td", { class: "barcell" }, el("span", { class: `bar ${v < 50 ? "low" : v < 75 ? "mid" : "high"}`, style: `width:${Math.max(v, 2)}%` })),
        chapterIds ? el("td", {}, prac) : null]));
    });
    return t;
  };
  const order = (a, b) => pc(a[2], a[1]) - pc(b[2], b[1]) || b[1] - a[1];
  const chRows = p.byChapter.filter((r) => r[1] >= 3).sort(order);
  if (p.byBook.length) {
    box.append(el("h3", {}, "Strengths and weak areas"),
      el("p", { class: "muted small" }, "Weakest first. Chapters appear once you have answered at least 3 of their questions."),
      el("div", { class: "areas2" }, [el("div", { class: "scroll" }, table([...p.byBook].sort(order), "Book")),
        chRows.length ? el("div", { class: "scroll" }, table(chRows, "Chapter", true)) : null]));
  }
  return box;
}
