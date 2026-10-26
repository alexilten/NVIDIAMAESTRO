import { hash53 } from './revision';
import type { IngestedPart } from './types';
import type { ViewMesh } from './rhino';

/**
 * A private library bundle: approved project parts in one file a team can pass around through its own private
 * storage (never this repository). Importing a bundle merges it into this browser's library: a part already
 * held in the same version is kept, a different part under the same id and version is reported as a conflict
 * and never overwritten, and everything else is added with a note of where it came from.
 */

export interface BundlePart extends Omit<IngestedPart, 'mesh'> { mesh: { material: string; positions: string; indices: string }[]; checksum: string }
export interface LibraryBundle { schema: 'maestro.library'; version: 1; name: string; exportedAt: string; exportedBy?: string; app?: string; parts: BundlePart[] }

const b64 = (a: ArrayBufferView) => {
  const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

/** what identifies a part's content: its source geometry and dimensions, not its review notes */
export function partChecksum(p: Pick<IngestedPart, 'geometry' | 'dims' | 'source'>): string {
  return hash53(JSON.stringify([p.source.sha256, p.source.block, p.dims.map((v) => Math.round(v * 10)), p.geometry]));
}

export function exportBundle(parts: IngestedPart[], name: string, opts: { includeProposed?: boolean; by?: string; app?: string } = {}): LibraryBundle {
  const chosen = parts.filter((p) => p.status === 'approved' || (opts.includeProposed && p.status === 'proposed'));
  return {
    schema: 'maestro.library', version: 1, name, exportedAt: new Date().toISOString(), exportedBy: opts.by, app: opts.app,
    parts: chosen.map((p) => ({ ...p, mesh: p.mesh.map((m) => ({ material: m.material, positions: b64(m.positions), indices: b64(m.indices) })), checksum: partChecksum(p) })),
  };
}

export interface BundleImport { add: IngestedPart[]; same: IngestedPart[]; conflicts: { incoming: IngestedPart; local: IngestedPart }[]; damaged: string[] }

export function readBundle(text: string, local: IngestedPart[], bundleName?: string): BundleImport {
  let b: LibraryBundle;
  try { b = JSON.parse(text); } catch { throw new Error('This file is not a MAESTRO library bundle.'); }
  if (b?.schema !== 'maestro.library' || !Array.isArray(b.parts)) throw new Error('This file is not a MAESTRO library bundle.');
  const out: BundleImport = { add: [], same: [], conflicts: [], damaged: [] };
  const at = new Date().toISOString();
  for (const bp of b.parts) {
    const { checksum, ...rest } = bp;
    const mesh: ViewMesh[] = bp.mesh.map((m) => {
      const pos = unb64(m.positions), idx = unb64(m.indices);
      return { material: m.material, positions: new Float32Array(pos.buffer, 0, pos.byteLength / 4), indices: new Uint32Array(idx.buffer, 0, idx.byteLength / 4) };
    });
    const p: IngestedPart = { ...(rest as Omit<BundlePart, 'checksum' | 'mesh'>), mesh };
    if (partChecksum(p) !== checksum) { out.damaged.push(`${p.name} v${p.version}`); continue; }
    const mine = local.find((x) => x.id === p.id && x.version === p.version);
    if (mine) {
      if (partChecksum(mine) === checksum) out.same.push(mine);
      else out.conflicts.push({ incoming: p, local: mine });
      continue;
    }
    out.add.push({ ...p, sharedFrom: p.sharedFrom ?? { bundle: bundleName ?? b.name, by: b.exportedBy, importedAt: at } });
  }
  return out;
}
