import { useMemo, useState } from 'react';
import { kitEntries, partEntries, productEntries, SECTION_LABEL, type LibraryEntry, type Section } from '../core/library';
import { search } from '../core/search';
import { MODEL_KIND_LABEL, type Verification } from '../core/schema';
import { useStore } from './store';
import { Icon, LodBadge, VBadge, dims3 } from './common';

const EXAMPLES = ['Jetson Thor', 'rack', 'under 1 m wide', 'robotics', 'unverified', 'counter'];

/** The searchable library list. `onPick` decides what a click does (inspect, or add to the canvas). */
export function Catalog({ onPick, selectedKey, compact }: { onPick: (e: LibraryEntry) => void; selectedKey?: string | null; compact?: boolean }) {
  const parts = useStore((s) => s.parts);
  const favorites = useStore((s) => s.favorites);
  const [q, setQ] = useState('');
  const [section, setSection] = useState<Section | 'all' | 'favorites'>('all');
  const [status, setStatus] = useState<Verification | 'any'>('any');

  const all = useMemo(() => [...productEntries(), ...kitEntries(), ...partEntries(parts)], [parts]);
  const list = useMemo(() => {
    let l = search(all, q);
    if (section === 'favorites') l = l.filter((e) => favorites.includes(e.key));
    else if (section !== 'all') l = l.filter((e) => e.section === section);
    if (status !== 'any') l = l.filter((e) => e.verification === status);
    return l;
  }, [all, q, section, status, favorites]);

  const groups = useMemo(() => {
    const m = new Map<string, LibraryEntry[]>();
    for (const e of list) {
      const g = `${SECTION_LABEL[e.section]} · ${e.group}`;
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(e);
    }
    return [...m.entries()];
  }, [list]);

  return (
    <div className={`catalog ${compact ? 'compact' : ''}`}>
      <div className="search">
        <Icon name="search" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search: “DGX rack”, “under 1 m wide”…" aria-label="Search the library" />
        {q && <button className="clear" onClick={() => setQ('')} aria-label="Clear"><Icon name="x" size={12} /></button>}
      </div>
      {!compact && !q && (
        <div className="examples">{EXAMPLES.map((x) => <button key={x} className="chip" onClick={() => setQ(x)}>{x}</button>)}</div>
      )}
      <div className="filters">
        <div className="segmented sm">
          {(['all', 'hardware', 'kit', 'project', 'favorites'] as const).map((s) => (
            <button key={s} className={section === s ? 'on' : ''} onClick={() => setSection(s)}>{s === 'all' ? 'All' : s === 'favorites' ? '★' : s === 'hardware' ? 'NVIDIA' : s === 'kit' ? 'Kit' : 'Project'}</button>
          ))}
        </div>
        {!compact && (
          <select className="mini-select" value={status} onChange={(e) => setStatus(e.target.value as Verification | 'any')} aria-label="Verification">
            <option value="any">Any status</option>
            <option value="verified">Verified</option>
            <option value="project">Project-specific</option>
            <option value="estimated">Estimated</option>
            <option value="placeholder">Placeholder</option>
          </select>
        )}
      </div>
      <div className="catalog-list">
        {groups.map(([g, entries]) => (
          <div key={g} className="cat-group">
            <div className="cat-group-title">{g}</div>
            {entries.map((e) => (
              <button key={e.key} className={`cat-item ${selectedKey === e.key ? 'on' : ''}`} onClick={() => onPick(e)}>
                <span className="cat-name">{e.name}{e.section === 'project' && <span className="private-mark" title="Private project library: this browser only"><Icon name="lock" size={11} /></span>}</span>
                <span className="cat-meta">
                  <span className="cat-dims">{e.physical ? dims3(e.dims) : e.kind ? MODEL_KIND_LABEL[e.kind] : 'No physical object'}</span>
                </span>
                <span className="cat-badges"><VBadge status={e.verification} compact />{e.physical && <LodBadge lod={e.lod} />}</span>
              </button>
            ))}
          </div>
        ))}
        {!list.length && <div className="empty small muted">Nothing matches. Searches read names, families, tags and projects, and understand “under 1 m wide”, “taller than 2 m” and “unverified”.</div>}
      </div>
    </div>
  );
}
