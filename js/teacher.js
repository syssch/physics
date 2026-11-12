import { db, storage, api } from "./fb.js?v=202611120950";
import { collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, updateDoc, query, where, orderBy,
  documentId, serverTimestamp, Timestamp, writeBatch } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js";
import { el, mount, loading, toast, errMsg, fmtDate, toDate, pct, chunk, typeset, store } from "./ui.js?v=202611120950";
import { getAllQuestions, getQuestions, getTopics, getBooks, syllabusFilters, skillFilter, readQuestionIndex, chapterShort, booksFromQuestions, renderQuestion, renderPrintQuestion, sourceLabel } from "./questions.js?v=202611120950";
import { isSchoolEmail } from "./config.js?v=202611120950";
import { importExplainBundle } from "./explain.js?v=202611120950";
import { recordHref } from "./studentrecord.js?v=202611120950";
import { loadFirstAttempts, studentFilter, summarise, statsLine } from "./qstats.js?v=202611120950";
import { assignmentFeedback, feedbackSummary } from "./feedback.js?v=202611120950";
import { parseRow, rosterOf, studentLabel, sortByRoster, mergeRoster, attachRosters, attachRoster, saveClass, deleteClass } from "./roster.js?v=202611120950";

const emailRe = { test: (e) => /^[^@\s]+@[^@\s]+$/.test(e) && isSchoolEmail(e) };

async function listClasses() {
  const snap = await getDocs(collection(db, "classes"));
  return attachRosters(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => a.name.localeCompare(b.name)));
}
async function listAssignments(classId) {
  const snap = await getDocs(query(collection(db, "classes", classId, "assignments"), orderBy("dueAt", "desc")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

// ---------------------------------------------------------------- home
export async function teacherHome(user) {
  mount(loading());
  const classes = await listClasses();
  const page = el("section", {}, [
    el("h1", {}, "Teacher dashboard"),
    el("div", { class: "row" }, [
      el("a", { class: "btn primary", href: "#/t/assign" }, "New assignment"),
      el("a", { class: "btn", href: "#/t/class/new" }, "New class"),
      el("a", { class: "btn", href: "#/t/feedback" }, "Student feedback"),
    ]),
  ]);
  if (!classes.length) page.append(el("p", { class: "muted" }, "No classes yet. Create a class and add your students' school emails."));
  for (const c of classes) {
    const box = el("div", { class: "panel" }, [
      el("div", { class: "panelhead" }, [
        el("h2", {}, c.name),
        el("span", { class: "muted" }, `${(c.studentEmails || []).length} students`),
        el("a", { class: "btn small", href: `#/t/class/${c.id}` }, "Edit class"),
        el("a", { class: "btn small", href: `#/t/assign/${c.id}` }, "Assign"),
        el("a", { class: "btn small", href: `#/t/students/${c.id}` }, "Students"),
      ]),
    ]);
    const asg = await listAssignments(c.id);
    if (!asg.length) box.append(el("p", { class: "muted" }, "No assignments."));
    else {
      const t = el("table", { class: "grid" }, [el("tr", {}, ["Assignment", "Questions", "Due", ""].map((h) => el("th", {}, h)))]);
      asg.forEach((a) => t.append(el("tr", {}, [el("td", {}, a.title), el("td", {}, String(a.questionIds.length)),
        el("td", {}, fmtDate(a.dueAt)), el("td", {}, [el("a", { href: `#/t/results/${c.id}/${a.id}` }, "Results"), " · ",
          el("a", { href: `#/t/paper/${c.id}/${a.id}`, title: "Make a printable paper from this assignment" }, "Print")])])));
      box.append(t);
    }
    page.append(box);
  }
  mount(page);
}

// ---------------------------------------------------------------- classes
export async function classEditor(user, classId) {
  mount(loading());
  const isNew = classId === "new";
  const data = isNew ? { name: "", studentEmails: [] } : (await getDoc(doc(db, "classes", classId))).data();
  if (!data) return mount(el("p", { class: "error" }, "Class not found."));
  if (!isNew) await attachRoster(data, classId);
  const name = el("input", { type: "text", value: data.name, placeholder: "e.g. 4A" });
  const emails = el("textarea", { rows: 14, placeholder: "One student per line: number, name, Chinese name, school email\n12\tChan Tai Man\t陳大文\ts123456@syss.edu.hk\n(number and names are optional)" });
  emails.value = rosterOf(data).map((r) => [r.no, r.name, r.cname, r.email].filter((x) => x !== null && x !== undefined && x !== "").join("\t")).join("\n");
  const save = el("button", { class: "btn primary", type: "button" }, "Save class");
  save.addEventListener("click", async () => {
    const rows = emails.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).flatMap((l) => {
      const many = l.split(/[\s,;]+/).filter((c) => c.includes("@"));
      if (many.length > 1) return many.map((e) => ({ email: e.toLowerCase(), no: null, name: "", raw: e }));   // several emails on one line
      const r = parseRow(l); return [{ email: r.email, no: r.no, name: r.words.join(" "), cname: r.cname, raw: l }];
    });
    const bad = rows.filter((r) => !emailRe.test(r.email)).map((r) => r.raw);
    if (!name.value.trim()) return toast("Please give the class a name.", "error");
    if (bad.length) return toast(`Rows without a school email: ${bad.slice(0, 3).join(" | ")}${bad.length > 3 ? "…" : ""}`, "error");
    try {
      await saveClass(isNew ? null : classId, name.value.trim(), mergeRoster(null, rows, "replace"), user);
      toast("Class saved.");
      location.hash = "#/t";
    } catch (e) { toast(errMsg(e), "error"); }
  });
  const del = isNew ? null : el("button", { class: "btn danger", type: "button", onclick: async () => {
    if (!confirm("Delete this class? Its assignments will no longer be visible to students. Submitted results are kept.")) return;
    try { await deleteClass(classId); location.hash = "#/t"; } catch (e) { toast(errMsg(e), "error"); }
  } }, "Delete class");
  mount(el("section", { class: "narrow" }, [
    el("h1", {}, isNew ? "New class" : "Edit class"),
    el("label", {}, ["Class name", name]),
    el("label", {}, ["Students (number, name, Chinese name, school email — one per line)", emails]),
    el("p", { class: "muted" }, "Students see this class's assignments after signing in with these accounts."),
    el("div", { class: "row" }, [save, el("a", { class: "btn", href: "#/t" }, "Cancel"), del]),
  ]));
}

// ---------------------------------------------------------------- question picker (shared by builder and bank)
function questionFilters(questions, topics, onChange, books = []) {
  const syl = syllabusFilters(books.length ? books : booksFromQuestions(questions), onChange);
  const skill = skillFilter(onChange);
  const forms = [...new Set(questions.map((q) => q.form))].sort();
  const formSel = el("select", {}, [el("option", { value: "" }, "All forms")].concat(forms.map((f) => el("option", { value: f }, f))));
  const search = el("input", { type: "search", placeholder: "Search text…" });
  formSel.addEventListener("change", onChange);
  search.addEventListener("input", onChange);
  const strip = (h) => (h || "").replace(/<[^>]+>/g, " ").toLowerCase();
  const apply = () => questions.filter((q) =>
    syl.matches(q) && skill.matches(q) &&
    (!formSel.value || q.form === formSel.value) &&
    (!search.value || strip(q.textHtml).includes(search.value.toLowerCase())));
  return { node: el("div", { class: "row" }, [...syl.nodes, skill.node, formSel, search]), apply };
}

function snippet(q) {
  const t = (q.textHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 140 ? t.slice(0, 140) + "…" : t;
}

// Answer keys + solutions (teacher-only collection), fetched on demand and cached for the session.
const keyCache = new Map();
async function loadKeys(ids) {
  const missing = [...new Set(ids)].filter((id) => !keyCache.has(id));
  await Promise.all(chunk(missing, 30).map(async (part) => {
    const snap = await getDocs(query(collection(db, "answerKeys"), where(documentId(), "in", part)));
    part.forEach((id) => keyCache.set(id, null));            // no key stored
    snap.forEach((d) => keyCache.set(d.id, d.data()));
  }));
  return keyCache;
}
function teacherReview(id) {
  const k = keyCache.get(id) || {};
  return { teacher: true, answer: k.answer || null, correct: true, solution: k.solution || "" };
}

export async function bankView(user) {
  mount(loading());
  const [questions, topics, books] = await Promise.all([getAllQuestions(), getTopics(), getBooks()]);
  const listBox = el("div", {});
  const count = el("p", { class: "muted" });
  const f = questionFilters(questions, topics, () => draw(), books);
  const showKeys = el("input", { type: "checkbox", checked: store.get("bankShowSolutions") !== false });
  showKeys.addEventListener("change", () => { store.set("bankShowSolutions", showKeys.checked); draw(); });
  // first-attempt choice summaries
  const showStats = el("input", { type: "checkbox", checked: store.get("bankShowStats") !== false });
  const statsOpts = el("span", { class: "row inline" });
  const sortSel = el("select", { "aria-label": "Order" }, [["", "Paper order"], ["hard", "Hardest first (first attempts)"], ["most", "Most attempted first"]]
    .map(([v, l]) => el("option", { value: v }, l)));
  sortSel.addEventListener("change", () => draw());
  let stats = null, who = null;
  async function ensureStats() {
    if (!showStats.checked) { statsOpts.replaceChildren(); return; }
    if (!stats) {
      statsOpts.replaceChildren(el("span", { class: "muted" }, "Loading students' answers…"));
      stats = await loadFirstAttempts();
      who = studentFilter(stats.classes, () => { sessionStorage.setItem("qsWho", who.value()); draw(); }, sessionStorage.getItem("qsWho") || "");
    }
    statsOpts.replaceChildren(who.node, sortSel);
  }
  showStats.addEventListener("change", () => { store.set("bankShowStats", showStats.checked); draw(); });
  let drawId = 0;
  async function draw() {
    const id = ++drawId;
    try { await ensureStats(); } catch (e) { toast(errMsg(e), "error"); showStats.checked = false; }
    if (id !== drawId) return;
    let qs = f.apply();
    const on = showStats.checked && stats;
    const emails = on ? who.emails() : null;
    if (on && sortSel.value) {
      try { await loadKeys(qs.filter((q) => stats.firsts.has(q.id)).map((q) => q.id)); } catch (e) { toast(errMsg(e), "error"); }
      if (id !== drawId) return;
      const sum = new Map(qs.map((q) => [q.id, summarise(stats.firsts.get(q.id), emails, (keyCache.get(q.id) || {}).answer, q.optionKeys)]));
      qs = qs.filter((q) => sum.get(q.id).n).sort((a, b) => sortSel.value === "most"
        ? sum.get(b.id).n - sum.get(a.id).n
        : (sum.get(a.id).pct ?? 101) - (sum.get(b.id).pct ?? 101) || sum.get(b.id).n - sum.get(a.id).n);
    }
    count.textContent = `${qs.length} of ${questions.length} questions` + (on && sortSel.value ? " attempted by these students" : "")
      + (qs.length > 200 ? " — showing the first 200; narrow the filters to see the rest" : "");
    const page = qs.slice(0, 200);
    if (showKeys.checked || on) {
      try { await loadKeys(page.map((q) => q.id)); }
      catch (e) { toast(errMsg(e), "error"); }
      if (id !== drawId) return;                               // a newer filter change has started
    }
    listBox.replaceChildren(...page.map((q, i) => {
      const c = renderQuestion(q, { number: i + 1, review: showKeys.checked ? teacherReview(q.id) : null });
      if (on) {
        const key = (keyCache.get(q.id) || {}).answer;
        c.insertBefore(statsLine(summarise(stats.firsts.get(q.id), emails, key, q.optionKeys), key), c.querySelector(".solution"));
      }
      return c;
    }));
    typeset(listBox);
  }
  mount(el("section", {}, [el("h1", {}, "Question bank"), f.node,
    el("div", { class: "row" }, [el("label", { class: "check" }, [showKeys, " Show answers & solutions"]),
      el("label", { class: "check" }, [showStats, " Show students' first-attempt choices"]), statsOpts,
      el("a", { href: "#/t/qstats" }, "Question stats table")]),
    count, listBox]));
  draw();
}

/** All attempted questions with their first-attempt choice counts: sortable, filterable, CSV. */
export async function questionStatsView(user, force = true) {   // always the latest results when opened
  mount(loading("Loading students' answers…"));
  const [questions, topics, books, stats] = await Promise.all([getAllQuestions(), getTopics(), getBooks(), loadFirstAttempts(force)]);
  const attempted = questions.filter((q) => stats.firsts.has(q.id));
  await loadKeys(attempted.map((q) => q.id));
  const body = el("div", {});
  const info = el("p", { class: "muted" });
  const f = questionFilters(attempted, topics, () => draw(), books);
  const who = studentFilter(stats.classes, () => { sessionStorage.setItem("qsWho", who.value()); draw(); }, sessionStorage.getItem("qsWho") || "");
  const minSel = el("select", { "aria-label": "Minimum students" }, [1, 3, 5, 10, 20].map((n) => el("option", { value: n }, `at least ${n} student${n > 1 ? "s" : ""}`)));
  minSel.addEventListener("change", () => draw());
  const sort = { by: "pct", dir: 1 };
  let rows = [];
  function draw() {
    const emails = who.emails(), min = Number(minSel.value);
    rows = f.apply().map((q) => { const key = (keyCache.get(q.id) || {}).answer; return { q, key, s: summarise(stats.firsts.get(q.id), emails, key, q.optionKeys) }; })
      .filter((r) => r.s.n >= min);
    const val = (r) => sort.by === "pct" ? (r.s.pct ?? 101) : sort.by === "n" ? r.s.n : sourceLabel(r.q);
    rows.sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir || b.s.n - a.s.n);
    const students = new Set(); let firsts = 0;
    for (const r of rows) for (const e of stats.firsts.get(r.q.id)) if (!emails || emails.has(e.email)) { students.add(e.email); firsts++; }
    info.textContent = `${rows.length} questions · ${firsts} first attempts by ${students.size} students · loaded ${new Date(stats.at).toLocaleTimeString("en-HK", { timeStyle: "short" })}`;
    const th = (label, by) => {
      const h = el("th", { class: by ? "sortable" : "" }, by && sort.by === by ? `${label} ${sort.dir > 0 ? "▲" : "▼"}` : label);
      if (by) h.addEventListener("click", () => { sort.dir = sort.by === by ? -sort.dir : (by === "n" ? -1 : 1); sort.by = by; draw(); });
      return h;
    };
    const t = el("table", { class: "grid qstats" }, [el("tr", {}, [th("Question", "src"), th("Topic"), th("Students", "n"), th("% correct", "pct"),
      th("A"), th("B"), th("C"), th("D"), th("Blank"), th("")])]);
    rows.slice(0, 500).forEach((r) => {
      const keys = r.q.optionKeys || ["A", "B", "C", "D"];
      const cnt = (k) => el("td", { class: k === r.key ? "qs-keycell" : "" }, r.s.counts[k] ? `${r.s.counts[k]} (${Math.round((100 * r.s.counts[k]) / r.s.n)}%)` : "0");
      const more = el("button", { type: "button", class: "linkbtn" }, "Show");
      const detail = el("tr", { class: "attempt-detail", hidden: true }, el("td", { colspan: 10 }));
      more.addEventListener("click", () => {
        detail.hidden = !detail.hidden; more.textContent = detail.hidden ? "Show" : "Hide";
        if (detail.hidden || detail.dataset.drawn) return;
        detail.dataset.drawn = "1";
        const c = renderQuestion(r.q, { review: teacherReview(r.q.id) });
        c.insertBefore(statsLine(r.s, r.key), c.querySelector(".solution"));
        detail.firstChild.append(c); typeset(c);
      });
      t.append(el("tr", {}, [el("td", { class: "nowrap" }, sourceLabel(r.q)), el("td", {}, r.q.topic || ""), el("td", {}, String(r.s.n)),
        el("td", { class: r.s.pct === null ? "" : r.s.pct < 50 ? "qs-low" : r.s.pct < 75 ? "qs-mid" : "qs-high" }, r.s.pct === null ? "no key" : `${r.s.pct}%`),
        ...["A", "B", "C", "D"].map((k) => keys.includes(k) ? cnt(k) : el("td", {}, "")), el("td", {}, String(r.s.blank)), el("td", {}, more)]), detail);
    });
    body.replaceChildren(rows.length ? el("div", { class: "scroll" }, t) : el("p", { class: "muted" }, "No questions match."),
      rows.length > 500 ? el("p", { class: "muted" }, "Showing the first 500 — narrow the filters or download the CSV for the rest.") : "");
  }
  const csv = el("button", { class: "btn small", type: "button" }, "Download CSV");
  csv.addEventListener("click", () => {
    const out = [["question", "id", "topic", "students", "percent_correct", "key", "A", "B", "C", "D", "blank"],
      ...rows.map((r) => [sourceLabel(r.q), r.q.id, r.q.topic || "", r.s.n, r.s.pct ?? "", r.key || "", r.s.counts.A || 0, r.s.counts.B || 0, r.s.counts.C || 0, r.s.counts.D || 0, r.s.blank])];
    const blob = new Blob(["﻿" + out.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    el("a", { href: URL.createObjectURL(blob), download: `question_stats${who.value() ? "_" + who.node.selectedOptions[0].textContent.replace(/\W+/g, "") : ""}.csv` }).click();
  });
  const refresh = el("button", { class: "btn small", type: "button", onclick: () => questionStatsView(user, true) }, "Reload latest results");
  mount(el("section", {}, [el("h1", {}, "Question stats"),
    el("p", { class: "muted" }, "How students answered each question the first time they met it (practice, Redo my mistakes or an assignment); later attempts are not counted. Click a column heading to sort."),
    f.node, el("div", { class: "row" }, [who.node, minSel, csv, refresh]), info, body]));
  draw();
}

// Question picker shared by the assignment builder and the paper builder: filters, list with previews,
// "add random", and the ordered list of selected questions (can be reordered).
function questionPicker(questions, topics, books, selected) {
  const selBox = el("ol", { class: "sellist" });
  const selCount = el("strong", {});
  const listBox = el("div", { class: "picklist" });
  const shown = el("p", { class: "muted" });
  const f = questionFilters(questions, topics, () => drawList(), books);
  const randN = el("input", { type: "number", min: 1, max: 40, value: 5, style: "width:5em" });
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= selected.length) return; [selected[i], selected[j]] = [selected[j], selected[i]]; drawSelected(); };

  function drawSelected() {
    selCount.textContent = `(${selected.length})`;
    selBox.replaceChildren(...selected.map((id, i) => {
      const q = questions.find((x) => x.id === id);
      return el("li", {}, [el("span", { class: "selnum" }, `${i + 1}.`), el("span", { class: "seltext" }, q ? `${q.topic} · ${sourceLabel(q)}` : id),
        el("span", { class: "selbtns" }, [
          el("button", { class: "iconbtn", type: "button", title: "Move up", disabled: i === 0, onclick: () => move(i, -1) }, "↑"),
          el("button", { class: "iconbtn", type: "button", title: "Move down", disabled: i === selected.length - 1, onclick: () => move(i, 1) }, "↓"),
          el("button", { class: "iconbtn", type: "button", title: "Remove", onclick: () => { selected.splice(selected.indexOf(id), 1); drawSelected(); drawList(); } }, "✕")])]);
    }));
  }
  function drawList() {
    const qs = f.apply();
    shown.textContent = `${qs.length} questions match` + (qs.length > 300 ? " (showing the first 300 — narrow the filters to see the rest)" : "");
    listBox.replaceChildren(...qs.slice(0, 300).map((q) => {
      const box = el("input", { type: "checkbox", checked: selected.includes(q.id) });
      box.addEventListener("change", () => {
        if (box.checked && !selected.includes(q.id)) selected.push(q.id);
        if (!box.checked) selected.splice(selected.indexOf(q.id), 1);
        drawSelected();
      });
      const preview = el("div", { class: "preview" });
      const toggle = el("button", { class: "linkbtn", type: "button" }, "preview");
      toggle.addEventListener("click", () => {
        if (preview.firstChild) preview.replaceChildren();
        else {
          loadKeys([q.id]).catch(() => {}).then(() => {
            preview.replaceChildren(renderQuestion(q, { review: teacherReview(q.id) })); typeset(preview);
          });
        }
      });
      return el("div", { class: "pickrow" }, [el("label", { class: "pick" }, [box,
        el("span", {}, [el("strong", { title: q.topic || "" }, `${(q.chapters || []).length ? (q.chapters || []).map(chapterShort).join(", ") : q.topic} · ${(q.subtopics || []).join(", ")}`), el("br"), el("span", { class: "muted" }, `${sourceLabel(q)} — ${snippet(q)}`)])]),
        toggle, preview]);
    }));
  }
  const randBtn = el("button", { class: "btn small", type: "button" }, "Add random from filter");
  randBtn.addEventListener("click", () => {
    const pool = f.apply().map((q) => q.id).filter((id) => !selected.includes(id));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    selected.push(...pool.slice(0, Number(randN.value) || 5));
    drawSelected(); drawList();
  });
  drawSelected(); drawList();
  return {
    drawSelected, drawList,
    layout: (...actions) => el("div", { class: "builder" }, [
      el("div", { class: "panel" }, [el("h2", {}, "Choose questions"), f.node,
        el("div", { class: "row" }, [shown, randN, randBtn]), listBox]),
      el("div", { class: "panel sticky" }, [el("h2", {}, ["Selected ", selCount]), selBox, ...actions]),
    ]),
  };
}

// ---------------------------------------------------------------- assignment builder
export async function assignmentBuilder(user, presetClassId) {
  mount(loading());
  const [classes, questions, topics, books] = await Promise.all([listClasses(), getAllQuestions(), getTopics(), getBooks()]);
  if (!classes.length) return mount(el("section", {}, [el("p", {}, "Create a class first."), el("a", { class: "btn", href: "#/t/class/new" }, "New class")]));
  const selected = [];
  const classSel = el("select", {}, classes.map((c) => el("option", { value: c.id, selected: c.id === presetClassId }, c.name)));
  const title = el("input", { type: "text", placeholder: "e.g. Kinematics homework 1" });
  const due = new Date(); due.setDate(due.getDate() + 7); due.setHours(23, 59, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const dueInput = el("input", { type: "datetime-local",
    value: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}` });
  const reveal = el("select", {}, [el("option", { value: "after_submit" }, "Show answers & solutions right after submitting"),
    el("option", { value: "after_due" }, "Show answers & solutions after the due date"),
    el("option", { value: "manual" }, "Hide until I release them")]);

  const pk = questionPicker(questions, topics, books, selected);

  const save = el("button", { class: "btn primary", type: "button" }, "Create assignment");
  save.addEventListener("click", async () => {
    if (!title.value.trim()) return toast("Please give the assignment a title.", "error");
    if (!selected.length) return toast("Pick at least one question.", "error");
    const dueAt = new Date(dueInput.value);
    if (isNaN(dueAt)) return toast("Please set a due date.", "error");
    save.disabled = true;
    try {
      await addDoc(collection(db, "classes", classSel.value, "assignments"), {
        title: title.value.trim(), questionIds: [...selected], dueAt: Timestamp.fromDate(dueAt), reveal: reveal.value,
        createdBy: user.email, createdAt: serverTimestamp(),
      });
      toast("Assignment created.");
      location.hash = "#/t";
    } catch (e) { toast(errMsg(e), "error"); save.disabled = false; }
  });

  mount(el("section", {}, [
    el("h1", {}, "New assignment"),
    el("div", { class: "formgrid" }, [
      el("label", {}, ["Class", classSel]), el("label", {}, ["Title", title]),
      el("label", {}, ["Due", dueInput]), el("label", {}, ["Answers & solutions", reveal]),
    ]),
    pk.layout(save),
  ]));
}

// ---------------------------------------------------------------- printable paper
/**
 * Paper builder: pick questions (or start from an assignment), set the cover details and what to include,
 * then preview a print layout and print it / save it as PDF from the browser. Nothing is saved.
 */
export async function paperBuilder(user, classId, assignmentId) {
  mount(loading());
  const [questions, topics, books] = await Promise.all([getAllQuestions(), getTopics(), getBooks()]);
  const selected = [];
  const title = el("input", { type: "text", placeholder: "e.g. F.5 Physics Quiz 1 — Electricity" });
  const subtitle = el("input", { type: "text", placeholder: "e.g. Multiple-choice questions (optional)" });
  const minutes = el("input", { type: "number", min: 0, max: 300, placeholder: "minutes", style: "width:7em" });
  if (classId && assignmentId) {
    const a = await getDoc(doc(db, "classes", classId, "assignments", assignmentId));
    if (a.exists()) { selected.push(...(a.data().questionIds || [])); title.value = a.data().title || ""; }
  }
  const box = (label, on, hint) => {
    const i = el("input", { type: "checkbox", checked: on });
    return { input: i, node: el("label", { class: "check", title: hint || "" }, [i, " " + label]) };
  };
  const opt = {
    nameLines: box("Name / Class / No. lines", true),
    answerGrid: box("Answer boxes on the first page", true),
    source: box("Show each question's source paper", false),
    key: box("Answer key (separate page)", true),
    solutions: box("Worked solutions (separate pages)", false),
    shuffle: box("Shuffle question order", false, "A new order each time you press Preview"),
  };
  const pk = questionPicker(questions, topics, books, selected);
  const previewBtn = el("button", { class: "btn primary", type: "button" }, "Preview & print");
  const editor = el("section", {}, [
    el("h1", {}, "Printable paper"),
    el("p", { class: "muted" }, "Choose questions, then preview the paper and print it or save it as a PDF. Nothing is saved on the platform."),
    el("div", { class: "formgrid" }, [
      el("label", {}, ["Title", title]), el("label", {}, ["Subtitle", subtitle]),
      el("label", {}, ["Time allowed", minutes]),
    ]),
    el("div", { class: "row paperopts" }, Object.values(opt).map((o) => o.node)),
    pk.layout(previewBtn),
  ]);
  previewBtn.addEventListener("click", async () => {
    if (!selected.length) return toast("Pick at least one question.", "error");
    previewBtn.disabled = true;
    try {
      const ids = [...selected];
      if (opt.shuffle.input.checked) for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      if (opt.key.input.checked || opt.solutions.input.checked) await loadKeys(ids);
      const byId = new Map(questions.map((q) => [q.id, q]));
      const qs = ids.map((id) => byId.get(id)).filter(Boolean);
      showPaper({
        title: title.value.trim() || "Physics — Multiple-choice questions", subtitle: subtitle.value.trim(),
        minutes: Number(minutes.value) || 0, questions: qs,
        nameLines: opt.nameLines.input.checked, answerGrid: opt.answerGrid.input.checked, source: opt.source.input.checked,
        key: opt.key.input.checked, solutions: opt.solutions.input.checked,
      }, () => { document.body.classList.remove("printmode"); mount(editor); });
    } catch (e) { toast(errMsg(e), "error"); }
    previewBtn.disabled = false;
  });
  mount(editor);
}

function letterGrid(n, fill) {
  const t = el("table", { class: "paper-grid" });
  for (let r = 0; r < n; r += 10) {
    const nums = el("tr", {}), cells = el("tr", {});
    for (let i = r; i < Math.min(n, r + 10); i++) { nums.append(el("th", {}, String(i + 1))); cells.append(el("td", {}, fill ? fill(i) : "")); }
    t.append(nums, cells);
  }
  return t;
}

/** The print layout. cfg: { title, subtitle, minutes, questions, nameLines, answerGrid, source, key, solutions } */
export function showPaper(cfg, onBack) {
  const qs = cfg.questions;
  const printBtn = el("button", { class: "btn primary", type: "button" }, "Print / Save as PDF");
  const back = el("button", { class: "btn", type: "button", onclick: onBack }, "← Back to edit");
  const wordBtn = el("button", { class: "btn", type: "button" }, "Download Word (.docx)");
  wordBtn.addEventListener("click", async () => {
    wordBtn.disabled = true; wordBtn.textContent = "Preparing Word file…";
    try {
      const { buildPaperDocx } = await import("./docx.js?v=202611120950");
      const names = [...new Set(qs.flatMap((q) => q.figures || []))];
      const figures = new Map();
      for (const part of chunk(names, 25)) {
        const r = await api.figureData({ names: part });
        Object.entries(r.figures || {}).forEach(([n, b64]) => {
          if (!b64) return;
          const bin = atob(b64), a = new Uint8Array(bin.length);
          for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k);
          figures.set(n, a);
        });
      }
      const keys = new Map(qs.map((q) => [q.id, keyCache.get(q.id) || {}]));
      const blob = buildPaperDocx({ ...cfg, questions: qs.map((q) => ({ ...q, sourceLabel: sourceLabel(q) })), keys, figures });
      const name = `${(cfg.title || "paper").replace(/[\\/:*?"<>|]+/g, "").trim().replace(/\s+/g, "_") || "paper"}.docx`;
      const link = el("a", { href: URL.createObjectURL(blob), download: name });
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 60000);
      toast(names.length && figures.size < names.length ? `Word file ready, but ${names.length - figures.size} figure(s) could not be included.` : "Word file downloaded.",
        names.length && figures.size < names.length ? "error" : "");
    } catch (e) { toast(errMsg(e), "error"); }
    wordBtn.disabled = false; wordBtn.textContent = "Download Word (.docx)";
  });
  const bar = el("div", { class: "printbar noprint" }, [back, printBtn, wordBtn,
    el("span", { class: "muted" }, "In the print dialog choose \"Save as PDF\" to keep a copy; turning off \"Headers and footers\" gives a cleaner page.")]);
  const paper = el("div", { class: "paper" });
  paper.append(el("div", { class: "paper-cover" }, [
    el("div", { class: "paper-school" }, "Sing Yin Secondary School · Physics"),
    el("h1", { class: "paper-title" }, cfg.title),
    cfg.subtitle ? el("div", { class: "paper-sub" }, cfg.subtitle) : null,
    el("div", { class: "paper-meta" }, [`${qs.length} question${qs.length === 1 ? "" : "s"}`, cfg.minutes ? ` · Time allowed: ${cfg.minutes} minutes` : ""].join("")),
    cfg.nameLines ? el("div", { class: "paper-name" }, ["Name", "Class", "No.", "Date"].map((k) => el("span", {}, [k + ": ", el("i", {})]))) : null,
    el("p", { class: "paper-instr" }, "Choose the best answer for each question." + (cfg.answerGrid ? " Write your answers in the boxes below." : "")),
    cfg.answerGrid ? letterGrid(qs.length) : null,
  ]));
  qs.forEach((q, i) => paper.append(renderPrintQuestion(q, i + 1, { showSource: cfg.source })));
  paper.append(el("p", { class: "paper-end" }, "— END OF PAPER —"));
  if (cfg.key) {
    paper.append(el("section", { class: "paper-key pagebreak" }, [el("h2", {}, `Answer key — ${cfg.title}`),
      letterGrid(qs.length, (i) => (keyCache.get(qs[i].id) || {}).answer || "—"),
      cfg.source ? el("ol", { class: "paper-srclist" }, qs.map((q) => el("li", {}, sourceLabel(q)))) : null]));
  }
  if (cfg.solutions) {
    const sec = el("section", { class: "paper-sols pagebreak" }, [el("h2", {}, `Worked solutions — ${cfg.title}`)]);
    qs.forEach((q, i) => {
      const k = keyCache.get(q.id) || {};
      sec.append(el("div", { class: "paper-sol" }, [el("div", { class: "paper-sol-head" }, `${i + 1}. Answer: ${k.answer || "—"}`),
        k.solution ? el("div", { class: "soltext", html: k.solution }) : el("p", { class: "muted" }, "No worked solution yet.")]));
    });
    paper.append(sec);
  }
  printBtn.addEventListener("click", async () => {
    printBtn.disabled = true;
    const imgs = [...paper.querySelectorAll("img")];
    await Promise.race([Promise.all(imgs.map((im) => im.complete && im.src ? null : new Promise((r) => { im.addEventListener("load", r, { once: true }); im.addEventListener("error", r, { once: true }); }))),
      new Promise((r) => setTimeout(r, 8000))]);
    if (window.MathJax?.typesetPromise) await window.MathJax.typesetPromise([paper]).catch(() => {});
    printBtn.disabled = false;
    window.print();
  });
  document.body.classList.add("printmode");
  mount(el("div", {}, [bar, paper]));
  typeset(paper);
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- leaderboard
const LB_PERIODS = [["week", "This week"], ["month", "This month"], ["all", "All time"]];
export async function leaderboardView(user) {
  const formSel = el("select", {}, ["F3", "F4", "F5", "F6"].map((f) => el("option", { value: f, selected: f === (store.get("lbForm") || "F4") }, f)));
  let period = "week";
  const tabs = el("div", { class: "tabs" });
  const body = el("div", {});
  const rebuild = el("button", { class: "btn small", type: "button", title: "Recount the current week, month and all-time totals from all saved practice results" }, "Recount from results");
  async function draw() {
    store.set("lbForm", formSel.value);
    [...tabs.children].forEach((b) => b.classList.toggle("on", b.dataset.p === period));
    body.replaceChildren(loading());
    try {
      const r = await api.getLeaderboard({ form: formSel.value, period });
      if (!r.rows.length) { body.replaceChildren(el("p", { class: "muted" }, "No practice points in this period yet.")); return; }
      const t = el("table", { class: "grid board" }, [el("tr", {}, ["#", "Student", "Points", "Practice sets", "Assignments", "Explain cards", "Check-in bonuses", "Email"].map((h) => el("th", {}, h)))]);
      r.rows.forEach((x) => t.append(el("tr", { class: x.rank <= 10 ? "top" : "" }, [el("td", {}, String(x.rank)), el("td", {}, x.label), el("td", {}, String(x.pts)), el("td", {}, String(x.sets || 0)), el("td", {}, String(x.asg || 0)), el("td", {}, String(x.cards || 0)), el("td", {}, String(x.bonus || 0)), el("td", { class: "muted" }, x.email || "")])));
      body.replaceChildren(el("p", { class: "muted" }, `${r.form} · ${period === "all" ? "all time" : r.key} · ${r.rows.length} student(s) with points. Students see the top 10 and their own rank.`), t);
    } catch (e) { body.replaceChildren(el("p", { class: "error" }, errMsg(e))); }
  }
  LB_PERIODS.forEach(([p, label]) => tabs.append(el("button", { class: "tab", type: "button", "data-p": p, onclick: () => { period = p; draw(); } }, label)));
  formSel.addEventListener("change", draw);
  rebuild.addEventListener("click", async () => {
    if (!confirm("Recount this week's, this month's and the all-time leaderboards from all saved results (practice and assignments) and Explain cards?")) return;
    rebuild.disabled = true;
    try { const r = await api.rebuildLeaderboards({}); toast(`Recounted: ${r.students} student(s).`); draw(); }
    catch (e) { toast(errMsg(e), "error"); }
    rebuild.disabled = false;
  });
  mount(el("section", {}, [el("h1", {}, "Leaderboard"),
    el("p", { class: "muted" }, "Points: 100 per correct answer in practice (incl. Redo my mistakes) and assignments (each assignment once), +500 for 90%+ or +200 for 75–89% in sets of 5+ questions; 300 for the Explain card of the day (once a day); +500 once a week for activity on 3 different days. A student's form comes from their class name (e.g. 4A → F4)."),
    el("div", { class: "row" }, [el("label", {}, ["Form ", formSel]), tabs, rebuild]), body]));
  draw();
}

// ---------------------------------------------------------------- results
/** When students may see answers and solutions (same rule as the Cloud Functions). */
export function revealState(a, now = Date.now()) {
  if (a.released) return true;
  if (a.reveal === "manual") return false;
  if (a.reveal === "after_due") return !!a.dueAt && (a.dueAt.toMillis ? a.dueAt.toMillis() : +a.dueAt) <= now;
  return true;
}
export function revealLabel(a) {
  return a.reveal === "after_due" ? "after the due date" : a.reveal === "manual" ? "when released" : "after submitting";
}

export async function resultsView(user, classId, assignmentId) {
  mount(loading());
  const [cSnap, aSnap] = await Promise.all([getDoc(doc(db, "classes", classId)), getDoc(doc(db, "classes", classId, "assignments", assignmentId))]);
  if (!cSnap.exists() || !aSnap.exists()) return mount(el("p", { class: "error" }, "Not found."));
  const cls = await attachRoster(cSnap.data(), classId), a = aSnap.data();
  const qids = a.questionIds;
  const [questions, attemptsSnap, fbk] = await Promise.all([
    getQuestions(qids),
    getDocs(query(collection(db, "attempts"), where("assignmentId", "==", assignmentId))),
    assignmentFeedback(assignmentId).catch((e) => { console.warn(e); return new Map(); }),
  ]);
  const answers = {}, solutions = {};
  for (const part of chunk(qids, 30)) {
    (await getDocs(query(collection(db, "answerKeys"), where(documentId(), "in", part)))).forEach((d) => {
      answers[d.id] = d.data().answer;
      if (d.data().solution) solutions[d.id] = d.data().solution;
    });
  }
  const byEmail = new Map(attemptsSnap.docs.map((d) => [d.data().email, { id: d.id, ...d.data() }]));
  const students = sortByRoster(cls, [...new Set([...(cls.studentEmails || []), ...byEmail.keys()])], (e) => byEmail.get(e)?.name);

  const head = el("tr", {}, [el("th", {}, "Student"), el("th", {}, "Score"), el("th", {}, "Submitted")]
    .concat(qids.map((id, i) => el("th", { class: "qcol" }, el("a", { href: `#q-${id}`, title: id }, `Q${i + 1}`)))));
  const table = el("table", { class: "grid results" }, [head]);
  const dist = qids.map(() => ({}));
  const correctCount = qids.map(() => 0);
  let submitted = 0, totalScore = 0;
  for (const email of students) {
    const at = byEmail.get(email);
    const cells = [el("td", { class: "nowrap" }, el("a", { href: recordHref(classId, email), title: "Full record for this student" }, studentLabel(cls, email, at && at.name)))];
    if (!at) { cells.push(el("td", { class: "muted" }, "—"), el("td", { class: "muted" }, "not submitted")); qids.forEach(() => cells.push(el("td", {}))); }
    else {
      submitted++; totalScore += at.score;
      const reset = el("button", { class: "linkbtn", type: "button", title: "Delete this submission so the student can do the assignment again",
        onclick: async () => {
          if (!confirm(`Delete ${studentLabel(cls, email, at.name)}'s submission? They will be able to do this assignment again.`)) return;
          try { await deleteDoc(doc(db, "attempts", at.id)); toast("Submission deleted."); resultsView(user, classId, assignmentId); }
          catch (e) { toast(errMsg(e), "error"); }
        } }, "reset");
      cells.push(el("td", {}, [`${at.score}/${at.total} `, reset]), el("td", { class: at.late ? "late" : "" }, fmtDate(at.submittedAt) + (at.late ? " (late)" : "")));
      qids.forEach((id, i) => {
        const r = (at.responses || {})[id];
        if (r) dist[i][r] = (dist[i][r] || 0) + 1;
        const ok = r && r === answers[id];
        if (ok) correctCount[i]++;
        cells.push(el("td", { class: `cell ${!r ? "blank" : ok ? "ok" : "no"}` }, r || "·"));
      });
    }
    table.append(el("tr", { class: at ? "" : "missing" }, cells));
  }
  table.append(el("tr", { class: "foot" }, [el("td", {}, "Correct"), el("td", {}, submitted ? `avg ${(totalScore / submitted).toFixed(1)}` : ""), el("td", {}, `${submitted}/${students.length} submitted`)]
    .concat(qids.map((id, i) => el("td", {}, submitted ? `${pct(correctCount[i], submitted)}%` : "")))));
  if (fbk.size) {
    const n = (id, kind) => (fbk.get(id) || []).filter((f) => f.kind === kind).length;
    table.append(el("tr", { class: "foot fbk-row-count" }, [el("td", {}, "Explain in class"), el("td", {}), el("td", { class: "muted" }, "requests")]
      .concat(qids.map((id) => el("td", { class: n(id, "explain") ? "fbk-hot" : "" }, n(id, "explain") ? String(n(id, "explain")) : "")))));
    if (qids.some((id) => n(id, "error"))) {
      table.append(el("tr", { class: "foot fbk-row-count" }, [el("td", {}, "Problem reports"), el("td", {}), el("td", {})]
        .concat(qids.map((id) => el("td", { class: n(id, "error") ? "fbk-hot" : "" }, n(id, "error") ? String(n(id, "error")) : "")))));
    }
  }

  const csv = el("button", { class: "btn small", type: "button" }, "Download CSV");
  csv.addEventListener("click", () => {
    const ro = new Map(rosterOf(cls).map((r) => [r.email, r]));
    const rows = [["class", "number", "name", "cname", "email", "score", "total", "submitted", "late", ...qids.map((_, i) => `Q${i + 1}`)]];
    rows.push(["", "", "(answer key)", "", "", "", "", "", "", ...qids.map((id) => answers[id] || "")]);
    for (const email of students) {
      const at = byEmail.get(email), r = ro.get(email) || {};
      rows.push([cls.name, r.no ?? "", r.name || at?.name || "", r.cname || "", email, at?.score ?? "", at?.total ?? "", at ? fmtDate(at.submittedAt) : "", at?.late ? "yes" : "",
        ...qids.map((id) => at?.responses?.[id] || "")]);
    }
    const blob = new Blob(["﻿" + rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n")], { type: "text/csv" });
    const link = el("a", { href: URL.createObjectURL(blob), download: `${a.title.replace(/[^\w-]+/g, "_")}.csv` });
    link.click();
  });

  const qBox = el("div", {}, [el("h2", {}, "Questions")]);
  questions.forEach((q, i) => {
    const d = dist[i];
    const keys = q.optionKeys || ["A", "B", "C", "D"];
    const bars = el("div", { class: "dist" }, keys.map((k) => el("span", { class: k === answers[q.id] ? "key" : "" }, `${k}: ${d[k] || 0}`)));
    qBox.append(renderQuestion(q, { number: i + 1, review: { answer: answers[q.id], correct: true, solution: solutions[q.id] } }));
    qBox.lastChild.append(el("div", { class: "muted" }, [`Chosen by students — `, bars]));
    const sum = feedbackSummary(fbk.get(q.id), cls);
    if (sum) qBox.lastChild.append(sum);
  });
  qBox.querySelectorAll(".fb").forEach((n) => n.remove());

  const shownNow = revealState(a);
  const release = el("button", { class: "btn small", type: "button" }, a.released ? "Hide answers & solutions again" : "Release answers & solutions now");
  release.addEventListener("click", async () => {
    try {
      await updateDoc(doc(db, "classes", classId, "assignments", assignmentId), { released: !a.released });
      toast(a.released ? "Hidden again." : "Released — students can now see answers and solutions.");
      resultsView(user, classId, assignmentId);
    } catch (e) { toast(errMsg(e), "error"); }
  });
  // edit title / due date / answer release, or delete the assignment (submissions are kept)
  const aRef = doc(db, "classes", classId, "assignments", assignmentId);
  const pad = (n) => String(n).padStart(2, "0");
  const dd = toDate(a.dueAt) || new Date();
  const tIn = el("input", { type: "text", value: a.title });
  const dueIn = el("input", { type: "datetime-local", value: `${dd.getFullYear()}-${pad(dd.getMonth() + 1)}-${pad(dd.getDate())}T${pad(dd.getHours())}:${pad(dd.getMinutes())}` });
  const revIn = el("select", {}, [["after_submit", "Show answers & solutions right after submitting"], ["after_due", "Show answers & solutions after the due date"], ["manual", "Hide until I release them"]]
    .map(([v, l]) => el("option", { value: v, selected: (a.reveal || "after_submit") === v }, l)));
  const saveEdit = el("button", { class: "btn primary", type: "button" }, "Save changes");
  const editBox = el("div", { class: "panel editbox", hidden: true }, [el("h2", {}, "Edit assignment"),
    el("div", { class: "formgrid" }, [el("label", {}, ["Title", tIn]), el("label", {}, ["Due", dueIn]), el("label", {}, ["Answers & solutions", revIn])]),
    el("p", { class: "muted" }, "The questions can't be changed once the assignment is set, so results stay comparable. To use different questions, create a new assignment."),
    el("div", { class: "row" }, [saveEdit, el("button", { class: "btn", type: "button", onclick: () => { editBox.hidden = true; } }, "Cancel")])]);
  saveEdit.addEventListener("click", async () => {
    const due = new Date(dueIn.value);
    if (!tIn.value.trim()) return toast("Please give the assignment a title.", "error");
    if (isNaN(due)) return toast("Please set a due date.", "error");
    saveEdit.disabled = true;
    try {
      await updateDoc(aRef, { title: tIn.value.trim(), dueAt: Timestamp.fromDate(due), reveal: revIn.value, editedBy: user.email, editedAt: serverTimestamp() });
      toast("Assignment updated.");
      resultsView(user, classId, assignmentId);
    } catch (e) { toast(errMsg(e), "error"); saveEdit.disabled = false; }
  });
  const editBtn = el("button", { class: "btn small", type: "button", onclick: () => { editBox.hidden = !editBox.hidden; } }, "Edit");
  const delBtn = el("button", { class: "btn small danger", type: "button" }, "Delete assignment");
  delBtn.addEventListener("click", async () => {
    if (!confirm(`Delete "${a.title}"? It disappears from students' Home pages and from your dashboard. Students keep their scores in My results, and leaderboard points already earned stay.`)) return;
    try { await deleteDoc(aRef); toast("Assignment deleted. Submitted results are kept."); location.hash = "#/t"; }
    catch (e) { toast(errMsg(e), "error"); }
  });
  mount(el("section", {}, [
    el("h1", {}, a.title), el("p", { class: "muted" }, `${cls.name} · due ${fmtDate(a.dueAt)} · answers & solutions ${revealLabel(a)}${shownNow ? " — students can see them now" : " — hidden from students for now"}`),
    el("div", { class: "row" }, [csv, a.reveal === "after_submit" ? null : release, editBtn, delBtn, el("a", { class: "btn small", href: "#/t" }, "Back")].filter(Boolean)),
    editBox,
    el("div", { class: "scroll" }, table), qBox,
  ]));
}

// ---------------------------------------------------------------- admin: classes & access
/** Parse pasted rows "class, email" (from Excel/Sheets: tab-separated) into { className: [emails] }. */
export function parseRoster(text) {
  const classes = new Map(), bad = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim()) continue;
    const r = parseRow(raw);
    if (!r.email) continue;                     // header or blank row
    const cls = (r.words[0] || "").replace(/\s+/g, " ");
    if (!cls || !emailRe.test(r.email)) { bad.push(raw.trim()); continue; }
    if (!classes.has(cls)) classes.set(cls, new Map());
    classes.get(cls).set(r.email, { email: r.email, no: r.no, name: r.words.slice(1).join(" "), cname: r.cname });
  }
  return { classes: new Map([...classes].map(([k, v]) => [k, [...v.values()]])), bad };
}

async function classesPanel(user) {
  const classes = await listClasses();
  const box = el("div", { class: "panel" }, [el("h2", {}, "Classes & students")]);
  box.append(el("p", { class: "muted" }, "Only students on a class list can use the platform. Teachers always can."));
  const t = el("table", { class: "grid" }, [el("tr", {}, ["Class", "Students", ""].map((h) => el("th", {}, h)))]);
  classes.forEach((c) => t.append(el("tr", {}, [el("td", {}, c.name), el("td", {}, String((c.studentEmails || []).length)),
    el("td", {}, [el("a", { href: `#/t/class/${c.id}` }, "edit"), " · ",
      el("button", { class: "linkbtn", type: "button", onclick: async () => {
        if (!confirm(`Delete class "${c.name}"? Its students lose access unless they are in another class. Their past results are kept.`)) return;
        try { await deleteClass(c.id); toast("Class deleted."); adminView(user); } catch (e) { toast(errMsg(e), "error"); }
      } }, "delete")])])));
  box.append(classes.length ? t : el("p", { class: "muted" }, "No classes yet."), el("p", {}, el("a", { class: "btn small", href: "#/t/class/new" }, "New class")));

  // bulk paste
  const area = el("textarea", { rows: 8, placeholder: "Class\tNumber\tName\tCName\tEmail\n4A\t12\tChan Tai Man\t陳大文\ts123456@syss.edu.hk\n4A\t13\tChan Siu Ming\t陳小明\ts123457@syss.edu.hk\n5B\t3\tLee Ka Yan\t李嘉欣\ts223344@syss.edu.hk" });
  const mode = el("select", {}, [el("option", { value: "replace" }, "Replace the student list of each class named"),
    el("option", { value: "add" }, "Add these students to the classes named")]);
  const preview = el("div", { class: "muted" });
  const apply = el("button", { class: "btn primary", type: "button", disabled: true }, "Apply");
  let parsed = null;
  const check = el("button", { class: "btn", type: "button" }, "Check");
  check.addEventListener("click", () => {
    parsed = parseRoster(area.value);
    const lines = [...parsed.classes].map(([name, list]) => {
      const ex = classes.find((c) => c.name.toLowerCase() === name.toLowerCase());
      return `${name}: ${list.length} students — ${ex ? (mode.value === "replace" ? `replaces ${ex.studentEmails.length}` : "added to existing class") : "new class"}`;
    });
    preview.replaceChildren(...lines.map((l) => el("div", {}, l)),
      ...(parsed.bad.length ? [el("div", { class: "error" }, `${parsed.bad.length} row(s) skipped (no class name or not a school email): ${parsed.bad.slice(0, 3).join(" | ")}`)] : []));
    apply.disabled = !parsed.classes.size;
  });
  apply.addEventListener("click", async () => {
    apply.disabled = true;
    try {
      for (const [name, list] of parsed.classes) {
        const ex = classes.find((c) => c.name.toLowerCase() === name.toLowerCase());
        await saveClass(ex ? ex.id : null, ex ? ex.name : name, mergeRoster(ex, list, ex ? mode.value : "replace"), user);
      }
      toast(`Saved ${parsed.classes.size} class(es).`);
      adminView(user);
    } catch (e) { toast(errMsg(e), "error"); apply.disabled = false; }
  });
  box.append(el("h3", {}, "Paste class lists"),
    el("p", { class: "muted" }, "Copy the columns Class | Number | Name | CName | Email from Excel or Google Sheets and paste below (the header row is skipped automatically). One student per row; Class and Email alone also work. Teachers then see students as e.g. \"4A 12 Chan Tai Man 陳大文\"."),
    area, el("div", { class: "row" }, [mode, check, apply]), preview);

  // look up one student / rebuild
  const who = el("input", { type: "email", placeholder: "s123456@syss.edu.hk" });
  const whoOut = el("span", { class: "muted" });
  const lookup = el("button", { class: "btn small", type: "button" }, "Check access");
  lookup.addEventListener("click", async () => {
    const e = who.value.trim().toLowerCase();
    if (!e) return;
    const inCls = classes.filter((c) => (c.studentEmails || []).includes(e)).map((c) => c.name);
    const teacher = (await getDoc(doc(db, "teachers", e))).exists();
    whoOut.textContent = teacher ? "Teacher — has access." : inCls.length ? `Has access (classes: ${inCls.join(", ")}).` : "No access — not on any class list.";
  });
  const rebuild = el("button", { class: "btn small", type: "button" }, "Rebuild access list");
  rebuild.addEventListener("click", async () => {
    rebuild.disabled = true;
    try { const r = await api.rebuildMembers({}); toast(`Access list rebuilt: ${r.members} students.`); }
    catch (e) { toast(errMsg(e), "error"); }
    rebuild.disabled = false;
  });
  box.append(el("h3", {}, "Check a student"), el("div", { class: "row" }, [who, lookup, whoOut]),
    el("p", { class: "muted" }, ["The access list updates by itself whenever a class is saved. ", rebuild, " only if something looks out of date."]));
  return box;
}

// ---------------------------------------------------------------- admin: import + teachers
export async function adminView(user) {
  mount(loading());
  const teachersSnap = await getDocs(collection(db, "teachers"));
  const tList = el("ul", {}, teachersSnap.docs.map((d) => el("li", {}, [d.id + " ",
    d.id === user.email ? el("span", { class: "muted" }, "(you)") : el("button", { class: "linkbtn", type: "button", onclick: async () => {
      if (!confirm(`Remove ${d.id} as a teacher?`)) return;
      await deleteDoc(doc(db, "teachers", d.id)); adminView(user);
    } }, "remove")])));
  const newT = el("input", { type: "email", placeholder: "teacher@singyin.edu.hk" });
  const addT = el("button", { class: "btn small", type: "button" }, "Add teacher");
  addT.addEventListener("click", async () => {
    const e = newT.value.trim().toLowerCase();
    if (!emailRe.test(e)) return toast("Enter a school email.", "error");
    try { await setDoc(doc(db, "teachers", e), { addedBy: user.email, addedAt: serverTimestamp() }); adminView(user); }
    catch (err) { toast(errMsg(err), "error"); }
  });

  const bundleIn = el("input", { type: "file", accept: ".json,application/json" });
  const figIn = el("input", { type: "file", accept: "image/*", multiple: true });
  const log = el("pre", { class: "log" });
  const go = el("button", { class: "btn primary", type: "button" }, "Import");
  const say = (m) => { log.textContent += m + "\n"; };
  go.addEventListener("click", async () => {
    if (!bundleIn.files[0]) return toast("Choose bundle.json first.", "error");
    go.disabled = true; log.textContent = "";
    try {
      const bundle = JSON.parse(await bundleIn.files[0].text());
      const needed = new Set(bundle.questions.flatMap((q) => q.figures || []));
      const files = [...figIn.files].filter((f) => needed.has(f.name));
      const missing = [...needed].filter((n) => !files.some((f) => f.name === n));
      if (missing.length) say(`Warning: ${missing.length} figure file(s) not selected, e.g. ${missing[0]}`);
      let i = 0;
      for (const f of files) {
        await uploadBytes(ref(storage, `figures/${f.name}`), f, { contentType: f.type || "image/png" });
        if (++i % 10 === 0 || i === files.length) say(`Uploaded ${i}/${files.length} figures`);
      }
      const ops = [];
      bundle.questions.forEach((q) => {
        ops.push([doc(db, "questions", q.id), { ...q, active: true, importedAt: serverTimestamp() }]);
        ops.push([doc(db, "answerKeys", q.id), { answer: bundle.answers[q.id], solution: (bundle.solutions || {})[q.id] || "" }]);
      });
      ops.push([doc(db, "meta", "topics"), { topics: bundle.topics, books: bundle.books || [], skills: bundle.skills || [], updatedAt: serverTimestamp() }]);
      // practice index: one small document listing every question's book / chapters / subtopics, merged with
      // questions imported earlier, so starting a practice set costs one read instead of one per question
      const old = await getDoc(doc(db, "meta", "questionIndex"));
      const index = {};
      if (old.exists()) Object.assign(index, readQuestionIndex(old.data()));
      else (await getAllQuestions()).forEach((q) => { index[q.id] = { t: q.topic, c: q.chapters || [], s: q.subtopics || [], k: q.skills || [] }; }); // first time: include earlier imports
      bundle.questions.forEach((q) => { index[q.id] = { t: q.topic, c: q.chapters || [], s: q.subtopics || [], k: q.skills || [] }; });
      // stored as one JSON text field: a map with thousands of entries exceeds Firestore's index-entry limit
      ops.push([doc(db, "meta", "questionIndex"), { data: JSON.stringify(index), count: Object.keys(index).length, updatedAt: serverTimestamp() }]);
      for (const part of chunk(ops, 400)) {
        const b = writeBatch(db);
        part.forEach(([r, d]) => b.set(r, d));
        await b.commit();
      }
      say(`Saved ${bundle.questions.length} questions, answer keys and ${Object.keys(bundle.solutions || {}).length} solutions.`);
      toast("Import finished.");
    } catch (e) { say("Error: " + errMsg(e)); toast(errMsg(e), "error"); }
    go.disabled = false;
  });

  const exIn = el("input", { type: "file", accept: ".json,application/json" });
  const exLog = el("p", { class: "muted" });
  const exGo = el("button", { class: "btn primary", type: "button" }, "Import Explain cards");
  exGo.addEventListener("click", async () => {
    if (!exIn.files[0]) return toast("Choose explain_bundle.json first.", "error");
    exGo.disabled = true;
    try { const n = await importExplainBundle(exIn.files[0]); exLog.textContent = `Saved ${n} Explain cards.`; toast("Explain cards imported."); }
    catch (e) { exLog.textContent = "Error: " + errMsg(e); toast(errMsg(e), "error"); }
    exGo.disabled = false;
  });

  const qs = await getDocs(collection(db, "questions"));
  mount(el("section", { class: "narrow" }, [
    el("h1", {}, "Admin"),
    await classesPanel(user),
    el("div", { class: "panel" }, [el("h2", {}, "Teachers"), tList, el("div", { class: "row" }, [newT, addT])]),
    el("div", { class: "panel" }, [el("h2", {}, "Import questions"),
      el("p", { class: "muted" }, `${qs.size} questions on the platform now. Choose bundle.json and all files in its figures folder (made by platform_prep/export_for_platform.py). Re-importing updates questions with the same id.`),
      el("label", {}, ["bundle.json", bundleIn]), el("label", {}, ["Figure files", figIn]), go, log]),
    el("div", { class: "panel" }, [el("h2", {}, "Import Explain cards"),
      el("p", { class: "muted" }, "Choose explain_bundle.json (made by platform_prep/export_explain_cards.py). Importing again replaces all cards; students keep their read marks."),
      el("label", {}, ["explain_bundle.json", exIn]), exGo, exLog]),
  ]));
}
