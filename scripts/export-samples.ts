/**
 * Public sample files: compositions built only from the public catalog and the parametric kit.
 * No project data is read. Usage: npm run export:samples   (then npm run verify:3dm)
 */
import rhino3dm from 'rhino3dm/rhino3dm.module.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { addItem, duplicateItems, groupItems, newComposition, rotateItems } from '../src/core/compose';
import { defaultParams } from '../src/core/geometry/kit';
import { boxSize, shapeBounds } from '../src/core/geometry/shape';
import { exportItemFor, resolveRef } from '../src/core/library';
import type { Composition, ItemRef, Vec3 } from '../src/core/schema';
import { MODEL_BY_ID } from '../src/core/catalog/products';
import { exportComposition, readBack } from '../src/export/rhino';
import { TEMPLATES, insertComposition } from '../src/core/templates';
import { buildBoothSheet, buildSheet } from '../src/core/sheet';
import { analyseBooth, boothCsv } from '../src/core/booth';
import { sampleExhibition } from '../src/core/exhibitionSample';
import { boothAnnotations } from '../src/export/boothAnnotations';
import { schedule, scheduleCsv } from '../src/core/services';
import { buildClientPackage, clientHtml } from '../src/core/presentation';
import { moduleTag } from '../src/core/sheet';

const rh = await rhino3dm();
const pkg = (await import('../package.json', { with: { type: 'json' } })).default as { version: string };
mkdirSync('samples', { recursive: true });

const dims = (ref: ItemRef): Vec3 => boxSize(shapeBounds(resolveRef(ref, [])!.shape!));
const add = (c: Composition, ref: ItemRef, name: string, at: Vec3) => addItem(c, ref, name, dims(ref), at);

function sparkStation(): Composition {
  let c = newComposition('DGX Spark demo station (sample)');
  const counter: ItemRef = { kind: 'kit', id: 'kit-demo-counter', params: { ...defaultParams('kit-demo-counter'), accessible: 900 } };
  const table: ItemRef = { kind: 'kit', id: 'kit-light-table', params: defaultParams('kit-light-table') };
  const spark: ItemRef = { kind: 'product', id: 'nv-dgx-spark' };
  let r = add(c, counter, 'Demo counter', [0, 0, 0]); c = r.comp; const counterId = r.id;
  r = add(c, spark, 'DGX Spark', [500, -150, 1000]); c = r.comp; const sparkId = r.id;
  c = groupItems(c, [counterId, sparkId], 'Spark station').comp;
  c = duplicateItems(c, [counterId, sparkId], [0, 2200, 0]).comp;
  c = rotateItems(c, c.items.slice(2).map((i) => i.id), 180);
  r = add(c, table, 'Light table', [2600, 1100, 0]); c = r.comp;
  for (const x of [-300, 0, 300]) c = add(c, spark, 'DGX Spark', [2600 + x, 1100, 900]).comp;
  return c;
}

function hardwareLineup(): Composition {
  let c = newComposition('NVIDIA hardware line-up (sample)');
  let x = 0;
  for (const id of ['gb-gb200-nvl72-rack', 'nv-dgx-b200', 'nv-rtx-pro-6000-maxq', 'nv-dgx-spark', 'nv-agx-orin-devkit', 'nv-agx-thor-devkit']) {
    const ref: ItemRef = { kind: 'product', id };
    const d = dims(ref);
    c = add(c, ref, MODEL_BY_ID.get(id)!.name, [x + d[0] / 2, 0, 0]).comp;
    x += d[0] + 400;
  }
  return c;
}

/** every Round 02 product with a published envelope, in a row; a catalog check, not a stand layout */
function lineupR02(): Composition {
  let c = newComposition('DGX Station, RTX PRO and Spectrum-X line-up (sample)');
  let x = 0;
  for (const id of ['dell-pro-max-gb300', 'gb-w775-v10', 'msi-ws300', 'smc-ars-511gd', 'nv-rtx-pro-6000-ws', 'nv-rtx-pro-5000', 'nv-connectx-9', 'dell-rtx-pro-server', 'hpe-rtx-pro-server', 'nv-sn6600', 'nv-sn6600-ld', 'nv-sn6810-ld', 'nv-sn6800-ld']) {
    const ref: ItemRef = { kind: 'product', id };
    const d = dims(ref);
    c = add(c, ref, MODEL_BY_ID.get(id)!.name, [x + d[0] / 2, 0, 0]).comp;
    x += d[0] + 300;
  }
  return c;
}

/** every built-in template, side by side: the Round 03 sample, with its sheet and services schedule */
function demoModules(): Composition {
  let c = newComposition('Demo module templates (sample)');
  let x = 0;
  for (const t of TEMPLATES) {
    const s = t.build();
    const ex = s.items.map((p) => { const b = shapeBounds(resolveRef(p.ref, [])!.shape!); return [p.position[0] + b.min[0], p.position[0] + b.max[0]]; });
    const lo = Math.min(...ex.map((e) => e[0])), hi = Math.max(...ex.map((e) => e[1]));
    c = insertComposition(c, s, [x - lo, 0, 0], t.name).comp;
    x += hi - lo + 600;
  }
  return c;
}

const modules = demoModules();
const sheet = buildSheet(modules, (p) => resolveRef(p.ref, [])?.shape ?? null, { statusOf: (p) => resolveRef(p.ref, [])!.entry.verification, appLabel: `MAESTRO ${pkg.version} · sample`, date: '2026-10-26' })!;
writeFileSync('samples/demo-modules.sheet.svg', sheet.svg);
writeFileSync('samples/demo-modules.services.csv', scheduleCsv(schedule(modules, (p) => resolveRef(p.ref, [])!.entry.name), modules.name));
console.log(`samples/demo-modules.sheet.svg: 1:${sheet.scale}, ${sheet.items.length} items`);

const expo = sampleExhibition();
const shapeOf = (p: Composition['items'][number]) => resolveRef(p.ref, [])?.shape ?? null;
const analysis = analyseBooth(expo, shapeOf, (p) => resolveRef(p.ref, [])!.entry.name)!;
const plan = buildBoothSheet(expo, analysis, shapeOf, { appLabel: `MAESTRO ${pkg.version} · sample`, date: '2026-10-26' })!;
writeFileSync('samples/sample-booth.plan.svg', plan.svg);
writeFileSync('samples/sample-booth.schedule.csv', boothCsv(expo, analysis));
console.log(`samples/sample-booth.plan.svg: 1:${plan.scale}, ${analysis.units.length} modules, ${analysis.issues.length} checks open`);

// the client view without stills (stills are rendered in the browser): one shared link, one confidential link left out
expo.docs = [
  { id: 'doc-venue', title: 'Venue exhibitor manual (placeholder)', kind: 'venue', confidential: false, addedAt: '2026-10-26T00:00:00Z' },
  { id: 'doc-cost', title: 'Internal cost plan', kind: 'other', reference: 'COST-01', confidential: true, addedAt: '2026-10-26T00:00:00Z' },
];
const sch = schedule(expo, (p) => resolveRef(p.ref, [])!.entry.name);
const client = buildClientPackage(expo, {
  resolve: (p) => { const e = resolveRef(p.ref, [])?.entry; return e ? { name: e.name, source: e.section, status: e.verification, dims: e.dims, category: e.group } : null; },
  overall: null, moduleTag, now: '2026-10-26T00:00:00Z',
  power: { statedW: sch.knownWatts, live: sch.liveCount, unknownLive: sch.unknownLive },
  access: { accessibleShare: analysis.accessibleShare, open: analysis.issues.length },
});
writeFileSync('samples/sample-booth.client.html', clientHtml(client));
console.log(`samples/sample-booth.client.html: ${client.items.length} item rows, ${client.docs.length} shared link(s)`);

for (const [file, comp] of [['spark-demo-station.3dm', sparkStation()], ['hardware-lineup.3dm', hardwareLineup()], ['lineup-r02.3dm', lineupR02()], ['demo-modules.3dm', modules], ['sample-booth.3dm', expo]] as const) {
  const r = exportComposition(rh, comp, (p) => exportItemFor(p, []), pkg.version, comp === expo ? boothAnnotations(expo, analysis) : []);
  const back = readBack(rh, r.bytes);
  writeFileSync(`samples/${file}`, r.bytes);
  writeFileSync(`samples/${file.replace('.3dm', '.maestro.json')}`, JSON.stringify(comp, null, 2));
  console.log(`samples/${file}: ${r.instances} instances, ${r.blocks} blocks, ${back.units}, ${(r.bytes.length / 1024).toFixed(0)} KB${r.annotations ? `, ${r.annotations} booth curves` : ''}${r.skipped.length ? `, skipped ${r.skipped.join('; ')}` : ''}`);
}
