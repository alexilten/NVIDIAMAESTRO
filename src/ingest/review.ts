import { measures } from './pipeline';
import type { DimCheck, DocLink, IngestedPart } from './types';

/**
 * Review notes: a reviewer's document links, drawing dimensions and notes, kept as a sidecar JSON file next to
 * the source model. The sidecar is project data, so it stays in private storage with the model and is never
 * committed. Notes are matched to parts by source block name, so they survive re-ingesting a revised model.
 */

export interface ReviewDoc { document: string; page: number; title: string; reference?: string; status?: string }
export interface ReviewCheck {
  label: string;
  /** a model measure as listed by `measures()`, e.g. "overall width" */
  measure: string;
  drawing: number;
  tolerance?: number;
  /** the page the drawing value was read from */
  document?: string;
  page?: number;
  resolution?: DimCheck['resolution'];
  note?: string;
}
export interface ReviewEntry { block: string; name?: string; notes?: string; docs?: ReviewDoc[]; checks?: ReviewCheck[] }
export interface Review { schema: 'maestro.review'; version: 1; source?: string; entries: ReviewEntry[] }

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function parseReview(text: string): Review {
  const r = JSON.parse(text);
  if (r?.schema !== 'maestro.review') throw new Error('not a MAESTRO review file');
  if (r.version !== 1) throw new Error(`unsupported review version ${r.version}`);
  if (!Array.isArray(r.entries)) throw new Error('review has no entries');
  for (const e of r.entries) if (typeof e?.block !== 'string') throw new Error('review entry without a block name');
  return r as Review;
}

/** Apply the matching entry to a part. Returns the same object when nothing changes. */
export function applyReview(p: IngestedPart, r: Review): IngestedPart {
  const e = r.entries.find((x) => x.block === p.source.block);
  if (!e) return p;
  let changed = false;
  const docs: DocLink[] = p.docs.map((d) => ({ ...d }));
  const docFor = (document: string, page: number) => docs.find((d) => d.document === document && d.page === page);

  for (const d of e.docs ?? []) {
    const have = docFor(d.document, d.page);
    if (have) {
      if (have.origin === 'suggested') { have.origin = 'confirmed'; changed = true; }
      if (d.reference && !have.reference) { have.reference = d.reference; changed = true; }
      if (d.status && !have.status) { have.status = d.status; changed = true; }
    } else {
      docs.push({ id: uid('doc'), document: d.document, page: d.page, title: d.title, reference: d.reference, status: d.status, origin: 'confirmed' });
      changed = true;
    }
  }

  const available = new Map(measures(p).map((m) => [m.measure, m.value]));
  const checks: DimCheck[] = p.checks.map((c) => ({ ...c }));
  for (const c of e.checks ?? []) {
    const link = c.document && c.page != null ? docFor(c.document, c.page) : undefined;
    const have = checks.find((x) => x.measure === c.measure && x.label === c.label) ?? checks.find((x) => x.measure === c.measure && x.drawing == null);
    if (have) {
      if (have.drawing === c.drawing && (c.resolution == null || have.resolution === c.resolution)) continue;
      // a drawing value the reviewer already entered by hand wins over the sidecar
      if (have.drawing != null && have.drawing !== c.drawing) continue;
      have.drawing = c.drawing;
      have.label = c.label;
      if (c.tolerance != null) have.tolerance = c.tolerance;
      if (link) have.docLinkId = link.id;
      if (c.resolution && have.resolution === 'open') have.resolution = c.resolution;
      if (c.note && !have.note) have.note = c.note;
      changed = true;
    } else {
      checks.push({
        id: uid('chk'), label: c.label, measure: c.measure, model: available.get(c.measure) ?? null, drawing: c.drawing,
        tolerance: c.tolerance ?? 2, docLinkId: link?.id, resolution: c.resolution ?? 'open', note: c.note,
      });
      changed = true;
    }
  }

  let notes = p.notes;
  if (e.notes && !notes.includes(e.notes)) { notes = notes ? `${notes}\n\n${e.notes}` : e.notes; changed = true; }
  return changed ? { ...p, docs, checks, notes } : p;
}

/** Write the review work on these parts back out as a sidecar. Only confirmed links and entered drawing values go in. */
export function exportReview(parts: IngestedPart[]): Review {
  const latest = new Map<string, IngestedPart>();
  for (const p of parts) { const q = latest.get(p.source.block); if (!q || q.version < p.version) latest.set(p.source.block, p); }
  const entries: ReviewEntry[] = [...latest.values()].map((p) => {
    const docs = p.docs.filter((d) => d.origin !== 'suggested');
    const byId = new Map(docs.map((d) => [d.id, d]));
    return {
      block: p.source.block,
      name: p.name,
      notes: p.notes || undefined,
      docs: docs.map(({ document, page, title, reference, status }) => ({ document, page, title, reference, status })),
      checks: p.checks.filter((c) => c.drawing != null).map((c) => {
        const d = c.docLinkId ? byId.get(c.docLinkId) : undefined;
        return { label: c.label, measure: c.measure, drawing: c.drawing as number, tolerance: c.tolerance, document: d?.document, page: d?.page, resolution: c.resolution === 'open' ? undefined : c.resolution, note: c.note };
      }),
    };
  });
  return { schema: 'maestro.review', version: 1, source: parts[0]?.source.fileName, entries };
}
