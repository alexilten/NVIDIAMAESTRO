import { extentOfShape, worldBoxes, type ShapeOf, type WorldBox } from './arrange';
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

  const style = `
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
    .note{font-size:2.1px;fill:#555}`;
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${PAPER.w}mm" height="${PAPER.h}mm" viewBox="0 0 ${PAPER.w} ${PAPER.h}">
<title>${esc(info.title ?? c.name)}</title>
<style>${style}</style>
<rect x="0" y="0" width="${PAPER.w}" height="${PAPER.h}" fill="#fff"/>
<rect x="${FRAME}" y="${FRAME}" width="${PAPER.w - 2 * FRAME}" height="${PAPER.h - 2 * FRAME}" class="frame"/>
${out.join('\n')}
</svg>
`;
  return { svg, scale, items, overall: [W, D, H] };
}
