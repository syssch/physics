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
for (const [id, a] of Object.entries(bundle.answers)) fake.store.set(`answerKeys/${id}`, { answer: a });
fake.store.set("meta/topics", { topics: bundle.topics });
fake.store.set("teachers/teacher@singyin.edu.hk", {});
const explain = JSON.parse(readFileSync(`${ROOT}/platform_prep/export/explain/explain_bundle.json`, "utf8"));
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
ok(byText("#nav a", "Teacher"), "teacher nav shown");
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
const topicSel = $(".builder select");
set(topicSel, "Force and Motion");
await sleep(20);
ok($$(".pickrow").length === 30, "topic filter works (30 Force and Motion)");
set($$(".builder select")[1], "Kinematics");
const kin = $$(".pickrow").length;
ok(kin > 0 && kin < 30, `subtopic filter works (${kin} Kinematics)`);
$$(".pickrow input[type=checkbox]").slice(0, 3).forEach((c) => { c.checked = true; c.dispatchEvent(new w.Event("change")); });
ok(/3 selected/.test($(".sticky h2").textContent), "3 selected");
byText(".pickrow button", "preview").click(); await sleep(20);
ok($(".preview .qcard"), "preview renders");
set($$(".builder select")[1], "");
byText("button", "Add random from filter").click();
ok(/8 selected/.test($(".sticky h2").textContent), "random add 5 more");
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
const at = fake.store.get(`attempts/${a1}_s1`);
ok(at && at.score === 4 && at.total === 8 && !at.late, "attempt stored server-side");
ok(!w.localStorage.getItem(`resp-asg-${a1}`), "local progress cleared");

console.log("5. student cannot cheat");
const fs = await import("./fakes/firestore.mjs");
let denied = false; try { await fs.getDoc(fs.doc({ __db: true }, "answerKeys", qids1[0])); } catch (e) { denied = /permission/.test(e.message); }
ok(denied, "student cannot read answer keys");
denied = false; try { await fs.setDoc(fs.doc({ __db: true }, "attempts", "fake"), { uid: "s1", score: 99 }); } catch (e) { denied = /permission/.test(e.message); }
ok(denied, "student cannot write attempts");
const { api } = await import(`${ROOT}/learning-platform/js/fb.js`);
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
await go(`#/review/${a2}_s1`);
await waitFor(() => $(".scorebox"), "review page");
ok(byText(".notice", "after the due date") && !$$(".opt.right").length, "review also withholds answers");
// move due date into the past -> answers released
const p2 = [...fake.store.keys()].find((p) => p.endsWith(`/assignments/${a2}`));
fake.store.get(p2).dueAt = Timestamp.fromMillis(Date.now() - 1000);
await go("#/history"); await go(`#/review/${a2}_s1`);
await waitFor(() => $$(".opt.right").length === 2, "answers after due");
ok(true, "answers released after due date");

console.log("7. practice");
await go("#/");
await waitFor(() => byText("button", "Start practice"), "practice panel");
const sels = $$(".panel select");
set(sels[0], "Wave Motion"); set(sels[2], "5");
byText("button", "Start practice").click();
await waitFor(() => $$(".qcard").length === 5, "5 practice questions");
ok($$(".qsrc").every((e) => e.textContent.startsWith("Wave Motion")), "practice respects topic");
$$(".qcard").forEach((c) => c.querySelector(".opt").click()); await sleep(10);
byText("button", "Submit answers").click();
await waitFor(() => $(".scorebox"), "practice score");
ok($$(".opt.right").length === 5, "practice shows answers");
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
ok($$("table.grid tr").length === 4, "history lists 3 attempts");

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
byText("button", "Download CSV").click();

console.log("10. admin");
await go("#/t/admin");
await waitFor(() => byText("h2", "Teachers"), "admin");
set($("input[placeholder='teacher@singyin.edu.hk']"), "newteacher@singyin.edu.hk");
byText("button", "Add teacher").click(); await sleep(50);
ok(fake.store.has("teachers/newteacher@singyin.edu.hk"), "teacher added");
await waitFor(() => byText("h2", "Import questions"), "admin reloaded");
const small = { ...bundle, questions: bundle.questions.slice(0, 3).map((q) => ({ ...q, textHtml: q.textHtml + "<p>updated</p>" })) };
const bf = new NodeFile([JSON.stringify(small)], "bundle.json", { type: "application/json" });
const figs = small.questions.flatMap((q) => q.figures).map((n) => new NodeFile(["png"], n, { type: "image/png" }));
const [bundleIn, figIn] = $$("input[type=file]");
Object.defineProperty(bundleIn, "files", { value: [bf] }); Object.defineProperty(figIn, "files", { value: figs });
byText("button", "Import").click();
await waitFor(() => /Saved 3 questions/.test($(".log").textContent), "import done");
ok(fake.store.get(`questions/${small.questions[0].id}`).textHtml.endsWith("<p>updated</p>"), "import updates questions");

console.log("11. teacher is NOT allowed what students aren't, and students can't reach teacher pages");
fake.setUser(S1); await sleep(50);
await go("#/t/admin");
await waitFor(() => byText("p.error", "Teachers only"), "teachers only");
ok(true, "teacher pages blocked for students");

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
byText("button", "Mark as read").click();
await waitFor(() => byText("button", "Read — tap to undo"), "marked");
ok(fake.store.get("explainProgress/s1").read[first.id], "read mark saved");
await go("#/explain");
await waitFor(() => $$(".chip").length, "topic chips");
ok($$(".chip").length === 7 && $$(".cardrow").length === 134, "7 topic chips, all 134 cards listed");
ok($$(".cardrow.done").length === 1, "read card ticked in the list");
const heat = $$(".chip").find((c) => c.textContent.includes("Heat and Gases"));
ok(/1\/23/.test(heat.textContent), "topic progress counter");
// student studies only Force and Motion
for (const chip of $$(".chip")) { const cb = chip.querySelector("input"); if (!chip.textContent.includes("Force and Motion") && cb.checked) { cb.checked = false; cb.dispatchEvent(new w.Event("change")); await sleep(10); } }
await sleep(30);
ok($$(".cardrow").length === 32, "list narrowed to chosen topic (32 Force and Motion cards)");
ok(JSON.stringify(fake.store.get("explainProgress/s1").topics) === JSON.stringify(["Force and Motion"]), "topic choice saved");
await go("#/history"); await go("#/");
await waitFor(() => byText("a.btn", "Read today's card") || byText("a.btn", "Read again"), "home");
ok(/Force and Motion/.test(byText(".panel strong", "Force and Motion")?.textContent || ""), "today's card switches to the chosen topic");
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
// teacher deletes their own practice results
await api.startPractice({ count: 3 }).then((r) => api.submitAnswers({ sessionId: r.sessionId, responses: {} }));
ok([...fake.store.entries()].some(([p, d]) => p.startsWith("attempts/") && d.uid === "t1"), "teacher has a practice result");
await go("#/history");
await waitFor(() => byText("button", "Delete all my results"), "history with delete");
byText("button", "Delete all my results").click();
await waitFor(() => ![...fake.store.entries()].some(([p, d]) => p.startsWith("attempts/") && d.uid === "t1"), "deleted own");
ok(true, "teacher can delete their own results");

console.log(`\n${passed} checks passed.`);
const real = errors.filter((e) => !/Not implemented: navigation/.test(e));
if (real.length) { console.log("Console errors:\n" + real.join("\n")); process.exitCode = 1; }
process.exit();
