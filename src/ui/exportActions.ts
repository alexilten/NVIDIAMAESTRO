import { exportItemFor, resolveRef } from '../core/library';
import { newComposition, addItem } from '../core/compose';
import { boxSize, shapeBounds } from '../core/geometry/shape';
import type { Composition, ItemRef } from '../core/schema';
import { exportComposition, readBack } from '../export/rhino';
import { buildSheet } from '../core/sheet';
import { schedule, scheduleCsv } from '../core/services';
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

const sheetFor = (comp: Composition, parts: IngestedPart[]) => buildSheet(comp, (p) => resolveRef(p.ref, parts)?.shape ?? null, {
  statusOf: (p) => resolveRef(p.ref, parts)?.entry.verification ?? 'placeholder',
  appLabel: `MAESTRO ${__APP_VERSION__} · build ${__APP_BUILD__}`,
});

/** Download the A3 elevation sheet as SVG (to scale, in millimetres). */
export function downloadSheet(comp: Composition, parts: IngestedPart[]): string {
  const r = sheetFor(comp, parts);
  if (!r) return 'Nothing to draw yet.';
  download(r.svg, `${slug(comp.name)}.sheet.svg`, 'image/svg+xml');
  return `Sheet saved at 1:${r.scale} on A3, ${r.items.length} items.`;
}

/** Open the sheet on its own page and print it (save as PDF from the print dialog; print at 100%). */
export function printSheet(comp: Composition, parts: IngestedPart[]): string {
  const r = sheetFor(comp, parts);
  if (!r) return 'Nothing to draw yet.';
  const w = window.open('', '_blank');
  if (!w) return 'The browser blocked the print window. Use Sheet .svg instead.';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${comp.name.replace(/</g, '')}</title><style>@page{size:A3 landscape;margin:0}html,body{margin:0}svg{display:block;width:420mm;height:297mm}</style></head><body>${r.svg.replace(/^<\?xml[^>]*>/, '')}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
  return `Sheet opened for printing at 1:${r.scale}. Print at 100% on A3 landscape.`;
}

export function downloadSchedule(comp: Composition, parts: IngestedPart[]) {
  const s = schedule(comp, (p) => resolveRef(p.ref, parts)?.entry.name ?? p.name);
  download(scheduleCsv(s, comp.name), `${slug(comp.name)}.services.csv`, 'text/csv');
}
