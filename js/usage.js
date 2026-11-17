// Admin → Usage statistics (teachers only). Built in the teacher's browser from data the platform already keeps:
//   activity/{uid}_{day}  one doc per student per Hong Kong day with practice / an assignment / the Explain card of the day
//   users/{uid}           written at sign-in (email, name, lastLogin)
//   classes/{id}          class lists (studentEmails)
// Staff accounts (@singyin.edu.hk) are left out. No new tracking.
import { db } from "./fb.js?v=202611171331";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { el, mount, loading, errMsg, toDate } from "./ui.js?v=202611171331";

const isStudent = (email) => /@syss\.edu\.hk$/i.test(email || "");
const formOf = (name) => { const m = /^\s*(?:F\.?\s*)?([1-6])/i.exec(name || ""); return m ? `F${m[1]}` : null; };
const ms = (ts) => (!ts ? 0 : ts.toMillis ? ts.toMillis() : +toDate(ts));
/** "2026-11-16" for a time in Hong Kong (UTC+8), like the server's dayKey(). */
export const hkDay = (t = Date.now()) => new Date(t + 8 * 3600 * 1000).toISOString().slice(0, 10);
const addDays = (day, n) => { const d = new Date(`${day}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** ISO week "2026-W47" of a day key, like the server's periodKeys(). */
export function weekOf(day) {
  const t = new Date(`${day}T00:00:00Z`); const wd = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - wd);
  const wy = t.getUTCFullYear(), wk = Math.ceil(((t - Date.UTC(wy, 0, 1)) / 86400000 + 1) / 7);
  return `${wy}-W${String(wk).padStart(2, "0")}`;
}
const PERIODS = [["7", "Last 7 days"], ["30", "Last 30 days"], ["90", "Last 90 days"], ["all", "All time"]];

/** Bars as an inline SVG: [{ label, value, title }]. */
function barChart(points, { height = 180 } = {}) {
  const n = points.length || 1, max = Math.max(1, ...points.map((p) => p.value));
  const W = 720, H = height, L = 34, B = 26, T = 10, bw = (W - L - 6) / n;
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const step = Math.max(1, Math.ceil(n / 12));
  const ticks = [...new Set([0, Math.round(max / 2), max])];
  let s = `<svg class="usage-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Active students">`;
  ticks.forEach((v) => { s += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" class="grid"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`; });
  points.forEach((p, i) => {
    const x = L + i * bw + bw * 0.12, w = bw * 0.76, top = y(p.value);
    s += `<rect x="${x}" y="${top}" width="${w}" height="${H - B - top}" class="bar"><title>${p.title}</title></rect>`;
    if (n <= 31 && p.value) s += `<text x="${x + w / 2}" y="${top - 3}" text-anchor="middle" class="val">${p.value}</text>`;
    if (i % step === 0) s += `<text x="${x + w / 2}" y="${H - 8}" text-anchor="middle">${p.label}</text>`;
  });
  return s + "</svg>";
}

function csv(rows) {
  const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const blob = new Blob(["﻿" + rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" });
  const a = el("a", { href: URL.createObjectURL(blob), download: `usage-${hkDay()}.csv` });
  document.body.append(a); a.click(); a.remove();
}

export async function usageView(user) {
  mount(loading());
  let classes, users;
  try {
    const [cSnap, uSnap] = await Promise.all([getDocs(collection(db, "classes")), getDocs(collection(db, "users"))]);
    classes = cSnap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || "").localeCompare(b.name || "", "en", { numeric: true }));
    users = uSnap.docs.map((d) => d.data()).filter((u) => isStudent(u.email));
  } catch (e) { mount(el("section", {}, [el("h1", {}, "Usage statistics"), el("p", { class: "error" }, errMsg(e))])); return; }
  const lastLogin = new Map(users.map((u) => [String(u.email).toLowerCase(), ms(u.lastLogin)]));
  const actCache = new Map();
  async function activityFrom(start) {          // start = day key, or null for all time
    const k = start || "all";
    if (!actCache.has(k)) {
      const snap = await getDocs(start ? query(collection(db, "activity"), where("day", ">=", start)) : collection(db, "activity"));
      actCache.set(k, snap.docs.map((d) => d.data()).filter((a) => isStudent(a.email) && a.day));
    }
    return actCache.get(k);
  }

  const sel = el("select", { "aria-label": "Period" }, PERIODS.map(([v, l]) => el("option", { value: v, selected: v === (sessionStorage.getItem("usagePeriod") || "30") }, l)));
  const body = el("div", {}, loading());
  const page = el("section", {}, [
    el("h1", {}, "Usage statistics"),
    el("p", { class: "muted" }, "A student counts as active on a day when they finish a practice set, submit an assignment or read their Explain card of the day (Hong Kong time). Students only — staff accounts are left out."),
    el("div", { class: "row" }, [sel, el("a", { class: "btn small", href: "#/t/admin" }, "Back to Admin")]),
    body]);
  mount(page);

  async function draw() {
    const p = sel.value; try { sessionStorage.setItem("usagePeriod", p); } catch (e) {}
    body.replaceChildren(loading());
    const today = hkDay();
    const start = p === "all" ? null : addDays(today, -(Number(p) - 1));
    let acts;
    try { acts = await activityFrom(start); } catch (e) { body.replaceChildren(el("p", { class: "error" }, errMsg(e))); return; }
    const first = start || acts.reduce((m, a) => (a.day < m ? a.day : m), today);
    const startMs = Date.parse(`${first}T00:00:00+08:00`);

    // per student: active days in the period, last active day
    const byStudent = new Map();
    for (const a of acts) {
      const e = String(a.email).toLowerCase();
      if (!byStudent.has(e)) byStudent.set(e, { days: new Set(), last: "" });
      const s = byStudent.get(e); s.days.add(a.day); if (a.day > s.last) s.last = a.day;
    }

    // chart: distinct active students per day (7 / 30 days) or per week (90 days / all)
    const weekly = p === "90" || p === "all";
    const buckets = new Map();
    if (weekly) for (let d = first; d <= today; d = addDays(d, 7)) buckets.set(weekOf(d), new Set());
    else for (let d = first; d <= today; d = addDays(d, 1)) buckets.set(d, new Set());
    if (weekly) buckets.set(weekOf(today), buckets.get(weekOf(today)) || new Set());
    for (const a of acts) { const k = weekly ? weekOf(a.day) : a.day; if (buckets.has(k)) buckets.get(k).add(String(a.email).toLowerCase()); }
    const points = [...buckets.entries()].map(([k, set]) => ({
      label: weekly ? k.slice(5) : k.slice(8), value: set.size,
      title: `${weekly ? "Week " + k : k}: ${set.size} active student${set.size === 1 ? "" : "s"}`,
    }));

    // summary
    const onList = new Set(classes.flatMap((c) => (c.studentEmails || []).map((e) => e.toLowerCase())).filter(isStudent));
    const signedIn = [...onList].filter((e) => lastLogin.has(e));
    const signedInPeriod = [...onList].filter((e) => (lastLogin.get(e) || 0) >= startMs);
    const active = [...byStudent.keys()];
    const totalDays = active.reduce((n, e) => n + byStudent.get(e).days.size, 0);
    const card = (n, label, sub) => el("div", { class: "stat" }, [el("strong", {}, String(n)), el("span", {}, label), sub ? el("span", { class: "muted small" }, sub) : null]);
    const summary = el("div", { class: "stats-row" }, [
      card(onList.size, "students on class lists"),
      card(signedIn.length, "have ever signed in", onList.size ? `${Math.round((100 * signedIn.length) / onList.size)}% of the lists` : ""),
      card(signedInPeriod.length, "last signed in during this period"),
      card(active.length, "active in this period", onList.size ? `${Math.round((100 * active.filter((e) => onList.has(e)).length) / onList.size)}% of the lists` : ""),
      card(active.length ? (totalDays / active.length).toFixed(1) : "0", "active days per active student"),
    ]);

    // by form and class
    const rowFor = (label, emails, cls) => {
      const list = [...emails].filter(isStudent);
      const act = list.filter((e) => byStudent.has(e));
      const days = act.reduce((n, e) => n + byStudent.get(e).days.size, 0);
      const last = act.reduce((m, e) => (byStudent.get(e).last > m ? byStudent.get(e).last : m), "");
      return { label, cls, n: list.length, signed: list.filter((e) => lastLogin.has(e)).length, active: act.length,
        pct: list.length ? Math.round((100 * act.length) / list.length) : 0, perStudent: act.length ? (days / act.length).toFixed(1) : "–", last: last || "–" };
    };
    const forms = [...new Set(classes.map((c) => formOf(c.name)).filter(Boolean))].sort();
    const rows = [];
    for (const f of forms) {
      const cl = classes.filter((c) => formOf(c.name) === f);
      rows.push({ ...rowFor(`All ${f}`, new Set(cl.flatMap((c) => (c.studentEmails || []).map((e) => e.toLowerCase())))), form: true });
      cl.forEach((c) => rows.push(rowFor(c.name, new Set((c.studentEmails || []).map((e) => e.toLowerCase())), c)));
    }
    classes.filter((c) => !formOf(c.name)).forEach((c) => rows.push(rowFor(c.name, new Set((c.studentEmails || []).map((e) => e.toLowerCase())), c)));
    const head = ["Form / class", "Students", "Signed in (ever)", "Active", "% active", "Active days per active student", "Last activity"];
    const table = el("table", { class: "grid usage-table" }, [el("tr", {}, head.map((h) => el("th", {}, h)))].concat(rows.map((r) =>
      el("tr", { class: r.form ? "form-row" : "" }, [
        el("td", {}, r.cls ? el("a", { href: `#/t/students/${r.cls.id}` }, r.label) : r.label),
        el("td", {}, String(r.n)), el("td", {}, String(r.signed)), el("td", {}, String(r.active)),
        el("td", {}, el("span", { class: "pctbar" }, [el("span", { style: `width:${r.pct}%` }), ` ${r.pct}%`])),
        el("td", {}, r.perStudent), el("td", {}, r.last)]))));
    const dl = el("button", { class: "btn small", type: "button" }, "Download CSV");
    dl.addEventListener("click", () => csv([head, ...rows.map((r) => [r.label, r.n, r.signed, r.active, r.pct, r.perStudent, r.last])]));

    body.replaceChildren(summary,
      el("div", { class: "panel" }, [el("h2", {}, `Active students per ${weekly ? "week" : "day"}`),
        el("div", { html: barChart(points) }),
        el("p", { class: "muted small" }, weekly ? "ISO weeks (Monday–Sunday)." : "Days in Hong Kong time.")]),
      el("div", { class: "panel" }, [el("div", { class: "panelhead" }, [el("h2", {}, "By form and class"), dl]),
        el("p", { class: "muted small" }, "Students: on the class list. Active: did something in the period chosen above. Click a class for its Students list."),
        el("div", { class: "scroll" }, table)]));
  }
  sel.addEventListener("change", draw);
  draw();
}
