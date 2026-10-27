import { describe, expect, it } from 'vitest';
import { BOOTH_TYPES, CELL, DECK_DEFAULTS, accessRect, addDeck, deckObstacles, moveToDeck, stairRun, addColumn, addServicePoint, boothTypeOf, turnToFace, analyseBooth, approachZone, boothCsv, changedModules, freeSpot, frontSide, newExhibition, placeModule, planExtent } from '../src/core/booth';
import { addItem, rotateItems } from '../src/core/compose';
import { sampleExhibition, sampleIsland, sampleTwoStorey } from '../src/core/exhibitionSample';
import { defaultParams } from '../src/core/geometry/kit';
import { boxSize, shapeBounds } from '../src/core/geometry/shape';
import { resolveRef } from '../src/core/library';
import { buildBoothSheet } from '../src/core/sheet';
import { boothAnnotations } from '../src/export/boothAnnotations';
import { TEMPLATES } from '../src/core/templates';
import type { BoothDeck, Composition, ItemRef, Placement, Vec3 } from '../src/core/schema';

const shapeOf = (p: Placement) => resolveRef(p.ref, [])?.shape ?? null;
const dimsOf = (ref: ItemRef): Vec3 => boxSize(shapeBounds(resolveRef(ref, [])!.shape!));
const kit = (id: string, over: Record<string, number> = {}): ItemRef => ({ kind: 'kit', id, params: { ...defaultParams(id), ...over } });
const tpl = (id: string) => TEMPLATES.find((t) => t.id === id)!.build();

/** an empty 6 × 4 m booth, open to the front only */
function booth(w = 6000, d = 4000): Composition {
  const c = newExhibition('test');
  return { ...c, booth: { ...c.booth!, width: { value: w, status: 'project' }, depth: { value: d, status: 'project' }, open: { front: true, back: false, left: false, right: false } } };
}
/** a 400 mm deep barrier along X from x0 to x1 at y, built from light tables (at most 3200 mm each) */
function wall(c: Composition, x0: number, x1: number, y: number): Composition {
  for (let x = x0; x < x1 - 1;) {
    const width = Math.min(3200, x1 - x);
    const ref = kit('kit-light-table', { width, depth: 400, height: 1200 });
    c = addItem(c, ref, 'block', dimsOf(ref), [x + width / 2, y, 0]).comp;
    x += width;
  }
  return c;
}

describe('booth circulation', () => {
  it('reaches all of an empty booth from its open side, and none of it with no open side', () => {
    const a = analyseBooth(booth(), shapeOf)!;
    expect(a.accessibleShare).toBe(1);
    expect(a.issues).toHaveLength(0);
    const shut = booth();
    shut.booth!.open.front = false;
    const b = analyseBooth(shut, shapeOf)!;
    expect(b.accessibleShare).toBe(0);
    expect(b.issues[0]).toMatchObject({ level: 'error', text: expect.stringMatching(/No side is open/) });
  });

  it('closes a gap narrower than the route width and opens one wider', () => {
    // a wall across the booth at y = 0 leaving a gap at the right side; the back half is reached only through the gap
    const withGap = (gap: number) => {
      const c = wall(booth(), -3000, 3000 - gap, 0);
      return analyseBooth(c, shapeOf)!;
    };
    const at = (a: ReturnType<typeof withGap>, x: number, y: number) => {
      const g = a.grid;
      return g.cls[Math.round((y - g.y0) / g.g) * g.nx + Math.round((x - g.x0) / g.g)];
    };
    const narrow = withGap(800), wide = withGap(1000);
    expect(at(narrow, -2000, 1500)).toBe(CELL.tight);
    expect(at(wide, -2000, 1500)).not.toBe(CELL.tight);
    expect(at(narrow, -2000, -1500)).not.toBe(CELL.tight);
  });

  it('needs an approach in front of each module, and finds a turning circle only where 1525 mm fits', () => {
    // a counter against the back wall faces the front: open floor in front
    let c = booth();
    c = placeModule(c, tpl('tpl-spark-counter'), shapeOf, [0, 1650]).comp;
    let a = analyseBooth(c, shapeOf)!;
    expect(a.access[0]).toMatchObject({ approach: true, turning: true });
    // turned to face the back wall, 300 mm off it: no way to stand in front
    c = placeModule(booth(), tpl('tpl-spark-counter'), shapeOf, [0, 1300], 180).comp;
    a = analyseBooth(c, shapeOf)!;
    expect(a.units[0].front).toBe('back');
    expect(a.access[0].approach).toBe(false);
    expect(a.issues.some((i) => i.level === 'error' && /no accessible approach/.test(i.text))).toBe(true);
  });

  it('flags items outside the plot and over the height limit', () => {
    let c = booth();
    c = { ...c, booth: { ...c.booth!, heightLimit: { value: 1800, status: 'project' } } };
    c = placeModule(c, tpl('tpl-spark-counter'), shapeOf, [3000, 0]).comp; // half outside, and its display is 2004 mm high
    const texts = analyseBooth(c, shapeOf)!.issues.map((i) => i.text).join('\n');
    expect(texts).toMatch(/outside the booth plot/);
    expect(texts).toMatch(/over the 1800 mm height limit/);
  });

  it('ignores parts wholly above the headroom', () => {
    const c = booth();
    const ref = kit('kit-light-table', { width: 3200, depth: 1600, height: 300 });
    const over = addItem(c, ref, 'canopy', dimsOf(ref), [0, 0, 2500]).comp; // a slab hung at 2.5 m
    expect(analyseBooth(over, shapeOf)!.accessibleShare).toBe(1);
  });
});

describe('modules on a booth', () => {
  it('places a module centred where asked, turned, as one group that remembers its source', () => {
    const src = tpl('tpl-accessible-counter');
    const r = placeModule(booth(), src, shapeOf, [1000, 500], 90);
    const e = planExtent(r.comp.items, shapeOf)!;
    expect((e.min[0] + e.max[0]) / 2).toBeCloseTo(1000, 0);
    expect((e.min[1] + e.max[1]) / 2).toBeCloseTo(500, 0);
    // turned a quarter: the 2400 mm counter now runs along Y
    expect(e.max[1] - e.min[1]).toBeCloseTo(2400, 0);
    expect(r.comp.groups).toEqual([expect.objectContaining({ id: r.groupId, source: expect.objectContaining({ id: src.id }) })]);
    expect(frontSide(90)).toBe('right');
    expect(approachZone(e, 'right', 1220).min[0]).toBeCloseTo(e.max[0]);
  });

  it('finds free spots a route width apart, then none', () => {
    let c = booth(6000, 3000);
    const size: [number, number] = [1800, 700];
    const spots: [number, number][] = [];
    for (;;) {
      const ex = c.items.map((p) => planExtent([p], shapeOf)!);
      const s = freeSpot(c, ex, size);
      if (!s) break;
      spots.push(s);
      c = placeModule(c, tpl('tpl-spark-counter'), shapeOf, s).comp;
      if (spots.length > 10) break;
    }
    expect(spots.length).toBeGreaterThanOrEqual(2);
    expect(spots.length).toBeLessThanOrEqual(6);
    expect(spots[0]).toEqual([-2100, 1150]);
    expect(spots[1][0] - spots[0][0]).toBeGreaterThanOrEqual(1800 + 915);
  });

  it('flags a placed module once its saved source is edited', () => {
    const src = { ...tpl('tpl-spark-counter'), updatedAt: '2026-01-01T00:00:00.000Z' };
    const c = placeModule(booth(), src, shapeOf, [0, 0]).comp;
    expect(changedModules(c, [src]).size).toBe(0);
    expect(changedModules(c, [{ ...src, updatedAt: '2026-02-01T00:00:00.000Z' }]).size).toBe(1);
  });
});

describe('booth services', () => {
  it('feeds each live module from the nearest point of its kind and sums stated loads', () => {
    let c = booth();
    c = placeModule(c, tpl('tpl-spark-counter'), shapeOf, [-1500, 1000]).comp;
    c = placeModule(c, tpl('tpl-switch-table'), shapeOf, [1500, 1000]).comp;
    c = { ...c, booth: addServicePoint(addServicePoint(c.booth!, 'power', -1500, -500), 'power-data', 1500, -500) };
    c.booth!.services[0].capacityW = 300;
    const a = analyseBooth(c, shapeOf)!;
    const [spark, sw] = a.services;
    expect(spark.power?.point).toBe(c.booth!.services[0].id);
    expect(spark.watts).toBe(480);
    expect(spark.power?.run).toBe(1500);
    expect(sw.power?.point).toBe(c.booth!.services[1].id);
    expect(sw.needsData).toBe(true);
    expect(sw.data?.point).toBe(c.booth!.services[1].id);
    expect(a.loads[0]).toMatchObject({ watts: 480, over: true });
    expect(a.issues.some((i) => /over its stated 0.30 kW/.test(i.text))).toBe(true);
    const csv = boothCsv(c, a);
    expect(csv.split('\n')[0]).toMatch(/^Module,Items,/);
    expect(csv).toMatch(/S1,power,-1500,-500,300/);
  });
});

describe('sample booth and its plan sheet', () => {
  it('builds a clean sample: every module approachable, inside the plot, fed', () => {
    const c = sampleExhibition();
    const a = analyseBooth(c, shapeOf)!;
    expect(a.units).toHaveLength(6);
    expect(a.access.every((x) => x.approach)).toBe(true);
    expect(a.issues.filter((i) => i.level === 'error')).toEqual([]);
    expect(a.services.filter((s) => s.liveCount).every((s) => s.power)).toBe(true);
  });

  it('draws the booth to a standard scale with a tag per module and a mark per service point', () => {
    const c = sampleExhibition();
    const a = analyseBooth(c, shapeOf)!;
    const r = buildBoothSheet(c, a, shapeOf, { date: '2026-10-26' })!;
    expect(r.scale).toBe(50);
    expect(r.svg).toContain('width="420mm"');
    for (const v of ['>10000<', '>8000<', 'Scale 1:50', 'HALL AISLE', '>S1<', '>S2<', '>F<']) expect(r.svg).toContain(v);
    expect((r.svg.match(/<g /g) ?? []).length).toBe((r.svg.match(/<\/g>/g) ?? []).length);
  });
});

describe('venue rule sets', () => {
  it('starts from a preset, recognises it, and stops matching once a value is edited', async () => {
    const { RULE_PRESETS, rulePresetOf } = await import('../src/core/booth');
    const b = newExhibition('x').booth!;
    expect(rulePresetOf(b.rules)).toBe('ada-2010');
    const din = RULE_PRESETS.find((p) => p.id === 'din-18040-1')!;
    expect(rulePresetOf(din.rules)).toBe('din-18040-1');
    expect(Object.values(din.rules).every((r) => r.status === 'estimated' && !!r.note)).toBe(true);
    expect(rulePresetOf({ ...din.rules, route: { value: 1500, status: 'project' } })).toBeNull();
  });

  it('a wider route rule leaves less floor reachable', async () => {
    const { RULE_PRESETS } = await import('../src/core/booth');
    const c = sampleExhibition();
    const ada = analyseBooth(c, shapeOf, (p) => p.name)!;
    const din = analyseBooth({ ...c, booth: { ...c.booth!, rules: { ...RULE_PRESETS[1].rules } } }, shapeOf, (p) => p.name)!;
    expect(din.accessibleShare).toBeLessThanOrEqual(ada.accessibleShare);
  });
});

describe('refreshing a placed module', () => {
  it('replaces the group with the saved module at the same spot, turned the same way, keeping id and name', async () => {
    const { refreshModule } = await import('../src/core/booth');
    const src: Composition = { ...tpl('tpl-spark-counter'), id: 'saved-1', updatedAt: '2026-01-01T00:00:00Z' };
    let c = booth(8000, 6000);
    const placed = placeModule(c, src, shapeOf, [1000, 500], 90);
    c = { ...placed.comp, groups: placed.comp.groups.map((g) => ({ ...g, name: 'Spark A' })) };
    const before = planExtent(c.items.filter((i) => i.groupId === placed.groupId), shapeOf)!;
    // the saved module gains an item and is edited later
    const extra = src.items[src.items.length - 1];
    const edited: Composition = { ...src, items: [...src.items, { ...extra, id: 'new-1', name: 'Extra', position: [extra.position[0] + 50, extra.position[1], extra.position[2]] }], updatedAt: '2026-02-01T00:00:00Z' };
    expect(changedModules(c, [edited]).has(placed.groupId)).toBe(true);
    const r = refreshModule(c, placed.groupId, edited, shapeOf)!;
    const mine = r.comp.items.filter((i) => i.groupId === placed.groupId);
    expect(mine).toHaveLength(edited.items.length);
    expect(r.comp.groups.find((g) => g.id === placed.groupId)?.name).toBe('Spark A');
    expect(changedModules(r.comp, [edited]).size).toBe(0);
    const after = planExtent(mine, shapeOf)!;
    const mid = (e: { min: Vec3; max: Vec3 }) => [(e.min[0] + e.max[0]) / 2, (e.min[1] + e.max[1]) / 2];
    // the same item turned the same way, and centred close to where the old group stood
    expect(mine[0].rotation).toBe(placed.comp.items.find((i) => i.groupId === placed.groupId)!.rotation);
    expect(Math.hypot(mid(after)[0] - mid(before)[0], mid(after)[1] - mid(before)[1])).toBeLessThan(200);
    expect(r.comp.items.length).toBe(c.items.length + 1);
  });
});

describe('booth columns', () => {
  it('flags a module that runs into a column, and a column outside the plot', () => {
    let c = booth();
    c = { ...c, booth: addColumn(c.booth!, 0, 0) };
    const ref = kit('kit-light-table', { width: 1600, depth: 800, height: 900 });
    c = addItem(c, ref, 'table', dimsOf(ref), [0, 0, 0]).comp;
    const a = analyseBooth(c, shapeOf)!;
    expect(a.issues.some((i) => i.level === 'error' && /runs into column C1/.test(i.text))).toBe(true);
    const out = { ...c, booth: addColumn(c.booth!, 2900, 0) };
    expect(analyseBooth(out, shapeOf)!.issues.some((i) => /Column C2 is not wholly inside/.test(i.text))).toBe(true);
  });

  it('takes column floor out of the reachable area, and new modules avoid it', () => {
    const open = analyseBooth(booth(), shapeOf)!;
    let c = booth();
    c = { ...c, booth: addColumn(c.booth!, 0, 0, 1000, 1000) };
    const a = analyseBooth(c, shapeOf)!;
    expect(a.freeArea).toBeLessThan(open.freeArea - 0.9e6);
    const at = freeSpot(c, [], [1200, 1200])!;
    const k = c.booth!.columns![0];
    expect(Math.abs(at[0] - k.x) >= (1200 + k.w) / 2 || Math.abs(at[1] - k.y) >= (1200 + k.d) / 2).toBe(true);
  });

  it('writes each column to the COLUMNS layer of the booth annotations', () => {
    let c = booth();
    c = { ...c, booth: addColumn(addColumn(c.booth!, -2000, 1000), 2000, 1000) };
    const notes = boothAnnotations(c, analyseBooth(c, shapeOf)!).filter((n) => n.layer.endsWith('::COLUMNS'));
    expect(notes.map((n) => n.name)).toEqual(['C1', 'C2']);
  });
});

describe('stand types and island booths', () => {
  it('names a stand by its open sides, and each preset reads back as itself', () => {
    for (const t of BOOTH_TYPES) expect(boothTypeOf(t.open)).toBe(t.id);
    expect(boothTypeOf({ front: true, back: true, left: false, right: false })).toBeNull();
    expect(boothTypeOf({ front: false, back: false, left: true, right: true })).toBeNull();
  });

  it('turns a module the short way to face a side', () => {
    expect(turnToFace('front', 'front')).toBe(0);
    expect(turnToFace('front', 'right')).toBe(90);
    expect(turnToFace('front', 'back')).toBe(180);
    expect(turnToFace('front', 'left')).toBe(-90);
    expect(turnToFace('left', 'front')).toBe(90);
  });

  it('builds a clear sample island: every module faces an aisle, two back to back in the middle', () => {
    const c = sampleIsland();
    expect(boothTypeOf(c.booth!.open)).toBe('island');
    const a = analyseBooth(c, shapeOf)!;
    expect(a.issues.filter((i) => i.level !== 'info')).toEqual([]);
    expect(a.issues.some((i) => /back to the/.test(i.text))).toBe(false);
    expect(a.access.every((z) => z.approach)).toBe(true);
  });

  it('flags a module with its back to a nearby aisle, and the suggested turn clears it', () => {
    let c = booth();
    c = { ...c, booth: { ...c.booth!, open: { front: true, back: true, left: true, right: true } } };
    c = placeModule(c, tpl('tpl-spark-counter'), shapeOf, [0, 1300], 0).comp;
    const hit = analyseBooth(c, shapeOf)!.issues.find((i) => /back to the back aisle/.test(i.text))!;
    expect(hit).toBeDefined();
    expect(hit.turn).toBe(180);
    const turned = rotateItems(c, c.items.map((i) => i.id), hit.turn!);
    const after = analyseBooth(turned, shapeOf)!;
    expect(after.issues.some((i) => /back to the/.test(i.text))).toBe(false);
    expect(after.access.every((z) => z.approach)).toBe(true);
  });

  it('offers the turn to the nearest aisle when a module faces a closed side', () => {
    // against the closed back wall, facing it
    const e = planExtent(tpl('tpl-spark-counter').items, shapeOf)!;
    const half = (e.max[1] - e.min[1]) / 2;
    const c = placeModule(booth(), tpl('tpl-spark-counter'), shapeOf, [0, 2000 - half], 180).comp;
    const err = analyseBooth(c, shapeOf)!.issues.find((i) => i.level === 'error' && /no accessible approach/.test(i.text))!;
    expect(err).toBeDefined();
    expect(err.turn).toBe(180);
  });
});

describe('upper decks', () => {
  const deckBooth = (over: Partial<BoothDeck> = {}) => {
    const c = sampleTwoStorey();
    return { ...c, booth: { ...c.booth!, decks: [{ ...c.booth!.decks![0], ...over }] } };
  };

  it('builds a clear sample two-storey booth, with its upstairs modules reached by the lift', () => {
    const c = sampleTwoStorey();
    const a = analyseBooth(c, shapeOf)!;
    expect(a.issues.filter((i) => i.level !== 'info')).toEqual([]);
    const up = a.access.filter((z) => z.deck === 'deck-1');
    expect(up).toHaveLength(2);
    expect(up.every((z) => z.approach)).toBe(true);
    expect(a.access.filter((z) => !z.deck).every((z) => z.approach)).toBe(true);
  });

  it('sizes the stair from the level and stands it against the deck edge', () => {
    const k = sampleTwoStorey().booth!.decks![0];
    expect(stairRun(k)).toEqual({ risers: Math.ceil(2700 / DECK_DEFAULTS.rise.value), length: Math.ceil(2700 / DECK_DEFAULTS.rise.value) * DECK_DEFAULTS.going.value });
    const s = accessRect(k, k.stair!, 'stair');
    expect(s.max[1]).toBe(k.y - k.d / 2);
    expect(s.max[1] - s.min[1]).toBe(stairRun(k).length);
    expect(s.max[0] - s.min[0]).toBe(1200);
  });

  it('blocks only the posts under a high deck, and the whole footprint under a low one', () => {
    const k = sampleTwoStorey().booth!.decks![0];
    const high = deckObstacles({ ...k, stair: undefined, lift: undefined }, 2030);
    expect(high).toHaveLength(4);
    expect(deckObstacles({ ...k, level: 1500, stair: undefined, lift: undefined }, 2030)).toHaveLength(1);
  });

  it('warns without a lift and makes upstairs modules inaccessible', () => {
    const a = analyseBooth(deckBooth({ lift: undefined }), shapeOf)!;
    expect(a.issues.some((i) => i.level === 'warn' && /D1 has no lift/.test(i.text))).toBe(true);
    expect(a.access.filter((z) => z.deck).every((z) => !z.approach)).toBe(true);
  });

  it('flags a missing stair, a guard rail over the height limit and a stair running off the plot', () => {
    expect(analyseBooth(deckBooth({ stair: undefined }), shapeOf)!.issues.some((i) => /D1 has no stair/.test(i.text))).toBe(true);
    expect(analyseBooth(deckBooth({ level: 3200 }), shapeOf)!.issues.some((i) => /guard rail tops out at 4300 mm/.test(i.text))).toBe(true);
    expect(analyseBooth(deckBooth({ stair: { side: 'back', offset: 0, width: 1200 } }), shapeOf)!.issues.some((i) => /stair runs outside the plot/.test(i.text))).toBe(true);
  });

  it('flags a floor module that runs into the deck underside, and moving it onto the deck clears that', () => {
    let c = booth(8000, 6000);
    c = { ...c, booth: addDeck(c.booth!) };
    c = placeModule(c, tpl('tpl-board-niche'), shapeOf, [0, 2850], 0).comp;
    const a = analyseBooth(c, shapeOf)!;
    expect(a.issues.some((i) => /runs into the underside of deck D1/.test(i.text))).toBe(true);
    const k = c.booth!.decks![0];
    const up = moveToDeck(c, c.items.map((i) => i.id), k, shapeOf);
    expect(Math.min(...up.items.map((i) => i.position[2]))).toBeGreaterThanOrEqual(k.level - 1);
    expect(analyseBooth(up, shapeOf)!.issues.some((i) => /underside/.test(i.text))).toBe(false);
  });

  it('writes the deck, stair and lift to the DECKS layer', () => {
    const c = sampleTwoStorey();
    const notes = boothAnnotations(c, analyseBooth(c, shapeOf)!).filter((n) => n.layer.endsWith('::DECKS'));
    expect(notes.map((n) => n.name)).toEqual(['D1', 'D1 STAIR', 'D1 LIFT']);
  });
});
