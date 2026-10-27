import { extentOfShape, worldBoxes, type ShapeOf, type WorldBox } from './arrange';
import { CELL, plotEdges, type BoothAnalysis } from './booth';
import type { Composition, Placement, Vec3, Verification } from './schema';

/**
 * A dimensioned A3 drawing sheet for a composition: plan above front elevation (third-angle), drawn to a
 * standard scale, with item tags, an item list with verification statuses and a title block. Output is a
 * self-contained SVG in millimetres, so it prints to scale and opens in Illustrator or Rhino.
 * Every box is the generated or imported geometry the composition holds; nothing is redrawn by hand.
 */

export interface SheetItem { tag: number; name: string; dims: Vec3; status: Verification; base: number }
export interface SheetInfo { title?: string; project?: string; appLabel?: string; date?: string; statusOf: (p: Placement) => Verification }

const PAPER = { w: 420, h: 297 };
const FRAME = 10;
const LIST_W = 112;
const TITLE_H = 34;
export const SCALES = [1, 2, 5, 10, 20, 25, 50, 75, 100, 200, 500];

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const n = (v: number) => (Math.round(v * 100) / 100).toString();
const fmm = (v: number) => `${Math.round(v)}`;

const STATUS_LABEL: Record<Verification, string> = { verified: 'Verified', project: 'Project-specific', estimated: 'Estimated', placeholder: 'Placeholder' };

export interface SheetResult { svg: string; scale: number; items: SheetItem[]; overall: Vec3 }

export function buildSheet(c: Composition, shapeOf: ShapeOf, info: SheetInfo): SheetResult | null {
  const placed = c.items.map((p) => ({ p, shape: shapeOf(p) })).filter((x): x is { p: Placement; shape: NonNullable<ReturnType<ShapeOf>> } => !!x.shape);
  if (!placed.length) return null;
  const boxes: WorldBox[] = placed.flatMap(({ p, shape }) => worldBoxes(p, shape));
  const ext = placed.map(({ p, shape }) => ({ id: p.id, e: extentOfShape(p, shape) }));
  const min = [0, 1, 2].map((k) => Math.min(...ext.map((x) => x.e.min[k]))) as Vec3;
  const max = [0, 1, 2].map((k) => Math.max(...ext.map((x) => x.e.max[k]))) as Vec3;
  const W = max[0] - min[0], D = max[1] - min[1], H = max[2] - min[2];

  // drawing area left of the item list and above the title block, with room for dimension lines
  const areaX0 = FRAME + 14, areaX1 = PAPER.w - FRAME - LIST_W - 14;
  const areaY0 = FRAME + 12, areaY1 = PAPER.h - FRAME - TITLE_H - 16;
  const gap = 22; // between plan and elevation, for the plan's front dimension
  const fit = (s: number) => W / s <= areaX1 - areaX0 && (D + H) / s + gap <= areaY1 - areaY0;
  const scale = SCALES.find(fit) ?? SCALES[SCALES.length - 1];
  const k = 1 / scale;

  // sheet coordinates: plan on top (looking down, front −Y at the bottom), elevation below (looking at the front)
  const ox = areaX0 + ((areaX1 - areaX0) - W * k) / 2 - min[0] * k;
  const planTop = areaY0 + ((areaY1 - areaY0) - ((D + H) * k + gap)) / 2;
  const px = (x: number) => ox + x * k;
  const py = (y: number) => planTop + (max[1] - y) * k;
  const elevBase = planTop + D * k + gap + H * k;
  const ez = (z: number) => elevBase - (z - min[2]) * k;

  const out: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, cls: string) => out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" class="${cls}"/>`);
  const text = (x: number, y: number, s: string, cls: string, anchor = 'middle', rot = 0) =>
    out.push(`<text x="${n(x)}" y="${n(y)}" class="${cls}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${n(x)} ${n(y)})"` : ''}>${esc(s)}</text>`);
  const rect = (x: number, y: number, w: number, h: number, cls: string) => out.push(`<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(w, 0.05))}" height="${n(Math.max(h, 0.05))}" class="${cls}"/>`);

  // plan: low parts first so higher parts paint over them
  out.push('<g id="plan">');
  for (const b of [...boxes].sort((a, b2) => a.max[2] - b2.max[2])) rect(px(b.min[0]), py(b.max[1]), (b.max[0] - b.min[0]) * k, (b.max[1] - b.min[1]) * k, 'part');
  out.push('</g>');
  // front elevation: rear parts first so front parts paint over them
  out.push('<g id="elevation">');
  for (const b of [...boxes].sort((a, b2) => b2.min[1] - a.min[1])) rect(px(b.min[0]), ez(b.max[2]), (b.max[0] - b.min[0]) * k, (b.max[2] - b.min[2]) * k, 'part');
  line(px(min[0]) - 6, ez(min[2]), px(max[0]) + 6, ez(min[2]), 'floor');
  out.push('</g>');

  // dimensions: overall width under the elevation, height to its left, depth to the plan's left, width over the plan
  const dimH = (x1: number, x2: number, y: number, label: string, above = false) => {
    line(x1, y, x2, y, 'dim'); line(x1, y - 1.5, x1, y + 1.5, 'tick'); line(x2, y - 1.5, x2, y + 1.5, 'tick');
    text((x1 + x2) / 2, above ? y - 1.4 : y + 3.6, label, 'dimtext');
  };
  const dimV = (x: number, y1: number, y2: number, label: string) => {
    line(x, y1, x, y2, 'dim'); line(x - 1.5, y1, x + 1.5, y1, 'tick'); line(x - 1.5, y2, x + 1.5, y2, 'tick');
    text(x - 1.6, (y1 + y2) / 2, label, 'dimtext', 'middle', -90);
  };
  out.push('<g id="dimensions">');
  dimH(px(min[0]), px(max[0]), elevBase + 7, fmm(W));
  dimV(px(min[0]) - 8, ez(max[2]), ez(min[2]), fmm(H));
  dimV(px(min[0]) - 8, py(max[1]), py(min[1]), fmm(D));
  dimH(px(min[0]), px(max[0]), py(max[1]) - 5, fmm(W), true);
  out.push('</g>');

  // tags: one number per placement above it on the elevation, and at its plan centre when it stands on the floor
  // (an item standing on another is tagged on the elevation only, where it can be seen)
  const items: SheetItem[] = [];
  const placedTags: [number, number][] = [];
  out.push('<g id="tags">');
  placed.forEach(({ p, shape }, i) => {
    const e = extentOfShape(p, shape);
    const tag = i + 1;
    items.push({ tag, name: p.name, dims: [e.max[0] - e.min[0], e.max[1] - e.min[1], e.max[2] - e.min[2]], status: info.statusOf(p), base: e.min[2] });
    const cx = px((e.min[0] + e.max[0]) / 2);
    const onFloor = e.min[2] <= min[2] + 1;
    for (const at of onFloor ? [py((e.min[1] + e.max[1]) / 2), ez(e.max[2]) - 3.2] : [ez(e.max[2]) - 3.2]) {
      // nudge up past any tag already drawn there
      let cy = at;
      const clash = (y0: number) => placedTags.some(([tx, ty]) => Math.hypot(tx - cx, ty - y0) < 4.6);
      while (clash(cy)) cy -= 4.8;
      placedTags.push([cx, cy]);
      out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="2.1" class="tag"/>`);
      text(cx, cy + 0.9, String(tag), 'tagtext');
    }
  });
  out.push('</g>');

  // view titles
  text(areaX0, planTop - 9, 'PLAN', 'view', 'start');
  text(areaX0, planTop + D * k + gap - 4 - 0, 'FRONT ELEVATION', 'view', 'start');

  // item list
  const lx = PAPER.w - FRAME - LIST_W;
  out.push('<g id="list">');
  line(lx, FRAME, lx, PAPER.h - FRAME, 'frame');
  text(lx + 4, FRAME + 7, 'ITEMS', 'view', 'start');
  let y = FRAME + 14;
  for (const it of items) {
    if (y > PAPER.h - FRAME - TITLE_H - 6) { text(lx + 4, y, `+ ${items.length - it.tag + 1} more`, 'small', 'start'); break; }
    out.push(`<circle cx="${n(lx + 6)}" cy="${n(y - 1)}" r="2.1" class="tag"/>`);
    text(lx + 6, y - 0.1, String(it.tag), 'tagtext');
    text(lx + 10, y, it.name.length > 44 ? `${it.name.slice(0, 43)}…` : it.name, 'small', 'start');
    text(lx + 10, y + 3.6, `${fmm(it.dims[0])} × ${fmm(it.dims[1])} × ${fmm(it.dims[2])} mm${it.base > min[2] + 1 ? ` · base +${fmm(it.base)}` : ''} · ${STATUS_LABEL[it.status]}`, 'tiny', 'start');
    y += 9;
  }
  out.push('</g>');

  // title block
  const ty = PAPER.h - FRAME - TITLE_H;
  out.push('<g id="title">');
  line(lx, ty, PAPER.w - FRAME, ty, 'frame');
  text(lx + 4, ty + 8, info.title ?? c.name, 'title', 'start');
  text(lx + 4, ty + 14, `${info.project ? `${info.project} · ` : ''}${c.kind === 'module' ? 'Demo module' : 'Exhibition'} · overall ${fmm(W)} × ${fmm(D)} × ${fmm(H)} mm`, 'small', 'start');
  text(lx + 4, ty + 19.5, `Scale 1:${scale} at A3 · millimetres · ${info.date ?? new Date().toISOString().slice(0, 10)}`, 'small', 'start');
  text(lx + 4, ty + 25, 'Design intent. Check every Estimated or Placeholder value before fabrication.', 'tiny', 'start');
  text(lx + 4, ty + 29, info.appLabel ?? 'MAESTRO', 'tiny', 'start');
  out.push('</g>');

  const svg = svgDoc(info.title ?? c.name, out);
  return { svg, scale, items, overall: [W, D, H] };
}

/** the letter that tags the k-th module on a booth sheet (A … Z, AA …) */
export const moduleTag = (k: number): string => (k < 26 ? String.fromCharCode(65 + k) : moduleTag(Math.floor(k / 26) - 1) + String.fromCharCode(65 + (k % 26)));

/** break text into lines of at most `w` characters, at spaces */
function wrap(t: string, w: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of t.split(' ')) {
    if (line && line.length + word.length + 1 > w) { out.push(line); line = word; } else line = line ? `${line} ${word}` : word;
  }
  if (line) out.push(line);
  return out;
}

const KIND_LABEL = { power: 'Power', data: 'Data', 'power-data': 'Power + data' } as const;

/**
 * The booth plan on A3: the plot with its walls and open sides, the hall aisles, every part in plan, module tags,
 * approach zones, the floor narrower than the accessible route, and the service points; beside it the module
 * schedule, the service loads and the open checks. The analysis it draws is the one the app shows.
 */
export function buildBoothSheet(c: Composition, a: BoothAnalysis, shapeOf: ShapeOf, info: Omit<SheetInfo, 'statusOf'>): { svg: string; scale: number } | null {
  const b = c.booth;
  if (!b) return null;
  const W = b.width.value, D = b.depth.value, A = b.aisle.value;
  const ext = { x0: -W / 2 - (b.open.left ? A : 0), x1: W / 2 + (b.open.right ? A : 0), y0: -D / 2 - (b.open.front ? A : 0), y1: D / 2 + (b.open.back ? A : 0) };
  const areaX0 = FRAME + 16, areaX1 = PAPER.w - FRAME - LIST_W - 10;
  const areaY0 = FRAME + 14, areaY1 = PAPER.h - FRAME - 12;
  const fit = (s: number) => (ext.x1 - ext.x0) / s <= areaX1 - areaX0 && (ext.y1 - ext.y0) / s <= areaY1 - areaY0;
  const scale = SCALES.find(fit) ?? SCALES[SCALES.length - 1];
  const k = 1 / scale;
  const ox = areaX0 + ((areaX1 - areaX0) - (ext.x1 - ext.x0) * k) / 2 - ext.x0 * k;
  const oy = areaY0 + ((areaY1 - areaY0) - (ext.y1 - ext.y0) * k) / 2 + ext.y1 * k;
  const px = (x: number) => ox + x * k, py = (y: number) => oy - y * k;

  const out: string[] = [];
  const line = (x1: number, y1: number, x2: number, y2: number, cls: string) => out.push(`<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" class="${cls}"/>`);
  const text = (x: number, y: number, s: string, cls: string, anchor = 'middle', rot = 0) =>
    out.push(`<text x="${n(x)}" y="${n(y)}" class="${cls}" text-anchor="${anchor}"${rot ? ` transform="rotate(${rot} ${n(x)} ${n(y)})"` : ''}>${esc(s)}</text>`);
  const rectW = (x0: number, y0: number, x1: number, y1: number, cls: string) => out.push(`<rect x="${n(px(x0))}" y="${n(py(y1))}" width="${n(Math.max((x1 - x0) * k, 0.05))}" height="${n(Math.max((y1 - y0) * k, 0.05))}" class="${cls}"/>`);

  // hall aisles
  out.push('<g id="aisles">');
  if (b.open.front) { rectW(ext.x0, -D / 2 - A, ext.x1, -D / 2, 'aisle'); text(px(0), py(-D / 2 - A / 2) + 1, `HALL AISLE · ${fmm(A)}`, 'tiny'); }
  if (b.open.back) { rectW(ext.x0, D / 2, ext.x1, D / 2 + A, 'aisle'); text(px(0), py(D / 2 + A / 2) + 1, `HALL AISLE · ${fmm(A)}`, 'tiny'); }
  if (b.open.left) { rectW(-W / 2 - A, ext.y0, -W / 2, ext.y1, 'aisle'); text(px(-W / 2 - A / 2), py(0), `HALL AISLE · ${fmm(A)}`, 'tiny', 'middle', -90); }
  if (b.open.right) { rectW(W / 2, ext.y0, W / 2 + A, ext.y1, 'aisle'); text(px(W / 2 + A / 2), py(0), `HALL AISLE · ${fmm(A)}`, 'tiny', 'middle', 90); }
  out.push('</g>');

  // floor narrower than the route, merged into runs along each grid row
  const gr = a.grid;
  out.push('<g id="tight">');
  for (let j = 0; j < gr.ny; j++) {
    let i = 0;
    while (i < gr.nx) {
      if (gr.cls[j * gr.nx + i] !== CELL.tight) { i++; continue; }
      const i0 = i;
      while (i < gr.nx && gr.cls[j * gr.nx + i] === CELL.tight) i++;
      const x0 = gr.x0 + i0 * gr.g - gr.g / 2, y0 = gr.y0 + j * gr.g - gr.g / 2;
      rectW(Math.max(x0, -W / 2), Math.max(y0, -D / 2), Math.min(x0 + (i - i0) * gr.g, W / 2), Math.min(y0 + gr.g, D / 2), 'tight');
    }
  }
  out.push('</g>');

  // approach zones
  out.push('<g id="approach">');
  for (const z of a.access.filter((x) => !x.overhead)) rectW(z.zone.min[0], z.zone.min[1], z.zone.max[0], z.zone.max[1], z.approach ? 'zone' : 'zone bad');
  out.push('</g>');

  // parts in plan, low first
  const boxes = c.items.flatMap((p) => { const s = shapeOf(p); return s ? worldBoxes(p, s) : []; });
  out.push('<g id="plan">');
  for (const bx of [...boxes].sort((p1, p2) => p1.max[2] - p2.max[2])) rectW(bx.min[0], bx.min[1], bx.max[0], bx.max[1], 'part');
  out.push('</g>');

  // the plot: walls on closed sides, a dashed line on open ones
  out.push('<g id="plot">');
  for (const e of plotEdges(b)) line(px(e.a[0]), py(e.a[1]), px(e.b[0]), py(e.b[1]), e.open ? 'open' : 'wall');
  // hall columns, solid, with their names
  for (const col of b.columns ?? []) {
    rectW(col.x - col.w / 2, col.y - col.d / 2, col.x + col.w / 2, col.y + col.d / 2, 'column');
    text(px(col.x + col.w / 2) + 1, py(col.y + col.d / 2) - 0.6, col.name, 'tiny', 'start');
  }
  out.push('</g>');

  // dimensions
  out.push('<g id="dimensions">');
  const top = py(ext.y1) - 5, left = px(ext.x0) - 6;
  line(px(-W / 2), top, px(W / 2), top, 'dim'); line(px(-W / 2), top - 1.5, px(-W / 2), top + 1.5, 'tick'); line(px(W / 2), top - 1.5, px(W / 2), top + 1.5, 'tick');
  text(px(0), top - 1.4, fmm(W), 'dimtext');
  line(left, py(D / 2), left, py(-D / 2), 'dim'); line(left - 1.5, py(D / 2), left + 1.5, py(D / 2), 'tick'); line(left - 1.5, py(-D / 2), left + 1.5, py(-D / 2), 'tick');
  text(left - 1.6, py(0), fmm(D), 'dimtext', 'middle', -90);
  out.push('</g>');

  // module tags and service points
  out.push('<g id="tags">');
  a.units.forEach((u, i) => {
    const cx = px((u.extent.min[0] + u.extent.max[0]) / 2), cy = py((u.extent.min[1] + u.extent.max[1]) / 2);
    out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="2.4" class="tag"/>`);
    text(cx, cy + 0.9, moduleTag(i), 'tagtext');
  });
  for (const sp of b.services) {
    const cx = px(sp.x), cy = py(sp.y);
    out.push(`<circle cx="${n(cx)}" cy="${n(cy)}" r="1.6" class="svc"/>`);
    line(cx - 1.1, cy - 1.1, cx + 1.1, cy + 1.1, 'tick'); line(cx - 1.1, cy + 1.1, cx + 1.1, cy - 1.1, 'tick');
    text(cx + 2.4, cy - 1.6, sp.name, 'svctext', 'start');
  }
  out.push('</g>');
  text(areaX0, FRAME + 8, 'BOOTH PLAN', 'view', 'start');
  text(areaX0 + 26, FRAME + 8, 'Front (−Y) at the bottom', 'tiny', 'start');

  // the list column
  const lx = PAPER.w - FRAME - LIST_W;
  const svcName = new Map(b.services.map((s) => [s.id, s.name]));
  out.push('<g id="list">');
  line(lx, FRAME, lx, PAPER.h - FRAME, 'frame');
  let y = FRAME + 7;
  const room = () => y < PAPER.h - FRAME - TITLE_H - 8;
  text(lx + 4, y, 'MODULES', 'view', 'start'); y += 6;
  a.units.forEach((u, i) => {
    if (!room()) return;
    const s = a.services.find((x) => x.unit === u.id)!, acc = a.access.find((x) => x.unit === u.id)!;
    out.push(`<circle cx="${n(lx + 6)}" cy="${n(y - 1)}" r="2.1" class="tag"/>`);
    text(lx + 6, y - 0.1, moduleTag(i), 'tagtext');
    text(lx + 10, y, u.name.length > 40 ? `${u.name.slice(0, 39)}…` : u.name, 'small', 'start');
    const e = u.extent;
    const pw = s.liveCount ? `${(s.watts / 1000).toFixed(2)} kW${s.unknownLive ? ` + ${s.unknownLive} unknown` : ''}${s.power ? ` from ${svcName.get(s.power.point)} (${(s.power.run / 1000).toFixed(1)} m)` : ', no point'}` : 'static';
    text(lx + 10, y + 3.4, `${fmm(e.max[0] - e.min[0])} × ${fmm(e.max[1] - e.min[1])} mm · ${pw}`, 'tiny', 'start');
    text(lx + 10, y + 6.4, acc.overhead ? 'Overhead, above the headroom' : acc.approach ? `Accessible approach${acc.turning ? ' and turning circle' : ', no turning circle'}` : 'NO accessible approach', acc.approach ? 'tiny' : 'tiny err', 'start');
    y += 10;
  });
  if (b.services.length && room()) {
    y += 2; text(lx + 4, y, 'SERVICE POINTS', 'view', 'start'); y += 5;
    for (const l of a.loads) {
      if (!room()) break;
      text(lx + 6, y, `${l.point.name} · ${KIND_LABEL[l.point.kind]} · ${(l.watts / 1000).toFixed(2)} kW stated${l.point.capacityW != null ? ` of ${(l.point.capacityW / 1000).toFixed(2)} kW` : ', capacity not stated'}`, l.over ? 'tiny err' : 'tiny', 'start');
      y += 3.6;
    }
  }
  if (room()) {
    y += 2; text(lx + 4, y, 'CHECKS', 'view', 'start'); y += 5;
    if (!a.issues.length) { text(lx + 6, y, 'No open checks.', 'tiny', 'start'); y += 3.6; }
    for (const is of a.issues) {
      if (!room()) { text(lx + 6, y, '…more in the schedule', 'tiny', 'start'); break; }
      const cls = is.level === 'error' ? 'tiny err' : is.level === 'warn' ? 'tiny warn' : 'tiny';
      text(lx + 6, y, is.level === 'error' ? '✕' : is.level === 'warn' ? '!' : 'i', cls, 'start');
      for (const ln of wrap(is.text, 66)) { text(lx + 9.5, y, ln, cls, 'start'); y += 3.2; }
      y += 0.6;
    }
  }
  out.push('</g>');

  // legend under the plan
  const ly = PAPER.h - FRAME - 5;
  out.push('<g id="legend">');
  out.push(`<rect x="${n(areaX0)}" y="${n(ly - 2.2)}" width="4" height="2.4" class="tight"/>`);
  text(areaX0 + 5.5, ly, `Floor narrower than the ${fmm(b.rules.route.value)} mm route`, 'tiny', 'start');
  out.push(`<rect x="${n(areaX0 + 62)}" y="${n(ly - 2.2)}" width="4" height="2.4" class="zone"/>`);
  text(areaX0 + 67.5, ly, `Approach zone, ${fmm(b.rules.approach.value)} mm`, 'tiny', 'start');
  out.push(`<circle cx="${n(areaX0 + 112)}" cy="${n(ly - 1)}" r="1.4" class="svc"/>`);
  text(areaX0 + 115, ly, 'Service point', 'tiny', 'start');
  line(areaX0 + 140, ly - 1, areaX0 + 150, ly - 1, 'wall'); text(areaX0 + 152, ly, 'Closed side', 'tiny', 'start');
  line(areaX0 + 172, ly - 1, areaX0 + 182, ly - 1, 'open'); text(areaX0 + 184, ly, 'Open side', 'tiny', 'start');
  out.push('</g>');

  // title block
  const ty = PAPER.h - FRAME - TITLE_H;
  out.push('<g id="title">');
  line(lx, ty, PAPER.w - FRAME, ty, 'frame');
  text(lx + 4, ty + 8, info.title ?? c.name, 'title', 'start');
  text(lx + 4, ty + 14, `${info.project ? `${info.project} · ` : ''}Booth ${fmm(W)} × ${fmm(D)} mm · height limit ${fmm(b.heightLimit.value)} mm · ${a.units.length} modules`, 'small', 'start');
  text(lx + 4, ty + 19.5, `Scale 1:${scale} at A3 · millimetres · ${info.date ?? new Date().toISOString().slice(0, 10)}`, 'small', 'start');
  text(lx + 4, ty + 25, `Plot, limits and clearances: ${STATUS_LABEL[a.status]}. Check with the venue before submission.`, 'tiny', 'start');
  text(lx + 4, ty + 29, info.appLabel ?? 'MAESTRO', 'tiny', 'start');
  out.push('</g>');
  return { svg: svgDoc(info.title ?? c.name, out), scale };
}

const STYLE = `
    .frame{stroke:#111;stroke-width:.35;fill:none}
    .part{fill:#fff;stroke:#1a1a1a;stroke-width:.18;stroke-linejoin:round}
    .floor{stroke:#1a1a1a;stroke-width:.5}
    .dim{stroke:#555;stroke-width:.13}
    .tick{stroke:#555;stroke-width:.25}
    .tag{fill:#fff;stroke:#3b6400;stroke-width:.25}
    text{font-family:Inter,Helvetica,Arial,sans-serif;fill:#111}
    .dimtext{font-size:2.5px;fill:#333}
    .tagtext{font-size:2.3px;font-weight:600;fill:#3b6400}
    .view{font-size:3px;font-weight:700;letter-spacing:.3px}
    .title{font-size:4.2px;font-weight:700}
    .small{font-size:2.6px}
    .tiny{font-size:2.1px;fill:#555}
    .note{font-size:2.1px;fill:#555}
    .wall{stroke:#111;stroke-width:.7;fill:none}
    .open{stroke:#111;stroke-width:.25;stroke-dasharray:2 1.2;fill:none}
    .aisle{fill:#f2f2f4;stroke:none}
    .column{fill:#555;stroke:#111;stroke-width:.25}
    .tight{fill:#f2a33a;fill-opacity:.55;stroke:none}
    .zone{fill:none;stroke:#3b6400;stroke-width:.2;stroke-dasharray:1 .8}
    .zone.bad{stroke:#d33;stroke-width:.35}
    .svc{fill:#fff;stroke:#c77700;stroke-width:.3}
    .svctext{font-size:2.1px;font-weight:600;fill:#a35f00}
    .err{fill:#d33}
    .warn{fill:#c77700}`;

function svgDoc(title: string, out: string[]) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAPER.w}mm" height="${PAPER.h}mm" viewBox="0 0 ${PAPER.w} ${PAPER.h}">
<title>${esc(title)}</title>
<style>${STYLE}</style>
<rect x="0" y="0" width="${PAPER.w}" height="${PAPER.h}" fill="#fff"/>
<rect x="${FRAME}" y="${FRAME}" width="${PAPER.w - 2 * FRAME}" height="${PAPER.h - 2 * FRAME}" class="frame"/>
${out.join('\n')}
</svg>
`;
}
