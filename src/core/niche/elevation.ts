import { VERIFICATION } from '../schema';
import { SCALES } from '../sheet';
import { NICHE_TYPE_LABEL, type NicheLayout } from './layout';
import { inches, RULE_DEF } from './rules';

/**
 * The niche on an A3 sheet: a front elevation to scale with the hardware, shelves and die-cut labels, the
 * dimension chains in millimetres and inches the way the fabrication drawings write them, alignment guides for
 * installers, the rules used and the label schedule. A self-contained SVG in paper millimetres, so it prints to
 * scale; the interface shows the same drawing.
 */

const PAPER = { w: 420, h: 297 };
const FRAME = 10;
const SIDE_W = 128;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => (Math.round(v * 100) / 100).toString();

export interface ElevationInfo { appLabel?: string; date?: string }
/** `focus` is the niche and its dimensions on the sheet, in paper mm, for a close-up view */
export interface ElevationResult { svg: string; scale: number; focus: { x: number; y: number; w: number; h: number } }

export function nicheElevation(l: NicheLayout, info: ElevationInfo = {}): ElevationResult {
  const W = l.width / 2;
  const margin = { l: 300, r: 330, t: 190, b: 45 };
  const x0w = -W - margin.l, x1w = W + margin.r, z1w = l.top + margin.t;
  const spanX = x1w - x0w, spanZ = z1w + margin.b;
  const ax0 = FRAME + 8, ax1 = PAPER.w - FRAME - SIDE_W - 8, ay0 = FRAME + 10, ay1 = PAPER.h - FRAME - 8;
  const scale = SCALES.find((s) => spanX / s <= ax1 - ax0 && spanZ / s <= ay1 - ay0) ?? SCALES[SCALES.length - 1];
  const k = 1 / scale;
  const ox = ax0 + ((ax1 - ax0) - spanX * k) / 2;
  const oy = ay0 + ((ay1 - ay0) - spanZ * k) / 2;
  const X = (x: number) => ox + (x - x0w) * k;
  const Z = (z: number) => oy + (z1w - z) * k;

  const out: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, cls: string) => out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" class="${cls}"/>`);
  const rect = (x: number, y: number, w: number, h: number, cls: string, title?: string) => out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(w, 0.05))}" height="${n(Math.max(h, 0.05))}" class="${cls}">${title ? `<title>${esc(title)}</title>` : ''}</rect>`);
  const text = (x: number, y: number, s: string, cls: string, anchor = 'middle', rot = 0, size?: number) =>
    out.push(`<text x="${n(x)}" y="${n(y)}" class="${cls}" text-anchor="${anchor}"${size ? ` style="font-size:${n(size)}px"` : ''}${rot ? ` transform="rotate(${rot} ${n(x)} ${n(y)})"` : ''}>${esc(s)}</text>`);

  // wall, opening, shelves
  out.push('<g id="niche">');
  rect(X(-W - 220), Z(Math.min(l.top + 220, z1w)), (l.width + 440) * k, (Math.min(l.top + 220, z1w)) * k, 'wall');
  rect(X(-W), Z(l.top), l.width * k, l.height * k, 'opening');
  for (const sh of l.shelves) rect(X(-W), Z(sh.top), l.width * k, (sh.top - sh.under) * k, 'shelf');
  line(X(x0w + 40), Z(0), X(x1w - 40), Z(0), 'floor');
  text(X(x0w + 40), Z(0) + 3.6, 'FFL', 'small', 'start');
  out.push('</g>');

  // install guides: the left edge of each unit's type, and each row's label line
  out.push('<g id="guides">');
  const cols = [...new Set(l.labels.map((lb) => Math.round(lb.x0 * 10) / 10))];
  for (const x of cols) line(X(x), Z(l.top) - 2, X(x), Z(l.sill) + 2, 'guide');
  for (const z of [...new Set(l.labels.map((lb) => Math.round(lb.z0 * 10) / 10))]) line(X(-W) - 2, Z(z), X(W) + 2, Z(z), 'guide');
  out.push('</g>');

  // hardware and labels
  out.push('<g id="hardware">');
  for (const u of l.units) rect(X(u.x0), Z(u.z1), (u.x1 - u.x0) * k, (u.z1 - u.z0) * k, `unit ${u.status}`, `${u.name} · ${Math.round(u.x1 - u.x0)} × ${Math.round(u.z1 - u.z0)} mm · ${VERIFICATION[u.status].label}`);
  out.push('</g><g id="labels">');
  for (const lb of l.labels) text(X(lb.x0), Z(lb.z0), lb.text, 'vinyl', 'start', 0, Math.max(lb.cap * k / 0.72, 0.6));
  out.push('</g>');

  // dimensions: chain values in mm with inches under them
  out.push('<g id="dimensions">');
  const tick = (x: number, y: number) => line(x - 1, y + 1, x + 1, y - 1, 'tick');
  const dimH = (a: number, b: number, y: number, mm: number, below = true) => {
    line(X(a), y, X(b), y, 'dim'); tick(X(a), y); tick(X(b), y);
    const cx = (X(a) + X(b)) / 2;
    if (below) { text(cx, y + 3.1, String(Math.round(mm)), 'dimtext'); text(cx, y + 5.6, inches(mm), 'dimin'); }
    else { text(cx, y - 3.4, String(Math.round(mm)), 'dimtext'); text(cx, y - 1, inches(mm), 'dimin'); }
  };
  const dimV = (x: number, a: number, b: number, mm: number, left = false) => {
    line(x, Z(a), x, Z(b), 'dim'); tick(x, Z(a)); tick(x, Z(b));
    const cy = (Z(a) + Z(b)) / 2;
    if (Math.abs(Z(a) - Z(b)) < 5.5) { text(left ? x - 1.6 : x + 1.6, cy + 1, `${Math.round(mm)} · ${inches(mm)}`, 'dimtext', left ? 'end' : 'start'); return; }
    text(left ? x - 3.4 : x + 1.8, cy, String(Math.round(mm)), 'dimtext', 'middle', -90);
    text(left ? x - 1.2 : x + 4.2, cy, inches(mm), 'dimin', 'middle', -90);
  };
  dimH(-W, W, Z(l.top) - 9, l.width, false);
  for (const ch of l.rowChains) {
    const below = l.spec.type === 'shelf' ? Z(l.shelves[l.spec.rows.length - 1 - ch.row]?.under ?? ch.z) + 2.2 : Z(ch.z) + 2.2 + (l.labels[0]?.cap ?? 0) * k + 6;
    for (const sg of ch.segs) if (sg.kind !== 'space' || sg.b - sg.a > 1) dimH(sg.a, sg.b, below, sg.b - sg.a);
  }
  const xr = X(W) + 7;
  for (const h of l.heightChain) dimV(xr, h.a, h.b, h.b - h.a);
  dimV(X(-W) - 8, l.sill, l.top, l.height, true);
  dimV(X(-W) - 18, 0, l.sill, l.sill, true);
  text(X(-W) - 18, Z(0) + 3.4, 'AFF', 'tiny');
  line(X(-W) - 24, Z(l.centre), X(W) + 24, Z(l.centre), 'centre');
  text(X(W) + 25, Z(l.centre) + 1, `CL ${Math.round(l.centre)} AFF · ${inches(l.centre)}`, 'small', 'start');
  if (l.spec.type === 'shelf' && l.labelOffset != null && l.shelves.length) {
    const sh = l.shelves[0];
    const xm = X(W) + 22;
    line(xm, Z(sh.top), xm, Z(sh.top + l.labelOffset), 'dim'); tick(xm, Z(sh.top)); tick(xm, Z(sh.top + l.labelOffset));
    text(xm + 1.5, Z(sh.top + l.labelOffset / 2), `label line ${Math.round(l.labelOffset)} · ${inches(l.labelOffset)} above every shelf`, 'tiny', 'start');
  }
  out.push('</g>');

  text(ax0, ay0 - 2, `FRONT ELEVATION · ${l.spec.code} ${l.spec.name}`.toUpperCase(), 'view', 'start');

  // side column: title, opening, rules, label schedule
  const sx = PAPER.w - FRAME - SIDE_W;
  line(sx, FRAME, sx, PAPER.h - FRAME, 'frame');
  let y = FRAME + 8;
  const put = (s: string, cls: string, dy: number) => { text(sx + 4, y, s, cls, 'start'); y += dy; };
  const wrap = (s: string, max: number) => { const words = s.split(' '); const lines: string[] = []; let cur = ''; for (const w of words) { if ((cur + ' ' + w).trim().length > max) { lines.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); } if (cur) lines.push(cur); return lines; };
  put(`${l.spec.code} ${l.spec.name}`, 'title', 6);
  put(`${NICHE_TYPE_LABEL[l.spec.type]} · ${l.rules.name} rules`, 'small', 5);
  put(`Opening ${Math.round(l.width)} × ${Math.round(l.height)} mm (${inches(l.width)} × ${inches(l.height)})`, 'small', 4.4);
  put(`Sill ${Math.round(l.sill)} AFF · depth ${Math.round(l.depth)} · ${VERIFICATION[l.status].label}`, 'small', 7);
  put('RULES USED', 'view', 4.6);
  for (const key of l.used) {
    const v = l.rules.values[key];
    const src = l.rules.sources.find((s) => s.id === v.sourceId);
    put(`${RULE_DEF.get(key)!.label}  ${Math.round(v.value)} mm · ${inches(v.value)}`, 'tiny', 3.1);
    put(`   ${VERIFICATION[v.status].label}${src ? ` · ${src.title.replace('GTC Berlin 2026 ', '')} ${v.ref ?? ''}` : ''}`, 'tiny faint', 3.7);
  }
  y += 2.5;
  put(`LABELS · ${l.rules.labels.colour}`.toUpperCase(), 'view', 4.6);
  for (const lb of l.labels) {
    if (y > PAPER.h - FRAME - 34) { put(`+ ${l.labels.length - l.labels.indexOf(lb)} more in the label schedule`, 'tiny', 3.4); break; }
    for (const [i, s] of wrap(`${lb.code}  ${lb.text}`, 58).entries()) put(i ? `        ${s}` : s, 'tiny', 3.1);
  }
  y = PAPER.h - FRAME - 26;
  line(sx, y - 4, PAPER.w - FRAME, y - 4, 'frame');
  put(`Scale 1:${scale} at A3 · mm and inches · ${info.date ?? new Date().toISOString().slice(0, 10)}`, 'tiny', 3.6);
  for (const s of wrap('Built from the placement rules; check every Estimated value before fabrication. Type is shown at its cap height, its length estimated.', 62)) put(s, 'tiny', 3.4);
  put(info.appLabel ?? 'MAESTRO', 'tiny faint', 3.4);

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAPER.w}mm" height="${PAPER.h}mm" viewBox="0 0 ${PAPER.w} ${PAPER.h}">
<title>${esc(`${l.spec.code} ${l.spec.name}`)}</title>
<style>${STYLE}</style>
<rect x="0" y="0" width="${PAPER.w}" height="${PAPER.h}" fill="#fff"/>
<rect x="${FRAME}" y="${FRAME}" width="${PAPER.w - 2 * FRAME}" height="${PAPER.h - 2 * FRAME}" class="frame"/>
${out.join('\n')}
</svg>
`;
  const fx0 = X(-W) - 26, fx1 = X(W) + 62, fy0 = Z(l.top) - 16, fy1 = Z(l.sill) + 14;
  return { svg, scale, focus: { x: fx0, y: fy0, w: fx1 - fx0, h: fy1 - fy0 } };
}

const STYLE = `
text{font-family:Inter,Helvetica,Arial,sans-serif;fill:#1d1d1f}
.frame{fill:none;stroke:#1d1d1f;stroke-width:.35}
.wall{fill:#2a2b2e}
.opening{fill:#fbfbf8;stroke:#c8c8c2;stroke-width:.25}
.shelf{fill:#e3e3de;stroke:#b9b9b3;stroke-width:.15}
.floor{stroke:#1d1d1f;stroke-width:.4}
.unit{fill:#5f6064;stroke:#3a3b3e;stroke-width:.15}
.unit.estimated{fill:#8a8b8f}
.unit.placeholder{fill:none;stroke-dasharray:1 .8}
.vinyl{fill:#111;font-weight:600}
.guide{stroke:#e0249a;stroke-width:.2;stroke-dasharray:1.2 .9;opacity:.75}
.centre{stroke:#0a84ff;stroke-width:.2;stroke-dasharray:3 1 .6 1}
.dim{stroke:#0a84ff;stroke-width:.18}
.tick{stroke:#0a84ff;stroke-width:.3}
.dimtext{font-size:2.3px;fill:#0a5fc0}
.dimin{font-size:1.9px;fill:#0a5fc0;opacity:.85}
.view{font-size:2.7px;font-weight:700;letter-spacing:.06em}
.title{font-size:4.2px;font-weight:700}
.small{font-size:2.5px}
.tiny{font-size:2.05px}
.faint{fill:#6e6e73}
`;
