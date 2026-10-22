// A JS mirror of firestore.rules, applied to every client read/write so permission mistakes show up in tests.
import { fake } from "./core.mjs";
const DOMAINS = ["@syss.edu.hk", "@singyin.edu.hk"];
function me() { return fake.user; }
function isSchool() { const u = me(); return !!u && u.emailVerified !== false && DOMAINS.some((d) => u.email.toLowerCase().endsWith(d)); }
function myEmail() { return me().email.toLowerCase(); }
function isTeacher() { return isSchool() && fake.store.has(`teachers/${myEmail()}`); }
function deny(op, path) { const e = new Error(`permission-denied: ${op} ${path} as ${me()?.email}`); e.code = "permission-denied"; throw e; }
export function checkRead(path, data) {
  const s = path.split("/");
  const ok = (() => {
    switch (s[0]) {
      case "teachers": return isSchool() && (s[1] === myEmail() || isTeacher());
      case "users": return isSchool() && (s[1] === me().uid || isTeacher());
      case "questions": case "meta": return isSchool();
      case "answerKeys": return isTeacher();
      case "classes":
        if (s.length === 2) return isTeacher() || (isSchool() && data && (data.studentEmails || []).includes(myEmail()));
        return isTeacher() || (isSchool() && (fake.store.get(`classes/${s[1]}`)?.studentEmails || []).includes(myEmail()));
      case "explainProgress": return isSchool() && (s[1] === me().uid || isTeacher());
      case "attempts": case "sessions": return isTeacher() && s[0] === "attempts" || (isSchool() && data && data.uid === me().uid);
      default: return false;
    }
  })();
  if (!ok) deny("read", path);
}
export function checkList(path) {
  const s = path.split("/");
  if (s[0] === "teachers" && !isTeacher()) deny("list", path);
}
export function checkWrite(path, data) {
  const s = path.split("/");
  const ok = (() => {
    switch (s[0]) {
      case "users": return isSchool() && s[1] === me().uid && Object.keys(data || {}).every((k) => ["email", "name", "lastLogin"].includes(k)) && data.email === myEmail();
      case "questions": case "answerKeys": case "meta": case "classes": case "teachers": return isTeacher();
      case "explainProgress": return isSchool() && s[1] === me().uid && Object.keys(data || {}).every((k) => ["email", "name", "read", "topics", "today", "updatedAt"].includes(k)) && data.email === myEmail();
      default: return false;
    }
  })();
  if (!ok) deny("write", path);
}
