import { exportItemFor } from '../core/library';
import { nicheAnnotations, nicheComposition } from '../core/niche/build';
import { nicheElevation } from '../core/niche/elevation';
import type { NicheLayout } from '../core/niche/layout';
import { exportComposition, readBack } from '../export/rhino';
import { download, loadRhino } from '../ingest/rhinoBrowser';

const slug = (s: string) => s.replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'niche';

/** The niche as a .3dm: its blocks, the dimension chains and label text in the front plane; reopened and checked before download. */
export async function exportNicheFile(l: NicheLayout): Promise<string> {
  const rh = await loadRhino();
  const comp = nicheComposition(l);
  const r = exportComposition(rh, comp, (p) => exportItemFor(p, []), __APP_VERSION__, nicheAnnotations(l));
  const back = readBack(rh, r.bytes);
  const problems: string[] = [];
  if (back.units !== 'Millimeters') problems.push(`units ${back.units}`);
  if (back.instances.length !== r.instances) problems.push(`${back.instances.length} of ${r.instances} instances reopened`);
  download(r.bytes, `${slug(`${l.spec.code}_${l.spec.name}`)}.3dm`);
  return problems.length ? `Exported with problems: ${problems.join(', ')}.` : `Exported ${l.spec.code} with ${l.units.length} units, ${l.labels.length} labels and its dimensions (mm). Reopened and checked.`;
}

export function printNicheSheet(l: NicheLayout): string {
  const { svg, scale } = nicheElevation(l, { appLabel: `MAESTRO ${__APP_VERSION__} · build ${__APP_BUILD__}` });
  const w = window.open('', '_blank');
  if (!w) return 'The browser blocked the print window. Use Sheet .svg instead.';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${`${l.spec.code} ${l.spec.name}`.replace(/</g, '')}</title><style>@page{size:A3 landscape;margin:0}html,body{margin:0}svg{display:block;width:420mm;height:297mm}</style></head><body>${svg.replace(/^<\?xml[^>]*>/, '')}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
  return `Sheet opened for printing at 1:${scale}. Print at 100% on A3 landscape.`;
}
