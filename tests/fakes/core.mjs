// Shared in-memory "Firebase" used by both the client fakes (ESM) and the admin fakes (CJS).
export class Timestamp {
  constructor(ms) { this._ms = ms; }
  static now() { return new Timestamp(Date.now()); }
  static fromDate(d) { return new Timestamp(d.getTime()); }
  static fromMillis(m) { return new Timestamp(m); }
  toDate() { return new Date(this._ms); }
  toMillis() { return this._ms; }
}
export const SERVER_TS = { __serverTs: true };
const g = globalThis.__fake = globalThis.__fake || { store: new Map(), files: new Map(), user: null, listeners: [], handlers: {}, log: [] };
export const fake = g;
g.Timestamp = Timestamp; g.SERVER_TS = SERVER_TS;
let n = 0;
export const newId = () => `id${(++n).toString(36)}${Math.random().toString(36).slice(2, 7)}`;
g.newId = newId;
export function resolve(v) {
  if (v && v.__serverTs) return Timestamp.now();
  if (v instanceof Timestamp) return v;
  if (Array.isArray(v)) return v.map(resolve);
  if (v && typeof v === "object" && !(v instanceof Date)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolve(x)]));
  return v;
}
g.resolve = resolve;
const val = (x) => (x && typeof x.toMillis === "function" ? x.toMillis() : x);
function match(d, [field, op, v]) {
  const x = field === "__id__" ? d.id : d.data[field];
  switch (op) {
    case "==": return val(x) === val(v);
    case ">": return val(x) > val(v);
    case ">=": return val(x) >= val(v);
    case "<": return val(x) < val(v);
    case "<=": return val(x) <= val(v);
    case "in": return v.includes(x);
    case "array-contains": return Array.isArray(x) && x.includes(v);
    default: throw new Error("op " + op);
  }
}
export function runQuery(path, filters = [], orders = [], lim = 0) {
  let docs = [...g.store.entries()]
    .filter(([p]) => p.startsWith(path + "/") && !p.slice(path.length + 1).includes("/"))
    .map(([p, data]) => ({ id: p.split("/").pop(), path: p, data }));
  for (const f of filters) docs = docs.filter((d) => match(d, f));
  for (const [field, dir] of [...orders].reverse()) {
    docs.sort((a, b) => { const x = val(a.data[field]), y = val(b.data[field]); const c = x < y ? -1 : x > y ? 1 : 0; return dir === "desc" ? -c : c; });
  }
  if (lim) docs = docs.slice(0, lim);
  return docs;
}
g.runQuery = runQuery;
