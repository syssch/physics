// Fakes for firebase-admin and firebase-functions, backed by the same in-memory store.
const g = globalThis.__fake;
class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
const snapOf = (path, data) => ({ id: path.split("/").pop(), exists: data !== undefined, ref: docRef(path),
  get: (f) => (data || {})[f], data: () => data });
function applyOps(cur, d) {
  const out = { ...(cur || {}) };
  for (const [k, v] of Object.entries(d)) {
    if (v && v.__arrayUnion) out[k] = [...new Set([...(out[k] || []), ...v.__arrayUnion])];
    else out[k] = g.resolve(v);
  }
  return out;
}
function docRef(path) {
  return { path, id: path.split("/").pop(),
    get: async () => snapOf(path, g.store.get(path)),
    set: async (d, opts) => { g.store.set(path, applyOps(opts && opts.merge ? g.store.get(path) : {}, d)); },
    delete: async () => { g.store.delete(path); },
    update: async (d) => { if (!g.store.has(path)) throw new Error("NOT_FOUND"); g.store.set(path, { ...g.store.get(path), ...g.resolve(d) }); },
    collection: (sub) => collRef(`${path}/${sub}`) };
}
function collRef(path, filters = [], orders = [], lim = 0) {
  return { path,
    where: (f, op, v) => collRef(path, [...filters, [f, op, v]], orders, lim),
    orderBy: (f, d = "asc") => collRef(path, filters, [...orders, [f, d]], lim),
    limit: (n) => collRef(path, filters, orders, n),
    select: () => collRef(path, filters, orders, lim),
    doc: (id) => docRef(`${path}/${id || g.newId()}`),
    add: async (d) => { const r = docRef(`${path}/${g.newId()}`); await r.set(d); return r; },
    get: async () => { const docs = g.runQuery(path, filters, orders, lim).map((d) => snapOf(d.path, d.data));
      return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) }; } };
}
const db = { collection: (p) => collRef(p), doc: (p) => docRef(p), getAll: async (...refs) => Promise.all(refs.map((r) => r.get())) };
module.exports = {
  "firebase-admin/app": { initializeApp: () => ({}) },
  "firebase-admin/firestore": { getFirestore: () => db, FieldValue: { serverTimestamp: () => g.SERVER_TS, arrayUnion: (...x) => ({ __arrayUnion: x }) }, Timestamp: g.Timestamp },
  "firebase-functions/v2/firestore": { onDocumentWritten: (path, fn) => ({ run: fn, __trigger: path }) },
  "firebase-functions/v2/https": { onCall: (fn) => ({ run: fn }), HttpsError },
  "firebase-functions/v2": { setGlobalOptions: () => {} },
};
