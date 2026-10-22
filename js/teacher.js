import { db, storage, api } from "./fb.js";
import { collection, doc, getDoc, getDocs, addDoc, setDoc, deleteDoc, updateDoc, query, where, orderBy,
  documentId, serverTimestamp, Timestamp, writeBatch } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import { ref, uploadBytes } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-storage.js";
import { el, mount, loading, toast, errMsg, fmtDate, toDate, pct, chunk, typeset } from "./ui.js";
import { getAllQuestions, getQuestions, getTopics, renderQuestion, sourceLabel } from "./questions.js";
import { isSchoolEmail } from "./config.js";
import { importExplainBundle } from "./explain.js";
import { parseRow, rosterOf, studentLabel, sortByRoster, mergeRoster, attachRosters, attachRoster, saveClass, deleteClass } from "./roster.js";

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
      el("a", { class: "btn", href: "#/t/bank" }, "Browse questions"),
      el("a", { class: "btn", href: "#/t/explain" }, "Explain reading"),
      el("a", { class: "btn", href: "#/t/admin" }, "Admin"),
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
      ]),
    ]);
    const asg = await listAssignments(c.id);
    if (!asg.length) box.append(el("p", { class: "muted" }, "No assignments."));
    else {
      const t = el("table", { class: "grid" }, [el("tr", {}, ["Assignment", "Questions", "Due", ""].map((h) => el("th", {}, h)))]);
      asg.forEach((a) => t.append(el("tr", {}, [el("td", {}, a.title), el("td", {}, String(a.questionIds.length)),
        el("td", {}, fmtDate(a.dueAt)), el("td", {}, el("a", { href: `#/t/results/${c.id}/${a.id}` }, "Results"))])));
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
function questionFilters(questions, topics, onChange) {
  const topicSel = el("select", {}, [el("option", { value: "" }, "All topics")].concat(Object.keys(topics).map((t) => el("option", { value: t }, t))));
  const subSel = el("select", {}, [el("option", { value: "" }, "All subtopics")]);
  const forms = [...new Set(questions.map((q) => q.form))].sort();
  const formSel = el("select", {}, [el("option", { value: "" }, "All forms")].concat(forms.map((f) => el("option", { value: f }, f))));
  const search = el("input", { type: "search", placeholder: "Search text…" });
  topicSel.addEventListener("change", () => {
    subSel.replaceChildren(el("option", { value: "" }, "All subtopics"), ...(topics[topicSel.value] || []).map((s) => el("option", { value: s }, s)));
    onChange();
  });
  [subSel, formSel].forEach((s) => s.addEventListener("change", onChange));
  search.addEventListener("input", onChange);
  const strip = (h) => (h || "").replace(/<[^>]+>/g, " ").toLowerCase();
  const apply = () => questions.filter((q) =>
    (!topicSel.value || q.topic === topicSel.value) &&
    (!subSel.value || (q.subtopics || []).includes(subSel.value)) &&
    (!formSel.value || q.form === formSel.value) &&
    (!search.value || strip(q.textHtml).includes(search.value.toLowerCase())));
  return { node: el("div", { class: "row" }, [topicSel, subSel, formSel, search]), apply };
}

function snippet(q) {
  const t = (q.textHtml || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > 140 ? t.slice(0, 140) + "…" : t;
}

export async function bankView(user) {
  mount(loading());
  const [questions, topics] = await Promise.all([getAllQuestions(), getTopics()]);
  const listBox = el("div", {});
  const count = el("p", { class: "muted" });
  const f = questionFilters(questions, topics, () => draw());
  function draw() {
    const qs = f.apply();
    count.textContent = `${qs.length} of ${questions.length} questions`;
    listBox.replaceChildren(...qs.slice(0, 200).map((q, i) => renderQuestion(q, { number: i + 1 })));
    typeset(listBox);
  }
  mount(el("section", {}, [el("h1", {}, "Question bank"), f.node, count, listBox]));
  draw();
}

// ---------------------------------------------------------------- assignment builder
export async function assignmentBuilder(user, presetClassId) {
  mount(loading());
  const [classes, questions, topics] = await Promise.all([listClasses(), getAllQuestions(), getTopics()]);
  if (!classes.length) return mount(el("section", {}, [el("p", {}, "Create a class first."), el("a", { class: "btn", href: "#/t/class/new" }, "New class")]));
  const selected = [];
  const classSel = el("select", {}, classes.map((c) => el("option", { value: c.id, selected: c.id === presetClassId }, c.name)));
  const title = el("input", { type: "text", placeholder: "e.g. Kinematics homework 1" });
  const due = new Date(); due.setDate(due.getDate() + 7); due.setHours(23, 59, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const dueInput = el("input", { type: "datetime-local",
    value: `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}` });
  const reveal = el("select", {}, [el("option", { value: "after_submit" }, "Show answers right after submitting"),
    el("option", { value: "after_due" }, "Show answers after the due date")]);

  const selBox = el("ol", { class: "sellist" });
  const selCount = el("strong", {});
  const listBox = el("div", { class: "picklist" });
  const shown = el("p", { class: "muted" });
  const f = questionFilters(questions, topics, () => drawList());
  const randN = el("input", { type: "number", min: 1, max: 40, value: 5, style: "width:5em" });

  function drawSelected() {
    selCount.textContent = `${selected.length} selected`;
    selBox.replaceChildren(...selected.map((id) => {
      const q = questions.find((x) => x.id === id);
      return el("li", {}, [el("span", {}, `${q.topic} · ${sourceLabel(q)} `),
        el("button", { class: "linkbtn", type: "button", onclick: () => { selected.splice(selected.indexOf(id), 1); drawSelected(); drawList(); } }, "remove")]);
    }));
  }
  function drawList() {
    const qs = f.apply();
    shown.textContent = `${qs.length} questions match`;
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
        else { preview.replaceChildren(renderQuestion(q, {})); typeset(preview); }
      });
      return el("div", { class: "pickrow" }, [el("label", { class: "pick" }, [box,
        el("span", {}, [el("strong", {}, `${q.topic} · ${(q.subtopics || [])[0] || ""}`), el("br"), el("span", { class: "muted" }, `${sourceLabel(q)} — ${snippet(q)}`)])]),
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
      el("label", {}, ["Due", dueInput]), el("label", {}, ["Answers", reveal]),
    ]),
    el("div", { class: "builder" }, [
      el("div", { class: "panel" }, [el("h2", {}, "Choose questions"), f.node,
        el("div", { class: "row" }, [shown, randN, randBtn]), listBox]),
      el("div", { class: "panel sticky" }, [el("h2", {}, ["Selected ", selCount]), selBox, save]),
    ]),
  ]));
  drawSelected(); drawList();
}

// ---------------------------------------------------------------- results
export async function resultsView(user, classId, assignmentId) {
  mount(loading());
  const [cSnap, aSnap] = await Promise.all([getDoc(doc(db, "classes", classId)), getDoc(doc(db, "classes", classId, "assignments", assignmentId))]);
  if (!cSnap.exists() || !aSnap.exists()) return mount(el("p", { class: "error" }, "Not found."));
  const cls = await attachRoster(cSnap.data(), classId), a = aSnap.data();
  const qids = a.questionIds;
  const [questions, attemptsSnap] = await Promise.all([
    getQuestions(qids),
    getDocs(query(collection(db, "attempts"), where("assignmentId", "==", assignmentId))),
  ]);
  const answers = {};
  for (const part of chunk(qids, 30)) {
    (await getDocs(query(collection(db, "answerKeys"), where(documentId(), "in", part)))).forEach((d) => (answers[d.id] = d.data().answer));
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
    const cells = [el("td", { class: "nowrap" }, studentLabel(cls, email, at && at.name))];
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
    qBox.append(renderQuestion(q, { number: i + 1, review: { answer: answers[q.id], correct: true } }));
    qBox.lastChild.append(el("div", { class: "muted" }, [`Chosen by students — `, bars]));
  });
  qBox.querySelectorAll(".fb").forEach((n) => n.remove());

  mount(el("section", {}, [
    el("h1", {}, a.title), el("p", { class: "muted" }, `${cls.name} · due ${fmtDate(a.dueAt)} · answers ${a.reveal === "after_due" ? "after due date" : "after submitting"}`),
    el("div", { class: "row" }, [csv, el("a", { class: "btn small", href: "#/t" }, "Back")]),
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
        ops.push([doc(db, "answerKeys", q.id), { answer: bundle.answers[q.id] }]);
      });
      ops.push([doc(db, "meta", "topics"), { topics: bundle.topics, updatedAt: serverTimestamp() }]);
      for (const part of chunk(ops, 400)) {
        const b = writeBatch(db);
        part.forEach(([r, d]) => b.set(r, d));
        await b.commit();
      }
      say(`Saved ${bundle.questions.length} questions and answer keys.`);
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
