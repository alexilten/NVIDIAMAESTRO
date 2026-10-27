import rhino3dm from 'rhino3dm/rhino3dm.module.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { catalogResolver, labelCsv, nicheAnnotations, nicheComposition } from '../src/core/niche/build';
import { nicheElevation } from '../src/core/niche/elevation';
import { NICHE_EXAMPLES } from '../src/core/niche/examples';
import { layoutNiche, type NicheItem, type NicheSpec } from '../src/core/niche/layout';
import { BERLIN_2026, IN, inches } from '../src/core/niche/rules';
import { exportItemFor, resolveRef } from '../src/core/library';
import { exportComposition, readBack } from '../src/export/rhino';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let rh: any;
beforeAll(async () => { rh = await rhino3dm(); });

const resolve = catalogResolver();
let k = 0;
const box = (name: string, w: number, d: number, h: number): NicheItem => ({ id: `t${k++}`, custom: { name, width: w, depth: d, height: h, status: 'project' } });
const spec = (rows: (NicheItem | null)[][], patch: Partial<NicheSpec> = {}): NicheSpec => ({ schema: 'maestro.niche', version: 1, id: 't', code: 'T', name: 'Test', type: 'shelf', rulesId: BERLIN_2026.id, letter: 'standard', rows, updatedAt: '', ...patch });
const example = (code: string) => NICHE_EXAMPLES.find((e) => e.spec.code === code)!.spec;

describe('inches', () => {
  it('writes feet, inches and eighths as the drawings do', () => {
    expect(inches(4 * IN)).toBe('4"');
    expect(inches(7.125 * IN)).toBe('7 1/8"');
    expect(inches(59.125 * IN)).toBe(`4'-11 1/8"`);
    expect(inches(48 * IN)).toBe(`4'-0"`);
    expect(inches(0.5 * IN)).toBe('1/2"');
  });
});

describe('niche layout', () => {
  it('rebuilds the GTC San Jose DGX Spark niche chain from its hardware (fab deck p.184)', () => {
    // 5 7/8" units, a 5 1/2" board in the middle column, 4" gaps, 7" from the visible edge
    const u = (s: string) => box(s, 5.875 * IN, 5.9 * IN, 1.9 * IN);
    const board = box('GB10 board', 5.5 * IN, 5.5 * IN, 4 * IN);
    const l = layoutNiche(spec([[u('a'), u('b'), null, u('c'), u('d')], [u('e'), u('f'), board, u('g'), u('h')]]), BERLIN_2026, resolve)!;
    const top = l.rowChains[0].segs.map((s) => Math.round((s.b - s.a) / IN * 8) / 8);
    // the drawing: 4" 5 7/8" 4" 5 7/8" 1'-1 1/2" 5 7/8" 4" 5 7/8" 4", inside 7" edges; the empty slot is the board's column
    expect(top).toEqual([7, 5.875, 4, 5.875, 4, 5.5, 4, 5.875, 4, 5.875, 7]);
    expect(l.width / IN).toBeCloseTo(53 + 6, 1); // 4'-11" against 4'-11 1/8" drawn
    // labels start at each unit's left edge and share a line on every shelf
    const firsts = l.labels.filter((x) => x.col === 0);
    expect(firsts.map((x) => x.x0)).toEqual([l.units[0].x0, l.units[0].x0]);
    const offsets = l.labels.map((x) => x.z0 - l.shelves[l.spec.rows.length - 1 - x.row].top);
    expect(new Set(offsets.map((o) => Math.round(o))).size).toBe(1);
  });

  it('rebuilds the Berlin RTX PRO cards niche: 660 wide, centred at 1675 (fab deck p.59)', () => {
    const l = layoutNiche(example('03'), BERLIN_2026, resolve)!;
    expect(l.width).toBeCloseTo(660, -1); // 304.8 card + 2 × 7"
    expect(l.centre).toBe(1675);
    // shelf spaces 340 / 315 / 315 on the drawing: each is the tallest card plus the 203 mm headroom
    expect(l.shelves.map((s) => Math.round(s.clear))).toEqual([315, 315, 340]);
    expect(Math.abs(l.height - 1255)).toBeLessThanOrEqual(16); // the drawing's bottom space is 177, the rule's 162
    expect(l.labels.map((x) => x.code)).toEqual(['03.01', '03.02', '03.03']);
    expect(l.labels[0].text).toMatch(/6000 Blackwell Workstation/);
  });

  it('rebuilds the Berlin DGX Spark niche height and sill, and flags the 1253 mm shelf against the spacing rules (fab deck p.55)', () => {
    const free = layoutNiche(example('02A'), BERLIN_2026, resolve)!;
    // three placeholders are listed, not drawn
    expect(free.checks.filter((c) => /no recorded dimensions/.test(c.text))).toHaveLength(3);
    expect(free.units).toHaveLength(7);
    expect(free.shelves).toHaveLength(3);
    const locked = layoutNiche({ ...example('02A'), lockWidth: 1253 }, BERLIN_2026, resolve)!;
    expect(locked.width).toBe(1253);
    expect(locked.checks.some((c) => c.level === 'error' && c.rule === 'gap')).toBe(false); // 4 columns of 150 fit at 4"
    const five = layoutNiche({ ...spec([Array.from({ length: 5 }, (_, i) => box(`Spark ${i}`, 150, 150, 50))]), lockWidth: 1253 }, BERLIN_2026, resolve)!;
    const err = five.checks.find((c) => c.rule === 'gap' && c.level === 'error');
    expect(err?.text).toMatch(/gaps between units drop to 37 mm/);
  });

  it('puts wall-hung labels 2" below the lowest hardware in the row, on one line', () => {
    const tall = box('Tall', 200, 40, 300), short = box('Short', 200, 40, 120);
    const l = layoutNiche(spec([[tall, short]], { type: 'wall' }), BERLIN_2026, resolve)!;
    const [a, b] = l.labels;
    expect(a.z0).toBe(b.z0);
    const lowest = Math.min(...l.units.map((u) => u.z0));
    expect(lowest - (a.z0 + a.cap)).toBeCloseTo(2 * IN, 5);
    expect(l.units.every((u) => u.z0 === lowest)).toBe(true); // bottom-aligned
    expect(l.units[0].x0 - -l.width / 2).toBeCloseTo(7 * IN, 5);
  });

  it('hangs a tray upright: its depth runs up the wall', () => {
    const l = layoutNiche(example('07A'), BERLIN_2026, resolve)!;
    const u = l.units[0];
    expect(u.z1 - u.z0).toBe(900);
    expect(u.protrude).toBe(45);
    expect(l.width).toBeCloseTo(445 + 2 * 7 * IN, 3);
  });

  it('reports a unit too deep for the niche and a label that runs into its neighbour', () => {
    const l = layoutNiche(spec([[box('Deep', 100, 400, 50), box('Next', 100, 100, 50)]]), BERLIN_2026, resolve)!;
    expect(l.checks.some((c) => c.level === 'error' && c.rule === 'depth')).toBe(true);
    const long = layoutNiche(spec([[{ ...box('A', 60, 100, 50), label: 'A very long product name that cannot fit' }, box('B', 60, 100, 50)]]), BERLIN_2026, resolve)!;
    expect(long.checks.some((c) => c.level === 'warn' && /runs into label T\.02/.test(c.text))).toBe(true);
  });
});

describe('niche outputs', () => {
  it('draws an A3 elevation with every label and the centre line', () => {
    const l = layoutNiche(example('03'), BERLIN_2026, resolve)!;
    const r = nicheElevation(l, { date: '2026-10-27' });
    expect(r.svg).toMatch(/^<\?xml/);
    expect(r.svg).toContain('CL 1675 AFF');
    for (const lb of l.labels) expect(r.svg).toContain(lb.text);
    expect([5, 10, 20]).toContain(r.scale);
  });

  it('writes a label schedule with positions from the niche corner', () => {
    const l = layoutNiche(example('08A'), BERLIN_2026, resolve)!;
    const rows = labelCsv(l).trim().split('\n');
    expect(rows[0]).toMatch(/^code,text,letter_size/);
    expect(rows).toHaveLength(3);
    expect(rows[1]).toMatch(/^08A\.01,NVIDIA Vera Rubin NVL72 Compute Tray,standard,10,\d+,178,/);
  });

  it('becomes one grouped module that resolves and exports to Rhino with its dimensions and labels', () => {
    const l = layoutNiche(example('03'), BERLIN_2026, resolve)!;
    const c = nicheComposition(l);
    expect(c.groups).toHaveLength(1);
    expect(c.items).toHaveLength(1 + 3 + 3);
    for (const p of c.items) expect(resolveRef(p.ref, [])?.shape).toBeTruthy();
    const niche = resolveRef(c.items[0].ref, [])!.shape!;
    expect(niche.parts.filter((p) => p.name.startsWith('SHELF_'))).toHaveLength(3);
    const r = exportComposition(rh, c, (p) => exportItemFor(p, []), 'test', nicheAnnotations(l));
    const back = readBack(rh, r.bytes);
    expect(r.instances).toBe(c.items.length);
    expect(r.skipped).toEqual([]);
    expect(back.layers).toContain('NVIDIA_MAESTRO::90_DIMENSIONS::NICHE');
    expect(back.layers).toContain('NVIDIA_MAESTRO::90_DIMENSIONS::NICHE_LABELS');
    const card = back.instances.find((i) => i.user['maestro.ref'] === 'product:nv-rtx-pro-6000-ws')!;
    expect(card.origin[2]).toBeCloseTo(l.shelves[2].top, 1);
  });
});

describe('pedestals and racks', () => {
  it('lays a pedestal out in plan: one front line, labels 50 mm in front and 90 mm from the edge (fab deck p.121)', () => {
    const l = layoutNiche(example('06A'), BERLIN_2026, resolve)!;
    expect(l.base).toBe(900);
    expect([l.width, l.height]).toEqual([1810, 1250]);
    // every unit's front on one line, so every label shares a top line
    expect(new Set(l.units.map((u) => u.z0)).size).toBe(1);
    const front = l.units[0].z0;
    for (const lb of l.labels) {
      expect(lb.z0).toBe(90);
      expect(front - (lb.z0 + lb.cap)).toBe(50);
      expect(lb.x0).toBe(l.units.find((u) => u.col === lb.col)!.x0);
    }
    expect(l.labels.map((x) => x.code)).toEqual(['06A.01', '06A.02', '06A.03']);
    expect(l.checks.filter((c) => c.level === 'error')).toEqual([]);
    // too shallow a table is reported
    const shallow = layoutNiche({ ...example('06A'), lockHeight: 800 }, BERLIN_2026, resolve)!;
    expect(shallow.checks.some((c) => c.level === 'error' && /overhangs the back edge/.test(c.text))).toBe(true);
  });

  it('builds the pedestal with its hardware on the top and flat labels, and draws its plan', () => {
    const l = layoutNiche(example('06A'), BERLIN_2026, resolve)!;
    const c = nicheComposition(l);
    expect(c.items).toHaveLength(1 + 3 + 3);
    for (const p of c.items) expect(resolveRef(p.ref, [])?.shape).toBeTruthy();
    const units = c.items.slice(1, 4);
    for (const u of units) expect(u.position[2]).toBe(900);
    const label = c.items[4];
    expect(label.ref.kind === 'kit' && label.ref.params?.flat).toBe(1);
    const svg = nicheElevation(l).svg;
    expect(svg).toContain('PLAN OF PEDESTAL TOP');
    expect(svg).not.toContain('CL 1675');
    expect(labelCsv(l).split('\n')[1]).toMatch(/,black die-cut vinyl,.*,pedestal front edge$/);
  });

  it('puts a white label centred on each rack door', () => {
    const l = layoutNiche(example('05C'), BERLIN_2026, resolve)!;
    expect([l.width, l.height, l.depth]).toEqual([600, 2296, 1404]);
    const [lb] = l.labels;
    expect(lb.x0 + lb.w / 2).toBeCloseTo(0, 5);
    expect(l.height - (lb.z0 + lb.cap)).toBe(BERLIN_2026.values.rackLabelDrop.value);
    expect(lb.status).toBe('estimated');
    const c = nicheComposition(l);
    expect(c.items).toHaveLength(2);
    const v = c.items[1];
    expect(v.ref.kind === 'kit' && v.ref.params?.white).toBe(1);
    expect(labelCsv(l).split('\n')[1]).toMatch(/,white die-cut vinyl,.*,floor$/);
    const r = exportComposition(rh, c, (p) => exportItemFor(p, []), 'test', nicheAnnotations(l));
    expect(r.skipped).toEqual([]);
  });
});
