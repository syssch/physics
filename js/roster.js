import { db } from "./fb.js";
import { doc, getDoc, getDocs, setDoc, deleteDoc, collection, addDoc, updateDoc, serverTimestamp }
  from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
// Class rosters: each class keeps `studentEmails` (used for access) and an optional `roster`
// with class numbers and names, so teachers see "4A 12 Chan Tai Man" instead of an email.

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

/** Split one pasted row into { email, no, words, cname }.
 *  School format: Class | Number | Name | CName | Email (any column except Email may be missing).
 *  The Chinese-name cell is recognised by its Chinese characters; `words` are the other text cells in order. */
export function parseRow(raw) {
  const cells = raw.split(/\t|,|;|\|/).map((c) => c.trim()).filter(Boolean);
  const email = (cells.find((c) => c.includes("@")) || "").toLowerCase();
  const rest = cells.filter((c) => !c.includes("@"));
  const noCell = rest.find((c) => /^\d{1,3}$/.test(c));
  const cname = rest.filter((c) => c !== noCell && CJK.test(c)).join(" ");
  const words = rest.filter((c) => c !== noCell && !CJK.test(c));
  return { email, no: noCell ? Number(noCell) : null, words, cname };
}

/** The roster of a class as [{ email, no, name }], whether or not numbers/names were given. */
export function rosterOf(cls) {
  const byEmail = new Map((cls.roster || []).map((r) => [r.email, r]));
  return (cls.studentEmails || []).map((e) => byEmail.get(e) || { email: e, no: null, name: "", cname: "" });
}

/** "4A 12 Chan Tai Man 陳大文"; falls back to the Google name, then the email's user part. */
export function studentLabel(cls, email, fallbackName) {
  const r = rosterOf(cls).find((x) => x.email === email);
  if (r && (r.no || r.name || r.cname)) return [cls.name, r.no, r.name, r.cname].filter((x) => x !== null && x !== "" && x !== undefined).join(" ");
  const id = email.split("@")[0];
  return fallbackName && fallbackName !== email ? `${fallbackName} (${id})` : id;
}

/** Sort emails by class number (if known), then by label. */
export function sortByRoster(cls, emails, nameOf = () => "") {
  const ro = new Map(rosterOf(cls).map((r) => [r.email, r]));
  return [...emails].sort((a, b) => {
    const na = ro.get(a)?.no ?? 1e9, nb = ro.get(b)?.no ?? 1e9;
    if (na !== nb) return na - nb;
    return studentLabel(cls, a, nameOf(a)).localeCompare(studentLabel(cls, b, nameOf(b)));
  });
}

/** Build roster + studentEmails from rows, optionally merging into an existing class. */
export function mergeRoster(existing, rows, mode) {
  const map = new Map(mode === "add" ? rosterOf(existing || {}).map((r) => [r.email, { ...r }]) : []);
  for (const r of rows) {
    const prev = map.get(r.email) || { email: r.email, no: null, name: "", cname: "" };
    map.set(r.email, { email: r.email, no: r.no ?? prev.no, name: r.name || prev.name, cname: r.cname || prev.cname || "" });
  }
  const roster = [...map.values()].sort((a, b) => (a.no ?? 1e9) - (b.no ?? 1e9) || a.email.localeCompare(b.email));
  return { roster, studentEmails: roster.map((r) => r.email) };
}

// Names and class numbers are kept in a teacher-only document (classRosters/{classId}),
// so students can't see their classmates' details. The class document keeps only the emails needed for access.
export async function attachRosters(classes) {
  const snap = await getDocs(collection(db, "classRosters"));
  const map = new Map(snap.docs.map((d) => [d.id, d.data().roster || []]));
  classes.forEach((c) => { c.roster = map.get(c.id) || []; });
  return classes;
}
export async function attachRoster(cls, classId) {
  const s = await getDoc(doc(db, "classRosters", classId));
  cls.roster = s.exists() ? s.data().roster || [] : [];
  return cls;
}
/** Create or update a class from merged { roster, studentEmails }. */
export async function saveClass(classId, name, merged, user) {
  let id = classId;
  if (!id) id = (await addDoc(collection(db, "classes"), { name, studentEmails: merged.studentEmails, createdBy: user.email, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })).id;
  else await updateDoc(doc(db, "classes", id), { name, studentEmails: merged.studentEmails, updatedAt: serverTimestamp() });
  await setDoc(doc(db, "classRosters", id), { roster: merged.roster, updatedAt: serverTimestamp() });
  return id;
}
export async function deleteClass(classId) {
  await deleteDoc(doc(db, "classes", classId));
  try { await deleteDoc(doc(db, "classRosters", classId)); } catch (e) { console.warn(e); }
}
