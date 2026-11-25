// Pull-out "Constants" data sheet shown on every quiz screen (practice, assignments, Redo my mistakes).
// Content = the HKDSE Physics data sheet, exactly as Shi supplied it (Nov 2026). Plain HTML, no MathJax needed.
import { el, store } from "./ui.js?v=202611252309";

export const CONSTANTS = [
  ["molar gas constant", "<i>R</i> = 8.31 J mol<sup>−1</sup> K<sup>−1</sup>"],
  ["Avogadro constant", "<i>N</i><sub>A</sub> = 6.02 × 10<sup>23</sup> mol<sup>−1</sup>"],
  ["acceleration due to gravity", "<i>g</i> = 9.81 m s<sup>−2</sup> (close to the Earth)"],
  ["universal gravitational constant", "<i>G</i> = 6.67 × 10<sup>−11</sup> N m<sup>2</sup> kg<sup>−2</sup>"],
  ["speed of light in vacuum", "<i>c</i> = 3.00 × 10<sup>8</sup> m s<sup>−1</sup>"],
  ["charge of electron", "<i>q</i><sub>e</sub> = 1.60 × 10<sup>−19</sup> C"],
  ["electron rest mass", "<i>m</i><sub>e</sub> = 9.11 × 10<sup>−31</sup> kg"],
  ["permittivity of free space", "<i>ε</i><sub>0</sub> = 8.85 × 10<sup>−12</sup> C<sup>2</sup> N<sup>−1</sup> m<sup>−2</sup>"],
  ["permeability of free space", "<i>μ</i><sub>0</sub> = 4π × 10<sup>−7</sup> H m<sup>−1</sup>"],
  ["atomic mass unit", "u = 1.661 × 10<sup>−27</sup> kg <span class=\"cst-note\">(1 u is equivalent to 931 MeV)</span>"],
  ["astronomical unit", "AU = 1.50 × 10<sup>11</sup> m"],
  ["light year", "ly = 9.46 × 10<sup>15</sup> m"],
  ["parsec", "pc = 3.09 × 10<sup>16</sup> m = 3.26 ly = 206265 AU"],
  ["Stefan constant", "<i>σ</i> = 5.67 × 10<sup>−8</sup> W m<sup>−2</sup> K<sup>−4</sup>"],
  ["Planck constant", "<i>h</i> = 6.63 × 10<sup>−34</sup> J s"],
];

const KEY = "constantsOpen";

/** Returns the tab + panel (fixed to the right edge). Append it inside the quiz page so it goes away with it.
 *  The tab label is rotated with a CSS transform (not writing-mode: some phone browsers draw a vertical-writing
 *  button with zero width, leaving only its border). */
export function constantsPullout() {
  const wrap = el("div", { class: "cst" });
  const table = el("table", { class: "cst-table" });
  for (const [name, value] of CONSTANTS) {
    const v = el("td", { class: "cst-val" });
    v.innerHTML = value;                       // static, trusted content defined above
    table.append(el("tr", {}, [el("td", { class: "cst-name" }, name), v]));
  }
  const close = el("button", { class: "cst-close", type: "button", "aria-label": "Close constants" }, "×");
  const panel = el("aside", { class: "cst-panel", "aria-label": "Constants" }, [
    el("div", { class: "cst-head" }, [el("strong", {}, "Constants"), close]),
    el("div", { class: "cst-body" }, table)]);   // only the list scrolls; the header (× button) stays put
  const tab = el("button", { class: "cst-tab", type: "button", "aria-expanded": "false" }, el("span", {}, "Constants"));
  const set = (open, remember = true) => {
    wrap.classList.toggle("open", open);
    tab.setAttribute("aria-expanded", String(open));
    if (remember) store.set(KEY, open);
  };
  tab.addEventListener("click", () => set(!wrap.classList.contains("open")));
  close.addEventListener("click", () => set(false));
  wrap.append(tab, panel);
  // reopen if it was open last time — but not on phones, where the sheet would cover the question
  const phone = window.matchMedia ? window.matchMedia("(max-width: 760px)").matches : false;
  if (store.get(KEY) && !phone) set(true, false);
  return wrap;
}
