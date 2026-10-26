import { addCheck, approvalBlockers, approve, measures } from './pipeline';
import type { DocLink, IngestedPart } from './types';

/**
 * Review several proposed parts that share a drawing page in one pass: confirm the page for all of them,
 * compare the same dimension with the drawing on each, and approve the ones that are then clear. Every part
 * still meets the same approval rules on its own; a group never lowers the bar.
 */

export interface DrawingGroup {
  key: string;
  document: string;
  page: number;
  title: string;
  reference?: string;
  parts: IngestedPart[];
  /** how many of the parts already have this page confirmed */
  confirmed: number;
}

export const pageKey = (d: Pick<DocLink, 'document' | 'page'>) => `${d.document}#${d.page}`;

/**
 * pages linked (suggested or confirmed) to two or more proposed parts, the most shared first. `settled` keeps
 * approved parts in, so a group under review stays on screen once some of its parts are approved.
 */
export function drawingGroups(parts: IngestedPart[], settled = false): DrawingGroup[] {
  const groups = new Map<string, DrawingGroup>();
  for (const p of parts) {
    if (p.status !== 'proposed' && !(settled && p.status === 'approved')) continue;
    const seen = new Set<string>();
    for (const d of p.docs) {
      const k = pageKey(d);
      if (seen.has(k)) continue;
      seen.add(k);
      let g = groups.get(k);
      if (!g) { g = { key: k, document: d.document, page: d.page, title: d.title, reference: d.reference, parts: [], confirmed: 0 }; groups.set(k, g); }
      g.parts.push(p);
      if (p.docs.some((x) => pageKey(x) === k && x.origin !== 'suggested')) g.confirmed++;
      if (!g.reference && d.reference) g.reference = d.reference;
    }
  }
  return [...groups.values()].filter((g) => g.parts.length >= 2).sort((a, b) => b.parts.length - a.parts.length || a.document.localeCompare(b.document) || a.page - b.page);
}

/** confirm the page on every part of the group, turning a suggestion into a confirmed link */
export function confirmPage(g: Pick<DrawingGroup, 'document' | 'page'>, parts: IngestedPart[]): IngestedPart[] {
  return parts.map((p) => ({ ...p, docs: p.docs.map((d) => (d.document === g.document && d.page === g.page && d.origin === 'suggested' ? { ...d, origin: 'confirmed' as const } : d)) }));
}

/**
 * Compare one measure with the same drawing value on every part, linked to the group's page. A part that has
 * no such measure is left as it is and reported; a check already made on that measure is updated, not doubled.
 */
export function checkAll(g: Pick<DrawingGroup, 'document' | 'page'>, parts: IngestedPart[], measure: string, drawing: number, tolerance = 2): { parts: IngestedPart[]; skipped: IngestedPart[] } {
  const out: IngestedPart[] = [], skipped: IngestedPart[] = [];
  for (const p of parts) {
    const m = measures(p).find((x) => x.measure === measure);
    if (!m) { skipped.push(p); continue; }
    const link = p.docs.find((d) => d.document === g.document && d.page === g.page);
    const existing = p.checks.find((c) => c.measure === measure && (c.drawing == null || c.docLinkId === link?.id));
    if (existing) {
      out.push({ ...p, checks: p.checks.map((c) => (c === existing ? { ...c, drawing, tolerance, docLinkId: link?.id ?? c.docLinkId, resolution: 'open' as const } : c)) });
    } else {
      out.push(addCheck(p, measure, measure, m.value, drawing, tolerance, link?.id));
    }
  }
  return { parts: out, skipped };
}

/** the measures every part in the group can be checked on */
export function sharedMeasures(parts: IngestedPart[]): string[] {
  if (!parts.length) return [];
  const sets = parts.map((p) => new Set(measures(p).map((m) => m.measure)));
  return [...sets[0]].filter((m) => sets.every((s) => s.has(m)));
}

/** approve every part that is clear; the rest come back with what still blocks each one */
export function approveReady(parts: IngestedPart[], by: string): { approved: IngestedPart[]; blocked: { part: IngestedPart; blockers: string[] }[] } {
  const approved: IngestedPart[] = [], blocked: { part: IngestedPart; blockers: string[] }[] = [];
  for (const p of parts) {
    if (p.status !== 'proposed') continue;
    const b = approvalBlockers(p);
    if (b.length) blocked.push({ part: p, blockers: b });
    else approved.push(approve(p, by));
  }
  return { approved, blocked };
}
