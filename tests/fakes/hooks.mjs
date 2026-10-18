const MAP = { "firebase-app.js": "app.mjs", "firebase-auth.js": "auth.mjs", "firebase-firestore.js": "firestore.mjs",
  "firebase-storage.js": "storage.mjs", "firebase-functions.js": "functions.mjs" };
export async function resolve(spec, ctx, next) {
  if (spec.startsWith("https://www.gstatic.com/firebasejs/")) {
    const f = MAP[spec.split("/").pop()];
    return { url: new URL(f, import.meta.url).href, shortCircuit: true };
  }
  return next(spec, ctx);
}
