import { auth, db, signIn, signOut, onAuthStateChanged } from "./fb.js?v=202611141656";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, toast, errMsg } from "./ui.js?v=202611141656";
import { isSchoolEmail } from "./config.js?v=202611141656";
import { studentHome, practiceView, doAssignment, reviewView, historyView, practisePage, leaderboardPage, refreshStudentStatus } from "./student.js?v=202611141656";
import { drawChrome, updateChrome, clearChrome, isTeacherMode } from "./chrome.js?v=202611141656";
import { explainLibrary, explainCard, explainProgressView } from "./explain.js?v=202611141656";
import { studentsView, studentRecordView } from "./studentrecord.js?v=202611141656";
import { feedbackView, refreshFeedbackBadge } from "./feedback.js?v=202611141656";
import { teacherHome, classEditor, assignmentBuilder, resultsView, adminView, bankView, paperBuilder, leaderboardView, questionStatsView } from "./teacher.js?v=202611141656";

let user = null;

// Shown under the sign-in button (edit the wording here).
export const COPYRIGHT_NOTICE = "By logging in, you acknowledge that the questions, solutions, Explain cards and other "
  + "materials on this site are protected by copyright, belonging to Sing Yin Secondary School. "
  + "They are provided only for the personal study of "
  + "SYSS students and staff. You must not copy, share, sell or upload them to any other website, group, app or AI "
  + "tool without the school's permission.";

function signInPage(message) {
  const btn = el("button", { class: "btn primary big", type: "button" }, "Sign in with school Google account");
  btn.addEventListener("click", async () => {
    try { await signIn(); } catch (e) { if (e.code !== "auth/popup-closed-by-user") toast(errMsg(e), "error"); }
  });
  mount(el("section", { class: "signin" }, [
    el("h1", {}, "SYSS Physics Practice"),
    el("p", {}, "Sign in with your school Google account (@syss.edu.hk or @singyin.edu.hk) to do assignments and practise past-paper questions."),
    message ? el("p", { class: "error" }, message) : null,
    btn,
    el("p", { class: "disclaimer" }, COPYRIGHT_NOTICE),
  ]));
  clearChrome();
}

function notOnListPage(email) {
  mount(el("section", { class: "signin" }, [
    el("h1", {}, "SYSS Physics Practice"),
    el("p", {}, `You're signed in as ${email}, but this site is only for SYSS Physics students.`),
    el("p", { class: "muted" }, "If you take Physics, ask your physics teacher to add your school email to your class. Then sign in again."),
    el("button", { class: "btn", type: "button", onclick: () => signOut(auth) }, "Sign out"),
  ]));
  clearChrome();
}

const routes = [
  [/^#?\/?$/, () => (user.isTeacher && !sessionStorage.getItem("asStudent") ? teacherHome(user) : studentHome(user))],
  [/^#\/student$/, () => { sessionStorage.setItem("asStudent", "1"); return studentHome(user); }],
  [/^#\/history$/, () => historyView(user)],
  [/^#\/practi[cs]e$/, () => practisePage(user)],
  [/^#\/leaderboard$/, () => leaderboardPage(user)],
  [/^#\/practice\/([\w-]+)$/, (m) => practiceView(user, m[1])],
  [/^#\/do\/([\w-]+)\/([\w-]+)$/, (m) => doAssignment(user, m[1], m[2])],
  [/^#\/review\/([\w-]+)$/, (m) => reviewView(user, m[1])],
  [/^#\/explain$/, () => explainLibrary(user)],
  [/^#\/explain\/([\w-]+)$/, (m) => explainCard(user, m[1])],
  [/^#\/t\/explain$/, () => explainProgressView(user), true],
  [/^#\/t$/, () => { sessionStorage.removeItem("asStudent"); return teacherHome(user); }, true],
  [/^#\/t\/class\/([\w-]+)$/, (m) => classEditor(user, m[1]), true],
  [/^#\/t\/assign(?:\/([\w-]+))?$/, (m) => assignmentBuilder(user, m[1]), true],
  [/^#\/t\/results\/([\w-]+)\/([\w-]+)$/, (m) => resultsView(user, m[1], m[2]), true],
  [/^#\/t\/bank$/, () => bankView(user), true],
  [/^#\/t\/qstats$/, () => questionStatsView(user), true],
  [/^#\/t\/feedback$/, () => feedbackView(user), true],
  [/^#\/t\/students(?:\/([\w-]+))?$/, (m) => studentsView(user, m[1]), true],
  [/^#\/t\/student\/([\w-]+)\/([^/]+)$/, (m) => studentRecordView(user, m[1], m[2]), true],
  [/^#\/t\/leaderboard$/, () => leaderboardView(user), true],
  [/^#\/t\/paper(?:\/([\w-]+)\/([\w-]+))?$/, (m) => paperBuilder(user, m[1], m[2]), true],
  [/^#\/t\/admin$/, () => adminView(user), true],
];

async function route() {
  if (!user) return;
  const h = location.hash || "#/";
  if (h.startsWith("#q-")) return;   // in-page anchor
  document.body.classList.remove("printmode");
  if (user.isTeacher && /^#\/t(\/|$)/.test(h)) sessionStorage.removeItem("asStudent");
  if (user.isTeacher && h === "#/student") sessionStorage.setItem("asStudent", "1");
  updateChrome();
  for (const [re, fn, teacherOnly] of routes) {
    const m = h.match(re);
    if (!m) continue;
    if (teacherOnly && !user.isTeacher) return mount(el("p", { class: "error" }, "Teachers only."));
    try { await fn(m); } catch (e) { console.error(e); mount(el("p", { class: "error" }, errMsg(e))); }
    return;
  }
  mount(el("p", {}, ["Page not found. ", el("a", { href: "#/" }, "Home")]));
}

window.addEventListener("hashchange", route);

onAuthStateChanged(auth, async (u) => {
  if (!u) { user = null; return signInPage(); }
  const email = (u.email || "").toLowerCase();
  if (!isSchoolEmail(email)) {
    await signOut(auth);
    return signInPage(`${email} is not a school account. Please use your @syss.edu.hk or @singyin.edu.hk account.`);
  }
  user = { uid: u.uid, email, name: u.displayName || email.split("@")[0], isTeacher: false };
  let allowed = false;
  try {
    user.isTeacher = (await getDoc(doc(db, "teachers", email))).exists();
    allowed = user.isTeacher || (await getDoc(doc(db, "members", email))).exists();
  } catch (e) { console.warn(e); }
  if (!allowed) { user = null; return notOnListPage(email); }
  try { await setDoc(doc(db, "users", u.uid), { email, name: user.name, lastLogin: serverTimestamp() }); } catch (e) { console.warn(e); }
  if (!user.isTeacher && (location.hash || "").startsWith("#/t")) history.replaceState(null, "", "#/");
  drawChrome(user, () => signOut(auth));
  if (!user.isTeacher) refreshStudentStatus(user);
  else refreshFeedbackBadge();
  route();
});
