// Top bar (and the bottom tab bar on phones): highlights the current page, teacher/student switch,
// a Questions drop-down for teachers and an initials button with the account menu.
import { el } from "./ui.js?v=202611112112";

const STUDENT_NAV = [
  { href: "#/", icon: "home", label: "Home", match: /^(#?\/?|#\/student|#\/do\/.*)$/, badge: "due" },
  { href: "#/practise", icon: "pencil", label: "Practise", match: /^#\/practi[cs]e/ },
  { href: "#/explain", icon: "book", label: "Explain", match: /^#\/explain/ },
  { href: "#/leaderboard", icon: "trophy", label: "Leaderboard", short: "Board", match: /^#\/leaderboard/ },
  { href: "#/history", icon: "history", label: "My results", short: "Results", match: /^#\/(history|review)/ },
];
const TEACHER_NAV = [
  { href: "#/t", icon: "layout-dashboard", label: "Classes", match: /^(#?\/?|#\/t|#\/t\/(class|results|students?)(\/.*)?)$/ },
  { href: "#/t/assign", icon: "clipboard-list", label: "Assign", match: /^#\/t\/assign/ },
  { href: "#/t/feedback", icon: "message-question", label: "Feedback", match: /^#\/t\/feedback/, badge: "feedback" },
  { label: "Questions", icon: "database", match: /^#\/t\/(bank|paper)/, items: [
    { href: "#/t/bank", icon: "search", label: "Browse question bank", short: "Bank" },
    { href: "#/t/paper", icon: "printer", label: "Printable paper", short: "Paper" },
  ] },
  { href: "#/t/leaderboard", icon: "trophy", label: "Leaderboard", short: "Board", match: /^#\/t\/leaderboard/ },
  { href: "#/t/explain", icon: "book", label: "Explain", match: /^#\/t\/explain/ },
];

const icon = (name) => el("i", { class: `ti ti-${name}`, "aria-hidden": "true" });
const state = { user: null, mode: null, onSignOut: null, badges: { due: 0, feedback: 0 }, chip: "" };
const $ = (id) => document.getElementById(id);

export const isTeacherMode = (user) => !!(user && user.isTeacher && !sessionStorage.getItem("asStudent"));

function initials(name) {
  const parts = String(name || "").replace(/\(.*?\)/g, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function closeMenus(except) {
  document.querySelectorAll(".dd.open").forEach((d) => { if (d !== except) d.classList.remove("open"); });
}
document.addEventListener("click", (e) => {
  if (!e.target.closest || !e.target.closest(".dd")) closeMenus();
  if (e.target.closest && e.target.closest("#nav a, #tabbar a, .dd-menu a")) { document.body.classList.remove("menu-open"); closeMenus(); }
});

function navItem(item) {
  if (item.items) {
    const btn = el("button", { type: "button", class: "navlink dd-toggle", "aria-haspopup": "true" },
      [icon(item.icon), item.label, el("i", { class: "ti ti-chevron-down caret", "aria-hidden": "true" })]);
    const menu = el("div", { class: "dd-menu" }, item.items.map((s) => el("a", { href: s.href }, [icon(s.icon), s.label])));
    const wrap = el("div", { class: "dd", "data-match": item.match.source }, [btn, menu]);
    btn.addEventListener("click", (e) => { e.stopPropagation(); closeMenus(wrap); wrap.classList.toggle("open"); });
    return wrap;
  }
  const a = el("a", { href: item.href, class: "navlink", "data-match": item.match.source }, [icon(item.icon), item.label]);
  if (item.badge) a.append(el("span", { class: "navbadge", "data-key": item.badge, hidden: true }));
  return a;
}

function tabItems(nav) {
  return nav.flatMap((n) => n.items ? n.items.map((s) => ({ ...s, match: new RegExp(`^${s.href.replace(/[/#]/g, "\\$&")}`) })) : [n]).slice(0, 5)
    .map((n) => {
      const a = el("a", { href: n.href, "data-match": n.match.source }, [icon(n.icon), el("span", {}, n.short || n.label)]);
      if (n.badge) a.append(el("span", { class: "navbadge", "data-key": n.badge, hidden: true }));
      return a;
    });
}

function render() {
  const { user } = state;
  const teacher = isTeacherMode(user);
  state.mode = teacher ? "teacher" : "student";
  const nav = teacher ? TEACHER_NAV : STUDENT_NAV;
  $("nav").replaceChildren(...nav.map(navItem));
  const tabbar = $("tabbar");
  if (tabbar) tabbar.replaceChildren(...tabItems(nav));

  const right = [];
  if (!teacher && state.chip) right.push(el("span", { class: "chip-pts", title: "Your class and all-time leaderboard points" }, state.chip));
  if (user.isTeacher) {
    right.push(el("div", { class: "seg", role: "group", "aria-label": "View" }, [
      el("a", { href: "#/t", class: teacher ? "on" : "" }, "Teacher"),
      el("a", { href: "#/student", class: teacher ? "" : "on" }, "Student"),
    ]));
  }
  const av = el("button", { type: "button", class: "avatar dd-toggle", title: user.email, "aria-label": "Account menu" }, initials(user.name));
  const menu = el("div", { class: "dd-menu right" }, [
    el("div", { class: "dd-head" }, [el("strong", {}, user.name), el("span", { class: "muted" }, user.email)]),
    user.isTeacher ? el("a", { href: teacher ? "#/student" : "#/t" }, [icon(teacher ? "user" : "school"), teacher ? "Switch to student view" : "Switch to teacher view"]) : null,
    user.isTeacher ? el("a", { href: "#/t/admin" }, [icon("settings"), "Admin"]) : null,
    el("button", { type: "button", class: "dd-item", onclick: () => state.onSignOut && state.onSignOut() }, [icon("logout"), "Sign out"]),
  ]);
  const ddUser = el("div", { class: "dd" }, [av, menu]);
  av.addEventListener("click", (e) => { e.stopPropagation(); closeMenus(ddUser); ddUser.classList.toggle("open"); });
  right.push(ddUser);
  $("user").replaceChildren(...right);
  applyBadge();
  highlight();
}

function applyBadge() {
  document.querySelectorAll(".navbadge").forEach((b) => {
    const n = state.badges[b.dataset.key] || 0;
    b.hidden = !n;
    b.textContent = !n ? "" : b.closest("#tabbar") || b.dataset.key !== "due" ? String(n) : `${n} due`;
  });
}

function highlight() {
  const h = location.hash || "#/";
  document.querySelectorAll("#nav [data-match], #tabbar [data-match]").forEach((n) => {
    const on = new RegExp(n.dataset.match).test(h);
    n.classList.toggle("on", on);
    if (n.tagName === "A") { if (on) n.setAttribute("aria-current", "page"); else n.removeAttribute("aria-current"); }
  });
}

/** Draw the bar for a signed-in user. */
export function drawChrome(user, onSignOut) {
  state.user = user; state.onSignOut = onSignOut;
  document.body.classList.add("signed-in");
  const mb = $("menuBtn");
  if (mb && !mb.dataset.wired) {
    mb.dataset.wired = "1";
    mb.addEventListener("click", (e) => { e.stopPropagation(); document.body.classList.toggle("menu-open"); });
  }
  render();
}

/** Call on every page change: redraw if the teacher/student mode changed, then mark the current page. */
export function updateChrome() {
  if (!state.user) return;
  const mode = isTeacherMode(state.user) ? "teacher" : "student";
  if (mode !== state.mode) render(); else highlight();
}

export function clearChrome() {
  state.user = null; state.mode = null; state.chip = ""; state.badges = { due: 0, feedback: 0 };
  document.body.classList.remove("signed-in", "menu-open");
  $("nav").replaceChildren(); $("user").replaceChildren();
  if ($("tabbar")) $("tabbar").replaceChildren();
}

/** Number of assignments waiting (shown on Home). */
export function setDue(n) { setBadge("due", n); }
/** Number shown on a nav item ("due" on Home, "feedback" on the teacher's Feedback). */
export function setBadge(key, n) { state.badges[key] = n || 0; applyBadge(); }
/** "4A · 132 pts" on the right of the bar (students). */
export function setChip(text) { if (state.chip === text) return; state.chip = text || ""; if (state.user) render(); }
