// Chapters each form may practise. F3 students only learn these chapters in F3 (and not all go on to take Physics),
// so their Practise, Redo my mistakes and Explain cards are limited to them. Teachers (and other forms) are not limited.
// The same list is in functions/index.js (FORM_CHAPTERS) — change both together (a test checks they match).
import { db } from "./fb.js?v=202611130815";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";

export const FORM_CHAPTERS = { F3: ["1", "2", "17", "18", "19"] };

/** "F3" from a class name such as "3A", "F.3B", "F3 Physics"; null if it doesn't start with a form number. */
export const formOfClassName = (name) => { const m = /^\s*(?:F\.?\s*)?([1-6])/i.exec(name || ""); return m ? `F${m[1]}` : null; };

/** The limit for a list of class names: { form, chapters: Set } or null (no limit). */
export function limitForClasses(names) {
  for (const n of names) { const f = formOfClassName(n); if (f && FORM_CHAPTERS[f]) return { form: f, chapters: new Set(FORM_CHAPTERS[f]) }; }
  return null;
}

let cache = { email: null, limit: null };
/** The signed-in student's limit (null for teachers, including teachers in Student view, and for F4–F6). */
export async function chapterLimit(user) {
  if (!user || user.isTeacher) return null;
  if (cache.email === user.email) return cache.limit;
  let limit = null;
  try {
    const snap = await getDocs(query(collection(db, "classes"), where("studentEmails", "array-contains", user.email)));
    limit = limitForClasses(snap.docs.map((d) => d.data().name));
  } catch (e) { console.warn("chapter limit", e); }
  cache = { email: user.email, limit };
  return limit;
}

/** Books trimmed to the allowed chapters (books with none left are dropped). */
export function limitBooks(books, limit) {
  if (!limit) return books;
  return books.map((b) => ({ ...b, chapters: (b.chapters || []).filter((c) => limit.chapters.has(String(c.id))) })).filter((b) => b.chapters.length);
}

/** "Ch 1, 2, 17, 18 and 19" */
export const limitText = (limit) => {
  const c = [...limit.chapters]; return `Ch ${c.slice(0, -1).join(", ")}${c.length > 1 ? " and " : ""}${c[c.length - 1]}`;
};
