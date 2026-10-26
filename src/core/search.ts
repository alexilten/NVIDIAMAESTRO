import type { LibraryEntry } from './library';
import type { Verification } from './schema';

/**
 * Catalog search: free text plus a few structured phrases, all deterministic.
 *   "jetson thor"                 words must all match name, family, tags or project
 *   "under 1 m wide", "< 500 mm deep", "taller than 2m"   dimension filters (mm, cm or m)
 *   "unverified"                  anything not Verified
 *   "used in expo"                project library parts tagged with a project
 */

export interface Query {
  words: string[];
  dims: { axis: 0 | 1 | 2; op: '<' | '>'; mm: number }[];
  unverified: boolean;
  status?: Verification;
}

const AXIS: Record<string, 0 | 1 | 2> = { wide: 0, width: 0, deep: 1, depth: 1, tall: 2, high: 2, height: 2 };
const UNIT: Record<string, number> = { mm: 1, cm: 10, m: 1000, meter: 1000, meters: 1000, metre: 1000, metres: 1000, in: 25.4, inch: 25.4, inches: 25.4, ft: 304.8, feet: 304.8 };
const STOP = new Set(['all', 'the', 'a', 'an', 'show', 'me', 'find', 'with', 'of', 'in', 'used', 'our', 'hardware', 'products', 'items', 'systems', 'that', 'are', 'is', 'and']);

export function parseQuery(q: string): Query {
  let s = ` ${q.toLowerCase()} `;
  const dims: Query['dims'] = [];
  const re = /(under|below|less than|smaller than|<|over|above|more than|larger than|taller than|wider than|deeper than|>)\s*([\d.]+)\s*(mm|cm|m|meters?|metres?|in|inch(?:es)?|ft|feet)?\s*(wide|width|deep|depth|tall|high|height)?/g;
  s = s.replace(re, (_m, op: string, n: string, u: string | undefined, ax: string | undefined) => {
    const lt = /under|below|less|smaller|</.test(op);
    const axisWord = ax ?? (/taller/.test(op) ? 'tall' : /wider/.test(op) ? 'wide' : /deeper/.test(op) ? 'deep' : 'wide');
    dims.push({ axis: AXIS[axisWord], op: lt ? '<' : '>', mm: parseFloat(n) * (UNIT[u ?? 'mm'] ?? 1) });
    return ' ';
  });
  let unverified = false;
  s = s.replace(/\b(unverified|not verified|estimated or placeholder)\b/g, () => { unverified = true; return ' '; });
  s = s.replace(/\b(dimensions?)\b/g, ' ');
  const words = s.split(/[^a-z0-9.+-]+/).filter((w) => w && !STOP.has(w));
  return { words, dims, unverified };
}

function haystack(e: LibraryEntry) {
  return [e.name, e.subtitle, e.group, e.manufacturer ?? '', e.project ?? '', ...e.tags].join(' ').toLowerCase();
}

export function search(entries: LibraryEntry[], q: string): LibraryEntry[] {
  const query = parseQuery(q);
  return entries.filter((e) => {
    const h = haystack(e);
    for (const w of query.words) if (!h.includes(w) && !(w.endsWith('s') && h.includes(w.slice(0, -1)))) return false;
    for (const d of query.dims) {
      if (!e.dims) return false;
      const v = e.dims[d.axis];
      if (d.op === '<' ? !(v < d.mm) : !(v > d.mm)) return false;
    }
    if (query.unverified && e.verification === 'verified') return false;
    return true;
  });
}
