// End-to-end test of the web app + Cloud Functions against an in-memory Firebase (no network needed).
// Needs the trial bundle at ../../platform_prep/export/trial/bundle.json
import { register, createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
register("./fakes/hooks.mjs", import.meta.url);

import { fileURLToPath } from "node:url";
import { dirname, resolve as pathResolve } from "node:path";
// Run from learning-platform/tests:  npm install && node run.mjs
const ROOT = pathResolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const html = readFileSync(`${ROOT}/learning-platform/index.html`, "utf8").replace(/<script[\s\S]*?<\/script>/g, "");
const dom = new JSDOM(html, { url: "http://localhost/index.html", pretendToBeVisual: true });
const w = dom.window;
const NodeFile = globalThis.File;
for (const k of ["window", "document", "location", "localStorage", "sessionStorage", "navigator", "HTMLElement", "Event", "history"]) {
  try { globalThis[k] = k === "window" ? w : w[k]; } catch {}
}
w.scrollTo = () => {}; globalThis.confirm = w.confirm = () => true; globalThis.alert = w.alert = () => {};
w.URL.createObjectURL = () => "blob:x"; globalThis.URL.createObjectURL = () => "blob:x";
const errors = [];
w.console.error = (...a) => errors.push(a.join(" "));
process.on("unhandledRejection", (e) => errors.push("unhandled: " + (e?.message || e)));

const { fake, Timestamp } = await import("./fakes/core.mjs");
// seed
const bundle = JSON.parse(readFileSync(`${ROOT}/platform_prep/export/trial/bundle.json`, "utf8"));
for (const q of bundle.questions) fake.store.set(`questions/${q.id}`, { ...q, active: true });
const PNG1 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="; // 1x1 png
// every trial question gets a worked solution, except one (questions without a solution still work)
const noSol = Object.keys(bundle.answers)[0];
for (const [id, a] of Object.entries(bundle.answers)) fake.store.set(`answerKeys/${id}`, id === noSol ? { answer: a } : { answer: a, solution: `<p><b>Key idea:</b> worked solution for ${id} $x^2$</p><p class="sol-fig"><img src="data:image/png;base64,${PNG1}" alt="Solution figure"></p>` });
fake.store.set("meta/topics", process.env.NOMETABOOKS ? { topics: bundle.topics } : { topics: bundle.topics, books: bundle.books });   // as the Admin import writes it (NOMETABOOKS: an older import without the book list)
fake.store.set("teachers/teacher@singyin.edu.hk", {});
const explain = JSON.parse(readFileSync(`${ROOT}/platform_prep/export/explain/explain_bundle.json`, "utf8"));
if (process.env.NOBOOKS) delete explain.books;   // bundle imported without its book list
// an Explain bundle imported before the Chinese chapter names were dropped still carries them: they must not show
explain.cards.forEach((c) => { c.chapterZh = "中文"; });
(explain.books || []).forEach((b) => { b.zh = "中文"; b.chapters.forEach((ch) => { ch.zh = "中文"; }); });
for (const q of bundle.questions) for (const f of q.figures) fake.files.set(`figures/${f}`, "png");

// cloud functions
const require = createRequire(import.meta.url);
const Module = require("module");
const fakesAdmin = require("./fakes/admin.cjs");
const origLoad = Module._load;
Module._load = function (req, ...rest) { return fakesAdmin[req] || origLoad.call(this, req, ...rest); };
fake.handlers = require(`${ROOT}/learning-platform/functions/index.js`);
fake.afterWrite = async (path, before, after) => {
  const m = path.match(/^classes\/([^/]+)$/);
  if (!m) return;
  const snap = (d) => ({ exists: d !== undefined, data: () => d });
  await fake.handlers.syncMembers.run({ params: { classId: m[1] }, data: { before: snap(before), after: snap(after) } });
};

// helpers
const $ = (s) => w.document.querySelector(s);
const $$ = (s) => [...w.document.querySelectorAll(s)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, what, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await sleep(20); }
  throw new Error(`Timed out waiting for: ${what}\nPage: ${$("#app").textContent.slice(0, 400)}\nToast: ${$("#toast").textContent}`);
}
const go = async (h) => { w.location.hash = h; await sleep(60); };
const byText = (sel, t) => $$(sel).find((e) => e.textContent.trim().includes(t));
const set = (el, v) => { el.value = v; el.dispatchEvent(new w.Event("input")); el.dispatchEvent(new w.Event("change")); };
let passed = 0;
const ok = (cond, msg) => { if (!cond) throw new Error("FAIL: " + msg); passed++; console.log("  ✓", msg); };

const T = { uid: "t1", email: "teacher@singyin.edu.hk", name: "Ms Teacher" };
const S1 = { uid: "s1", email: "s001@syss.edu.hk", name: "Student One" };
const S2 = { uid: "s2", email: "s002@syss.edu.hk", name: "Student Two" };
const X = { uid: "x1", email: "someone@gmail.com", name: "Outsider" };

console.log("1. outsider is rejected");
fake.user = X;
await import(`${ROOT}/learning-platform/js/app.js`);
await waitFor(() => byText("p.error", "not a school account"), "outsider message");
ok(fake.user === null, "non-school account is signed out");

console.log("2. teacher creates a class");
fake.setUser(T);
await waitFor(() => byText("h1", "Teacher dashboard"), "teacher home");
ok(byText("#nav a", "Classes") && byText(".seg a", "Student") && $('#nav .dd a[href="#/t/paper"]'), "teacher top bar: Classes, Questions menu, teacher/student switch");
await go("#/t/class/new");
await waitFor(() => $("textarea"), "class form");
set($("input[type=text]"), "4A Physics");
set($("textarea"), "S001@syss.edu.hk\nnot-an-email@gmail.com");
byText("button", "Save class").click(); await sleep(50);
ok(/without a school email/.test($("#toast").textContent), "rejects non-school emails");
set($("textarea"), "S001@syss.edu.hk\ns002@syss.edu.hk, s003@syss.edu.hk");
byText("button", "Save class").click();
await waitFor(() => byText("h1", "Teacher dashboard"), "back to dashboard");
const cls = [...fake.store.entries()].find(([p]) => /^classes\/[^/]+$/.test(p));
const classId = cls[0].split("/")[1];
ok(JSON.stringify(cls[1].studentEmails) === JSON.stringify(["s001@syss.edu.hk", "s002@syss.edu.hk", "s003@syss.edu.hk"]), "class saved with lower-cased emails");
ok(fake.store.has("members/s001@syss.edu.hk") && fake.store.has("members/s003@syss.edu.hk"), "saving a class puts its students on the access list");

console.log("3. teacher builds two assignments");
await go("#/t/assign");
await waitFor(() => $$(".pickrow").length, "question list");
ok($$(".pickrow").length === 100, "all 100 questions listed");
const [bookSel, chSel] = $$(".builder select");
ok([...chSel.querySelectorAll("optgroup")].some((g) => g.label.startsWith("Book 2 Force and Motion")) && [...chSel.options].some((o) => o.textContent === "Ch 9 Momentum"), "chapter filter lists textbook chapters by book");
set(chSel, "9");
await sleep(20);
const n9 = bundle.questions.filter((q) => (q.chapters || []).includes("9")).length;
ok(n9 > 0 && $$(".pickrow").length === n9, `chapter filter works (${n9} in Ch 9 Momentum)`);
ok([...$$(".builder select")[2].options].slice(1).every((o) => o.closest("optgroup").label.startsWith("Ch 9 ")), "choosing a chapter narrows the subtopics to that chapter");
set(chSel, "");
set(bookSel, "Force and Motion");
await sleep(20);
ok($$(".pickrow").length === 30, "book filter works (30 Force and Motion)");
ok([...chSel.querySelectorAll("optgroup")].length === 1 && chSel.querySelector("optgroup").label.startsWith("Book 2"), "choosing a book narrows the chapters to that book");
set($$(".builder select")[2], "Kinematics");
const kin = $$(".pickrow").length;
ok(kin > 0 && kin < 30, `subtopic filter works (${kin} Kinematics)`);
{ // skill filter (combined with the book / subtopic choice)
  const skSel = $(".builder .skill-filter");
  ok(skSel && [...skSel.options].length === 10, "skill menu lists the 9 skills");
  set(skSel, "Conceptual understanding"); await sleep(20);
  const nk = bundle.questions.filter((q) => q.topic === "Force and Motion" && q.subtopics.includes("Kinematics") && (q.skills || []).includes("Conceptual understanding")).length;
  ok($$(".pickrow").length === nk, `skill filter works (${nk} Kinematics questions testing conceptual understanding)`);
  set(skSel, ""); await sleep(20);
}
$$(".pickrow input[type=checkbox]").slice(0, 3).forEach((c) => { c.checked = true; c.dispatchEvent(new w.Event("change")); });
ok(/\(3\)/.test($(".sticky h2").textContent), "3 selected");
byText(".pickrow button", "preview").click(); await sleep(20);
ok($(".preview .qcard"), "preview renders");
set($$(".builder select")[2], "");
byText("button", "Add random from filter").click();
ok(/\(8\)/.test($(".sticky h2").textContent), "random add 5 more");
set($$(".formgrid input")[0], "Kinematics HW1");
byText("button", "Create assignment").click();
await waitFor(() => byText("h1", "Teacher dashboard"), "dashboard after create");
let asg = [...fake.store.entries()].filter(([p]) => p.includes("/assignments/"));
ok(asg.length === 1 && asg[0][1].questionIds.length === 8, "assignment saved with 8 questions");
const a1 = asg[0][0].split("/").pop(), qids1 = asg[0][1].questionIds;
// second assignment: answers after due date
await go("#/t/assign/" + classId);
await waitFor(() => $$(".pickrow").length, "list");
$$(".pickrow input[type=checkbox]").slice(10, 12).forEach((c) => { c.checked = true; c.dispatchEvent(new w.Event("change")); });
set($$(".formgrid input")[0], "Quiz with hidden answers");
set($$(".formgrid select")[1], "after_due");
byText("button", "Create assignment").click();
await waitFor(() => byText("h1", "Teacher dashboard"), "dashboard");
asg = [...fake.store.entries()].filter(([p]) => p.includes("/assignments/"));
const a2 = asg.find(([, d]) => d.reveal === "after_due")[0].split("/").pop();
ok(asg.length === 2, "second assignment saved");

console.log("4. student does an assignment");
fake.setUser(S1);
await waitFor(() => byText("h1", "Hello"), "student home");
await waitFor(() => byText("a.btn", "Start"), "assignment list");
ok($$("table.grid tr").length >= 3, "student sees both assignments");
ok(byText(".points-panel h2", "Earn leaderboard points") && $$(".points-panel .pt-item").length === 4 && byText(".points-panel", "300"), "home page explains how to earn points");
await waitFor(() => byText("#nav a.on .navbadge", "due"), "due badge");
ok(/^\d+ due$/.test($("#nav .navbadge").textContent) && !$(".seg") && !byText("#nav a", "Classes"), "student top bar: Home shows assignments due, no teacher items");
ok($$("#tabbar a").length === 5 && byText("#tabbar a", "Practise"), "phone tab bar has the five student links");
await go(`#/do/${classId}/${a1}`);
await waitFor(() => $$(".qcard").length === 8, "8 questions");
ok($$("img.figure").length === qids1.filter((id) => fake.store.get(`questions/${id}`).figures.length).length, "figures rendered");
// answer: first 4 correct, next 3 wrong, last blank
const key = Object.fromEntries(qids1.map((id) => [id, fake.store.get(`answerKeys/${id}`).answer]));
for (let i = 0; i < 7; i++) {
  const id = qids1[i];
  const want = i < 4 ? key[id] : ["A", "B", "C", "D"].find((k) => k !== key[id]);
  const card = $(`#q-${CSS_escape(id)}`);
  [...card.querySelectorAll(".opt")].find((b) => b.querySelector(".optkey").textContent === want).click();
  await sleep(5);
}
function CSS_escape(s) { return s.replace(/\./g, "\\."); }
ok(/7 of 8 answered/.test($(".submitbar").textContent), "answered counter");
ok(JSON.parse(w.localStorage.getItem(`resp-asg-${a1}`))[qids1[0]], "progress saved locally");
byText("button", "Submit answers").click();
await waitFor(() => $(".scorebox"), "score");
ok($(".score").textContent === "4 / 8", "score 4/8");
ok($$(".opt.right").length === 8 && $$(".opt.wrong").length === 3, "review highlights right/wrong");
ok($$(".qcard .solution").length === qids1.filter((id) => id !== noSol).length && byText(".solution", "worked solution for " + qids1.find((id) => id !== noSol)), "solutions shown after submitting");
ok($$(".qcard .solution .sol-fig img").length === $$(".qcard .solution").length && $(".qcard .solution .sol-fig img").getAttribute("src").startsWith("data:image/png"), "solution figures (data: images) survive sanitising");
const at = fake.store.get(`attempts/${a1}_s1`);
ok(at && at.score === 4 && at.total === 8 && !at.late, "attempt stored server-side");
ok(!w.localStorage.getItem(`resp-asg-${a1}`), "local progress cleared");

console.log("5. student cannot cheat");
const fs = await import("./fakes/firestore.mjs");
let denied = false; try { await fs.getDoc(fs.doc({ __db: true }, "answerKeys", qids1[0])); } catch (e) { denied = /permission/.test(e.message); }
ok(denied, "student cannot read answer keys");
denied = false; try { await fs.setDoc(fs.doc({ __db: true }, "attempts", "fake"), { uid: "s1", score: 99 }); } catch (e) { denied = /permission/.test(e.message); }
ok(denied, "student cannot write attempts");
const VER = (readFileSync(`${ROOT}/learning-platform/js/app.js`, "utf8").match(/fb\.js(\?v=\w+)?"/) || [])[1] || "";
const { api } = await import(`${ROOT}/learning-platform/js/fb.js${VER}`);   // same module instance as the app
let again = ""; try { await api.submitAnswers({ classId, assignmentId: a1, responses: {} }); } catch (e) { again = e.message; }
ok(/already submitted/.test(again), "cannot submit twice");
let notIn = ""; fake.user = { uid: "s9", email: "s009@syss.edu.hk", name: "x" };
try { await api.submitAnswers({ classId, assignmentId: a1, responses: {} }); } catch (e) { notIn = e.message; }
ok(/not in this class|only for SYSS Physics students|Ask your physics teacher/.test(notIn), "non-member cannot submit");
fake.user = S1;

console.log("6. hidden-answer assignment");
await go(`#/do/${classId}/${a2}`);
await waitFor(() => $$(".qcard").length === 2, "2 questions");
$$(".qcard")[0].querySelector(".opt").click(); await sleep(5);
byText("button", "Submit answers").click();
await waitFor(() => $(".scorebox"), "score");
ok(byText(".notice", "after the due date"), "answers withheld until due date");
ok(!$$(".opt.right").length, "no answer highlighted");
ok(!$$(".solution").length, "no solution shown before the due date");
await go(`#/review/${a2}_s1`);
await waitFor(() => $(".scorebox"), "review page");
ok(byText(".notice", "after the due date") && !$$(".opt.right").length, "review also withholds answers");
// move due date into the past -> answers released
const p2 = [...fake.store.keys()].find((p) => p.endsWith(`/assignments/${a2}`));
fake.store.get(p2).dueAt = Timestamp.fromMillis(Date.now() - 1000);
await go("#/history"); await go(`#/review/${a2}_s1`);
await waitFor(() => $$(".opt.right").length === 2, "answers after due");
ok(true, "answers released after due date");
ok($$(".solution").length === fake.store.get(p2).questionIds.filter((id) => id !== noSol).length, "solutions released with the answers");
{ // "hide until I release them": nothing shown until the teacher releases
  const qm = Object.keys(bundle.answers).slice(20, 22);
  fake.store.set(`classes/${classId}/assignments/manual1`, { title: "Released by teacher", questionIds: qm, reveal: "manual",
    dueAt: Timestamp.fromMillis(Date.now() - 1000), createdBy: T.email });
  const r = await api.submitAnswers({ classId, assignmentId: "manual1", responses: { [qm[0]]: "A" } });
  ok(r.revealed === false && !r.answers && !r.solutions, "manual: nothing revealed on submit, even after the due date");
  await go("#/history"); await go(`#/review/manual1_s1`);
  await waitFor(() => $(".scorebox"), "manual review");
  ok(byText(".notice", "when your teacher releases") && !$$(".solution").length, "manual: student told to wait for the teacher");
  fake.store.get(`classes/${classId}/assignments/manual1`).released = true;
  const r2 = await api.getReview({ attemptId: "manual1_s1" });
  ok(r2.revealed && r2.answers[qm[0]] && Object.keys(r2.solutions).length === 2, "manual: answers and solutions after the teacher releases");
}

console.log("7. practice");
await go("#/practise");
await waitFor(() => byText("button", "Start practice"), "practice panel");
const sels = $$(".panel select");
ok($(".panel .skill-filter"), "practice panel has a skill menu");
set(sels[0], "Wave Motion"); set(sels[4], "5");
byText("button", "Start practice").click();
await waitFor(() => $$(".qcard").length === 5, "5 practice questions");
ok($$(".qsrc").every((e) => e.textContent.startsWith("Wave Motion")), "practice respects topic");
{ // practice by textbook chapter (through the Cloud Function)
  const ch = bundle.questions.find((q) => (q.chapters || []).length).chapters[0];
  const r = await api.startPractice({ chapter: ch, count: 20 });
  ok(r.questionIds.length && r.questionIds.every((id) => bundle.questions.find((q) => q.id === id).chapters.includes(ch)), `practice by chapter only gives Ch ${ch} questions`);
}
$$(".qcard").forEach((c) => c.querySelector(".opt").click()); await sleep(10);
byText("button", "Submit answers").click();
await waitFor(() => $(".scorebox"), "practice score");
ok($$(".opt.right").length === 5, "practice shows answers");
ok($$(".qcard .solution").length >= 4, "practice shows solutions");
const pat = [...fake.store.entries()].find(([p, d]) => p.startsWith("attempts/practice_"));
ok(pat && pat[1].total === 5 && pat[1].uid === "s1", "practice attempt stored");
// practice excludes questions in open assignments
fake.store.get(p2).dueAt = Timestamp.fromMillis(Date.now() + 86400000);
const blockedIds = new Set(fake.store.get(p2).questionIds);
let leak = false;
for (let i = 0; i < 15; i++) { const r = await api.startPractice({ count: 20 }); if (r.questionIds.some((id) => blockedIds.has(id))) leak = true; }
ok(!leak, "practice never serves questions from open assignments");

console.log("8. history");
await go("#/history");
await waitFor(() => byText("h1", "My results"), "history");
ok($$("table.grid tr").length === 5, "history lists 4 attempts");

console.log("8b. redo my mistakes");
{
  // what the server should offer: last visible answer per question is wrong/blank; hidden assignments don't count
  const canSee = (d) => {
    if (d.mode !== "assignment") return true;
    const a = fake.store.get(`classes/${d.classId}/assignments/${d.assignmentId}`);
    if (!a) return false;
    if (a.released === true) return true;
    const mode = a.reveal || "after_submit";
    return mode === "after_submit" || (mode === "after_due" && (!a.dueAt || a.dueAt.toMillis() <= Date.now()));
  };
  const expected = () => {
    const last = new Map();
    [...fake.store.entries()].filter(([p, d]) => p.startsWith("attempts/") && d.uid === "s1")
      .map(([, d]) => d).sort((a, b) => a.submittedAt.toMillis() - b.submittedAt.toMillis())
      .forEach((d) => { if (canSee(d)) d.questionIds.forEach((q) => last.set(q, (d.responses || {})[q] || "")); });
    return new Set([...last].filter(([q, r]) => r !== bundle.answers[q]).map(([q]) => q));
  };
  const hiddenOnly = new Set();
  [...fake.store.entries()].filter(([p, d]) => p.startsWith("attempts/") && d.uid === "s1" && !canSee(d)).forEach(([, d]) => d.questionIds.forEach((q) => hiddenOnly.add(q)));
  expected().forEach((q) => hiddenOnly.delete(q));
  const openIds = new Set();
  [...fake.store.entries()].filter(([p, d]) => /^classes\/[^/]+\/assignments\//.test(p) && d.dueAt && d.dueAt.toMillis() > Date.now()
    && (fake.store.get(p.split("/assignments/")[0]).studentEmails || []).includes("s001@syss.edu.hk")).forEach(([, d]) => d.questionIds.forEach((q) => openIds.add(q)));
  const pv = await api.startMistakes({ preview: true });
  const exp = [...expected()].filter((q) => !openIds.has(q));
  ok(pv.available === exp.length && pv.available > 0, `preview counts the questions to redo (${pv.available})`);
  ok(Object.values(pv.byTopic).reduce((a, b) => a + b, 0) === pv.available, "preview splits them by book");
  const r = await api.startMistakes({ count: 20 });
  ok(r.questionIds.length === Math.min(20, exp.length) && r.questionIds.every((q) => exp.includes(q)), "set contains only questions answered wrongly last time");
  ok(!r.questionIds.some((q) => openIds.has(q)), "set leaves out questions in open assignments");
  ok(!r.questionIds.some((q) => hiddenOnly.has(q) && !exp.includes(q)), "answers still hidden in an assignment are not used");
  const book = Object.keys(pv.byTopic)[0];
  const rb = await api.startMistakes({ topic: book, count: 20 });
  ok(rb.questionIds.every((q) => bundle.questions.find((x) => x.id === q).topic === book), "set can be limited to one book");
  // through the page
  await go("#/practise");
  await waitFor(() => { const b = byText("button", "Redo my mistakes"); return b && !b.disabled; }, "redo button");
  byText("button", "Redo my mistakes").click();
  await waitFor(() => byText("h1", "Redo my mistakes") && $$(".qcard").length, "redo quiz page");
  ok($$(".qcard").length === Math.min(10, pv.available), "redo page shows the set");
  await go("#/");
  // answer the set correctly: those questions drop off the list
  const right = Object.fromEntries(r.questionIds.map((q) => [q, bundle.answers[q]]));
  const res = await api.submitAnswers({ sessionId: r.sessionId, responses: right });
  ok(res.score === r.questionIds.length, "redo set is marked like practice");
  const at = fake.store.get(`attempts/practice_${r.sessionId}`);
  ok(at.title === "Redo my mistakes" && at.kind === "mistakes", "redo attempt is saved with its own title");
  const pv2 = await api.startMistakes({ preview: true });
  ok(pv2.available === pv.available - r.questionIds.length, "questions answered correctly leave the list");
  await go("#/history"); await go("#/practise");
  await waitFor(() => byText(".mistakes p", "No mistakes to redo"), "empty redo panel");
  ok($(".mistakes .row").style.display === "none", "nothing to redo: the panel says so and hides the button");
}

console.log("8c. leaderboard");
{
  const bonus = (a) => a.total >= 5 ? (a.score / a.total >= 0.9 ? 500 : a.score / a.total >= 0.75 ? 200 : 0) : 0;
  const pAtts = [...fake.store.entries()].filter(([p, d]) => p.startsWith("attempts/practice_") && d.uid === "s1").map(([, d]) => d);
  const aAtts = [...fake.store.entries()].filter(([p, d]) => !p.startsWith("attempts/practice_") && p.startsWith("attempts/") && d.uid === "s1").map(([, d]) => d);
  const expPts = [...pAtts, ...aAtts].reduce((t, a) => t + a.score * 100 + bonus(a), 0);
  const lbs = [...fake.store.entries()].filter(([p]) => p.startsWith("leaderboards/"));
  ok(lbs.length === 3 && lbs.every(([, d]) => d.form === "F4"), "practice points go to the F4 week, month and all-time boards");
  ok(aAtts.length >= 2 && fake.store.get("leaderboards/F4_all").scores.s1.pts === expPts, `all-time points match the practice and assignment results (${expPts})`);
  ok(lbs.every(([, d]) => d.scores.s1.sets === pAtts.length && d.scores.s1.asg === aAtts.length), "each practice set and each assignment counted once");
  const before = fake.store.get("leaderboards/F4_all").scores.s1.pts;
  const r = await api.startPractice({ count: 5 });
  const res = await api.submitAnswers({ sessionId: r.sessionId, responses: Object.fromEntries(r.questionIds.map((q) => [q, bundle.answers[q]])) });
  ok(res.points === 1000 && fake.store.get("leaderboards/F4_all").scores.s1.pts === before + 1000, "perfect 5-question set: 5 × 100 + 500 bonus");
  ok(!res.checkinBonus, "no check-in bonus for a second set on the same day");
  const r2 = await api.startPractice({ count: 5 });
  const res2 = await api.submitAnswers({ sessionId: r2.sessionId, responses: {} });
  ok(res2.points === undefined || res2.points === 0, "a blank set earns nothing");
  await go("#/practise"); await waitFor(() => byText("button", "Start practice"), "practise page");
  ok([...$$(".panel select")].some((sel) => [...sel.options].some((o) => o.value === "3")), "3-question sets can be chosen");
  const r3 = await api.startPractice({ count: 3 });
  const res3 = await api.submitAnswers({ sessionId: r3.sessionId, responses: Object.fromEntries(r3.questionIds.map((q) => [q, bundle.answers[q]])) });
  ok(res3.points === 300, "3 correct answers: 300 points (no accuracy bonus for sets under 5)");
  // check-in bonus: two earlier active days this week + a new day today
  const today = Object.keys(Object.fromEntries(fake.store)).find((p) => p.startsWith("activity/s1_"));
  const wk = fake.store.get(today).week;
  fake.store.delete(today);
  fake.store.set("activity/s1_1999-01-01", { uid: "s1", email: "s001@syss.edu.hk", day: "1999-01-01", week: wk, practice: true });
  fake.store.set("activity/s1_1999-01-02", { uid: "s1", email: "s001@syss.edu.hk", day: "1999-01-02", week: wk, practice: true });
  const pBefore = fake.store.get("leaderboards/F4_week_" + wk).scores.s1.pts;
  const r4 = await api.startPractice({ count: 3 });
  const res4 = await api.submitAnswers({ sessionId: r4.sessionId, responses: {} });
  ok(res4.checkinBonus === 500 && fake.store.get("leaderboards/F4_week_" + wk).scores.s1.pts === pBefore + 500 && fake.store.get("leaderboards/F4_all").scores.s1.bonus === 1, "3rd active day in a week: +500 check-in bonus");
  fake.store.delete(Object.keys(Object.fromEntries(fake.store)).find((p) => p.startsWith("activity/s1_2")));
  const res5 = await api.submitAnswers({ sessionId: (await api.startPractice({ count: 3 })).sessionId, responses: {} });
  ok(!res5.checkinBonus, "the check-in bonus is given only once a week");
  await go("#/leaderboard");
  await waitFor(() => byText(".leaderboard h2", "F4 leaderboard") && $(".leaderboard table"), "student leaderboard");
  ok($('#nav a.on[href="#/leaderboard"]') && $('#nav a.on').getAttribute("aria-current") === "page", "top bar highlights the current page");
  await waitFor(() => /4A · \d+ pts/.test($(".chip-pts")?.textContent || ""), "points chip");
  ok(true, "top bar shows the student's class and points");
  ok($(".leaderboard tr.me") && byText(".leaderboard tr.me", "4A"), "student sees the board with their own row highlighted");
  const lb = await api.getLeaderboard({ period: "all" });
  ok(lb.rows.length <= 10 && lb.rows.every((x) => !("email" in x)) && lb.me && lb.me.pts === fake.store.get("leaderboards/F4_all").scores.s1.pts, "students get the top 10 and their own rank, without emails");
  ok((await api.getLeaderboard({ period: "all", form: "F5" })).form === "F4", "students only see their own form");
  byText(".leaderboard .tab", "This month").click();
  await waitFor(() => $(".leaderboard .tab.on") && $(".leaderboard .tab.on").textContent === "This month" && $(".leaderboard table"), "month tab");
  ok(true, "period tabs switch between week, month and all time");
  let denied = false; try { await fs.getDoc(fs.doc({ __db: true }, "leaderboards", "F4_all")); } catch (e) { denied = /permission/.test(e.message); }
  ok(denied, "students cannot read the raw leaderboard data");
  // teacher view + recount
  fake.setUser(T); await sleep(50);
  await go("#/t/leaderboard");
  await waitFor(() => byText("h1", "Leaderboard") && $("table.board"), "teacher leaderboard");
  ok(byText("table.board", "s001@syss.edu.hk") && byText("table.board", String(fake.store.get("leaderboards/F4_all").scores.s1.pts)), "teacher sees the full list with emails");
  fake.store.get("leaderboards/F4_all").scores.s1.pts = 1;           // corrupt, then recount from the results
  const rb = await api.rebuildLeaderboards({});
  const allSets = [...fake.store.entries()].filter(([p, d]) => p.startsWith("attempts/") && d.uid === "s1" && (d.mode === "practice" || d.mode === "assignment")).map(([, d]) => d);
  ok(rb.students >= 1 && fake.store.get("leaderboards/F4_all").scores.s1.pts === allSets.reduce((x, a) => x + a.score * 100 + bonus(a), 0), "recount rebuilds totals from saved practice and assignment results");
  // teacher/student switch
  byText(".seg a", "Student").click(); await go("#/student");
  await waitFor(() => byText("#nav a", "Practise") && byText(".seg a.on", "Student"), "student view");
  ok(!byText("#nav a", "Classes") && $(".avatar"), "switching to student view swaps the menu");
  await go("#/leaderboard");
  await waitFor(() => $(".leaderboard select"), "teacher form picker");
  set($(".leaderboard select"), "F4");
  await waitFor(() => byText(".leaderboard h2", "F4 leaderboard") && $(".leaderboard table"), "teacher preview of the student leaderboard");
  ok($(".leaderboard select") && $$(".leaderboard tr").length <= 11 && !byText(".leaderboard", "@syss"), "teacher in student view sees the student board (top 10, form picker, no emails)");
  await go("#/t/bank");
  await waitFor(() => byText("#nav a", "Classes") && byText(".seg a.on", "Teacher"), "teacher view again");
  ok($("#nav .dd.on"), "opening a teacher page switches back and highlights Questions");
  $(".avatar").click(); await sleep(10);
  ok($("#user .dd.open") && byText("#user .dd-menu", "Sign out") && byText("#user .dd-menu", "Admin"), "initials button opens the account menu");
  w.document.body.click(); await sleep(10);
  ok(!$("#user .dd.open"), "clicking elsewhere closes it");
  fake.setUser(S1); await sleep(50);
}

console.log("9. second student + teacher results");
fake.setUser(S2); await sleep(50); await go("#/");
await waitFor(() => byText("a.btn", "Start"), "s2 home");
await go(`#/do/${classId}/${a1}`);
await waitFor(() => $$(".qcard").length === 8, "8 q");
for (const id of qids1) { const c = $(`#q-${CSS_escape(id)}`); [...c.querySelectorAll(".opt")].find((b) => b.querySelector(".optkey").textContent === key[id]).click(); await sleep(3); }
byText("button", "Submit answers").click();
await waitFor(() => $(".scorebox"), "score");
ok($(".score").textContent === "8 / 8", "s2 full marks");
fake.setUser(T); await sleep(50); await go("#/t");
await waitFor(() => byText("h1", "Teacher dashboard"), "teacher");
await go(`#/t/results/${classId}/${a1}`);
await waitFor(() => $("table.results"), "results table");
const rows = $$("table.results tr");
ok(rows.length === 1 + 3 + 1, "header + 3 students + footer");
ok(byText("table.results tr", "s003") && byText("table.results tr", "not submitted"), "missing student shown");
ok($$("td.ok").length === 4 + 8 && $$("td.no").length === 3, "cell colouring matches answers");
ok(byText("tr.foot td", "2/3 submitted"), "submission count");
ok($$(".dist").length === 8, "per-question distribution shown");
ok($$(".qcard .solution").length === qids1.filter((id) => id !== noSol).length, "teacher sees the solutions in the results page");
ok(!byText("button", "Release answers"), "no release button when answers show after submitting");
byText("button", "Download CSV").click();
{ // after-due assignment (due date in the future again): the teacher can release early
  await go(`#/t/results/${classId}/${a2}`);
  await waitFor(() => byText("button", "Release answers & solutions now"), "release button");
  ok(byText("p.muted", "hidden from students for now"), "results page says answers are hidden for now");
  byText("button", "Release answers & solutions now").click();
  await waitFor(() => fake.store.get(p2).released === true, "released flag");
  await waitFor(() => byText("button", "Hide answers & solutions again"), "page redrawn after release");
  ok(true, "teacher releases answers and solutions early");
  const r = await (async () => { fake.user = S1; const x = await api.getReview({ attemptId: `${a2}_s1` }); fake.user = T; return x; })();
  ok(r.revealed && Object.keys(r.solutions).length >= 1, "student sees them once released");
}

{ // question bank: teachers see answers and solutions (toggle remembered)
  await go("#/t/bank");
  await waitFor(() => $$(".qcard").length && $$(".qcard .keyline").length, "bank with answers");
  const cards = $$(".qcard").length;
  ok($$(".qcard .keyline").length === cards, "every bank question shows its answer");
  ok($$(".qcard .solution").length >= cards - 1 && byText(".solution", "worked solution for"), "bank shows the worked solutions");
  ok(!$$(".qcard .fb.bad").length && !byText(".qcard", "Your answer"), "no student-style feedback in the bank");
  const box = [...$$("label.check input")][0];
  box.checked = false; box.dispatchEvent(new window.Event("change"));
  await waitFor(() => !$$(".qcard .solution").length, "solutions hidden");
  ok($$(".qcard").length === cards && !$$(".qcard .keyline").length, "toggle hides answers and solutions");
  await go("#/t"); await waitFor(() => byText("h1", "Teacher dashboard"), "teacher home");
  await go("#/t/bank"); await waitFor(() => $$(".qcard").length, "bank again");
  await sleep(30);
  ok(!$$(".qcard .solution").length && !$("label.check input").checked, "toggle setting remembered");
  $("label.check input").checked = true; $("label.check input").dispatchEvent(new window.Event("change"));
  await waitFor(() => $$(".qcard .solution").length, "solutions back on");
  // assignment builder preview also shows the answer and solution
  await go("#/t/assign");
  await waitFor(() => $$(".pickrow").length, "builder");
  byText(".pickrow button", "preview").click();
  await waitFor(() => $(".pickrow .preview .keyline"), "preview answer");
  ok($(".pickrow .preview .qcard"), "builder preview shows answer and solution");
}
{ // printable paper
  let printed = 0; w.print = () => { printed++; }; window.print = w.print;
  await go("#/t"); await waitFor(() => byText("h1", "Teacher dashboard"), "teacher home");
  ok($('#nav a[href="#/t/paper"]'), "top bar links to the paper builder");
  const printLink = $$("a").find((a) => a.textContent === "Print" && a.getAttribute("href").startsWith("#/t/paper/"));
  ok(printLink, "each assignment has a Print link");
  const [, , , cid, aid] = printLink.getAttribute("href").split("/");
  const asgIds = fake.store.get(`classes/${cid}/assignments/${aid}`).questionIds;
  await go(printLink.getAttribute("href"));
  await waitFor(() => byText("h1", "Printable paper") && $$(".sellist li").length, "paper builder from assignment");
  ok($$(".sellist li").length === asgIds.length && $(".formgrid input").value === fake.store.get(`classes/${cid}/assignments/${aid}`).title, "starts with the assignment's questions and title");
  // reorder: move the second question up
  if (asgIds.length > 1) { $$(".sellist li")[1].querySelector("button[title='Move up']").click(); await sleep(10); }
  const order = asgIds.length > 1 ? [asgIds[1], asgIds[0], ...asgIds.slice(2)] : asgIds;
  // turn on worked solutions
  const sol = $$(".paperopts label").find((l) => l.textContent.includes("Worked solutions")).querySelector("input");
  sol.checked = true;
  byText("button", "Preview & print").click();
  await waitFor(() => $(".paper") && $$(".pq").length === order.length, "paper preview");
  ok(document.body.classList.contains("printmode") && $(".printbar"), "preview is in print mode with a toolbar");
  ok($(".paper-title").textContent === fake.store.get(`classes/${cid}/assignments/${aid}`).title, "paper has the title");
  ok($(".paper-name") && $$(".paper-cover table.paper-grid td").length === order.length, "cover has name lines and an answer box per question");
  ok($$(".pq-num").map((e) => e.textContent).join(",") === order.map((_, i) => `${i + 1}.`).join(","), "questions are numbered in the chosen order");
  ok(!$$(".pq .opt, .pq button").length && $$(".pq .pq-opt, .pq table.pq-table").length, "options are printed as text, not buttons");
  ok(!$(".pq-src"), "sources hidden by default");
  const keyCells = $$(".paper-key table.paper-grid td").map((td) => td.textContent);
  ok(keyCells.join("") === order.map((id) => bundle.answers[id]).join(""), "answer key lists the right letters in paper order");
  ok($$(".paper-sol").length === order.length && $(".paper-sols .soltext"), "worked solutions section");
  ok($$(".pagebreak").length === 2, "key and solutions start on new pages");
  byText("button", "Print / Save as PDF").click();
  await waitFor(() => printed === 1, "print dialog", 10000);
  ok(printed === 1, "Print button opens the print dialog");
  // Word download
  let blob = null, dl = null;
  const origCO = URL.createObjectURL, origRO = URL.revokeObjectURL;
  w.URL.createObjectURL = URL.createObjectURL = (b) => { blob = b; return "blob:test"; }; w.URL.revokeObjectURL = URL.revokeObjectURL = () => {};
  const origClick = w.HTMLAnchorElement.prototype.click;
  w.HTMLAnchorElement.prototype.click = function () { if (this.download) dl = this.download; else origClick.call(this); };
  byText("button", "Download Word (.docx)").click();
  await waitFor(() => dl, "docx download", 8000);
  w.HTMLAnchorElement.prototype.click = origClick; URL.createObjectURL = origCO; URL.revokeObjectURL = origRO;
  ok(dl.endsWith(".docx") && blob && blob.type.includes("wordprocessingml"), "Word button downloads a .docx");
  const zbytes = new Uint8Array(await blob.arrayBuffer());
  const files = {};       // read the stored zip
  for (let p = 0; p + 30 < zbytes.length && zbytes[p] === 0x50 && zbytes[p + 1] === 0x4b && zbytes[p + 2] === 3; ) {
    const dv = new DataView(zbytes.buffer, p); const size = dv.getUint32(18, true), nlen = dv.getUint16(26, true);
    const name = new TextDecoder().decode(zbytes.slice(p + 30, p + 30 + nlen));
    files[name] = zbytes.slice(p + 30 + nlen, p + 30 + nlen + size); p += 30 + nlen + size;
  }
  ok(["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels"].every((f) => files[f]), "docx has the Word package parts");
  const docXml = new TextDecoder().decode(files["word/document.xml"]);
  ok(!new w.DOMParser().parseFromString(docXml, "application/xml").querySelector("parsererror"), "document.xml is well-formed XML");
  const nFig = new Set(order.flatMap((id) => bundle.questions.find((q) => q.id === id).figures)).size;
  ok(Object.keys(files).filter((f) => f.startsWith("word/media/")).length >= nFig, "question figures are embedded");
  const firstText = bundle.questions.find((q) => q.id === order[0]).textHtml.replace(/<[^>]+>/g, " ").replace(/\$[^$]*\$/g, " ").replace(/\s+/g, " ").trim().split(" ").slice(0, 3).join(" ");
  ok(docXml.includes("Answer key") && docXml.includes("Worked solutions") && docXml.replace(/<[^>]+>/g, "").includes(firstText.replace(/&/g, "&amp;")), "docx contains the questions, key and solutions");
  const hasMath = order.some((id) => /\$/.test(bundle.questions.find((q) => q.id === id).textHtml + JSON.stringify(bundle.questions.find((q) => q.id === id).optionsHtml)));
  ok(!hasMath || docXml.includes("<m:oMath>"), "maths becomes Word equations");
  byText("button", "Back to edit").click();
  await waitFor(() => byText("h1", "Printable paper"), "back to editor");
  ok(!document.body.classList.contains("printmode") && $$(".sellist li").length === order.length, "back keeps the selection");
  // fresh paper from the bank, sources on, no key
  await go("#/t/paper");
  await waitFor(() => byText("h1", "Printable paper") && $$(".pickrow").length, "empty paper builder");
  ok(!$$(".sellist li").length, "new paper starts empty");
  byText("button", "Preview & print").click(); await sleep(20);
  ok(!$(".paper"), "needs at least one question");
  byText("button", "Add random from filter").click(); await sleep(20);
  const cb = (t) => $$(".paperopts label").find((l) => l.textContent.includes(t)).querySelector("input");
  cb("source paper").checked = true; cb("Answer key").checked = false; cb("Answer boxes").checked = false;
  byText("button", "Preview & print").click();
  await waitFor(() => $$(".pq").length === 5, "random paper");
  ok($$(".pq-src").length === 5 && !$(".paper-key") && !$(".paper-cover table.paper-grid"), "options respected (sources on, no key, no answer boxes)");
  await go("#/t"); await waitFor(() => byText("h1", "Teacher dashboard"), "teacher home");
  ok(!document.body.classList.contains("printmode"), "leaving the paper clears print mode");
}

console.log("10. admin");
await go("#/t/admin");
await waitFor(() => byText("h2", "Teachers"), "admin");
set($("input[placeholder='teacher@singyin.edu.hk']"), "newteacher@singyin.edu.hk");
byText("button", "Add teacher").click(); await sleep(50);
ok(fake.store.has("teachers/newteacher@singyin.edu.hk"), "teacher added");
await waitFor(() => byText("h2", "Import questions"), "admin reloaded");
const small = { ...bundle, questions: bundle.questions.slice(0, 3).map((q) => ({ ...q, textHtml: q.textHtml + "<p>updated</p>" })),
  solutions: { [bundle.questions[0].id]: "<p>imported solution</p>" } };
const bf = new NodeFile([JSON.stringify(small)], "bundle.json", { type: "application/json" });
const figs = small.questions.flatMap((q) => q.figures).map((n) => new NodeFile(["png"], n, { type: "image/png" }));
const [bundleIn, figIn] = $$("input[type=file]");
Object.defineProperty(bundleIn, "files", { value: [bf] }); Object.defineProperty(figIn, "files", { value: figs });
byText("button", "Import").click();
await waitFor(() => /Saved 3 questions/.test($(".log").textContent), "import done");
ok(fake.store.get(`questions/${small.questions[0].id}`).textHtml.endsWith("<p>updated</p>"), "import updates questions");
ok(fake.store.get(`answerKeys/${small.questions[0].id}`).solution === "<p>imported solution</p>" && !("solution" in fake.store.get(`questions/${small.questions[0].id}`)), "import stores solutions with the answer keys (not in the public question)");
ok(Object.keys(JSON.parse(fake.store.get("meta/questionIndex").data)).length === bundle.questions.length, "first import builds the practice index from all questions already on the platform");

console.log("11. teacher is NOT allowed what students aren't, and students can't reach teacher pages");
fake.setUser(S1); await sleep(50);
await go("#/t/admin");
await waitFor(() => byText("p.error", "Teachers only"), "teachers only");
ok(true, "teacher pages blocked for students");
await go("#/t/paper");
await waitFor(() => byText("p.error", "Teachers only"), "paper builder teachers only");
{ let err = ""; try { await api.figureData({ names: [bundle.questions.find((q) => q.figures.length).figures[0]] }); } catch (e) { err = e.message; }
  ok(/Teachers only/.test(err), "students cannot download figure files for Word papers"); }

console.log("12. Explain cards");
await go("#/"); await sleep(50);
ok(byText(".panel h2", "Explain card of the day") && byText(".panel", "Coming soon"), "home shows Explain panel before cards are imported");
fake.setUser(T); await sleep(50); await go("#/t/admin");
await waitFor(() => byText("h2", "Import Explain cards"), "explain import box");
const exFile = new NodeFile([JSON.stringify(explain)], "explain_bundle.json", { type: "application/json" });
Object.defineProperty($$("input[type=file]")[2], "files", { value: [exFile] });
byText("button", "Import Explain cards").click();
await waitFor(() => /Saved 134 Explain cards/.test(w.document.body.textContent), "explain import");
ok(fake.store.get("meta/explainCards").cards.length === 134, "134 cards stored in one document");
fake.setUser(S1); await sleep(50);
await go("#/history"); await go("#/");
await waitFor(() => byText("a.btn", "Read today's card"), "today's card button");
const first = explain.cards[0];
ok(byText(".panel strong", `${first.year} ${first.qref}`), "today's card is the first card");
byText("a.btn", "Read today's card").click(); await go(`#/explain/${first.id}`);
await waitFor(() => byText("button", "Mark as read"), "card page");
ok(byText(".xsec h3", "Marking-scheme answer") && byText(".xsec h3", "Teaching notes") && byText(".xsec h3", "Examiners"), "card shows all sections");
ok(/Book 1 Heat and Gases › Ch 1 Temperature and Heat Transfer(?! *\p{Script=Han})/u.test(w.document.body.textContent), "card shows its book and chapter");
byText("button", "Mark as read").click();
await waitFor(() => byText("button", "Read — tap to undo"), "marked");
ok(fake.store.get("explainProgress/s1").read[first.id], "read mark saved");
await waitFor(() => /\+300 leaderboard points/.test($("#toast").textContent), "explain points toast");
const lbAll = fake.store.get("leaderboards/F4_all").scores.s1;
ok(lbAll.cards === 1, "card of the day: +300 points");
ok((await api.explainRead({ cardId: first.id })).points === 0, "only once a day");
ok((await api.explainRead({ cardId: explain.cards[1].id })).points === 0, "only for the card of the day");
await go("#/explain");
await waitFor(() => $$(".chip").length, "chapter chips");
const nCh = new Set(explain.cards.map((c) => c.chapter)).size;
ok($$(".bookbox").length === 5 && $$(".chip").length === nCh && $$(".cardrow").length === 134, `5 books, ${nCh} chapter chips, all 134 cards listed`);
ok($$(".cardrow.done").length === 1, "read card ticked in the list");
const ch1 = $$(".chip").find((c) => c.textContent.includes("Ch 1 Temperature and Heat Transfer"));
ok(/1\/8/.test(ch1.textContent), "chapter progress counter");
// student studies only Book 2 (Force and Motion): untick every other book
for (const box of $$(".bookbox")) if (!box.textContent.includes("Book 2")) { const b = [...box.querySelectorAll("button")].find((x) => x.textContent === "Untick all"); b.click(); await sleep(15); }
await sleep(30);
const b2 = explain.cards.filter((c) => c.book === 2);
ok($$(".cardrow").length === b2.length, `list narrowed to chosen chapters (${b2.length} Book 2 cards)`);
ok(JSON.stringify(fake.store.get("explainProgress/s1").topics) === JSON.stringify([...new Set(b2.map((c) => c.chapter))]), "chapter choice saved");
// untick one more chapter with its checkbox
const ch10 = $$(".chip").find((c) => c.textContent.includes("Ch 10 Projectile"));
ch10.querySelector("input").checked = false; ch10.querySelector("input").dispatchEvent(new w.Event("change")); await sleep(30);
ok($$(".cardrow").length === b2.filter((c) => c.chapter !== "10").length && !fake.store.get("explainProgress/s1").topics.includes("10"), "single chapter can be unticked");
await go("#/history"); await go("#/");
await waitFor(() => byText("a.btn", "Read today's card") || byText("a.btn", "Read again"), "home");
const todayCardDoc = explain.cards.find((c) => c.id === fake.store.get("explainProgress/s1").today.cardId);
ok(todayCardDoc.book === 2 && todayCardDoc.chapter === "6" && byText(".panel strong", "Ch 6 Fundamentals of Force"), "today's card switches to the first chosen chapter");
ok(!/\p{Script=Han}/u.test(w.document.body.textContent), "Explain page shows English chapter names only (no Chinese)");
// same card all day
const todayId = fake.store.get("explainProgress/s1").today.cardId;
await go("#/history"); await go("#/");
await waitFor(() => byText(".panel h2", "Explain card of the day"), "home again"); await sleep(50);
ok(fake.store.get("explainProgress/s1").today.cardId === todayId, "today's card stays the same during the day");
// next day -> next unread
fake.store.get("explainProgress/s1").today.date = "2000-01-01";
fake.store.get("explainProgress/s1").read[todayId] = new Date().toISOString();
await go("#/history"); await go("#/"); await sleep(100);
ok(fake.store.get("explainProgress/s1").today.cardId !== todayId, "a new day gives the next unread card");
// others cannot write my progress
denied = false; fake.user = S2;
try { await fs.setDoc(fs.doc({ __db: true }, "explainProgress", "s1"), { email: "s002@syss.edu.hk", read: {} }); } catch (e) { denied = /permission/.test(e.message); }
ok(denied, "a student cannot change someone else's reading record"); fake.user = S1;
// teacher view
fake.setUser(T); await sleep(50); await go("#/t/explain");
await waitFor(() => byText("h1", "reading progress"), "teacher progress");
const row = byText("table.grid tr", "s001");
ok(row && row.children[1].textContent === "2", "teacher sees cards read per student");
ok(row && row.children[4].textContent === "Ch 6, Ch 7, Ch 8, Ch 9, Ch 11", "teacher sees chosen chapters");
// a reading record saved before chapters existed (topic names) counts as "all chapters"
fake.store.get("explainProgress/s1").topics = ["Force and Motion"];
await go("#/t"); await go("#/t/explain"); await waitFor(() => byText("h1", "reading progress"), "teacher progress again");
ok(byText("table.grid tr", "s001").children[4].textContent === "all", "old topic choices fall back to all chapters");

console.log("13. Class lists control access");
const S9 = { uid: "s9", email: "s009@syss.edu.hk", name: "Not Physics" };
fake.setUser(S9); await sleep(80);
await waitFor(() => byText("p", "only for SYSS Physics students"), "not-on-list page");
ok(!fake.store.has("users/s9"), "non-physics student is stopped and no profile is stored");
denied = false; try { await fs.getDoc(fs.doc({ __db: true }, "meta", "explainCards")); } catch (e) { denied = /permission/.test(e.message); }
ok(denied, "non-physics student cannot read content directly");
let blocked = ""; try { await api.startPractice({ count: 5 }); } catch (e) { blocked = e.message; }
ok(/Ask your physics teacher/.test(blocked), "non-physics student cannot start practice");
// teacher pastes class lists on the Admin page
fake.setUser(T); await sleep(50); await go("#/t/admin");
await waitFor(() => byText("h2", "Classes & students"), "classes panel");
ok(byText("table.grid tr", "4A Physics"), "admin lists existing classes");
const area = $$("textarea").find((t) => /Chan Tai Man/.test(t.getAttribute("placeholder") || ""));
set(area, "Class\tNumber\tName\tCName\tEmail\n5B Physics\t2\tWong Ka Ho\t黃家豪\ts009@syss.edu.hk\n5B Physics\t1\tLee Ka Yan\t李嘉欣\tS010@syss.edu.hk\n4A Physics\t12\tChan Tai Man\t陳大文\ts001@syss.edu.hk\n4A Physics\t3\tHo Siu Ming\t何小明\ts002@syss.edu.hk\n5B Physics\t5\tSomeone\t某人\tsomeone@gmail.com");
byText("button", "Check").click(); await sleep(20);
ok(/5B Physics: 2 students — new class/.test(w.document.body.textContent) && /4A Physics: 2 students — replaces 3/.test(w.document.body.textContent), "paste preview explains the changes");
ok(/1 row\(s\) skipped/.test(w.document.body.textContent), "non-school email row is skipped");
byText("button", "Apply").click();
await waitFor(() => /Saved 2 class/.test($("#toast").textContent), "apply");
await sleep(50);
ok(fake.store.has("members/s009@syss.edu.hk") && fake.store.has("members/s010@syss.edu.hk"), "pasted students get access");
ok(!fake.store.has("members/s003@syss.edu.hk"), "student removed from 4A (and in no other class) loses access");
const c4aEntry = [...fake.store.entries()].find(([p, d]) => /^classes\/[^/]+$/.test(p) && d.name === "4A Physics");
const c4a = { ...c4aEntry[1], roster: fake.store.get(`classRosters/${c4aEntry[0].split("/")[1]}`).roster };
ok(!("roster" in c4aEntry[1]), "names are not stored in the class document students can read");
ok(JSON.stringify(c4a.roster) === JSON.stringify([{ email: "s002@syss.edu.hk", no: 3, name: "Ho Siu Ming", cname: "何小明" }, { email: "s001@syss.edu.hk", no: 12, name: "Chan Tai Man", cname: "陳大文" }]), "class numbers and names saved, in class-number order");
const a1path = [...fake.store.keys()].find((p) => p.endsWith(`/assignments/${a1}`));
const c4aId = [...fake.store.entries()].find(([p, d]) => /^classes\/[^/]+$/.test(p) && d.name === "4A Physics")[0].split("/")[1];
await go(`#/t/results/${c4aId}/${a1}`);
await waitFor(() => $("table.results"), "results with names");
const firstCells = $$("table.results tr").slice(1, 3).map((tr) => tr.children[0].textContent);
ok(firstCells[0] === "4A Physics 3 Ho Siu Ming 何小明" && firstCells[1] === "4A Physics 12 Chan Tai Man 陳大文", "results show \"class no. name\" in class-number order");
fake.user = S1; denied = false;
try { await fs.getDoc(fs.doc({ __db: true }, "classRosters", c4aId)); } catch (e) { denied = /permission/.test(e.message); }
ok(denied, "students cannot read classmates' names and numbers"); fake.user = T;
await go("#/t/admin"); await waitFor(() => byText("h2", "Classes & students"), "admin again");
await waitFor(() => byText("h2", "Classes & students"), "admin reloaded");
set($("input[placeholder='s123456@syss.edu.hk']"), "s003@syss.edu.hk"); byText("button", "Check access").click(); await sleep(30);
ok(/No access/.test(w.document.body.textContent), "access check shows removed student has no access");
fake.setUser(S9); await sleep(50); await go("#/history"); await go("#/");
await waitFor(() => byText("h1", "Hello"), "s009 now allowed");
ok(true, "student added by paste can now sign in");
fake.setUser(T); await sleep(50);
fake.store.delete("members/s009@syss.edu.hk");
const r = await api.rebuildMembers({});
ok(r.members === 4 && fake.store.has("members/s009@syss.edu.hk"), "rebuild restores the access list from class lists");

console.log("14. Deleting results");
// a student cannot delete their own result
fake.user = S2; denied = false;
try { await fs.deleteDoc(fs.doc({ __db: true }, "attempts", `${a1}_s2`)); } catch (e) { denied = /permission/.test(e.message); }
ok(denied && fake.store.has(`attempts/${a1}_s2`), "students cannot delete results");
// teacher resets a student's submission from the results grid
fake.setUser(T); await sleep(50);
const cls1 = [...fake.store.entries()].find(([p, d]) => /^classes\/[^/]+$/.test(p) && (d.studentEmails || []).includes("s002@syss.edu.hk"))[0].split("/")[1];
await go(`#/t/results/${cls1}/${a1}`);
await waitFor(() => $("table.results"), "results");
const s2row = $$("table.results tr").find((tr) => /Ho Siu Ming|s002/.test(tr.children[0].textContent));
s2row.querySelector("button.linkbtn").click();
await waitFor(() => !fake.store.has(`attempts/${a1}_s2`), "reset");
ok(true, "teacher can reset a student's submission");
{ // the student redoes it: only the difference in points is added, and the assignment still counts once
  const sc0 = { ...fake.store.get("leaderboards/F4_all").scores.s2 };
  const oldA = fake.store.get(`assignmentPoints/${a1}_s2`).pts;
  const qa = fake.store.get(`classes/${cls1}/assignments/${a1}`).questionIds;
  fake.setUser(S2); await sleep(50);
  const rr = await api.submitAnswers({ classId: cls1, assignmentId: a1, responses: Object.fromEntries(qa.map((q) => [q, bundle.answers[q]])) });
  const sc1 = fake.store.get("leaderboards/F4_all").scores.s2;
  const full = qa.length * 100 + (qa.length >= 5 ? 500 : 0);
  ok(rr.points === full && sc1.asg === sc0.asg && sc1.pts - sc0.pts === full - oldA && fake.store.get(`assignmentPoints/${a1}_s2`).pts === full,
    "a redo after a reset replaces the old assignment score (counted once)");
  fake.setUser(T); await sleep(50);
}
// teacher deletes their own practice results
await api.startPractice({ count: 3 }).then((r) => api.submitAnswers({ sessionId: r.sessionId, responses: {} }));
ok([...fake.store.entries()].some(([p, d]) => p.startsWith("attempts/") && d.uid === "t1"), "teacher has a practice result");
await go("#/history");
await waitFor(() => byText("button", "Delete all my results"), "history with delete");
byText("button", "Delete all my results").click();
await waitFor(() => ![...fake.store.entries()].some(([p, d]) => p.startsWith("attempts/") && d.uid === "t1"), "deleted own");
ok(true, "teacher can delete their own results");

console.log("15. full SYSS import (all ready questions) and the practice index");
{
  const full = JSON.parse(readFileSync(`${ROOT}/platform_prep/export/all_ready/bundle.json`, "utf8"));
  fake.setUser(T); await sleep(50);
  await go("#/t"); await go("#/t/admin");
  await waitFor(() => byText("h2", "Import questions"), "admin for full import");
  const bf2 = new NodeFile([JSON.stringify(full)], "bundle.json", { type: "application/json" });
  const figs2 = [...new Set(full.questions.flatMap((q) => q.figures))].map((n) => new NodeFile(["png"], n, { type: "image/png" }));
  const [bIn, fIn] = $$("input[type=file]");
  Object.defineProperty(bIn, "files", { value: [bf2] }); Object.defineProperty(fIn, "files", { value: figs2 });
  byText("button", "Import").click();
  await waitFor(() => new RegExp(`Saved ${full.questions.length} questions`).test($(".log").textContent), "full import done", 20000);
  ok(full.questions.every((q) => fake.store.has(`questions/${q.id}`) && fake.store.has(`answerKeys/${q.id}`)), `all ${full.questions.length} ready questions and answer keys stored`);
  const idxDoc = fake.store.get("meta/questionIndex");
  ok(typeof idxDoc.data === "string" && !idxDoc.questions, "practice index is stored as one text field (no per-entry Firestore index entries)");
  const idx = JSON.parse(idxDoc.data);
  ok(Object.keys(idx).length >= full.questions.length && full.questions.every((q) => idx[q.id] && idx[q.id].t === q.topic), "practice index lists every question with its book");
  ok(!JSON.stringify(idx).includes('"answer'), "practice index holds no answers");
  // a student practises by chapter: the pool comes from the index
  fake.setUser(S1); await sleep(50);
  const inCh = full.questions.filter((q) => q.chapters.includes("18")).map((q) => q.id);
  const r = await api.startPractice({ chapter: "18", count: 20 });
  ok(r.questionIds.length === Math.min(20, inCh.length) && r.questionIds.every((id) => inCh.includes(id)), `practice by chapter draws from all ${inCh.length} Ch 18 questions`);
  { // an index written by an older import (a map, not text) is still understood
    const saved = fake.store.get("meta/questionIndex");
    fake.store.set("meta/questionIndex", { questions: idx });
    const rl = await api.startPractice({ chapter: "18", count: 5 });
    ok(rl.questionIds.length === 5 && rl.questionIds.every((id) => inCh.includes(id)), "older map-style practice index still works");
    fake.store.set("meta/questionIndex", saved);
  }
  const rb = await api.startPractice({ topic: "Atomic World", count: 5 });
  ok(rb.questionIds.every((id) => idx[id].t === "Atomic World"), "practice by book uses the index");
  ok(full.questions.every((q) => JSON.stringify(idx[q.id].k) === JSON.stringify(q.skills)), "practice index lists every question's skills");
  const inSk = full.questions.filter((q) => q.skills.includes("Experimental skills")).map((q) => q.id);
  const rs = await api.startPractice({ skill: "Experimental skills", count: 20 });
  ok(inSk.length && rs.questionIds.length === Math.min(20, inSk.length) && rs.questionIds.every((id) => inSk.includes(id)), `practice by skill draws only from the ${inSk.length} experimental-skills questions`);
}

console.log(`\n${passed} checks passed.`);
const real = errors.filter((e) => !/Not implemented: navigation/.test(e));
if (real.length) { console.log("Console errors:\n" + real.join("\n")); process.exitCode = 1; }
process.exit();
