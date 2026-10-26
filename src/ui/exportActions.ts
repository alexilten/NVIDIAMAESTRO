import { exportItemFor, resolveRef } from '../core/library';
import { newComposition, addItem } from '../core/compose';
import { boxSize, shapeBounds } from '../core/geometry/shape';
import type { Composition, ItemRef } from '../core/schema';
import { exportComposition, readBack } from '../export/rhino';
import { download, loadRhino } from '../ingest/rhinoBrowser';
import type { IngestedPart } from '../ingest/types';

const slug = (s: string) => s.replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'maestro';

/** Export a composition to .3dm, reopen the bytes and check them, then download. Returns a short report. */
export async function exportCompositionFile(comp: Composition, parts: IngestedPart[]): Promise<string> {
  const rh = await loadRhino();
  const r = exportComposition(rh, comp, (p) => exportItemFor(p, parts), __APP_VERSION__);
  const back = readBack(rh, r.bytes);
  const problems: string[] = [];
  if (back.units !== 'Millimeters') problems.push(`units ${back.units}`);
  if (back.instances.length !== r.instances) problems.push(`${back.instances.length} of ${r.instances} instances reopened`);
  download(r.bytes, `${slug(comp.name)}.3dm`);
  const skipped = r.skipped.length ? ` ${r.skipped.length} skipped: ${r.skipped.slice(0, 3).join('; ')}.` : '';
  return problems.length ? `Exported with problems: ${problems.join(', ')}.${skipped}` : `Exported ${r.instances} instance${r.instances === 1 ? '' : 's'} of ${r.blocks} block${r.blocks === 1 ? '' : 's'} (mm). Reopened and checked.${skipped}`;
}

/** Export one library item on its own, at the origin. */
export async function exportItemFile(ref: ItemRef, name: string, parts: IngestedPart[]): Promise<string> {
  const r = resolveRef(ref, parts);
  if (!r?.shape) return 'This item has no geometry to export.';
  const comp = addItem(newComposition(name), ref, name, boxSize(shapeBounds(r.shape)), [0, 0, 0], ref.kind === 'ingested' ? ref.version : 1).comp;
  return exportCompositionFile(comp, parts);
}

export function saveCompositionJson(comp: Composition) {
  download(JSON.stringify(comp, null, 2), `${slug(comp.name)}.maestro.json`, 'application/json');
}
