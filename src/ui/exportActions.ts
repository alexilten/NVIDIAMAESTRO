import { exportItemFor, resolveRef } from '../core/library';
import { newComposition, addItem } from '../core/compose';
import { boxSize, shapeBounds } from '../core/geometry/shape';
import type { Composition, ItemRef, Placement, Vec3 } from '../core/schema';
import { auditText, buildClientPackage, clientHtml, secretsFor, type ClientPackage, type Secret } from '../core/presentation';
import { extentOf } from './store';
import { exportComposition, readBack } from '../export/rhino';
import { boothAnnotations } from '../export/boothAnnotations';
import { boothCsv } from '../core/booth';
import { boothAnalysis } from './useBooth';
import { buildBoothSheet, buildSheet, moduleTag } from '../core/sheet';
import { schedule, scheduleCsv } from '../core/services';
import { download, loadRhino } from '../ingest/rhinoBrowser';
import type { IngestedPart } from '../ingest/types';

const slug = (s: string) => s.replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'maestro';

/** Export a composition to .3dm, reopen the bytes and check them, then download. Returns a short report. */
export async function exportCompositionFile(comp: Composition, parts: IngestedPart[]): Promise<string> {
  const rh = await loadRhino();
  const a = comp.booth ? boothAnalysis(comp, parts) : null;
  const r = exportComposition(rh, comp, (p) => exportItemFor(p, parts), __APP_VERSION__, a ? boothAnnotations(comp, a) : []);
  const back = readBack(rh, r.bytes);
  const problems: string[] = [];
  if (back.units !== 'Millimeters') problems.push(`units ${back.units}`);
  if (back.instances.length !== r.instances) problems.push(`${back.instances.length} of ${r.instances} instances reopened`);
  download(r.bytes, `${slug(comp.name)}.3dm`);
  const skipped = r.skipped.length ? ` ${r.skipped.length} skipped: ${r.skipped.slice(0, 3).join('; ')}.` : '';
  const extra = r.annotations ? ` with the booth plot, service points and clearances` : '';
  return problems.length ? `Exported with problems: ${problems.join(', ')}.${skipped}` : `Exported ${r.instances} instance${r.instances === 1 ? '' : 's'} of ${r.blocks} block${r.blocks === 1 ? '' : 's'}${extra} (mm). Reopened and checked.${skipped}`;
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
  return printSvg(r.svg, comp.name, r.scale);
}

function printSvg(svg: string, title: string, scale: number): string {
  const w = window.open('', '_blank');
  if (!w) return 'The browser blocked the print window. Use Sheet .svg instead.';
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title.replace(/</g, '')}</title><style>@page{size:A3 landscape;margin:0}html,body{margin:0}svg{display:block;width:420mm;height:297mm}</style></head><body>${svg.replace(/^<\?xml[^>]*>/, '')}<script>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
  return `Sheet opened for printing at 1:${scale}. Print at 100% on A3 landscape.`;
}

const boothSheetFor = (comp: Composition, parts: IngestedPart[]) => {
  const a = boothAnalysis(comp, parts);
  return a ? buildBoothSheet(comp, a, (p) => resolveRef(p.ref, parts)?.shape ?? null, { appLabel: `MAESTRO ${__APP_VERSION__} · build ${__APP_BUILD__}` }) : null;
};

export function downloadBoothSheet(comp: Composition, parts: IngestedPart[]): string {
  const r = boothSheetFor(comp, parts);
  if (!r) return 'This composition has no booth.';
  download(r.svg, `${slug(comp.name)}.booth.svg`, 'image/svg+xml');
  return `Booth plan saved at 1:${r.scale} on A3.`;
}

export function printBoothSheet(comp: Composition, parts: IngestedPart[]): string {
  const r = boothSheetFor(comp, parts);
  return r ? printSvg(r.svg, comp.name, r.scale) : 'This composition has no booth.';
}

export function downloadBoothSchedule(comp: Composition, parts: IngestedPart[]) {
  const a = boothAnalysis(comp, parts);
  if (a) download(boothCsv(comp, a), `${slug(comp.name)}.booth.csv`, 'text/csv');
}

export function downloadSchedule(comp: Composition, parts: IngestedPart[]) {
  const s = schedule(comp, (p) => resolveRef(p.ref, parts)?.entry.name ?? p.name);
  download(scheduleCsv(s, comp.name), `${slug(comp.name)}.services.csv`, 'text/csv');
}

// ── client view ─────────────────────────────────────────────────────────────────────────────────────

export interface ClientBuild { html: string; pkg: ClientPackage; checked: number; leaks: Secret[] }

/** Build the client view and check it against every private value of the parts it shows. */
export function clientViewFor(comp: Composition, parts: IngestedPart[], stills: { name: string; src: string }[], preparedBy?: string): ClientBuild {
  const resolve = (p: Placement) => {
    const r = resolveRef(p.ref, parts);
    return r ? { name: r.entry.name, source: r.entry.section, status: r.entry.verification, dims: r.entry.dims, category: r.entry.group } : null;
  };
  const ex = comp.items.map((p) => extentOf(p, parts)).filter(Boolean) as { min: Vec3; max: Vec3 }[];
  const overall: Vec3 | null = ex.length ? [0, 1, 2].map((k) => Math.max(...ex.map((e) => e.max[k])) - Math.min(...ex.map((e) => e.min[k]))) as Vec3 : null;
  const s = schedule(comp, (p) => resolveRef(p.ref, parts)?.entry.name ?? p.name);
  const a = comp.booth ? boothAnalysis(comp, parts) : null;
  const pkg = buildClientPackage(comp, {
    resolve, overall, stills, preparedBy, moduleTag,
    power: { statedW: s.knownWatts, live: s.liveCount, unknownLive: s.unknownLive },
    access: a ? { accessibleShare: a.accessibleShare, open: a.issues.length } : undefined,
  });
  const html = clientHtml(pkg);
  const used = parts.filter((p) => comp.items.some((i) => i.ref.kind === 'ingested' && i.ref.id === p.id && i.ref.version === p.version));
  // item names are shown on purpose (an imported part is named after its block); names typed for the
  // composition and its modules are not exempt, so a pasted file name or drawing number is still caught
  const shown = [...pkg.items.map((r) => r.name), ...(comp.docs ?? []).filter((d) => !d.confidential).flatMap((d) => [d.title, d.url ?? '', d.reference ?? ''])];
  const secrets = secretsFor(comp, used, shown);
  return { html, pkg, checked: secrets.length, leaks: auditText(html, secrets) };
}

export function downloadClientView(b: ClientBuild, comp: Composition): string {
  if (b.leaks.length) return `Not saved: the client view would show ${b.leaks.map((l) => l.what).slice(0, 3).join('; ')}.`;
  download(b.html, `${slug(comp.name)}.client.html`, 'text/html');
  return `Client view saved: ${b.pkg.stills.length} still${b.pkg.stills.length === 1 ? '' : 's'}, ${b.pkg.items.length} item row${b.pkg.items.length === 1 ? '' : 's'}, ${b.pkg.docs.length + b.pkg.modules.reduce((n, m) => n + m.docs.length, 0)} shared document link(s). Checked against ${b.checked} private values.`;
}

export function previewClientView(b: ClientBuild): string {
  if (b.leaks.length) return 'The client view shows private values; fix them first.';
  const url = URL.createObjectURL(new Blob([b.html], { type: 'text/html' }));
  const w = window.open(url, '_blank', 'noopener');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  void w;
  return 'Client view opened in a new tab.';
}

export function downloadStill(name: string, compName: string, src: string) {
  const a = document.createElement('a');
  a.href = src;
  a.download = `${slug(compName)}.${slug(name)}.png`;
  a.click();
}
