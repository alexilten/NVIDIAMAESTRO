import { useMemo, useState } from 'react';
import { catalogResolver, labelCsv, nicheComposition, nicheItem } from '../core/niche/build';
import { nicheElevation } from '../core/niche/elevation';
import { NICHE_EXAMPLES } from '../core/niche/examples';
import { layoutNiche, NICHE_TYPE_LABEL, type NicheItem, type NicheLayout } from '../core/niche/layout';
import { inches, RULE_DEFS, RULE_SET_BY_ID, RULE_SETS, withOverrides, type RuleKey, type RuleValue } from '../core/niche/rules';
import { VERIFICATION, VERIFICATION_RANK, type Verification } from '../core/schema';
import { download } from '../ingest/rhinoBrowser';
import { NicheCanvas } from '../viewport/NicheCanvas';
import { Catalog } from './Catalog';
import { Icon, KV, Section, VBadge } from './common';
import { exportNicheFile, printNicheSheet } from './nicheActions';
import { useNiche } from './nicheStore';
import { useStore } from './store';
import './niches.css';

const APP = () => `MAESTRO ${__APP_VERSION__} · build ${__APP_BUILD__}`;
const slug = (s: string) => s.replace(/[^\w-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').slice(0, 60) || 'niche';
const statuses = [...VERIFICATION_RANK].reverse() as Verification[];
const resolve = catalogResolver();

/** The current niche laid out with the current rules; every panel reads this one layout. */
export function useNicheLayout(): NicheLayout | null {
  const spec = useNiche((s) => s.spec);
  const overrides = useNiche((s) => s.overrides);
  return useMemo(() => {
    const rules = withOverrides(RULE_SET_BY_ID.get(spec.rulesId) ?? RULE_SETS[0], overrides[spec.rulesId]);
    return layoutNiche(spec, rules, resolve);
  }, [spec, overrides]);
}

export function Niches() {
  const view = useNiche((s) => s.view);
  const l = useNicheLayout();
  return (
    <>
      {view === 'elevation' ? <Elevation l={l} /> : <NicheCanvas l={l} />}
      <aside className="panel left glass"><NicheEditor /></aside>
      <aside className="panel right glass"><NicheReport l={l} /></aside>
      <NicheBar l={l} />
    </>
  );
}

function Elevation({ l }: { l: NicheLayout | null }) {
  // drawn as an image so the sheet's own styles stay inside it
  const close = useNiche((s) => s.closeUp);
  const src = useMemo(() => {
    if (!l) return null;
    const r = nicheElevation(l, { appLabel: APP() });
    const f = r.focus;
    const svg = close ? r.svg.replace(/width="420mm" height="297mm" viewBox="0 0 420 297"/, `width="${f.w}mm" height="${f.h}mm" viewBox="${f.x} ${f.y} ${f.w} ${f.h}"`) : r.svg;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }, [l, close]);
  return (
    <div className="viewer niche-sheet">
      {src ? <div className={`niche-paper ${close ? 'close' : ''}`}><img src={src} alt={`Front elevation of ${l!.spec.code} ${l!.spec.name}`} /></div> : <div className="viewer-empty">Add hardware on the left. The niche is sized from it and the show’s placement rules.</div>}
    </div>
  );
}

// ── left: the niche and its hardware ─────────────────────────────────────────────────────────────

function NicheEditor() {
  const n = useNiche();
  const spec = n.spec;
  const [adding, setAdding] = useState<'library' | 'custom'>('library');
  const example = NICHE_EXAMPLES.find((e) => e.spec.code === spec.code && e.spec.name === spec.name);
  const rowName = (i: number) => (spec.type === 'shelf' ? `Shelf ${spec.rows.length - i}${i === 0 ? ' (top)' : i === spec.rows.length - 1 && spec.rows.length > 1 ? ' (bottom)' : ''}` : `Row ${i + 1}`);
  return (
    <div className="panel-scroll niche-editor">
      <div className="insp-head">
        <div className="insp-kicker">Niche builder · {RULE_SET_BY_ID.get(spec.rulesId)?.name ?? spec.rulesId} rules</div>
        <div className="niche-title">
          <input className="field code" value={spec.code} onChange={(e) => n.patch({ code: e.target.value.toUpperCase().slice(0, 6) })} aria-label="Graphics code" title="Graphics code; labels are numbered from it" />
          <input className="field" value={spec.name} onChange={(e) => n.patch({ name: e.target.value })} aria-label="Niche name" />
        </div>
        <div className="niche-row-controls">
          <div className="segmented sm">
            {(['shelf', 'wall'] as const).map((t) => <button key={t} className={spec.type === t ? 'on' : ''} onClick={() => n.patch({ type: t })}>{NICHE_TYPE_LABEL[t]}</button>)}
          </div>
          <div className="segmented sm" title="Letter size of the die-cut labels">
            {(['standard', 'small'] as const).map((t) => <button key={t} className={spec.letter === t ? 'on' : ''} onClick={() => n.patch({ letter: t })}>{t === 'standard' ? 'Standard type' : 'Small type'}</button>)}
          </div>
        </div>
        <div className="niche-row-controls">
          <select className="field" value="" onChange={(e) => { if (e.target.value === 'new') n.newSpec(); else if (e.target.value.startsWith('ex:')) n.loadExample(e.target.value.slice(3)); else { const s = n.saved.find((x) => x.id === e.target.value); if (s) n.open(s); } }} aria-label="Open a niche">
            <option value="">Open…</option>
            <option value="new">New empty niche</option>
            <optgroup label="GTC Berlin 2026">{NICHE_EXAMPLES.map((e) => <option key={e.spec.code} value={`ex:${e.spec.code}`}>{e.spec.code} {e.spec.name}</option>)}</optgroup>
            {n.saved.length > 0 && <optgroup label="Saved in this browser">{n.saved.map((s) => <option key={s.id} value={s.id}>{s.code} {s.name}</option>)}</optgroup>}
          </select>
          <button className="ghost" onClick={() => { n.save(); useStore.getState().notify(`Saved ${spec.code} ${spec.name} in this browser.`); }}>Save</button>
        </div>
        {example && <p className="note">{example.note}</p>}
      </div>

      <div className="sub-head niche-sub">
        <span>{spec.type === 'shelf' ? 'Shelves, top first' : 'Rows, top first'}</span>
        <button className="chip" onClick={n.addRow}><Icon name="plus" size={11} /> {spec.type === 'shelf' ? 'Shelf' : 'Row'}</button>
      </div>
      {spec.rows.map((row, ri) => (
        <div key={ri} className={`niche-rowbox ${n.target === ri ? 'on' : ''}`} onClick={() => n.setTarget(ri)}>
          <div className="niche-rowhead">
            <b>{rowName(ri)}</b>
            <span className="muted small">{n.target === ri ? 'adding here' : ''}</span>
            <span className="grow" />
            <button className="icon-btn sm" title="Move up" onClick={(e) => { e.stopPropagation(); n.moveRow(ri, -1); }} disabled={ri === 0}>↑</button>
            <button className="icon-btn sm" title="Move down" onClick={(e) => { e.stopPropagation(); n.moveRow(ri, 1); }} disabled={ri === spec.rows.length - 1}>↓</button>
            <button className="icon-btn sm" title={spec.type === 'shelf' ? 'Remove shelf' : 'Remove row'} onClick={(e) => { e.stopPropagation(); n.removeRow(ri); }}><Icon name="trash" size={13} /></button>
          </div>
          {row.map((c, ci) => <Cell key={c?.id ?? `gap-${ci}`} item={c} row={ri} col={ci} last={ci === row.length - 1} />)}
          <div className="niche-cell-actions">
            <button className="link-row" onClick={(e) => { e.stopPropagation(); n.addToRow(null, ri); }} title="An empty slot keeps its column, so units in other rows still line up">+ Empty slot</button>
          </div>
        </div>
      ))}

      <div className="sub-head niche-sub">
        <span>Add hardware to {rowName(n.target).toLowerCase()}</span>
        <div className="segmented sm">
          <button className={adding === 'library' ? 'on' : ''} onClick={() => setAdding('library')}>Catalog</button>
          <button className={adding === 'custom' ? 'on' : ''} onClick={() => setAdding('custom')}>Custom</button>
        </div>
      </div>
      {adding === 'custom' ? <CustomForm /> : (
        <div className="niche-catalog">
          <Catalog compact onPick={(e) => {
            if (e.section !== 'hardware' || e.ref.kind !== 'product') { useStore.getState().notify('Niches take hardware from the catalog. Use Custom for anything else.'); return; }
            n.addToRow(nicheItem({ product: e.ref.id, upright: spec.type === 'wall' && e.kind === 'tray' ? true : undefined }));
            useStore.getState().notify(e.dims ? `${e.name} added.` : `${e.name} added. It has no recorded dimensions, so it is listed but not drawn.`);
          }} />
        </div>
      )}
    </div>
  );
}

function Cell({ item, row, col, last }: { item: NicheItem | null; row: number; col: number; last: boolean }) {
  const n = useNiche();
  const [open, setOpen] = useState(false);
  const info = item ? resolve(item) : null;
  const wall = n.spec.type === 'wall';
  return (
    <div className="niche-cell" onClick={(e) => e.stopPropagation()}>
      <div className="niche-cell-line">
        <button className="niche-cell-name" onClick={() => item && setOpen(!open)} title={item ? 'Label text and mounting' : undefined}>
          {item ? <><span className="ellipsis">{item.label ?? info!.name}</span><span className="muted small">{info!.dims ? `${Math.round(info!.dims[0])} × ${Math.round(info!.dims[1])} × ${Math.round(info!.dims[2])}` : 'no size'}</span></> : <span className="muted">Empty slot</span>}
        </button>
        {info && <i className={`dot ${info.status}`} title={VERIFICATION[info.status].label} />}
        <button className="icon-btn sm" onClick={() => n.moveCell(row, col, -1)} disabled={col === 0} title="Move left">←</button>
        <button className="icon-btn sm" onClick={() => n.moveCell(row, col, 1)} disabled={last} title="Move right">→</button>
        <button className="icon-btn sm" onClick={() => n.removeCell(row, col)} title="Remove"><Icon name="x" size={12} /></button>
      </div>
      {open && item && (
        <div className="niche-cell-more">
          <label className="num-row"><span>Label text</span><input value={item.label ?? ''} placeholder={info!.name} onChange={(e) => n.setCell(row, col, { label: e.target.value || undefined })} /></label>
          {wall && <label className="niche-check"><input type="checkbox" checked={!!item.upright} onChange={(e) => n.setCell(row, col, { upright: e.target.checked || undefined })} /> Hung upright (its depth runs up the wall)</label>}
          {item.custom?.note && <p className="note">{item.custom.note}</p>}
        </div>
      )}
    </div>
  );
}

function CustomForm() {
  const n = useNiche();
  const [f, setF] = useState({ name: '', width: '', depth: '', height: '', status: 'project' as Verification, note: '' });
  const ok = f.name.trim() && [f.width, f.depth, f.height].every((v) => Number(v) > 0);
  return (
    <div className="section-body niche-custom">
      <p className="note">Hardware the catalog does not carry, with the size from a project document. Say where the size came from.</p>
      <label className="num-row"><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      {(['width', 'depth', 'height'] as const).map((k) => <label key={k} className="num-row"><span>{k[0].toUpperCase() + k.slice(1)} (mm)</span><input type="number" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
      <label className="num-row"><span>Status</span><select className={`vselect ${f.status}`} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Verification })}>{statuses.map((s) => <option key={s} value={s}>{VERIFICATION[s].label}</option>)}</select></label>
      <label className="num-row"><span>Source</span><input value={f.note} placeholder="e.g. fab deck p.72" onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      <button className="primary" disabled={!ok} onClick={() => {
        n.addToRow(nicheItem({ custom: { name: f.name.trim(), width: +f.width, depth: +f.depth, height: +f.height, status: f.status, note: f.note || undefined }, upright: n.spec.type === 'wall' && +f.depth > +f.height ? true : undefined }));
        setF({ ...f, name: '' });
      }}><Icon name="plus" /> Add</button>
    </div>
  );
}

// ── right: what the rules produced ───────────────────────────────────────────────────────────────

const mmIn = (v: number) => `${Math.round(v).toLocaleString('en-GB')} mm · ${inches(v)}`;

function NicheReport({ l }: { l: NicheLayout | null }) {
  const n = useNiche();
  const errors = l?.checks.filter((c) => c.level === 'error') ?? [];
  const warns = l?.checks.filter((c) => c.level === 'warn') ?? [];
  const infos = l?.checks.filter((c) => c.level === 'info') ?? [];
  const [lockW, setLockW] = useState<string | null>(null);
  const [lockH, setLockH] = useState<string | null>(null);
  return (
    <div className="panel-scroll inspector">
      <div className="insp-head">
        <div className="insp-kicker">{NICHE_TYPE_LABEL[n.spec.type]}</div>
        <h2 className="insp-title">{n.spec.code} {n.spec.name}</h2>
        {l && <div className="insp-badges"><VBadge status={l.status} />{errors.length > 0 && <span className="stale error">{errors.length} rule{errors.length === 1 ? '' : 's'} broken</span>}{warns.length > 0 && <span className="stale">{warns.length} to check</span>}</div>}
      </div>
      {l ? (
        <>
          <Section title="Opening" summary={`${Math.round(l.width)} × ${Math.round(l.height)} mm`}>
            <KV k="Width">{mmIn(l.width)}</KV>
            <KV k="Height">{mmIn(l.height)}</KV>
            <KV k="Sill above floor">{mmIn(l.sill)}</KV>
            <KV k="Centre above floor">{mmIn(l.centre)}</KV>
            <KV k="Clear depth">{mmIn(l.depth)}</KV>
            {l.shelves.map((s) => <KV key={s.index} k={`Shelf ${s.index + 1} top`}>{mmIn(s.top)} AFF · {Math.round(s.clear)} clear</KV>)}
            {l.labelOffset != null && <KV k="Label line">{mmIn(l.labelOffset)} above each shelf</KV>}
            <div className="niche-locks">
              <label className="num-row"><span>Fix width</span><input type="number" placeholder="from rules" value={lockW ?? (n.spec.lockWidth ? String(n.spec.lockWidth) : '')} onChange={(e) => setLockW(e.target.value)} onBlur={() => { if (lockW != null) n.patch({ lockWidth: Number(lockW) > 0 ? Number(lockW) : undefined }); setLockW(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>
              <label className="num-row"><span>Fix height</span><input type="number" placeholder="from rules" value={lockH ?? (n.spec.lockHeight ? String(n.spec.lockHeight) : '')} onChange={(e) => setLockH(e.target.value)} onBlur={() => { if (lockH != null) n.patch({ lockHeight: Number(lockH) > 0 ? Number(lockH) : undefined }); setLockH(null); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></label>
              <p className="note">Fix a size when the wall is already cut. The hardware reflows inside it and any rule it can’t meet is listed below.</p>
            </div>
          </Section>
          <Section title="Checks" summary={errors.length || warns.length ? `${errors.length} broken · ${warns.length} to check` : 'All rules met'}>
            {[...errors, ...warns].map((c, i) => <div key={i} className={`check ${c.level === 'error' ? 'discrepancy' : ''}`}><span className="small">{c.text}</span></div>)}
            {!errors.length && !warns.length && <p className="note">Every unit and label meets the rules.</p>}
            {infos.map((c, i) => <p key={i} className="note">{c.text}</p>)}
          </Section>
          <Section title="Labels" summary={`${l.labels.length} · ${l.rules.labels.colour}`}>
            {l.labels.map((lb) => <KV key={lb.code} k={lb.code}>{lb.text}</KV>)}
            <p className="note">Numbered top row first, left to right. Each label starts at the left edge of its hardware{l.spec.type === 'shelf' ? '; the label line is set on the shelf with the tallest unit, centred in the space above it, and repeated on every shelf' : `, ${inches(l.rules.values.labelBelow.value)} below the lowest hardware in its row`}.</p>
          </Section>
        </>
      ) : <p className="note pad">Nothing to lay out yet.</p>}
      <RulesPanel used={l?.used ?? []} />
    </div>
  );
}

function RulesPanel({ used }: { used: RuleKey[] }) {
  const n = useNiche();
  const overrides = useNiche((s) => s.overrides);
  const base = RULE_SET_BY_ID.get(n.spec.rulesId) ?? RULE_SETS[0];
  const rules = withOverrides(base, overrides[n.spec.rulesId]);
  const mine = overrides[n.spec.rulesId] ?? {};
  const [showAll, setShowAll] = useState(false);
  const list = RULE_DEFS.filter((d) => showAll || used.includes(d.key));
  return (
    <Section title="Placement rules" summary={`${rules.name}${Object.keys(mine).length ? ` · ${Object.keys(mine).length} changed here` : ''}`}>
      {list.map((d) => <RuleRow key={d.key} k={d.key} v={rules.values[d.key]} changed={d.key in mine} sourceTitle={rules.sources.find((s) => s.id === rules.values[d.key].sourceId)?.title} />)}
      <button className="link-row" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show only the rules this niche uses' : `Show all ${RULE_DEFS.length} rules`}</button>
      <div className="sub-head flush">Also in the decks, not applied yet</div>
      {rules.notes.map((x, i) => <p key={i} className="note">{x.text} <span className="muted">({rules.sources.find((s) => s.id === x.sourceId)?.title.replace('GTC Berlin 2026 ', '')} {x.ref})</span></p>)}
      <p className="note">Changes to a rule are kept in this browser and apply to every niche built with {rules.name} rules.</p>
    </Section>
  );
}

function RuleRow({ k, v, changed, sourceTitle }: { k: RuleKey; v: RuleValue; changed: boolean; sourceTitle?: string }) {
  const n = useNiche();
  const def = RULE_DEFS.find((d) => d.key === k)!;
  const [draft, setDraft] = useState<string | null>(null);
  const [unit, setUnit] = useState<'mm' | 'in'>(['edge', 'gap', 'labelBelow', 'rowGap'].includes(k) ? 'in' : 'mm');
  const shown = unit === 'in' ? String(Math.round((v.value / 25.4) * 1000) / 1000) : String(Math.round(v.value * 10) / 10);
  const commit = () => {
    if (draft != null && Number.isFinite(+draft) && +draft >= 0) n.setRule(k, { ...v, value: unit === 'in' ? +draft * 25.4 : +draft, status: v.status === 'placeholder' ? 'project' : v.status, note: `Changed in this browser. ${v.note ?? ''}`.trim() });
    setDraft(null);
  };
  return (
    <div className="rule-row" title={def.meaning}>
      <div className="rule-head"><span>{def.label}</span>{changed && <button className="link-row inline" onClick={() => n.resetRule(k)}>reset</button>}</div>
      <div className="value-row">
        <span className="muted small">{unit === 'in' ? `${Math.round(v.value)} mm` : inches(v.value)}</span>
        <span className="rule-input">
          <input type="number" step={unit === 'in' ? 0.125 : 1} value={draft ?? shown} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label={`${def.label} (${unit})`} />
          <button className="unit" onClick={() => setUnit(unit === 'mm' ? 'in' : 'mm')} title="Switch units">{unit}</button>
        </span>
        <select className={`vselect ${v.status}`} value={v.status} onChange={(e) => n.setRule(k, { ...v, status: e.target.value as Verification })} aria-label={`${def.label} status`}>
          {statuses.map((s) => <option key={s} value={s}>{VERIFICATION[s].label}</option>)}
        </select>
      </div>
      <div className="rule-src">{sourceTitle ? `${sourceTitle}${v.ref ? `, ${v.ref}` : ''}` : 'No source'}{v.note ? ` · ${v.note}` : ''}</div>
    </div>
  );
}

// ── bottom: view and outputs ─────────────────────────────────────────────────────────────────────

function NicheBar({ l }: { l: NicheLayout | null }) {
  const n = useNiche();
  const st = useStore();
  const name = l ? `${l.spec.code}_${l.spec.name}` : 'niche';
  return (
    <div className="viewbar glass">
      <div className="segmented sm">
        <button className={n.view === 'elevation' ? 'on' : ''} onClick={() => n.setView('elevation')}>Elevation</button>
        <button className={n.view === '3d' ? 'on' : ''} onClick={() => n.setView('3d')}>3D</button>
      </div>
      {n.view === 'elevation' && <button className={`chip ${n.closeUp ? 'on' : ''}`} onClick={() => n.setCloseUp(!n.closeUp)} title="Zoom the elevation to the niche and its dimensions">Close-up</button>}
      <span className="tool-sep" />
      <button className="chip" disabled={!l} onClick={() => { if (l) { download(nicheElevation(l, { appLabel: APP() }).svg, `${slug(name)}.elevation.svg`, 'image/svg+xml'); st.notify('Elevation saved as an A3 SVG, to scale.'); } }}>Sheet .svg</button>
      <button className="chip" disabled={!l} onClick={() => l && st.notify(printNicheSheet(l))}>Print</button>
      <button className="chip" disabled={!l} onClick={() => { if (l) { download(labelCsv(l), `${slug(name)}.labels.csv`, 'text/csv'); st.notify(`Label schedule saved: ${l.labels.length} labels.`); } }}>Labels .csv</button>
      <button className="chip" disabled={!l} onClick={async () => { if (!l) return; try { st.notify(await exportNicheFile(l)); } catch (e) { st.notify(`Export failed: ${(e as Error).message}`); } }}>Export .3dm</button>
      <span className="tool-sep" />
      <button className="chip on" disabled={!l} onClick={() => {
        if (!l) return;
        const comp = nicheComposition(l);
        st.setWorkspace('compose');
        useStore.getState().insertTemplate({ id: comp.id, name: comp.name, description: 'Built in Niches', build: () => comp });
      }} title="Insert this niche into the module in Compose as one group">Send to Compose</button>
    </div>
  );
}
