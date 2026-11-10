/**
 * Server-side logic for the SYSS Physics learning platform.
 * Answer keys never reach a student's browser before they are allowed to see them:
 * marking happens here, using the teacher-only `answerKeys` collection.
 */
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { setGlobalOptions } = require("firebase-functions/v2");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

initializeApp();
const db = getFirestore();
setGlobalOptions({ region: "asia-east2", maxInstances: 10 });

const SCHOOL_DOMAINS = ["@syss.edu.hk", "@singyin.edu.hk"];   // students, staff
const MAX_PRACTICE = 20;

function requireSchoolUser(request) {
  const t = request.auth && request.auth.token;
  const email = t && t.email ? t.email.toLowerCase() : "";
  if (!t || !t.email_verified || !SCHOOL_DOMAINS.some((d) => email.endsWith(d))) {
    throw new HttpsError("permission-denied", "Please sign in with your school Google account.");
  }
  return { uid: request.auth.uid, email, name: t.name || email };
}

async function isTeacher(email) {
  return (await db.doc(`teachers/${email}`).get()).exists;
}

/** Only teachers and students who are on at least one class list may use the platform. */
async function requireMember(request) {
  const user = requireSchoolUser(request);
  if ((await db.doc(`members/${user.email}`).get()).exists || (await isTeacher(user.email))) return user;
  throw new HttpsError("permission-denied", "This site is for SYSS Physics students. Ask your physics teacher to add you to a class.");
}

const cleanEmails = (list) => [...new Set((list || []).map((e) => String(e).trim().toLowerCase()).filter(Boolean))];

/** Keep `members/{email}` (the access list) in step with every class's student list. */
exports.syncMembers = onDocumentWritten("classes/{classId}", async (event) => {
  const classId = event.params.classId;
  const before = new Set(cleanEmails(event.data && event.data.before && event.data.before.exists ? event.data.before.data().studentEmails : []));
  const after = new Set(cleanEmails(event.data && event.data.after && event.data.after.exists ? event.data.after.data().studentEmails : []));
  for (const email of after) {
    if (!before.has(email)) {
      await db.doc(`members/${email}`).set({ classIds: FieldValue.arrayUnion(classId), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
  for (const email of before) {
    if (after.has(email)) continue;
    const ref = db.doc(`members/${email}`);
    const snap = await ref.get();
    const left = (snap.exists ? snap.get("classIds") || [] : []).filter((c) => c !== classId);
    if (left.length) await ref.set({ classIds: left, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    else if (snap.exists) await ref.delete();
  }
});

/** Teachers: rebuild the whole access list from the class lists (e.g. after a big change). */
exports.rebuildMembers = onCall(async (request) => {
  const user = requireSchoolUser(request);
  if (!(await isTeacher(user.email))) throw new HttpsError("permission-denied", "Teachers only.");
  const want = new Map();
  (await db.collection("classes").get()).forEach((c) => cleanEmails(c.get("studentEmails")).forEach((e) => {
    if (!want.has(e)) want.set(e, []);
    want.get(e).push(c.id);
  }));
  const existing = await db.collection("members").get();
  let removed = 0;
  for (const m of existing.docs) if (!want.has(m.id)) { await m.ref.delete(); removed++; }
  for (const [email, classIds] of want) await db.doc(`members/${email}`).set({ classIds, updatedAt: FieldValue.serverTimestamp() });
  return { members: want.size, removed };
});

/** Question ids in assignments that are still open for this student (kept out of practice). */
async function openAssignmentQuestionIds(email) {
  const classes = await db.collection("classes").where("studentEmails", "array-contains", email).get();
  const now = Timestamp.now();
  const ids = new Set();
  for (const c of classes.docs) {
    const open = await c.ref.collection("assignments").where("dueAt", ">", now).get();
    open.forEach((a) => (a.get("questionIds") || []).forEach((q) => ids.add(q)));
  }
  return ids;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Answer keys and worked solutions (both teacher-only in Firestore). */
async function loadKeys(questionIds) {
  const refs = questionIds.map((id) => db.doc(`answerKeys/${id}`));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const answers = {}, solutions = {};
  snaps.forEach((s) => {
    if (!s.exists) return;
    answers[s.id] = s.get("answer");
    if (s.get("solution")) solutions[s.id] = s.get("solution");
  });
  return { answers, solutions };
}

/**
 * May students see an assignment's answers and solutions now?
 *   reveal "after_submit" (default) | "after_due" | "manual"; a teacher can also release early (released: true).
 */
function canReveal(a, now = Date.now()) {
  if (a.get("released") === true) return true;
  const mode = a.get("reveal") || "after_submit";
  if (mode === "manual") return false;
  if (mode === "after_due") {
    const due = a.get("dueAt");
    return !due || due.toMillis() <= now;
  }
  return true;
}

function mark(questionIds, responses, answers) {
  const correct = {};
  let score = 0;
  for (const id of questionIds) {
    const ok = !!responses[id] && responses[id] === answers[id];
    correct[id] = ok;
    if (ok) score++;
  }
  return { correct, score, total: questionIds.length };
}

function cleanResponses(questionIds, raw) {
  const out = {};
  const allowed = new Set(questionIds);
  for (const [k, v] of Object.entries(raw || {})) {
    if (allowed.has(k) && typeof v === "string" && /^[A-H]$/.test(v)) out[k] = v;
  }
  return out;
}

/** Start a practice set: random questions, optionally limited to one textbook chapter / topic / subtopic / skill. */
exports.startPractice = onCall(async (request) => {
  const user = await requireMember(request);
  const { topic, subtopic, chapter, skill } = request.data || {};
  const count = Math.max(1, Math.min(MAX_PRACTICE, parseInt((request.data || {}).count, 10) || 10));

  // One read: meta/questionIndex lists every question's book/chapters/subtopics (written by the Admin import).
  // Older data without the index falls back to reading the question documents.
  let entries;
  const idx = await db.doc("meta/questionIndex").get();
  let ix = null;
  if (idx.exists && typeof idx.get("data") === "string") { try { ix = JSON.parse(idx.get("data")); } catch (e) { ix = null; } }
  else if (idx.exists && idx.get("questions")) ix = idx.get("questions");   // older imports
  if (ix) {
    entries = Object.entries(ix).map(([id, v]) => ({ id, topic: v.t, chapters: v.c || [], subtopics: v.s || [], skills: v.k || [] }));
  } else {
    const snap = await db.collection("questions").where("active", "==", true).select("topic", "subtopics", "chapters", "skills").get();
    entries = snap.docs.map((d) => ({ id: d.id, topic: d.get("topic"), chapters: d.get("chapters") || [], subtopics: d.get("subtopics") || [], skills: d.get("skills") || [] }));
  }
  const blocked = await openAssignmentQuestionIds(user.email);
  let pool = entries
    .filter((e) => !topic || e.topic === String(topic))
    .filter((e) => !subtopic || e.subtopics.includes(subtopic))
    .filter((e) => !chapter || e.chapters.includes(String(chapter)))
    .filter((e) => !skill || e.skills.includes(String(skill)))
    .map((e) => e.id)
    .filter((id) => !blocked.has(id));
  if (!pool.length) throw new HttpsError("not-found", "No questions match that choice yet.");
  const questionIds = shuffle(pool).slice(0, count);

  const ref = await db.collection("sessions").add({
    uid: user.uid, email: user.email, mode: "practice",
    topic: topic || null, subtopic: subtopic || null, chapter: chapter ? String(chapter) : null, skill: skill ? String(skill) : null,
    questionIds, submitted: false, createdAt: FieldValue.serverTimestamp(),
  });
  return { sessionId: ref.id, questionIds };
});

/**
 * "Redo my mistakes": a practice set made of questions the student got wrong (or left blank) the last
 * time they answered them. Only attempts whose answers the student may already see count, so an
 * assignment whose answers are still hidden gives nothing away. Questions in open assignments stay out.
 *   { count?, topic?, preview? }  preview: just return how many questions are waiting (overall and per book).
 */
exports.startMistakes = onCall(async (request) => {
  const user = await requireMember(request);
  const data = request.data || {};
  const count = Math.max(1, Math.min(MAX_PRACTICE, parseInt(data.count, 10) || 10));

  const snap = await db.collection("attempts").where("uid", "==", user.uid).get();
  const atts = snap.docs.map((d) => d.data())
    .sort((a, b) => ((a.submittedAt && a.submittedAt.toMillis ? a.submittedAt.toMillis() : 0) -
                     (b.submittedAt && b.submittedAt.toMillis ? b.submittedAt.toMillis() : 0)));
  const asgCache = new Map();
  const latest = new Map();          // question id -> the student's most recent visible response ("" = blank)
  for (const a of atts) {
    if (a.mode === "assignment") {
      const key = `${a.classId}/${a.assignmentId}`;
      if (!asgCache.has(key)) asgCache.set(key, await db.doc(`classes/${a.classId}/assignments/${a.assignmentId}`).get());
      const asg = asgCache.get(key);
      if (asg.exists && !canReveal(asg)) continue;          // a deleted assignment counts as finished (answers shown)
    }
    for (const q of a.questionIds || []) latest.set(q, (a.responses || {})[q] || "");
  }
  const { answers } = await loadKeys([...latest.keys()]);
  let wrong = [...latest.keys()].filter((q) => answers[q] && latest.get(q) !== answers[q]);

  // only questions still on the platform; book (topic) from the practice index
  const idx = await db.doc("meta/questionIndex").get();
  let ix = null;
  if (idx.exists && typeof idx.get("data") === "string") { try { ix = JSON.parse(idx.get("data")); } catch (e) { ix = null; } }
  else if (idx.exists && idx.get("questions")) ix = idx.get("questions");
  if (!ix && wrong.length) {        // older data without the index: read just these questions
    ix = {};
    (await db.getAll(...wrong.map((q) => db.doc(`questions/${q}`)))).forEach((d) => {
      if (d.exists && d.get("active") !== false) ix[d.id] = { t: d.get("topic") };
    });
  }
  if (ix) wrong = wrong.filter((q) => ix[q]);
  const blocked = await openAssignmentQuestionIds(user.email);
  wrong = wrong.filter((q) => !blocked.has(q));

  if (data.preview) {
    const byTopic = {};
    if (ix) wrong.forEach((q) => { const t = ix[q].t || "Other"; byTopic[t] = (byTopic[t] || 0) + 1; });
    return { available: wrong.length, byTopic };
  }
  const pool = data.topic && ix ? wrong.filter((q) => ix[q].t === String(data.topic)) : wrong;
  if (!pool.length) throw new HttpsError("not-found", "No mistakes to redo right now. Well done!");
  const questionIds = shuffle(pool).slice(0, count);
  const ref = await db.collection("sessions").add({
    uid: user.uid, email: user.email, mode: "mistakes", title: "Redo my mistakes",
    topic: data.topic ? String(data.topic) : null, questionIds, submitted: false, createdAt: FieldValue.serverTimestamp(),
  });
  return { sessionId: ref.id, questionIds, available: wrong.length };
});

/**
 * Submit answers.
 *   practice:   { sessionId, responses }
 *   assignment: { classId, assignmentId, responses }
 * Returns the score, plus answers/correctness/solutions when the student is allowed to see them.
 */
exports.submitAnswers = onCall(async (request) => {
  const user = await requireMember(request);
  const data = request.data || {};
  let questionIds, attemptRef, meta, reveal, revealMode = "after_submit";

  if (data.sessionId) {
    const sRef = db.doc(`sessions/${data.sessionId}`);
    const s = await sRef.get();
    if (!s.exists || s.get("uid") !== user.uid) throw new HttpsError("not-found", "Practice set not found.");
    if (s.get("submitted")) throw new HttpsError("failed-precondition", "This practice set was already submitted.");
    questionIds = s.get("questionIds");
    attemptRef = db.doc(`attempts/practice_${data.sessionId}`);
    meta = { mode: "practice", sessionId: data.sessionId,
             title: s.get("title") ? s.get("title") + (s.get("topic") ? `: ${s.get("topic")}` : "")
               : s.get("topic") ? `Practice: ${s.get("topic")}` : "Practice: mixed topics" };
    if (s.get("mode") === "mistakes") meta.kind = "mistakes";
    reveal = true;
    await sRef.update({ submitted: true });
  } else if (data.classId && data.assignmentId) {
    const cls = await db.doc(`classes/${data.classId}`).get();
    if (!cls.exists || !(cls.get("studentEmails") || []).includes(user.email)) {
      throw new HttpsError("permission-denied", "You are not in this class.");
    }
    const a = await db.doc(`classes/${data.classId}/assignments/${data.assignmentId}`).get();
    if (!a.exists) throw new HttpsError("not-found", "Assignment not found.");
    questionIds = a.get("questionIds");
    attemptRef = db.doc(`attempts/${data.assignmentId}_${user.uid}`);
    if ((await attemptRef.get()).exists) throw new HttpsError("already-exists", "You have already submitted this assignment.");
    const due = a.get("dueAt");
    const late = !!due && due.toMillis() < Date.now();
    meta = { mode: "assignment", classId: data.classId, assignmentId: data.assignmentId,
             title: a.get("title"), dueAt: due || null, late };
    reveal = canReveal(a);
    revealMode = a.get("reveal") || "after_submit";
  } else {
    throw new HttpsError("invalid-argument", "Missing sessionId or classId/assignmentId.");
  }

  const responses = cleanResponses(questionIds, data.responses);
  const { answers, solutions } = await loadKeys(questionIds);
  const result = mark(questionIds, responses, answers);

  await attemptRef.set({
    uid: user.uid, email: user.email, name: user.name, ...meta,
    questionIds, responses, score: result.score, total: result.total,
    submittedAt: FieldValue.serverTimestamp(),
  });

  const out = { attemptId: attemptRef.id, score: result.score, total: result.total, revealed: reveal, reveal: revealMode,
                dueAt: meta.dueAt ? meta.dueAt.toMillis() : null };
  try {                                           // leaderboard points: practice and assignments
    const pts = setPoints(result.score, result.total);
    if (meta.mode === "practice") {
      if (await addPoints(user, pts, Date.now(), { sets: 1 })) {
        out.points = pts;
        out.checkinBonus = await recordCheckin(user, Date.now(), "practice");
      }
    } else {
      // an assignment counts once; if a teacher resets it and the student redoes it, only the difference is added
      const pref = db.doc(`assignmentPoints/${data.assignmentId}_${user.uid}`);
      const prev = await pref.get();
      const before = prev.exists ? prev.get("pts") || 0 : 0;
      if (await addPoints(user, pts - before, Date.now(), prev.exists ? {} : { asg: 1 })) {
        await pref.set({ uid: user.uid, assignmentId: data.assignmentId, pts, at: FieldValue.serverTimestamp() });
        out.points = pts;
        out.checkinBonus = await recordCheckin(user, Date.now(), "assignment");
      }
    }
  } catch (e) { console.error("leaderboard", e); }
  if (reveal) Object.assign(out, { answers, correct: result.correct, solutions });
  return out;
});

// ------------------------------------------------------------------ leaderboards
/**
 * Points (all in Hong Kong time):
 *  - practice set (incl. Redo my mistakes) or assignment: 100 per correct answer; sets of 5+ questions also get +500
 *    for 90%+ correct or +200 for 75–89%. Each assignment counts once (a redo after a teacher reset replaces it).
 *  - Explain: 300 for marking the card of the day as read, once a day.
 *  - Check-in bonus: +500 once a week (Mon–Sun) on the 3rd day with any practice set, assignment or card of the day.
 */
const PTS = { correct: 100, bonus90: 500, bonus75: 200, explain: 300, checkin: 500, checkinDays: 3 };
function setPoints(score, total) {
  let p = score * PTS.correct;
  if (total >= 5) { const a = score / total; if (a >= 0.9) p += PTS.bonus90; else if (a >= 0.75) p += PTS.bonus75; }
  return p;
}
/** Hong Kong time period keys: ISO week ("2026-W46"), month ("2026-11"), day ("2026-11-10") and "all". */
function periodKeys(ms = Date.now()) {
  const d = new Date(ms + 8 * 3600 * 1000);
  const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const t = new Date(Date.UTC(y, m, d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const wy = t.getUTCFullYear();
  const wk = Math.ceil(((t - Date.UTC(wy, 0, 1)) / 86400000 + 1) / 7);
  return { week: `${wy}-W${String(wk).padStart(2, "0")}`, month: `${y}-${String(m + 1).padStart(2, "0")}`, all: "all" };
}
function dayKey(ms = Date.now()) { return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10); }
const lbDocId = (form, period, key) => period === "all" ? `${form}_all` : `${form}_${period}_${key}`;
/** The student's form (F1–F6) and class, from the first class whose name starts with a form number ("4A", "F.4 Phy"). */
async function studentForm(email) {
  const cls = await db.collection("classes").where("studentEmails", "array-contains", email).get();
  for (const c of cls.docs) {
    const m = /^\s*(?:F\.?\s*)?([1-6])/i.exec(c.get("name") || "");
    if (m) return { form: `F${m[1]}`, classId: c.id, className: (c.get("name") || "").trim() };
  }
  return null;
}
/** "4A Chan Tai Man": class + the name on the class list (or the Google name). */
async function boardLabel(info, email, fallback) {
  const r = await db.doc(`classRosters/${info.classId}`).get();
  const row = (r.exists ? r.get("roster") || [] : []).find((x) => x.email === email);
  const cls = info.className.split(/\s+/)[0];
  return `${cls} ${(row && row.name) || fallback || email.split("@")[0]}`.trim();
}
/** Add points to the student's form boards (week, month, all time). counts: { sets, cards, bonus }. */
async function addPoints(user, pts, ms, counts = {}) {
  const info = await studentForm(user.email);
  if (!info) return null;
  const label = await boardLabel(info, user.email, user.name);
  const entry = { pts: FieldValue.increment(pts), label, email: user.email };
  for (const k of ["sets", "asg", "cards", "bonus"]) if (counts[k]) entry[k] = FieldValue.increment(counts[k]);
  for (const [period, key] of Object.entries(periodKeys(ms))) {
    await db.doc(`leaderboards/${lbDocId(info.form, period, key)}`).set({
      form: info.form, period, key, updatedAt: FieldValue.serverTimestamp(), scores: { [user.uid]: entry },
    }, { merge: true });
  }
  return info.form;
}
/**
 * Record today's activity (activity/{uid}_{day}); on the 3rd active day of the week, award the check-in bonus once.
 * Returns the bonus points awarded now (0 or 500).
 */
async function recordCheckin(user, ms, kind) {
  const day = dayKey(ms), week = periodKeys(ms).week;
  const ref = db.doc(`activity/${user.uid}_${day}`);
  const snap = await ref.get();
  await ref.set({ uid: user.uid, email: user.email, day, week, [kind]: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  if (snap.exists) return 0;                                        // not a new day
  const days = await db.collection("activity").where("uid", "==", user.uid).where("week", "==", week).get();
  if (days.size < PTS.checkinDays) return 0;
  const bref = db.doc(`checkinBonus/${user.uid}_${week}`);
  if ((await bref.get()).exists) return 0;
  await bref.set({ uid: user.uid, week, day, at: FieldValue.serverTimestamp() });
  await addPoints(user, PTS.checkin, ms, { bonus: 1 });
  return PTS.checkin;
}

/** Explain: 300 points the first time each day the student marks their card of the day as read. */
exports.explainRead = onCall(async (request) => {
  const user = await requireMember(request);
  const cardId = String((request.data || {}).cardId || "");
  const prog = await db.doc(`explainProgress/${user.uid}`).get();
  const today = prog.exists ? prog.get("today") : null;
  const read = prog.exists ? prog.get("read") || {} : {};
  if (!cardId || !today || today.cardId !== cardId || !read[cardId]) return { points: 0, reason: "not-card-of-the-day" };
  const day = dayKey();
  const act = await db.doc(`activity/${user.uid}_${day}`).get();
  if (act.exists && act.get("explain")) return { points: 0, reason: "already-today" };
  if (!(await addPoints(user, PTS.explain, Date.now(), { cards: 1 }))) return { points: 0, reason: "no-form" };
  await db.doc(`activity/${user.uid}_${day}`).set({ explainCard: cardId }, { merge: true });
  const checkinBonus = await recordCheckin(user, Date.now(), "explain");
  return { points: PTS.explain, checkinBonus };
});
function ranked(scores) {
  const rows = Object.entries(scores || {}).map(([uid, v]) => ({ uid, label: v.label, pts: v.pts || 0, sets: v.sets || 0, asg: v.asg || 0, cards: v.cards || 0, bonus: v.bonus || 0 }))
    .filter((r) => r.pts > 0).sort((a, b) => b.pts - a.pts || a.label.localeCompare(b.label));
  let last = null, rank = 0;
  rows.forEach((r, i) => { if (r.pts !== last) { rank = i + 1; last = r.pts; } r.rank = rank; });
  return rows;
}

/**
 * Leaderboard for one form and period ("week" | "month" | "all").
 * Students: their own form, top 10 plus their own rank. Teachers: any form, the full list (with email).
 */
exports.getLeaderboard = onCall(async (request) => {
  const user = await requireMember(request);
  const data = request.data || {};
  const period = ["week", "month", "all"].includes(data.period) ? data.period : "week";
  const teacher = await isTeacher(user.email);
  let form;
  if (teacher && data.form) form = /^F[1-6]$/.test(String(data.form)) ? String(data.form) : null;
  else { const info = await studentForm(user.email); form = info && info.form; }
  if (!form) return { form: null, period, rows: [], me: null };
  const keys = periodKeys();
  const snap = await db.doc(`leaderboards/${lbDocId(form, period, keys[period])}`).get();
  const all = ranked(snap.exists ? snap.get("scores") : {});
  const mine = all.find((r) => r.uid === user.uid) || null;
  const strip = (r) => ({ rank: r.rank, label: r.label, pts: r.pts, me: r.uid === user.uid });
  if (teacher) {
    const sc = snap.exists ? snap.get("scores") : {};
    return { form, period, key: keys[period], rows: all.map((r) => ({ ...strip(r), sets: r.sets, asg: r.asg, cards: r.cards, bonus: r.bonus, email: (sc[r.uid] || {}).email })), me: null, total: all.length };
  }
  return { form, period, key: keys[period], rows: all.slice(0, 10).map(strip), me: mine ? { rank: mine.rank, pts: mine.pts } : null, total: all.length };
});

/** Teachers: rebuild the current week's, month's and all-time boards from saved results (practice and assignments) and Explain activity. */
exports.rebuildLeaderboards = onCall(async (request) => {
  const user = requireSchoolUser(request);
  if (!(await isTeacher(user.email))) throw new HttpsError("permission-denied", "Teachers only.");
  const now = periodKeys();
  const forms = new Map(), docs = new Map(), days = new Map();   // days: uid -> week -> Set(day)
  const who = async (uid, email, name) => {
    if (!forms.has(email)) {
      const info = await studentForm(email);
      forms.set(email, info ? { info, label: await boardLabel(info, email, name) } : null);
    }
    return forms.get(email);
  };
  const credit = (f, uid, email, ms, pts, counts) => {
    const keys = periodKeys(ms);
    for (const period of ["week", "month", "all"]) {
      if (period !== "all" && keys[period] !== now[period]) continue;      // only the current week / month
      const id = lbDocId(f.info.form, period, keys[period]);
      if (!docs.has(id)) docs.set(id, { form: f.info.form, period, key: keys[period], scores: {} });
      const sc = docs.get(id).scores;
      sc[uid] = sc[uid] || { pts: 0, sets: 0, asg: 0, cards: 0, bonus: 0, label: f.label, email };
      sc[uid].pts += pts;
      for (const k of Object.keys(counts)) sc[uid][k] += counts[k];
    }
  };
  const active = (uid, email, ms) => {
    const w = periodKeys(ms).week, d = dayKey(ms);
    if (!days.has(uid)) days.set(uid, { email, weeks: new Map() });
    const weeks = days.get(uid).weeks;
    if (!weeks.has(w)) weeks.set(w, new Map());
    if (!weeks.get(w).has(d)) weeks.get(w).set(d, ms);
  };
  const asgPts = new Map();
  for (const d of (await db.collection("attempts").get()).docs) {
    const a = d.data();
    if (!a.email || !a.uid || (a.mode !== "practice" && a.mode !== "assignment")) continue;
    const f = await who(a.uid, a.email, a.name);
    if (!f) continue;
    const ms = a.submittedAt && a.submittedAt.toMillis ? a.submittedAt.toMillis() : Date.now();
    const pts = setPoints(a.score || 0, a.total || 0);
    credit(f, a.uid, a.email, ms, pts, a.mode === "practice" ? { sets: 1 } : { asg: 1 });
    if (a.mode === "assignment") asgPts.set(`${a.assignmentId}_${a.uid}`, { uid: a.uid, assignmentId: a.assignmentId, pts });
    active(a.uid, a.email, ms);
  }
  for (const d of (await db.collection("activity").get()).docs) {
    const a = d.data();
    if (!a.explain || !a.email) continue;
    const f = await who(a.uid, a.email, "");
    if (!f) continue;
    const ms = Date.parse(`${a.day}T12:00:00+08:00`);
    credit(f, a.uid, a.email, ms, PTS.explain, { cards: 1 });
    active(a.uid, a.email, ms);
  }
  for (const [uid, { email, weeks }] of days) {
    const f = forms.get(email);
    if (!f) continue;
    for (const [, ds] of weeks) {
      if (ds.size < PTS.checkinDays) continue;
      const third = [...ds.values()].sort((x, y) => x - y)[PTS.checkinDays - 1];
      credit(f, uid, email, third, PTS.checkin, { bonus: 1 });
    }
  }
  const old = await db.collection("leaderboards").get();
  for (const d of old.docs) {
    const v = d.data();
    if (v.period === "all" || v.key === now[v.period]) await d.ref.delete();   // past weeks/months are kept as history
  }
  for (const [id, v] of docs) await db.doc(`leaderboards/${id}`).set({ ...v, updatedAt: FieldValue.serverTimestamp() });
  for (const d of (await db.collection("assignmentPoints").get()).docs) await d.ref.delete();
  for (const [id, v] of asgPts) await db.doc(`assignmentPoints/${id}`).set({ ...v, at: FieldValue.serverTimestamp() });
  return { boards: docs.size, students: [...forms.values()].filter(Boolean).length };
});

/**
 * Teachers: the bytes of some question figures (base64), for building a Word paper in the browser.
 * (Reading Storage files from the browser would need a CORS setup on the bucket; this avoids that.)
 *   { names: ["SYSS-...png", ...] }  (up to 25 per call)
 */
exports.figureData = onCall(async (request) => {
  const user = requireSchoolUser(request);
  if (!(await isTeacher(user.email))) throw new HttpsError("permission-denied", "Teachers only.");
  const names = [...new Set(((request.data || {}).names || []).map(String))]
    .filter((n) => /^[\w.\-]+\.(png|jpe?g|gif)$/i.test(n)).slice(0, 25);
  const bucket = getStorage().bucket();
  const out = {};
  await Promise.all(names.map(async (n) => {
    try { const [buf] = await bucket.file(`figures/${n}`).download(); out[n] = buf.toString("base64"); }
    catch (e) { out[n] = null; }
  }));
  return { figures: out };
});

/** Answers, correctness and solutions for a past attempt, if the student may see them now. */
exports.getReview = onCall(async (request) => {
  const user = requireSchoolUser(request);
  const { attemptId } = request.data || {};
  if (!attemptId) throw new HttpsError("invalid-argument", "Missing attemptId.");
  const at = await db.doc(`attempts/${attemptId}`).get();
  if (!at.exists) throw new HttpsError("not-found", "Attempt not found.");
  const teacher = await isTeacher(user.email);
  if (at.get("uid") !== user.uid && !teacher) throw new HttpsError("permission-denied", "Not your attempt.");

  let reveal = true, revealMode = "after_submit";
  if (at.get("mode") === "assignment" && !teacher) {
    const a = await db.doc(`classes/${at.get("classId")}/assignments/${at.get("assignmentId")}`).get();
    if (a.exists) { reveal = canReveal(a); revealMode = a.get("reveal") || "after_submit"; }
  }
  const questionIds = at.get("questionIds");
  const base = { score: at.get("score"), total: at.get("total"), responses: at.get("responses"),
                 questionIds, title: at.get("title"), revealed: reveal, reveal: revealMode,
                 dueAt: at.get("dueAt") ? at.get("dueAt").toMillis() : null };
  if (!reveal) return base;
  const { answers, solutions } = await loadKeys(questionIds);
  return { ...base, answers, solutions, correct: mark(questionIds, at.get("responses") || {}, answers).correct };
});
