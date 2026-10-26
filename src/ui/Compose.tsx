import { useEffect, useMemo, useState } from 'react';
import { staleItems } from '../core/compose';
import { isLive, powerOf, schedule } from '../core/services';
import { TEMPLATES } from '../core/templates';
import { downloadSchedule, downloadSheet, printSheet } from './exportActions';
import { resolveRef } from '../core/library';
import { boxSize, shapeBounds } from '../core/geometry/shape';
import type { Placement, Vec3 } from '../core/schema';
import { ComposeCanvas } from '../viewport/ComposeCanvas';
import { Catalog } from './Catalog';
import { BoothPanel, ModulesToPlace, useModuleFlags } from './Exhibition';
import { Icon, KV, Section, VBadge, dims3, mm } from './common';
import { extentOf, useStore } from './store';

export function Compose() {
  const [mode, setMode] = useState<'translate' | 'rotate'>('translate');
  const st = useStore();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest('input, textarea, select')) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && k === 'z') { e.preventDefault(); if (e.shiftKey) st.redo(); else st.undo(); return; }
      if ((e.metaKey || e.ctrlKey) && k === 'd') { e.preventDefault(); st.duplicate(); return; }
      if ((e.metaKey || e.ctrlKey) && k === 'g') { e.preventDefault(); if (e.shiftKey) st.ungroupSel(); else st.group(); return; }
      if (k === 'delete' || k === 'backspace') st.remove();
      if (k === 'w') setMode('translate');
      if (k === 'e') setMode('rotate');
      if (k === 'p') st.placeOnSurface();
      if (k === 'escape') st.selectItems([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [st]);

  return (
    <>
      <ComposeCanvas mode={mode} />
      <aside className="panel left glass">
        <ModuleTree />
        {st.comp.kind === 'exhibition' && <ModulesToPlace />}
        <div className="sub-head">Library</div>
        <Catalog compact onPick={(e) => st.addToCanvas(e.ref, e.name)} />
      </aside>
      <aside className="panel right glass"><SelectionPanel /></aside>
      <div className="viewbar glass">
        <div className="segmented sm">
          <button className={mode === 'translate' ? 'on' : ''} onClick={() => setMode('translate')} title="Move (W)"><Icon name="move" size={13} /> Move</button>
          <button className={mode === 'rotate' ? 'on' : ''} onClick={() => setMode('rotate')} title="Rotate about Z in 15° steps (E)"><Icon name="rotate" size={13} /> Rotate</button>
        </div>
        <span className="tool-sep" />
        <button className="icon-btn" onClick={st.duplicate} disabled={!st.selection.length} title="Duplicate (⌘D)"><Icon name="copy" /></button>
        <button className="icon-btn" onClick={st.group} disabled={st.selection.length < 2} title="Group (⌘G)"><Icon name="group" /></button>
        <button className="icon-btn" onClick={st.remove} disabled={!st.selection.length} title="Delete"><Icon name="trash" /></button>
        <span className="tool-sep" />
        <button className="icon-btn" onClick={st.undo} disabled={!st.history.length} title="Undo (⌘Z)"><Icon name="undo" /></button>
        <button className="icon-btn" onClick={st.redo} disabled={!st.future.length} title="Redo (⇧⌘Z)"><Icon name="redo" /></button>
        <span className="tool-sep" />
        <button className={`chip ${st.snap ? 'on' : ''}`} onClick={() => st.toggle('snap')} title="Snap edges and centres to nearby items within 40 mm">Snap</button>
        <button className={`chip ${st.xray ? 'on' : ''}`} onClick={() => st.toggle('xray')}>X-ray</button>
        {st.comp.booth && <button className={`chip ${st.circulation ? 'on' : ''}`} onClick={() => st.toggle('circulation')} title="Show the accessible route, turning space and narrow floor">Circulation</button>}
        {st.comp.booth && <button className="chip" onClick={() => st.setCamera('top')}>Plan</button>}
        <button className="chip" onClick={() => st.setCamera('perspective')}>Frame all</button>
      </div>
    </>
  );
}

function ModuleTree() {
  const comp = useStore((s) => s.comp);
  const selection = useStore((s) => s.selection);
  const selectItems = useStore((s) => s.selectItems);
  const setComp = useStore((s) => s.setComp);
  const parts = useStore((s) => s.parts);
  const stale = useMemo(() => new Map(staleItems(comp, (p) => {
    const r = resolveRef(p.ref, parts);
    if (!r?.shape) return null;
    return { dims: boxSize(shapeBounds(r.shape)), version: p.ref.kind === 'ingested' ? Math.max(...parts.filter((x) => x.id === p.ref.id).map((x) => x.version)) : 1 };
  }).map((s) => [s.id, s.reason])), [comp, parts]);
  const flags = useModuleFlags();
  const expo = comp.kind === 'exhibition';
  const loose = comp.items.filter((i) => !i.groupId);
  const row = (p: Placement) => (
    <button key={p.id} className={`tree-item ${selection.includes(p.id) ? 'on' : ''}`} onClick={(e) => selectItems([p.id], e.shiftKey || e.metaKey, true)} title="Selects this item alone; click the group name for the whole group">
      <span>{p.name}</span>
      {stale.has(p.id) && <span className="stale" title={stale.get(p.id)}>changed</span>}
    </button>
  );
  return (
    <div className="tree">
      <input className="name-input" value={comp.name} onChange={(e) => setComp({ ...comp, name: e.target.value }, false)} aria-label={expo ? 'Exhibition name' : 'Module name'} />
      <div className="muted small">{comp.items.length} item{comp.items.length === 1 ? '' : 's'} · {comp.groups.length} {expo ? 'module' : 'group'}{comp.groups.length === 1 ? '' : 's'}</div>
      <div className="tree-list">
        {comp.groups.map((g) => (
          <div key={g.id} className="tree-group">
            <button className="tree-group-title" onClick={() => selectItems(comp.items.filter((i) => i.groupId === g.id).map((i) => i.id))}><Icon name="group" size={12} /> {g.name}{(flags.get(g.id) ?? []).map((f) => <span key={f.text} className={`stale ${f.level}`} title={f.title}>{f.text}</span>)}</button>
            {comp.items.filter((i) => i.groupId === g.id).map(row)}
          </div>
        ))}
        {loose.map(row)}
      </div>
    </div>
  );
}

function SelectionPanel() {
  const comp = useStore((s) => s.comp);
  const parts = useStore((s) => s.parts);
  const selection = useStore((s) => s.selection);
  const setItem = useStore((s) => s.setItem);
  const st = useStore();
  const sel = comp.items.filter((i) => selection.includes(i.id));

  if (!sel.length) return comp.kind === 'exhibition' ? <BoothPanel /> : <ModulePanel />;
  if (sel.length === 1) {
    const p = sel[0];
    const r = resolveRef(p.ref, parts);
    const set = (k: number, v: number) => { const pos = [...p.position] as Vec3; pos[k] = v; setItem(p.id, { position: pos }); };
    const host = st.supportFor(p.id);
    return (
      <div className="inspector">
        <div className="insp-head">
          <div className="insp-kicker">{r?.entry.subtitle ?? 'Missing item'}</div>
          <input className="name-input title" value={p.name} onChange={(e) => setItem(p.id, { name: e.target.value })} />
          {r && <div className="insp-badges"><VBadge status={r.entry.verification} /></div>}
          <div className="insp-dims">{dims3(r?.entry.dims ?? null)}</div>
        </div>
        <div className="panel-scroll">
          <Section title="Placement">
            {(['X', 'Y', 'Elevation'] as const).map((l, k) => <NumberRow key={l} label={l} value={p.position[k]} onChange={(v) => set(k, v)} />)}
            <NumberRow label="Rotation (°)" value={p.rotation} step={15} onChange={(v) => setItem(p.id, { rotation: ((v % 360) + 360) % 360 })} />
            <button className="ghost wide" onClick={st.placeOnSurface} disabled={!host} title="Stand on the surface below; press again for the next shelf (P)">
              {host ? `Place on ${host.name}` : 'Place on surface'}
            </button>
            <p className="note">{host ? 'Press again to step through its surfaces. ' : 'Move the item over a counter, table, niche or another item to stand it there. '}Moving or rotating changes only the placement; the item’s geometry and dimensions stay as recorded.</p>
          </Section>
          <Section title="Power and data">
            <label className="check-row"><input type="checkbox" checked={isLive(p)} onChange={(e) => setItem(p.id, { live: e.target.checked })} /> Live in the demo (powered)</label>
            {(() => { const pw = powerOf(p.ref); return pw ? <KV k={`Power, ${pw.basis}`} status={pw.status}>{pw.watts.toLocaleString('en-GB')} W</KV> : <KV k="Power">No published figure</KV>; })()}
          </Section>
          <Section title="Reference">
            <KV k="Item">{p.ref.kind === 'ingested' ? `${p.ref.id.slice(0, 14)}… v${p.ref.version}` : p.ref.id}</KV>
            <KV k="Placed at">{dims3([p.snapshot.width, p.snapshot.depth, p.snapshot.height])}</KV>
          </Section>
          <div className="pad"><button className="ghost wide" onClick={() => { st.select(r ? r.entry : null); st.setSelectedRef(p.ref); st.setWorkspace('discover'); }}>Inspect in Discover</button></div>
        </div>
      </div>
    );
  }
  // several items
  const ex = sel.map((p) => extentOf(p, parts)).filter(Boolean) as { min: Vec3; max: Vec3 }[];
  const min = [0, 1, 2].map((k) => Math.min(...ex.map((e) => e.min[k])));
  const max = [0, 1, 2].map((k) => Math.max(...ex.map((e) => e.max[k])));
  const gap = ex.length === 2 ? clearGap(ex[0], ex[1]) : null;
  return (
    <div className="inspector">
      <div className="insp-head"><div className="insp-kicker">Selection</div><h2 className="insp-title">{sel.length} items</h2>
        <div className="insp-dims">Overall {dims3([max[0] - min[0], max[1] - min[1], max[2] - min[2]])}</div></div>
      <div className="panel-scroll">
        {gap && <Section title="Measure"><KV k="Clear gap X">{mm(gap[0], 0)}</KV><KV k="Clear gap Y">{mm(gap[1], 0)}</KV><p className="note">Between the two items’ plan extents; 0 means they touch or overlap on that axis.</p></Section>}
        <Section title="Arrange">
          <div className="btn-grid">
            <button className="ghost" onClick={() => st.align(0)}>Align X</button>
            <button className="ghost" onClick={() => st.align(1)}>Align Y</button>
            <button className="ghost" onClick={() => st.align(2)}>Align base</button>
            <button className="ghost" disabled={sel.length < 3} onClick={st.distribute}>Distribute X</button>
            <button className="ghost" onClick={st.group}>Group</button>
            <button className="ghost" onClick={st.ungroupSel}>Ungroup</button>
          </div>
          <p className="note">Align uses the first selected item as the reference.</p>
        </Section>
      </div>
    </div>
  );
}

function clearGap(a: { min: Vec3; max: Vec3 }, b: { min: Vec3; max: Vec3 }): [number, number] {
  const g = (k: number) => Math.max(0, Math.max(a.min[k], b.min[k]) - Math.min(a.max[k], b.max[k]));
  return [g(0), g(1)];
}

function NumberRow({ label, value, onChange, step = 10 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className="num-row">
      <span>{label}</span>
      <input type="number" step={step} value={draft ?? String(Math.round(value * 10) / 10)} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft != null && Number.isFinite(+draft)) onChange(+draft); setDraft(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </label>
  );
}

function ModulePanel() {
  const comp = useStore((s) => s.comp);
  const parts = useStore((s) => s.parts);
  const saved = useStore((s) => s.savedComps);
  const st = useStore();
  const ex = comp.items.map((p) => extentOf(p, parts)).filter(Boolean) as { min: Vec3; max: Vec3 }[];
  const fp = ex.length ? [Math.max(...ex.map((e) => e.max[0])) - Math.min(...ex.map((e) => e.min[0])), Math.max(...ex.map((e) => e.max[1])) - Math.min(...ex.map((e) => e.min[1]))] : [0, 0];
  const sch = useMemo(() => schedule(comp, (p) => resolveRef(p.ref, parts)?.entry.name ?? p.name), [comp, parts]);
  const counts = new Map<string, number>();
  for (const p of comp.items) { const n = resolveRef(p.ref, parts)?.entry.name ?? p.name; counts.set(n, (counts.get(n) ?? 0) + 1); }
  return (
    <div className="inspector">
      <div className="insp-head"><div className="insp-kicker">{comp.kind === 'module' ? 'Demo module' : 'Exhibition'}</div><h2 className="insp-title">{comp.name}</h2>
        <div className="insp-dims">Footprint {fp[0] ? `${mm(fp[0], 0)} × ${mm(fp[1], 0)}` : '—'}</div>
      </div>
      <div className="panel-scroll">
        <Section title="Schedule" summary={`${comp.items.length} items`}>
          {[...counts.entries()].map(([n, c]) => <KV key={n} k={n}>× {c}</KV>)}
          {!comp.items.length && <p className="note">Empty. Pick items from the library on the left.</p>}
        </Section>
        <Section title="Power and data" summary={sch.liveCount ? `${(sch.knownWatts / 1000).toLocaleString('en-GB', { maximumFractionDigits: 2 })} kW stated` : undefined} open={comp.items.length > 0}>
          {sch.rows.filter((r) => r.live).map((r) => (
            <KV key={r.key} k={`${r.name}${r.live > 1 ? ` × ${r.live}` : ''}`} status={r.power?.status}>{r.power ? `${(r.power.watts * r.live).toLocaleString('en-GB')} W` : 'unknown'}</KV>
          ))}
          {!!sch.liveCount && <p className="note">Sums only stated figures; a supply rating is an upper bound, not a measured draw.{sch.unknownLive ? ` ${sch.unknownLive} live item${sch.unknownLive === 1 ? ' has' : 's have'} no figure: add them per project.` : ''} Static display items are left out; switch any item to live in its panel.</p>}
          {!sch.liveCount && <p className="note">No live items. Systems are live by default; boards, trays and chips are shown static.</p>}
        </Section>
        <Section title="Templates" summary={`${TEMPLATES.length}`}>
          {TEMPLATES.map((t) => <button key={t.id} className="link-row" title={t.description} onClick={() => st.insertTemplate(t)}>{t.name}<span className="muted small"> · {t.description}</span></button>)}
        </Section>
        <Section title="Saved modules" summary={`${saved.filter((c) => c.kind === 'module').length}`} open={saved.length > 0}>
          {saved.filter((c) => c.kind === 'module').map((c) => <button key={c.id} className="link-row" onClick={() => st.openComp(c)}>{c.name}<span className="muted small"> · {c.items.length} items</span></button>)}
          {!saved.length && <p className="note">Save a module to reuse it. Modules are kept in this browser.</p>}
        </Section>
        <div className="pad col">
          <div className="btn-grid">
            <button className="ghost" disabled={!comp.items.length} onClick={() => st.notify(downloadSheet(comp, parts))}>Sheet .svg</button>
            <button className="ghost" disabled={!comp.items.length} onClick={() => st.notify(printSheet(comp, parts))}>Print sheet</button>
            <button className="ghost" disabled={!comp.items.length} onClick={() => downloadSchedule(comp, parts)}>Services .csv</button>
          </div>
          <button className="ghost wide" onClick={st.saveComp}>Save module</button>
          <button className="ghost wide" onClick={st.newComp}>New module</button>
        </div>
      </div>
    </div>
  );
}
