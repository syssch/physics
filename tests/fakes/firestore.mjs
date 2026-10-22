import { fake, Timestamp, SERVER_TS, newId, resolve, runQuery } from "./core.mjs";
import { checkRead, checkWrite, checkList } from "./rules.mjs";
export { Timestamp };
const clone = (x) => (x === undefined ? undefined : structuredCloneTs(x));
function structuredCloneTs(v) {
  if (v instanceof Timestamp) return v;
  if (Array.isArray(v)) return v.map(structuredCloneTs);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, structuredCloneTs(x)]));
  return v;
}
export const getFirestore = () => ({ __db: true });
export const connectFirestoreEmulator = () => {};
export function collection(base, ...segs) { const p = base.__db ? segs.join("/") : `${base.path}/${segs.join("/")}`; return { type: "coll", path: p }; }
export function doc(base, ...segs) {
  if (base.type === "coll" && !segs.length) { const id = newId(); return { type: "doc", path: `${base.path}/${id}`, id }; }
  const p = base.__db ? segs.join("/") : `${base.path}/${segs.join("/")}`;
  return { type: "doc", path: p, id: p.split("/").pop() };
}
export const documentId = () => "__id__";
export const where = (f, op, v) => ({ kind: "where", f: [f, op, v] });
export const orderBy = (f, dir = "asc") => ({ kind: "order", o: [f, dir] });
export const limit = (n) => ({ kind: "limit", n });
export function query(ref, ...cs) {
  return { type: "query", path: ref.path, filters: cs.filter((c) => c.kind === "where").map((c) => c.f),
    orders: cs.filter((c) => c.kind === "order").map((c) => c.o), lim: (cs.find((c) => c.kind === "limit") || {}).n || 0 };
}
export const serverTimestamp = () => SERVER_TS;
const snap = (id, data) => ({ id, exists: () => data !== undefined, data: () => clone(data) });
export async function getDoc(ref) { const d = fake.store.get(ref.path); checkRead(ref.path, d); return snap(ref.id, d); }
export async function getDocs(q) {
  const qq = q.type === "query" ? q : { path: q.path, filters: [], orders: [], lim: 0 };
  checkList(qq.path);
  const docs = runQuery(qq.path, qq.filters, qq.orders, qq.lim);
  docs.forEach((d) => checkRead(d.path, d.data));
  const out = docs.map((d) => ({ id: d.id, data: () => clone(d.data), ref: { path: d.path, id: d.id } }));
  return { docs: out, size: out.length, empty: !out.length, forEach: (fn) => out.forEach(fn) };
}
async function after(path, before) { if (fake.afterWrite) await fake.afterWrite(path, before, fake.store.get(path)); }
export async function setDoc(ref, data) { const r = resolve(data); checkWrite(ref.path, r); const b = fake.store.get(ref.path); fake.store.set(ref.path, r); await after(ref.path, b); }
export async function addDoc(coll, data) { const ref = doc(coll); await setDoc(ref, data); return ref; }
export async function updateDoc(ref, data) {
  const cur = fake.store.get(ref.path); if (!cur) throw new Error("not-found " + ref.path);
  const r = { ...cur, ...resolve(data) }; checkWrite(ref.path, r); fake.store.set(ref.path, r); await after(ref.path, cur);
}
export async function deleteDoc(ref) { const b = fake.store.get(ref.path); checkWrite(ref.path, b, "delete"); fake.store.delete(ref.path); await after(ref.path, b); }
export function writeBatch() {
  const ops = [];
  return { set: (r, d) => ops.push(() => setDoc(r, d)), update: (r, d) => ops.push(() => updateDoc(r, d)),
    delete: (r) => ops.push(() => deleteDoc(r)), commit: async () => { for (const o of ops) await o(); } };
}
