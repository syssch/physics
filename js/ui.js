// Small DOM helpers shared by all views.
export function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = sanitize(v);
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined || c === false) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}

export function sanitize(html) {
  return window.DOMPurify ? window.DOMPurify.sanitize(String(html)) : String(html).replace(/<script[\s\S]*?<\/script>/gi, "");
}

export function mount(node) {
  const app = document.getElementById("app");
  app.replaceChildren(node);
  window.scrollTo(0, 0);
  typeset(app);
  return app;
}

export function typeset(node) {
  const run = () => window.MathJax?.typesetPromise?.([node]).catch(() => {});
  if (window.MathJax?.typesetPromise) run();
  else window.addEventListener("load", run, { once: true });
}

let toastTimer;
export function toast(msg, kind = "") {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = ""), 3500);
}

export function errMsg(e) {
  return (e && (e.message || e.code)) ? String(e.message || e.code).replace(/^Firebase: /, "") : String(e);
}

export function loading(text = "Loading…") { return el("p", { class: "muted" }, text); }

export function fmtDate(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-HK", { dateStyle: "medium", timeStyle: "short" });
}

export function toDate(ts) { return !ts ? null : ts.toDate ? ts.toDate() : new Date(ts); }

export function pct(n, d) { return d ? Math.round((100 * n) / d) : 0; }

export const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};

export function chunk(arr, n) { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; }
