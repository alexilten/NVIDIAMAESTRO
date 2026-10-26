import { MODEL_BY_ID } from './catalog/products';
import { SOURCE_BY_ID } from './catalog/sources';
import type { Composition, ItemRef, Placement, Verification } from './schema';

/**
 * Power and data schedule for a composition. Only values a record states are summed; anything unknown is
 * listed as unknown, never guessed. A board, tray or chip on display is static by default (shown, not
 * running); a system is live. The designer can switch any placement either way.
 */

/** which stated figure stands for an item's draw, strongest first */
const POWER_BASIS = ['System power', 'Total board power', 'Power supply rating', 'SoC thermal design power'];

export interface PowerFigure { watts: number; basis: string; status: Verification; source?: string }

export function powerOf(ref: ItemRef): PowerFigure | null {
  if (ref.kind !== 'product') return null;
  const m = MODEL_BY_ID.get(ref.id);
  if (!m) return null;
  for (const label of POWER_BASIS) {
    const sp = m.specs.find((x) => x.label === label && typeof x.spec.value === 'number');
    if (!sp) continue;
    const v = sp.spec.value as number;
    const watts = sp.unit === 'kW' ? v * 1000 : v;
    return { watts, basis: label === 'Power supply rating' ? 'supply rating' : label.toLowerCase(), status: sp.spec.status, source: sp.spec.sourceId };
  }
  return null;
}

/** data connections a record states (ports and network specs), as written */
export function dataOf(ref: ItemRef): string[] {
  if (ref.kind !== 'product') return [];
  const m = MODEL_BY_ID.get(ref.id);
  if (!m) return [];
  return m.specs.filter((x) => /^(Network|Networking|Ports|Network port)$/i.test(x.label) && typeof x.spec.value === 'string').map((x) => x.spec.value as string);
}

export function defaultLive(ref: ItemRef): boolean {
  if (ref.kind === 'kit') return ref.id === 'kit-demo-counter' || ref.id === 'kit-light-table';
  if (ref.kind !== 'product') return false;
  const k = MODEL_BY_ID.get(ref.id)?.kind;
  return k === 'system' || k === 'devkit';
}

export const isLive = (p: Placement) => p.live ?? defaultLive(p.ref);

export interface ScheduleRow {
  key: string;
  name: string;
  count: number;
  live: number;
  power: PowerFigure | null;
  /** what the row needs that no record states */
  unknown: string | null;
  data: string[];
}

export interface Schedule { rows: ScheduleRow[]; knownWatts: number; liveCount: number; unknownLive: number }

export function schedule(c: Composition, nameOf: (p: Placement) => string): Schedule {
  const rows = new Map<string, ScheduleRow>();
  for (const p of c.items) {
    const key = JSON.stringify(p.ref);
    let r = rows.get(key);
    if (!r) {
      const power = powerOf(p.ref);
      const unknown = power ? null
        : p.ref.kind === 'kit' ? (p.ref.id === 'kit-demo-counter' ? 'display and outlets: set per project' : p.ref.id === 'kit-light-table' ? 'lighting: set per project' : null)
          : 'no published power figure';
      r = { key, name: nameOf(p), count: 0, live: 0, power, unknown, data: dataOf(p.ref) };
      rows.set(key, r);
    }
    r.count++;
    if (isLive(p)) r.live++;
  }
  const list = [...rows.values()];
  const knownWatts = list.reduce((s, r) => s + (r.power ? r.power.watts * r.live : 0), 0);
  const liveCount = list.reduce((s, r) => s + r.live, 0);
  const unknownLive = list.reduce((s, r) => s + (r.power ? 0 : r.live && r.unknown ? r.live : 0), 0);
  return { rows: list, knownWatts, liveCount, unknownLive };
}

const csvCell = (v: string | number) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

export function scheduleCsv(s: Schedule, compName: string): string {
  const head = ['Item', 'Quantity', 'Live', 'Power each (W)', 'Basis', 'Status', 'Source', 'Live total (W)', 'Unknown', 'Data'];
  const lines = [head, ...s.rows.map((r) => [
    r.name, r.count, r.live, r.power?.watts ?? '', r.power?.basis ?? '', r.power?.status ?? '', r.power?.source ? SOURCE_BY_ID.get(r.power.source)?.title ?? r.power.source : '',
    r.power ? r.power.watts * r.live : '', r.unknown ?? '', r.data.join('; '),
  ])];
  lines.push([`Total for ${compName} (stated values only)`, '', s.liveCount, '', '', '', '', s.knownWatts, s.unknownLive ? `${s.unknownLive} live item(s) without a figure` : '', '']);
  return lines.map((l) => l.map(csvCell).join(',')).join('\n') + '\n';
}
