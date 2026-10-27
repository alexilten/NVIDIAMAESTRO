import { parseComposition } from './compose';
import type { Composition, ItemRef } from './schema';
import type { LibraryBundle } from '../ingest/bundle';
import type { IngestedPart } from '../ingest/types';

/**
 * Show presets: booths as they were actually designed and built for a show, to start an exhibition from.
 * The shows the team has cleared for publication ship with the site in `public/shows/`: the presets in one small
 * file and the project parts they stand on in a library bundle, fetched only when a preset is opened. A team can
 * also load its own `*.maestro-shows.json` file, which carries its presets and parts together.
 */

export interface ShowPreset {
  id: string;
  /** the show as the team names it, e.g. "GTC Berlin"; presets are grouped by it */
  show: string;
  /** edition, e.g. "2026" */
  edition?: string;
  name: string;
  summary: string;
  /** where the layout comes from: model files, assembly blocks, drawing pages */
  sources: string[];
  comp: Composition;
  /** shipped with the site rather than loaded from a file */
  builtIn?: boolean;
  /** where the library bundle with this preset's parts can be fetched */
  partsUrl?: string;
}

export interface ShowPresetFile {
  schema: 'maestro.show-presets';
  version: 1;
  name: string;
  exportedAt: string;
  presets: ShowPreset[];
  /** the project parts the presets use */
  library?: LibraryBundle;
}

/** shows in the order the team works through the year; others follow alphabetically */
export const SHOW_ORDER = ['GTC San Jose', 'GTC Berlin', 'GTC DC', 'CES Las Vegas'];

export function showsOf(presets: Pick<ShowPreset, 'show'>[]): string[] {
  const shows = [...new Set(presets.map((p) => p.show))];
  const rank = (s: string) => { const i = SHOW_ORDER.indexOf(s); return i < 0 ? SHOW_ORDER.length : i; };
  return shows.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

export function parseShowPresets(text: string): ShowPresetFile {
  let f: ShowPresetFile;
  try { f = JSON.parse(text); } catch { throw new Error('This file is not a MAESTRO show presets file.'); }
  if (f?.schema !== 'maestro.show-presets' || !Array.isArray(f.presets)) throw new Error('This file is not a MAESTRO show presets file.');
  if (f.version !== 1) throw new Error(`Unsupported show presets version ${f.version}.`);
  const presets = f.presets.map((p) => {
    if (!p?.id || !p.show || !p.name) throw new Error('A show preset has no id, show or name.');
    const comp = parseComposition(JSON.stringify(p.comp));
    if (comp.kind !== 'exhibition' || !comp.booth) throw new Error(`${p.name} has no booth.`);
    return { ...p, sources: p.sources ?? [], comp };
  });
  return { ...f, presets };
}

/** the project parts a preset stands on that this browser does not hold */
export function missingParts(p: ShowPreset, parts: IngestedPart[]): ItemRef[] {
  const seen = new Set<string>();
  const out: ItemRef[] = [];
  for (const i of p.comp.items) {
    if (i.ref.kind !== 'ingested') continue;
    const k = `${i.ref.id}@${i.ref.version}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (!parts.some((x) => x.id === i.ref.id && x.version === (i.ref as { version: number }).version)) out.push(i.ref);
  }
  return out;
}

/** a fresh copy of a preset's booth to work on: new id, named after the preset, the preset remembered */
export function startFromPreset(p: ShowPreset): Composition {
  const now = new Date().toISOString();
  return { ...structuredClone(p.comp), id: `comp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, name: p.name, updatedAt: now, presetId: p.id };
}
