import { proposePart, revise, suggestDocs, type PageText } from './pipeline';
import { extractPart, type RhinoModule, type SourceSummary } from './rhino';
import type { SourcePrint } from './revision';
import type { IngestedPart } from './types';

/**
 * Batch extraction: many blocks from one source model in one pass. Each block is planned first (new, already in
 * the library, or the same geometry as another block in the batch), then extracted on its own, so one bad block
 * is reported and skipped without stopping the rest. Every extracted block is a proposal for review, as before.
 */

/** blocks worth offering as kit parts: placed in the model, or not used inside another block */
export function kitCandidates(s: SourceSummary): string[] {
  return s.blocks.filter((b) => (b.placements > 0 || b.usedIn.length === 0) && b.objectCount + b.nested.length > 0).map((b) => b.name);
}

export type PlanState = 'new' | 'in-library' | 'same-geometry' | 'duplicate';
export interface PlanRow { block: string; state: PlanState; note: string; hash?: string; existing?: IngestedPart }

export function planBatch(s: SourceSummary, prints: SourcePrint | null, names: string[], parts: IngestedPart[]): PlanRow[] {
  const seen = new Map<string, string>();
  return names.map((block) => {
    const hash = prints?.blocks.get(block)?.hash;
    const same = parts.find((p) => p.source.sha256 === s.sha256 && p.source.block === block);
    if (same) return { block, state: 'in-library' as const, note: `Already extracted from this file as “${same.name}” v${same.version}.`, hash, existing: same };
    const twin = hash ? parts.find((p) => p.source.geometryHash === hash) : undefined;
    if (twin) return { block, state: 'same-geometry' as const, note: `Same geometry as “${twin.name}” (${twin.source.block}) already in the library.`, hash, existing: twin };
    if (hash && seen.has(hash)) return { block, state: 'duplicate' as const, note: `Same geometry as ${seen.get(hash)} in this batch.`, hash };
    if (hash) seen.set(hash, block);
    return { block, state: 'new' as const, note: '', hash };
  });
}

export interface BatchResult { block: string; ok: boolean; part?: IngestedPart; error?: string; skipped?: string }

/**
 * Extract the planned blocks. Rows that are not new are skipped unless `includeKnown`; `onProgress` is called
 * before each block. Documentation pages are suggested from every indexed document.
 */
export async function runBatch(
  rh: RhinoModule, doc: unknown, s: SourceSummary, plan: PlanRow[], project: string,
  opts: { includeKnown?: boolean; docs?: { name: string; pages: PageText[] }[]; categories?: Record<string, IngestedPart['category']>; onProgress?: (done: number, total: number, block: string) => void | Promise<void> } = {},
): Promise<BatchResult[]> {
  const out: BatchResult[] = [];
  const todo = plan.filter((r) => r.state === 'new' || opts.includeKnown);
  for (const r of plan) if (!todo.includes(r)) out.push({ block: r.block, ok: false, skipped: r.note });
  let k = 0;
  for (const r of todo) {
    await opts.onProgress?.(k++, todo.length, r.block);
    try {
      const c = s.blocks.find((b) => b.name === r.block);
      if (!c) throw new Error('Not in this file.');
      const x = extractPart(rh, doc, r.block);
      if (!x.mesh.length && !x.stats.objects) throw new Error('No geometry MAESTRO can read (annotation only).');
      let p = proposePart(s, { ...c, category: opts.categories?.[r.block] ?? c.category }, x, project, r.hash);
      for (const d of opts.docs ?? []) p = { ...p, docs: [...p.docs, ...suggestDocs(d.name, d.pages, p)] };
      out.push({ block: r.block, ok: true, part: p });
    } catch (e) {
      out.push({ block: r.block, ok: false, error: (e as Error).message });
    }
  }
  await opts.onProgress?.(todo.length, todo.length, '');
  return out;
}

/**
 * A new version of a library part from a revised source model: the block (by its name in the new file) is
 * extracted again and proposed as the next version; the approved version stays as it was until this is approved.
 */
export function reviseFromSource(rh: RhinoModule, doc: unknown, s: SourceSummary, prints: SourcePrint | null, prev: IngestedPart, block: string): IngestedPart {
  const c = s.blocks.find((b) => b.name === block);
  if (!c) throw new Error(`Block “${block}” is not in ${s.fileName}.`);
  const next = proposePart(s, { ...c, category: prev.category }, extractPart(rh, doc, block), prev.project, prints?.blocks.get(block)?.hash);
  return revise(prev, { ...next, name: prev.name, tags: prev.tags, source: { ...next.source, revision: s.fileName } });
}
