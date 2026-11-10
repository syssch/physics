// Word (.docx) export of a printable paper, built entirely in the browser.
// Maths written as LaTeX ($...$) becomes real Word equations (OMML), so teachers can edit them.
// No library needed: the .docx (a zip of XML files) is written with a tiny "stored" zip writer.

// ------------------------------------------------------------------ zip (stored, no compression)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
const enc = new TextEncoder();
/** files: [{ name, data: Uint8Array | string }] -> Uint8Array (zip) */
export function zipStore(files) {
  const parts = [], central = [];
  let offset = 0;
  const u16 = (v) => [v & 0xff, (v >>> 8) & 0xff];
  const u32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
  for (const f of files) {
    const name = enc.encode(f.name);
    const data = typeof f.data === "string" ? enc.encode(f.data) : f.data;
    const crc = crc32(data);
    const head = new Uint8Array([...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)]);
    parts.push(head, name, data);
    central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
      ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
      ...u32(0), ...u32(offset)]), name);
    offset += head.length + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
    ...u32(cdSize), ...u32(offset), ...u16(0)]);
  const all = [...parts, ...central, end];
  const out = new Uint8Array(all.reduce((s, p) => s + p.length, 0));
  let p = 0;
  for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

// ------------------------------------------------------------------ LaTeX -> OMML
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SYM = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ϵ", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", vartheta: "ϑ",
  iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ",
  phi: "ϕ", varphi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π",
  Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
  times: "×", div: "÷", cdot: "·", pm: "±", mp: "∓", circ: "°", textdegree: "°", degree: "°", propto: "∝", approx: "≈",
  sim: "∼", simeq: "≃", ne: "≠", neq: "≠", le: "≤", leq: "≤", ge: "≥", geq: "≥", gg: "≫", ll: "≪", equiv: "≡",
  to: "→", rightarrow: "→", Rightarrow: "⇒", leftarrow: "←", Leftarrow: "⇐", leftrightarrow: "↔", Leftrightarrow: "⇔",
  uparrow: "↑", downarrow: "↓", infty: "∞", parallel: "∥", perp: "⊥", angle: "∠", odot: "⊙", otimes: "⊗", oplus: "⊕",
  ldots: "…", cdots: "⋯", dots: "…", ell: "ℓ", hbar: "ℏ", partial: "∂", nabla: "∇", sum: "∑", int: "∫", prod: "∏",
  langle: "⟨", rangle: "⟩", prime: "′", therefore: "∴", because: "∵", in: "∈", lvert: "|", rvert: "|", vert: "|", mid: "|",
  "{": "{", "}": "}", "%": "%", "$": "$", "&": "&", "#": "#", "_": "_", "|": "‖",
};
const SPACES = { ",": " ", " ": " ", ";": " ", ":": " ", "!": "", quad: "  ", qquad: "    ", enspace: " ", thinspace: " " };
const FUNCS = new Set(["sin", "cos", "tan", "sec", "csc", "cot", "ln", "log", "exp", "max", "min", "lim", "arcsin", "arccos", "arctan"]);
const TEXTCMDS = new Set(["text", "mathrm", "textrm", "rm", "mbox", "textit", "mathit", "mathbf", "textbf", "operatorname", "mathcal", "mathsf", "textup"]);

const mrun = (t, sty) => t === "" ? "" : `<m:r>${sty ? `<m:rPr><m:sty m:val="${sty}"/></m:rPr>` : ""}<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/></w:rPr><m:t xml:space="preserve">${esc(t)}</m:t></m:r>`;

/** Convert a LaTeX maths string (no surrounding $) into the inner XML of an m:oMath element. */
export function latexToOmml(src) {
  let i = 0;
  const s = String(src);
  const ws = () => { while (i < s.length && /\s/.test(s[i])) i++; };
  const cmdName = () => {          // at a backslash
    i++;
    if (i >= s.length) return "";
    if (/[a-zA-Z]/.test(s[i])) { const st = i; while (i < s.length && /[a-zA-Z]/.test(s[i])) i++; return s.slice(st, i); }
    return s[i++];
  };
  const rawGroup = () => {         // contents of {...} or a single token, as raw text
    ws();
    if (s[i] === "{") {
      let d = 0; const st = i + 1;
      for (; i < s.length; i++) {
        if (s[i] === "\\") { i++; continue; }
        if (s[i] === "{") d++;
        else if (s[i] === "}" && --d === 0) { const r = s.slice(st, i); i++; return r; }
      }
      return s.slice(st);
    }
    if (s[i] === "\\") { const st = i; cmdName(); return s.slice(st, i); }
    return s[i++] || "";
  };
  const arg = () => latexToOmml(rawGroup());
  const delim = () => {
    ws();
    if (s[i] === "\\") { const c = cmdName(); return { "{": "{", "}": "}", langle: "⟨", rangle: "⟩", lvert: "|", rvert: "|", vert: "|", "|": "‖" }[c] ?? ""; }
    const c = s[i++]; return c === "." ? "" : c;
  };
  function atom() {
    ws();
    if (i >= s.length) return null;
    const c = s[i];
    if (c === "{") return latexToOmml(rawGroup());
    if (c === "}") { i++; return ""; }
    if (c === "^" || c === "_") return "";          // script with no base
    if (c === "'") { i++; return mrun("′"); }
    if (c === "~") { i++; return mrun(" "); }
    if (c === "\\") {
      const st = i;
      const n = cmdName();
      if (n === "frac" || n === "dfrac" || n === "tfrac" || n === "cfrac") { const a = arg(), b = arg(); return `<m:f><m:num>${a}</m:num><m:den>${b}</m:den></m:f>`; }
      if (n === "sqrt") {
        ws(); let deg = "";
        if (s[i] === "[") { const e = s.indexOf("]", i); deg = latexToOmml(s.slice(i + 1, e < 0 ? s.length : e)); i = e < 0 ? s.length : e + 1; }
        const x = arg();
        return `<m:rad><m:radPr><m:degHide m:val="${deg ? 0 : 1}"/></m:radPr><m:deg>${deg}</m:deg><m:e>${x}</m:e></m:rad>`;
      }
      if (n === "left") {
        const open = delim();
        let d = 1, j = i;                             // find the matching \right
        while (j < s.length) {
          if (s.startsWith("\\left", j) && !/[a-zA-Z]/.test(s[j + 5] || "")) { d++; j += 5; continue; }
          if (s.startsWith("\\right", j) && !/[a-zA-Z]/.test(s[j + 6] || "")) { if (--d === 0) break; j += 6; continue; }
          j++;
        }
        const inner = latexToOmml(s.slice(i, j));
        i = Math.min(s.length, j + 6);
        const close = i <= s.length ? delim() : "";
        return `<m:d><m:dPr><m:begChr m:val="${esc(open)}"/><m:endChr m:val="${esc(close)}"/></m:dPr><m:e>${inner}</m:e></m:d>`;
      }
      if (n === "right") { delim(); return ""; }
      if (TEXTCMDS.has(n)) {
        const t = rawGroup().replace(/\\([,;: !]|quad)/g, " ").replace(/\\([%$&#_{}])/g, "$1").replace(/\\[a-zA-Z]+\s*/g, "").replace(/[{}]/g, "");
        return mrun(t, n === "mathbf" || n === "textbf" ? "b" : n === "textit" || n === "mathit" ? "i" : "p");
      }
      if (n === "vec" || n === "hat" || n === "dot" || n === "ddot" || n === "tilde") {
        const chr = { vec: "⃗", hat: "̂", dot: "̇", ddot: "̈", tilde: "̃" }[n];
        return `<m:acc><m:accPr><m:chr m:val="${chr}"/></m:accPr><m:e>${arg()}</m:e></m:acc>`;
      }
      if (n === "bar" || n === "overline") return `<m:bar><m:barPr><m:pos m:val="top"/></m:barPr><m:e>${arg()}</m:e></m:bar>`;
      if (n === "underline") return `<m:bar><m:barPr><m:pos m:val="bot"/></m:barPr><m:e>${arg()}</m:e></m:bar>`;
      if (n === "xrightarrow" || n === "xleftarrow" || n === "overset" || n === "stackrel") {
        ws(); if (s[i] === "[") { const e = s.indexOf("]", i); i = e < 0 ? s.length : e + 1; }
        const top = arg();
        const base = n === "xrightarrow" ? mrun("→") : n === "xleftarrow" ? mrun("←") : arg();
        return `<m:limUpp><m:e>${base}</m:e><m:lim>${top}</m:lim></m:limUpp>`;
      }
      if (n in SPACES) return mrun(SPACES[n]);
      if (FUNCS.has(n)) return mrun(n, "p");
      if (n in SYM) return mrun(SYM[n], /^[A-Za-z]+$/.test(n) && /^[α-ωϵϑϕ]$/.test(SYM[n]) ? undefined : "p");
      if (n === "displaystyle" || n === "textstyle" || n === "limits" || n === "nolimits") return "";
      if (n === "begin" || n === "end") { rawGroup(); return ""; }
      if (n === "\\") return mrun(" ");
      return mrun(s.slice(st + 1, i), "p");            // unknown command: keep its name as text
    }
    if (/[0-9.]/.test(c)) { const st = i; while (i < s.length && /[0-9.]/.test(s[i])) i++; return mrun(s.slice(st, i)); }
    if (/[A-Za-z]/.test(c)) { const st = i; while (i < s.length && /[A-Za-z]/.test(s[i])) i++; return mrun(s.slice(st, i)); }
    i++;
    return mrun(c);
  }
  const script = () => {
    ws();
    if (s[i] === "{") return latexToOmml(rawGroup());
    if (s[i] === "\\") return atom() || "";
    return s[i] ? mrun(s[i++]) : "";
  };
  let out = "";
  while (i < s.length) {
    const base = atom();
    if (base === null) break;
    let sup = null, sub = null;
    for (;;) {
      ws();
      if (s[i] === "^" && sup === null) { i++; sup = script(); continue; }
      if (s[i] === "_" && sub === null) { i++; sub = script(); continue; }
      break;
    }
    if (sup !== null && sub !== null) out += `<m:sSubSup><m:e>${base}</m:e><m:sub>${sub}</m:sub><m:sup>${sup}</m:sup></m:sSubSup>`;
    else if (sup !== null) out += `<m:sSup><m:e>${base}</m:e><m:sup>${sup}</m:sup></m:sSup>`;
    else if (sub !== null) out += `<m:sSub><m:e>${base}</m:e><m:sub>${sub}</m:sub></m:sSub>`;
    else out += base;
  }
  return out;
}

// ------------------------------------------------------------------ HTML -> Word paragraphs
const B64 = (str) => { const bin = atob(str); const a = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) a[k] = bin.charCodeAt(k); return a; };

function pngSize(bytes) {
  if (bytes && bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return { w: dv.getUint32(16), h: dv.getUint32(20) };
  }
  return null;
}

/** Splits text on $...$ / $$...$$ into text and maths pieces ("\$" stays a dollar sign). */
function splitMath(text) {
  const out = [];
  const t = text.replace(/\\\$/g, "\u0001");
  const re = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g;
  let last = 0, m;
  while ((m = re.exec(t))) {
    if (m.index > last) out.push({ text: t.slice(last, m.index).replace(/\u0001/g, "$") });
    out.push({ math: (m[1] || m[2]).replace(/\u0001/g, "\\$") });
    last = re.lastIndex;
  }
  if (last < t.length) out.push({ text: t.slice(last).replace(/\u0001/g, "$") });
  return out;
}

/**
 * HTML -> list of blocks. Each block: { kind: "p" | "li" | "img", items: [...] } where items are
 * { text, b, i, u, sup, sub } | { math } | { br: true }; an "img" block has { src }.
 */
export function htmlToBlocks(html) {
  const doc = new (globalThis.DOMParser || window.DOMParser)().parseFromString(`<div>${html || ""}</div>`, "text/html");
  const blocks = [];
  let cur = null;
  const open = (kind = "p") => { cur = { kind, items: [] }; blocks.push(cur); return cur; };
  const close = () => { cur = null; };
  function walk(node, fmt) {
    for (const n of node.childNodes) {
      if (n.nodeType === 3) {
        const txt = n.nodeValue.replace(/\s+/g, " ");
        if (!txt.trim() && (!cur || !cur.items.length)) continue;
        if (!cur) open();
        splitMath(txt).forEach((p) => cur.items.push(p.math !== undefined ? { math: p.math } : { text: p.text, ...fmt }));
        continue;
      }
      if (n.nodeType !== 1) continue;
      const tag = n.tagName.toLowerCase();
      if (tag === "p" || tag === "div") { close(); walk(n, fmt); close(); }
      else if (tag === "ul" || tag === "ol") { close(); walk(n, fmt); close(); }
      else if (tag === "li") { close(); open("li"); walk(n, fmt); close(); }
      else if (tag === "br") { if (!cur) open(); cur.items.push({ br: true }); }
      else if (tag === "img") { close(); blocks.push({ kind: "img", src: n.getAttribute("src") || "" }); }
      else if (tag === "table") {
        close();
        n.querySelectorAll("tr").forEach((tr) => {
          open();
          [...tr.children].forEach((td, k) => { if (k) cur.items.push({ text: "\t" }); walk(td, fmt); });
          close();
        });
      }
      else {
        const f = { ...fmt };
        if (tag === "b" || tag === "strong") f.b = true;
        if (tag === "i" || tag === "em") f.i = true;
        if (tag === "u") f.u = true;
        if (tag === "sup") f.sup = true;
        if (tag === "sub") f.sub = true;
        walk(n, f);
      }
    }
  }
  walk(doc.body.firstChild, {});
  return blocks.filter((b) => b.kind === "img" || b.items.some((x) => x.br || x.math || (x.text && x.text.trim())));
}

// ------------------------------------------------------------------ document builder
const TW = 454;          // hanging indent for question numbers (0.8 cm, in twips)
const TEXT_W = 10200;    // usable width (A4, 1.5 cm margins), twips

class DocBuilder {
  constructor() { this.body = []; this.media = []; this.picId = 1; }
  runs(items) {
    return items.map((x) => {
      if (x.br) return "<w:r><w:br/></w:r>";
      if (x.math !== undefined) return `<m:oMath>${latexToOmml(x.math)}</m:oMath>`;
      if (x.tab) return "<w:r><w:tab/></w:r>";
      const pr = (x.b ? "<w:b/>" : "") + (x.i ? "<w:i/>" : "") + (x.u ? '<w:u w:val="single"/>' : "") +
        (x.sup ? '<w:vertAlign w:val="superscript"/>' : x.sub ? '<w:vertAlign w:val="subscript"/>' : "") + (x.size ? `<w:sz w:val="${x.size}"/>` : "");
      return String(x.text).split("\t").map((part, k) => (k ? `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:tab/></w:r>` : "") +
        (part ? `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${esc(part)}</w:t></w:r>` : "")).join("");
    }).join("");
  }
  para(items, o = {}) {
    const ppr = [];
    if (o.style) ppr.push(`<w:pStyle w:val="${o.style}"/>`);
    if (o.keepNext) ppr.push("<w:keepNext/>");
    if (o.keepLines) ppr.push("<w:keepLines/>");
    if (o.pageBreak) ppr.push("<w:pageBreakBefore/>");
    if (o.tabs) ppr.push(`<w:tabs>${o.tabs.map((t) => `<w:tab w:val="${t.val || "left"}" w:pos="${t.pos}"/>`).join("")}</w:tabs>`);
    ppr.push(`<w:spacing w:before="${o.before ?? 0}" w:after="${o.after ?? 60}"/>`);
    if (o.indent !== undefined || o.hanging) ppr.push(`<w:ind w:left="${o.indent || 0}"${o.hanging ? ` w:hanging="${o.hanging}"` : ""}/>`);
    if (o.align) ppr.push(`<w:jc w:val="${o.align}"/>`);
    return `<w:p><w:pPr>${ppr.join("")}</w:pPr>${this.runs(items)}</w:p>`;
  }
  add(xml) { this.body.push(xml); }
  image(bytes, maxWcm, maxHcm) {
    const sz = pngSize(bytes) || { w: 400, h: 300 };
    const emuPerCm = 360000;
    let w = sz.w * 9525 * 0.6, h = sz.h * 9525 * 0.6;        // crops are ~170 dpi: show at a sensible size
    const k = Math.min(1, (maxWcm * emuPerCm) / w, (maxHcm * emuPerCm) / h);
    w = Math.round(w * k); h = Math.round(h * k);
    const id = this.picId++;
    const name = `image${id}.png`;
    this.media.push({ name, bytes, rid: `rIdImg${id}` });
    return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="${id}" name="Picture ${id}"/>` +
      `<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
      `<pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${name}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="rIdImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
      `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
  }
  table(rows, o = {}) {      // rows: [[cellXml...]]; cellXml = paragraphs
    const cols = Math.max(...rows.map((r) => r.length));
    const width = o.width || TEXT_W - (o.indent || 0);
    const cw = o.colWidths || Array(cols).fill(Math.floor(width / cols));
    const b = o.borders ? "single" : "nil";
    const borders = `<w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map((s) => `<w:${s} w:val="${b}" w:sz="4" w:space="0" w:color="000000"/>`).join("")}</w:tblBorders>`;
    return `<w:tbl><w:tblPr><w:tblW w:w="${cw.reduce((a, c) => a + c, 0)}" w:type="dxa"/>${o.indent ? `<w:tblInd w:w="${o.indent}" w:type="dxa"/>` : ""}${borders}<w:tblLayout w:type="fixed"/>` +
      `<w:tblCellMar><w:left w:w="${o.cellPad ?? 60}" w:type="dxa"/><w:right w:w="${o.cellPad ?? 60}" w:type="dxa"/></w:tblCellMar></w:tblPr>` +
      `<w:tblGrid>${cw.map((w) => `<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>` +
      rows.map((r, ri) => `<w:tr>${o.cantSplit ? "<w:trPr><w:cantSplit/></w:trPr>" : ""}${r.map((c, ci) => `<w:tc><w:tcPr><w:tcW w:w="${cw[ci]}" w:type="dxa"/>${o.headerShade && ri % 2 === 0 ? '<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>' : ""}${o.vcenter ? '<w:vAlign w:val="center"/>' : ""}</w:tcPr>${c || "<w:p/>"}</w:tc>`).join("")}</w:tr>`).join("") +
      `</w:tbl>`;
  }
}

/** Answer grid: rows of 10 numbered boxes, optionally filled with letters. */
function gridXml(d, n, fill) {
  const rows = [], per = Math.min(10, Math.max(1, n));
  for (let r = 0; r < n; r += per) {
    const nums = [], cells = [];
    for (let k = r; k < r + per; k++) {
      nums.push(k < n ? d.para([{ text: String(k + 1), size: 16 }], { align: "center", after: 0 }) : d.para([], { after: 0 }));
      cells.push(k < n ? d.para(fill ? [{ text: fill(k), b: true }] : [{ text: " " }], { align: "center", after: 0, before: 60 }) : d.para([], { after: 0 }));
    }
    rows.push(nums, cells);
  }
  return d.table(rows, { borders: true, colWidths: Array(per).fill(640), headerShade: true, vcenter: true });
}

function questionXml(d, q, num, cfg, fig) {
  const blocks = htmlToBlocks(q.textHtml);
  let first = true;
  blocks.forEach((bl) => {
    if (bl.kind === "img") return;
    if (first) {
      const src = cfg.source ? [{ text: "\t" }, { text: q.sourceLabel || "", size: 16, i: true }] : [];
      d.add(d.para([{ text: `${num}.`, b: true }, { text: "\t" }, ...bl.items, ...src],
        { indent: TW, hanging: TW, tabs: [{ pos: TW }, ...(cfg.source ? [{ pos: TEXT_W, val: "right" }] : [])], before: 200, keepNext: true, keepLines: true }));
      first = false;
    } else {
      d.add(d.para(bl.items, { indent: bl.kind === "li" ? TW + 340 : TW, keepNext: true, keepLines: true }));
    }
  });
  if (first) d.add(d.para([{ text: `${num}.`, b: true }], { indent: TW, hanging: TW, before: 200, keepNext: true }));
  (q.figures || []).forEach((f) => {
    const bytes = fig.get(f);
    if (bytes) d.add(`<w:p><w:pPr><w:keepNext/><w:spacing w:before="40" w:after="40"/><w:ind w:left="${TW}"/></w:pPr>${d.image(bytes, 9, 6.5)}</w:p>`);
    else d.add(d.para([{ text: "[Figure could not be included]", i: true }], { indent: TW, keepNext: true }));
  });
  const keys = q.optionKeys || ["A", "B", "C", "D"];
  const o = q.optionsHtml || {};
  if (q.optionsType === "table" && o.rows) {
    const head = [d.para([], { after: 0 })].concat((o.headers || []).map((h) => d.para(htmlToBlocks(h).flatMap((b) => b.items || []), { after: 0 })));
    const body = keys.map((k) => [d.para([{ text: k, b: true }], { after: 0 })].concat(((o.rows || {})[k] || []).map((c) => d.para(htmlToBlocks(c).flatMap((b) => b.items || []), { after: 0 }))));
    const cols = head.length;
    const w0 = 500, rest = Math.floor((TEXT_W - TW - w0) / Math.max(1, cols - 1));
    d.add(d.table([head, ...body], { indent: TW, colWidths: [w0, ...Array(cols - 1).fill(Math.min(rest, 2600))], cantSplit: true }));
  } else {
    const texts = keys.map((k) => htmlToBlocks(o[k] || "").flatMap((b, bi) => b.kind === "img" ? [] : (bi ? [{ br: true }] : []).concat(b.items)));
    const plain = keys.map((k) => (o[k] || "").replace(/<[^>]+>/g, "").replace(/\$[^$]*\$/g, "xxxx").trim());
    const longest = Math.max(...plain.map((t) => t.length));
    const cols = longest <= 12 ? 4 : longest <= 32 ? 2 : 1;
    const rows = [];
    for (let r = 0; r < keys.length; r += cols) {
      rows.push(keys.slice(r, r + cols).map((k, c) => d.para([{ text: `${k}.`, b: true }, { text: "\t" }, ...texts[r + c]],
        { tabs: [{ pos: 400 }], indent: 400, hanging: 400, after: 20 })));
    }
    d.add(d.table(rows, { indent: TW, width: TEXT_W - TW, cantSplit: true, cellPad: 40 }));
  }
}

/**
 * Build the .docx. cfg: { title, subtitle, minutes, questions, nameLines, answerGrid, source, key, solutions,
 *   keys: Map(id -> { answer, solution }), figures: Map(name -> Uint8Array) }. Returns a Blob.
 */
export function buildPaperDocx(cfg) {
  const d = new DocBuilder();
  const qs = cfg.questions;
  const keyOf = (q) => (cfg.keys && cfg.keys.get(q.id)) || {};
  d.add(d.para([{ text: "Sing Yin Secondary School · Physics" }], { align: "center", after: 40 }));
  d.add(d.para([{ text: cfg.title, b: true, size: 32 }], { align: "center", after: 40 }));
  if (cfg.subtitle) d.add(d.para([{ text: cfg.subtitle }], { align: "center", after: 40 }));
  d.add(d.para([{ text: `${qs.length} question${qs.length === 1 ? "" : "s"}${cfg.minutes ? ` · Time allowed: ${cfg.minutes} minutes` : ""}`, size: 20 }], { align: "center", after: 160 }));
  if (cfg.nameLines) {
    d.add(d.para([{ text: "Name: " }, { text: "\t", u: true }, { text: "  Class: " }, { text: "\t", u: true }, { text: "  No.: " }, { text: "\t", u: true }, { text: "  Date: " }, { text: "\t", u: true }],
      { tabs: [{ pos: 4300 }, { pos: 6300 }, { pos: 7900 }, { pos: TEXT_W }], after: 160 }));
  }
  d.add(d.para([{ text: "Choose the best answer for each question." + (cfg.answerGrid ? " Write your answers in the boxes below." : ""), i: true }], { after: 80 }));
  if (cfg.answerGrid) { d.add(gridXml(d, qs.length)); d.add(d.para([], { after: 120 })); }
  qs.forEach((q, n) => questionXml(d, q, n + 1, cfg, cfg.figures || new Map()));
  d.add(d.para([{ text: "— END OF PAPER —", b: true }], { align: "center", before: 360 }));
  if (cfg.key) {
    d.add(d.para([{ text: `Answer key — ${cfg.title}`, b: true, size: 28 }], { pageBreak: true, after: 160 }));
    d.add(gridXml(d, qs.length, (k) => keyOf(qs[k]).answer || "—"));
    if (cfg.source) qs.forEach((q, n) => d.add(d.para([{ text: `${n + 1}. ${q.sourceLabel || ""}`, size: 18 }], { after: 0, before: n ? 0 : 160 })));
  }
  if (cfg.solutions) {
    d.add(d.para([{ text: `Worked solutions — ${cfg.title}`, b: true, size: 28 }], { pageBreak: true, after: 160 }));
    qs.forEach((q, n) => {
      const k = keyOf(q);
      d.add(d.para([{ text: `${n + 1}. Answer: ${k.answer || "—"}`, b: true }], { before: 200, keepNext: true }));
      if (!k.solution) { d.add(d.para([{ text: "No worked solution yet.", i: true }], { indent: TW })); return; }
      htmlToBlocks(k.solution).forEach((bl) => {
        if (bl.kind === "img") {
          const m = /^data:image\/png;base64,(.+)$/.exec(bl.src);
          if (m) d.add(`<w:p><w:pPr><w:spacing w:before="40" w:after="40"/><w:ind w:left="${TW}"/></w:pPr>${d.image(B64(m[1]), 7.5, 5.5)}</w:p>`);
        } else d.add(d.para(bl.items, { indent: TW }));
      });
    });
  }
  return packDocx(d);
}

function packDocx(d) {
  const NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"';
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document ${NS}><w:body>${d.body.join("")}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:right="850" w:bottom="850" w:left="850" w:header="425" w:footer="425" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman" w:hAnsi="Times New Roman" w:eastAsia="PMingLiU" w:cs="Times New Roman"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB" w:eastAsia="zh-HK"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="60" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `</w:styles>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    d.media.map((m) => `<Relationship Id="${m.rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join("") +
    `</Relationships>`;
  const types = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Default Extension="png" ContentType="image/png"/>` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`;
  const root = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const zip = zipStore([
    { name: "[Content_Types].xml", data: types }, { name: "_rels/.rels", data: root },
    { name: "word/document.xml", data: document }, { name: "word/styles.xml", data: styles },
    { name: "word/_rels/document.xml.rels", data: rels },
    ...d.media.map((m) => ({ name: `word/media/${m.name}`, data: m.bytes })),
  ]);
  return new Blob([zip], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
