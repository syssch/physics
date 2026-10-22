import { auth, db, signIn, signOut, onAuthStateChanged } from "./fb.js";
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, toast, errMsg } from "./ui.js";
import { isSchoolEmail } from "./config.js";
import { studentHome, practiceView, doAssignment, reviewView, historyView } from "./student.js";
import { explainLibrary, explainCard, explainProgressView } from "./explain.js";
import { teacherHome, classEditor, assignmentBuilder, resultsView, adminView, bankView } from "./teacher.js";

let user = null;

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
  ]));
  document.getElementById("nav").replaceChildren();
  document.getElementById("user").replaceChildren();
}

function notOnListPage(email) {
  mount(el("section", { class: "signin" }, [
    el("h1", {}, "SYSS Physics Practice"),
    el("p", {}, `You're signed in as ${email}, but this site is only for SYSS Physics students.`),
    el("p", { class: "muted" }, "If you take Physics, ask your physics teacher to add your school email to your class. Then sign in again."),
    el("button", { class: "btn", type: "button", onclick: () => signOut(auth) }, "Sign out"),
  ]));
  document.getElementById("nav").replaceChildren();
  document.getElementById("user").replaceChildren();
}

function drawChrome() {
  const links = [el("a", { href: "#/" }, "Home"), el("a", { href: "#/explain" }, "Explain"), el("a", { href: "#/history" }, "My results")];
  if (user.isTeacher) links.push(el("a", { href: "#/student" }, "Practise"), el("a", { href: "#/t" }, "Teacher"));
  document.getElementById("nav").replaceChildren(...links);
  document.getElementById("user").replaceChildren(
    el("span", { class: "muted" }, user.email),
    el("button", { class: "linkbtn", type: "button", onclick: () => signOut(auth) }, "Sign out"));
}

const routes = [
  [/^#?\/?$/, () => (user.isTeacher && !sessionStorage.getItem("asStudent") ? teacherHome(user) : studentHome(user))],
  [/^#\/student$/, () => { sessionStorage.setItem("asStudent", "1"); return studentHome(user); }],
  [/^#\/history$/, () => historyView(user)],
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
  [/^#\/t\/admin$/, () => adminView(user), true],
];

async function route() {
  if (!user) return;
  const h = location.hash || "#/";
  if (h.startsWith("#q-")) return;   // in-page anchor
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
  drawChrome();
  if (!user.isTeacher && (location.hash || "").startsWith("#/t")) history.replaceState(null, "", "#/");
  route();
});
