import { boxSize } from '../core/geometry/shape';
import { measureByMaterial, type BlockCandidate, type ExtractedPart, type SourceSummary } from './rhino';
import type { DimCheck, DocLink, IngestedPart } from './types';

/**
 * Source project → ingestion → technical verification → kit of parts.
 * These functions turn an extracted block into a proposed library part, suggest documentation pages for it,
 * and carry it through review to approval. Nothing is published to the library without an explicit approval.
 */

const uid = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export function cleanName(block: string): string {
  return block.replace(/^NV_(HW|KIOSK|PART|DESK|ROBOT|SIGN|AV|SUB|HWALL|HERO|CES|VEH)_/, '').replace(/_/g, ' ').trim();
}

export function proposePart(summary: SourceSummary, c: BlockCandidate, x: ExtractedPart, project: string): IngestedPart {
  return {
    schema: 'maestro.ingested-part',
    id: uid('part'),
    version: 1,
    name: cleanName(c.name),
    category: c.category,
    status: 'proposed',
    project,
    tags: [c.category, ...cleanName(c.name).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1)],
    createdAt: new Date().toISOString(),
    source: {
      fileName: summary.fileName, fileSize: summary.fileSize, sha256: summary.sha256, units: summary.units,
      block: c.name, description: c.description, derivedFrom: c.derivedFrom, originNote: c.originNote,
    },
    bbox: x.bbox,
    dims: boxSize(x.bbox),
    geometry: x.geometry,
    mesh: x.mesh,
    materials: x.materials,
    stats: x.stats,
    docs: [],
    checks: defaultChecks(x),
    notes: '',
  };
}

/** overall dimensions, ready for drawing values to be entered against them */
export function defaultChecks(x: Pick<ExtractedPart, 'bbox'>): DimCheck[] {
  const s = boxSize(x.bbox);
  return (['width', 'depth', 'height'] as const).map((k, i) => ({
    id: uid('chk'), label: `Overall ${k}`, measure: `overall ${k}`, model: round1(s[i]), drawing: null, tolerance: 2, resolution: 'open' as const,
  }));
}

export function addCheck(p: IngestedPart, label: string, measure: string, model: number | null, drawing: number | null, tolerance = 2, docLinkId?: string): IngestedPart {
  return { ...p, checks: [...p.checks, { id: uid('chk'), label, measure, model, drawing, tolerance, resolution: 'open', docLinkId }] };
}

/** the model-side measurements available for a check */
export function measures(p: IngestedPart): { measure: string; value: number }[] {
  const out: { measure: string; value: number }[] = [];
  const s = p.dims;
  (['width', 'depth', 'height'] as const).forEach((k, i) => out.push({ measure: `overall ${k}`, value: round1(s[i]) }));
  for (const m of measureByMaterial(p.mesh)) {
    (['width', 'depth', 'height'] as const).forEach((k, i) => out.push({ measure: `${m.material} · ${k}`, value: round1(m.size[i]) }));
    out.push({ measure: `${m.material} · bottom (z)`, value: round1(m.min[2]) });
    out.push({ measure: `${m.material} · top (z)`, value: round1(m.max[2]) });
  }
  return out;
}

export type CheckState = 'match' | 'discrepancy' | 'missing';
export function checkState(c: DimCheck): CheckState {
  if (c.model == null || c.drawing == null) return 'missing';
  return Math.abs(c.model - c.drawing) <= c.tolerance ? 'match' : 'discrepancy';
}

/** what still blocks approval */
export function approvalBlockers(p: IngestedPart): string[] {
  const out: string[] = [];
  if (!p.docs.some((d) => d.origin !== 'suggested')) out.push('Confirm at least one documentation page.');
  const open = p.checks.filter((c) => checkState(c) === 'discrepancy' && c.resolution === 'open');
  if (open.length) out.push(`Resolve ${open.length} dimension discrepanc${open.length === 1 ? 'y' : 'ies'} (keep the model, take the drawing, or note it).`);
  if (!p.checks.some((c) => checkState(c) !== 'missing')) out.push('Compare at least one dimension with a drawing.');
  return out;
}

export function approve(p: IngestedPart, by: string): IngestedPart {
  const b = approvalBlockers(p);
  if (b.length) throw new Error(b.join(' '));
  return { ...p, status: 'approved', approvedAt: new Date().toISOString(), approvedBy: by };
}

/** a new version of an approved part from a revised source; the approved version stays as it was */
export function revise(prev: IngestedPart, next: IngestedPart): IngestedPart {
  return { ...next, id: prev.id, version: prev.version + 1, supersedes: prev.version, status: 'proposed', approvedAt: undefined, approvedBy: undefined, docs: prev.docs.map((d) => ({ ...d })), notes: prev.notes };
}

// ── documentation cross-reference ───────────────────────────────────────────────────────────────────

export interface PageText { page: number; text: string }

const GENERIC = new Set(['nv', 'hw', 'part', 'kit', 'exact', 'geometry', 'copy', 'block', 'the', 'and', 'with', 'of', 'x', 'in', 'complete', 'built', 'as']);
const STATUS_RE = /(SIGNED OFF|APPROVED TO DRAW[^|]{0,20}|READY FOR REVIEW[^|]{0,12}|IN PRODUCTION|DRAWING\s+\d{2}\.\d{2}\.\d{2}|UPDATED\s+\d{1,2}\/\d{1,2})/i;
const DRAWING_RE = /\b(\d{6}-[A-Z]+-\d+-\d+(?:-R\d+)?)\b/;

export function keywords(name: string, extra: string[] = []): string[] {
  const words = name.toLowerCase().replace(/[()]/g, ' ').split(/[^a-z0-9]+/).filter((w) => w && !GENERIC.has(w) && !/^\d{1,3}$/.test(w));
  return [...new Set([...words, ...extra.map((e) => e.toLowerCase())])];
}

/** rank pages of a document by how well they match a part; the reviewer confirms or rejects each suggestion */
export function suggestDocs(document: string, pages: PageText[], p: Pick<IngestedPart, 'name' | 'category' | 'source'>, limit = 6): DocLink[] {
  const texts = pages.map((pg) => pg.text.toLowerCase().replace(/\s+/g, ' '));
  const has = (t: string, k: string) => new RegExp(`\\b${escape(k)}\\b`).test(t);
  // words found on a large share of the pages (the project or client name, a running header) say nothing about a part
  const all = keywords(`${p.source.block} ${p.name}`, [p.category === 'kiosk' ? 'station' : p.category === 'pedestal' ? 'light table' : p.category]);
  const df = new Map(all.map((k) => [k, texts.filter((t) => has(t, k)).length]));
  const kws = all.filter((k) => (df.get(k) ?? 0) > 0 && (df.get(k) ?? 0) <= Math.max(2, pages.length * 0.4));
  const weight = (k: string) => Math.log((pages.length + 1) / (df.get(k)! + 0.5));
  const phrases: string[] = [];
  for (let i = 0; i < kws.length - 1; i++) phrases.push(`${kws[i]} ${kws[i + 1]}`);
  const scored = pages.map((pg, i) => {
    const t = texts[i];
    const matched = kws.filter((k) => has(t, k));
    let score = matched.reduce((s, k) => s + weight(k), 0) + phrases.filter((ph) => t.includes(ph)).length * 2;
    if (/build drawings?/.test(t)) score += 1.5;
    if (/signed off/.test(t)) score += 0.5;
    return { pg, matched, score };
  }).filter((x) => x.matched.length >= 2).sort((a, b) => b.score - a.score || a.pg.page - b.pg.page).slice(0, limit);
  return scored.map(({ pg, matched }) => {
    const firstLine = pg.text.replace(/\s+/g, ' ').trim();
    const title = (/([A-Z0-9][A-Z0-9 ,()'’&-]{8,90}?(?:BUILD DRAWINGS|DRAWINGS|TYPICAL|STATION|NICHE|PEDESTAL|TABLE)[A-Z0-9 ()-]{0,30})/.exec(firstLine)?.[1] ?? firstLine.slice(0, 80)).trim();
    return { id: uid('doc'), document, page: pg.page, title, status: STATUS_RE.exec(pg.text)?.[1]?.trim(), reference: DRAWING_RE.exec(pg.text)?.[1], origin: 'suggested' as const, matched };
  });
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const round1 = (x: number) => Math.round(x * 10) / 10;
