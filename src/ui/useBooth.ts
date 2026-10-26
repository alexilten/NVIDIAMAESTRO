import { analyseBooth, type BoothAnalysis } from '../core/booth';
import { resolveRef } from '../core/library';
import type { Composition, Placement } from '../core/schema';
import type { IngestedPart } from '../ingest/types';
import { useStore } from './store';

// one analysis per composition state, shared by the canvas, the panels and the exports
let last: { comp: Composition; parts: IngestedPart[]; a: BoothAnalysis | null } | null = null;

export function boothAnalysis(comp: Composition, parts: IngestedPart[]): BoothAnalysis | null {
  if (last && last.comp === comp && last.parts === parts) return last.a;
  const a = analyseBooth(comp, (p: Placement) => resolveRef(p.ref, parts)?.shape ?? null, (p) => resolveRef(p.ref, parts)?.entry.name ?? p.name);
  last = { comp, parts, a };
  return a;
}

export function useBoothAnalysis(): BoothAnalysis | null {
  const comp = useStore((s) => s.comp);
  const parts = useStore((s) => s.parts);
  return boothAnalysis(comp, parts);
}
