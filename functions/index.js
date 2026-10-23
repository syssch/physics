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

async function loadAnswers(questionIds) {
  const refs = questionIds.map((id) => db.doc(`answerKeys/${id}`));
  const snaps = refs.length ? await db.getAll(...refs) : [];
  const answers = {};
  snaps.forEach((s) => { if (s.exists) answers[s.id] = s.get("answer"); });
  return answers;
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

/** Start a practice set: random questions, optionally limited to one textbook chapter / topic / subtopic. */
exports.startPractice = onCall(async (request) => {
  const user = await requireMember(request);
  const { topic, subtopic, chapter } = request.data || {};
  const count = Math.max(1, Math.min(MAX_PRACTICE, parseInt((request.data || {}).count, 10) || 10));

  let q = db.collection("questions").where("active", "==", true);
  if (topic) q = q.where("topic", "==", String(topic));
  const snap = await q.select("subtopics", "chapters").get();
  const blocked = await openAssignmentQuestionIds(user.email);
  let pool = snap.docs
    .filter((d) => !subtopic || (d.get("subtopics") || []).includes(subtopic))
    .filter((d) => !chapter || (d.get("chapters") || []).includes(String(chapter)))
    .map((d) => d.id)
    .filter((id) => !blocked.has(id));
  if (!pool.length) throw new HttpsError("not-found", "No questions match that choice yet.");
  const questionIds = shuffle(pool).slice(0, count);

  const ref = await db.collection("sessions").add({
    uid: user.uid, email: user.email, mode: "practice",
    topic: topic || null, subtopic: subtopic || null, chapter: chapter ? String(chapter) : null,
    questionIds, submitted: false, createdAt: FieldValue.serverTimestamp(),
  });
  return { sessionId: ref.id, questionIds };
});

/**
 * Submit answers.
 *   practice:   { sessionId, responses }
 *   assignment: { classId, assignmentId, responses }
 * Returns the score, plus answers/correctness when the student is allowed to see them.
 */
exports.submitAnswers = onCall(async (request) => {
  const user = await requireMember(request);
  const data = request.data || {};
  let questionIds, attemptRef, meta, reveal;

  if (data.sessionId) {
    const sRef = db.doc(`sessions/${data.sessionId}`);
    const s = await sRef.get();
    if (!s.exists || s.get("uid") !== user.uid) throw new HttpsError("not-found", "Practice set not found.");
    if (s.get("submitted")) throw new HttpsError("failed-precondition", "This practice set was already submitted.");
    questionIds = s.get("questionIds");
    attemptRef = db.doc(`attempts/practice_${data.sessionId}`);
    meta = { mode: "practice", sessionId: data.sessionId, title: s.get("topic") ? `Practice: ${s.get("topic")}` : "Practice: mixed topics" };
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
    reveal = a.get("reveal") !== "after_due" || late;
  } else {
    throw new HttpsError("invalid-argument", "Missing sessionId or classId/assignmentId.");
  }

  const responses = cleanResponses(questionIds, data.responses);
  const answers = await loadAnswers(questionIds);
  const result = mark(questionIds, responses, answers);

  await attemptRef.set({
    uid: user.uid, email: user.email, name: user.name, ...meta,
    questionIds, responses, score: result.score, total: result.total,
    submittedAt: FieldValue.serverTimestamp(),
  });

  const out = { attemptId: attemptRef.id, score: result.score, total: result.total, revealed: reveal };
  if (reveal) Object.assign(out, { answers, correct: result.correct });
  return out;
});

/** Answers and correctness for a past attempt, if the student may see them now. */
exports.getReview = onCall(async (request) => {
  const user = requireSchoolUser(request);
  const { attemptId } = request.data || {};
  if (!attemptId) throw new HttpsError("invalid-argument", "Missing attemptId.");
  const at = await db.doc(`attempts/${attemptId}`).get();
  if (!at.exists) throw new HttpsError("not-found", "Attempt not found.");
  const teacher = await isTeacher(user.email);
  if (at.get("uid") !== user.uid && !teacher) throw new HttpsError("permission-denied", "Not your attempt.");

  let reveal = true;
  if (at.get("mode") === "assignment" && !teacher) {
    const a = await db.doc(`classes/${at.get("classId")}/assignments/${at.get("assignmentId")}`).get();
    if (a.exists && a.get("reveal") === "after_due") {
      const due = a.get("dueAt");
      reveal = !due || due.toMillis() <= Date.now();
    }
  }
  const questionIds = at.get("questionIds");
  const base = { score: at.get("score"), total: at.get("total"), responses: at.get("responses"),
                 questionIds, title: at.get("title"), revealed: reveal,
                 dueAt: at.get("dueAt") ? at.get("dueAt").toMillis() : null };
  if (!reveal) return base;
  const answers = await loadAnswers(questionIds);
  return { ...base, answers, correct: mark(questionIds, at.get("responses") || {}, answers).correct };
});
