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

for (const [file, comp] of [['spark-demo-station.3dm', sparkStation()], ['hardware-lineup.3dm', hardwareLineup()]] as const) {
  const r = exportComposition(rh, comp, (p) => exportItemFor(p, []), pkg.version);
  const back = readBack(rh, r.bytes);
  writeFileSync(`samples/${file}`, r.bytes);
  writeFileSync(`samples/${file.replace('.3dm', '.maestro.json')}`, JSON.stringify(comp, null, 2));
  console.log(`samples/${file}: ${r.instances} instances, ${r.blocks} blocks, ${back.units}, ${(r.bytes.length / 1024).toFixed(0)} KB${r.skipped.length ? `, skipped ${r.skipped.join('; ')}` : ''}`);
}
