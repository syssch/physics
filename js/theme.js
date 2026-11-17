// Light / dark theme. The choice ("light" | "dark" | "auto" = follow the device) is kept in localStorage("theme")
// and shown as html[data-theme="light"|"dark"]; index.html applies it before the page draws (no flash).
const KEY = "theme";
const mq = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
export function getTheme() {
  try { const t = localStorage.getItem(KEY); return t === "dark" || t === "auto" ? t : "light"; } catch (e) { return "light"; }
}
export function applyTheme(t = getTheme()) {
  const dark = t === "dark" || (t === "auto" && mq && mq.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", dark ? "#0f1520" : "#1f5fbf");
}
export function setTheme(t) {
  try { localStorage.setItem(KEY, t); } catch (e) {}
  applyTheme(t);
}
if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (getTheme() === "auto") applyTheme("auto"); });
applyTheme();
