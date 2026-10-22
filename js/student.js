import { db, api } from "./fb.js";
import { collection, getDocs, query, where, orderBy, limit, doc, getDoc, deleteDoc }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, loading, toast, errMsg, fmtDate, toDate } from "./ui.js";
import { getTopics, getQuestions } from "./questions.js";
import { runQuiz, showReview } from "./quiz.js";
import { explainPanel } from "./explain.js";

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
  // Practice
  page.append(await practicePanel());
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
  const topics = await getTopics();
  const topicSel = el("select", {}, [el("option", { value: "" }, "All topics")].concat(Object.keys(topics).map((t) => el("option", { value: t }, t))));
  const subSel = el("select", {}, [el("option", { value: "" }, "All subtopics")]);
  topicSel.addEventListener("change", () => {
    subSel.replaceChildren(el("option", { value: "" }, "All subtopics"), ...(topics[topicSel.value] || []).map((s) => el("option", { value: s }, s)));
  });
  const countSel = el("select", {}, [5, 10, 15, 20].map((n) => el("option", { value: n, selected: n === 10 }, `${n} questions`)));
  const go = el("button", { class: "btn primary", type: "button" }, "Start practice");
  go.addEventListener("click", async () => {
    go.disabled = true;
    try {
      const r = await api.startPractice({ topic: topicSel.value || null, subtopic: subSel.value || null, count: Number(countSel.value) });
      sessionStorage.setItem(`session-${r.sessionId}`, JSON.stringify(r.questionIds));
      location.hash = `#/practice/${r.sessionId}`;
    } catch (e) { toast(errMsg(e), "error"); go.disabled = false; }
  });
  return el("div", { class: "panel" }, [el("h2", {}, "Practise"),
    el("p", { class: "muted" }, "Pick a topic and get a random set of questions. You'll see the answers when you submit."),
    el("div", { class: "row" }, [topicSel, subSel, countSel, go])]);
}

export async function practiceView(user, sessionId) {
  mount(loading());
  let ids = null;
  try { ids = JSON.parse(sessionStorage.getItem(`session-${sessionId}`)); } catch {}
  if (!ids) {
    const s = await getDoc(doc(db, "sessions", sessionId));
    if (!s.exists()) return mount(el("p", { class: "error" }, "Practice set not found."));
    if (s.data().submitted) { location.hash = `#/review/practice_${sessionId}`; return; }
    ids = s.data().questionIds;
  }
  await runQuiz({
    title: "Practice", questionIds: ids, saveKey: `resp-practice-${sessionId}`,
    submit: (responses) => api.submitAnswers({ sessionId, responses }),
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
    submit: async (responses) => ({ ...(await api.submitAnswers({ classId, assignmentId, responses })), dueAt: toDate(data.dueAt) }),
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
