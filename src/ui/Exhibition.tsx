import { useMemo, useState } from 'react';
import { BOOTH_TYPES, DECK_DEFAULTS, RULE_PRESETS, SIDES, addDeck, boothTypeOf, stairRun, SIDE_LABEL, addColumn, addServicePoint, changedModules, rulePresetOf, unconfirmed } from '../core/booth';
import { moduleTag } from '../core/sheet';
import { TEMPLATES } from '../core/templates';
import { VERIFICATION, VERIFICATION_RANK, type BoothColumn, type BoothDeck, type BoothSide, type DeckAccess, type BoothValue, type ServicePoint, type Verification } from '../core/schema';
import { KV, Section, VBadge, mm } from './common';
import { downloadBoothSchedule, downloadBoothSheet, printBoothSheet } from './exportActions';
import { ProjectDocs } from './Present';
import { useStore } from './store';
import { useBoothAnalysis } from './useBooth';

/** Left panel, exhibition: modules to place on the booth. */
export function ModulesToPlace() {
  const saved = useStore((s) => s.savedComps);
  const st = useStore();
  const modules = saved.filter((c) => c.kind === 'module');
  return (
    <div className="place-list">
      <div className="sub-head">Place a module</div>
      {modules.map((c) => <button key={c.id} className="link-row" onClick={() => st.placeModuleOnBooth(c)}>{c.name}<span className="muted small"> · saved · {c.items.length} items</span></button>)}
      {TEMPLATES.map((t) => <button key={t.id} className="link-row" title={t.description} onClick={() => st.placeModuleOnBooth(t.build(), true)}>{t.name}<span className="muted small"> · template</span></button>)}
      <p className="note">A module lands in the first free spot from the back left, a route width clear of the others. Modules you save in Compose appear here.</p>
    </div>
  );
}

/** Selection panel, exhibition with decks: stand the selected modules on a deck or back on the floor. */
export function DeckMove() {
  const comp = useStore((s) => s.comp);
  const toDeck = useStore((s) => s.toDeck);
  const decks = comp.booth?.decks ?? [];
  if (comp.kind !== 'exhibition' || !decks.length) return null;
  return (
    <Section title="Level">
      <div className="btn-grid">
        {decks.map((k) => <button key={k.id} className="ghost" onClick={() => toDeck(k.id)}>Onto {k.name} · +{Math.round(k.level)}</button>)}
        <button className="ghost" onClick={() => toDeck(null)}>Booth floor</button>
      </div>
      <p className="note">Moves the whole module, centred on the deck with its base at the deck level. Move it into place from there.</p>
    </Section>
  );
}

/** Per-group badges for the exhibition tree: no accessible approach, or edited since it was placed. */
export function useModuleFlags(): Map<string, { text: string; title: string; level: 'error' | 'warn' }[]> {
  const comp = useStore((s) => s.comp);
  const saved = useStore((s) => s.savedComps);
  const a = useBoothAnalysis();
  return useMemo(() => {
    const out = new Map<string, { text: string; title: string; level: 'error' | 'warn' }[]>();
    const push = (id: string, f: { text: string; title: string; level: 'error' | 'warn' }) => out.set(id, [...(out.get(id) ?? []), f]);
    a?.access.forEach((z) => { if (!z.approach) push(z.unit, { text: 'no approach', title: 'No accessible approach in front of this module', level: 'error' }); });
    for (const [id, why] of changedModules(comp, saved)) push(id, { text: 'changed', title: why, level: 'warn' });
    return out;
  }, [a, comp, saved]);
}

const statuses = [...VERIFICATION_RANK].reverse() as Verification[];

function ValueRow({ label, v, onChange, step = 100 }: { label: string; v: BoothValue; onChange: (v: BoothValue) => void; step?: number }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <div className="value-row" title={v.note}>
      <span>{label}</span>
      <input type="number" step={step} value={draft ?? String(Math.round(v.value))} onChange={(e) => setDraft(e.target.value)}
        onBlur={() => { if (draft != null && Number.isFinite(+draft) && +draft > 0) onChange({ ...v, value: +draft, status: v.status === 'placeholder' ? 'project' : v.status }); setDraft(null); }}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} aria-label={`${label} (mm)`} />
      <select className={`vselect ${v.status}`} value={v.status} onChange={(e) => onChange({ ...v, status: e.target.value as Verification })} aria-label={`${label} status`}>
        {statuses.map((s) => <option key={s} value={s}>{VERIFICATION[s].label}</option>)}
      </select>
    </div>
  );
}

/** Right panel, exhibition, nothing selected: the booth, its checks and services. */
export function BoothPanel() {
  const comp = useStore((s) => s.comp);
  const parts = useStore((s) => s.parts);
  const saved = useStore((s) => s.savedComps);
  const st = useStore();
  const a = useBoothAnalysis();
  const b = comp.booth;
  if (!b || !a) return null;
  const rules = b.rules;
  const setSP = (id: string, patch: Partial<ServicePoint>) => st.setBooth({ services: b.services.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const errors = a.issues.filter((i) => i.level === 'error').length, warns = a.issues.filter((i) => i.level === 'warn').length;
  const open = unconfirmed(b);
  const selectUnit = (id?: string) => { if (!id) return; const ids = comp.items.filter((i) => i.groupId === id || i.id === id).map((i) => i.id); if (ids.length) st.selectItems(ids); };
  const turnUnit = (id: string, deg: number) => { selectUnit(id); st.rotate(deg); };
  const type = boothTypeOf(b.open);
  const exhibitions = saved.filter((c) => c.kind === 'exhibition');
  const changed = changedModules(comp, saved);
  const cols = b.columns ?? [];
  const decks = b.decks ?? [];
  const setDeck = (id: string, patch: Partial<BoothDeck>) => st.setBooth({ decks: decks.map((k) => (k.id === id ? { ...k, ...patch, status: k.status === 'placeholder' && !('status' in patch) && !('name' in patch) ? 'project' : patch.status ?? k.status } : k)) });
  const setCol = (id: string, patch: Partial<BoothColumn>) => st.setBooth({ columns: cols.map((c) => (c.id === id ? { ...c, ...patch } : c)) });
  return (
    <div className="inspector">
      <div className="insp-head"><div className="insp-kicker">Exhibition</div><h2 className="insp-title">{comp.name}</h2>
        <div className="insp-badges"><VBadge status={a.status} /></div>
        <div className="insp-dims">Booth {mm(b.width.value, 0)} × {mm(b.depth.value, 0)} · {a.units.length} module{a.units.length === 1 ? '' : 's'}</div>
      </div>
      <div className="panel-scroll">
        <Section title="Checks" summary={errors || warns ? `${errors} to fix · ${warns} to review` : 'clear'}>
          {a.issues.map((i, k) => (
            <div key={k} className="issue-row">
              <button className={`issue ${i.level}`} onClick={() => selectUnit(i.unit)} disabled={!i.unit}>{i.text}</button>
              {i.unit && i.turn ? <button className="text-btn turn-btn" onClick={() => turnUnit(i.unit!, i.turn!)} title={`Turn ${Math.abs(i.turn)}° so it faces the nearest aisle`}>Face aisle</button> : null}
            </div>
          ))}
          {!a.issues.length && <p className="note">Every module has an accessible approach, everything is inside the plot and under the height limit.</p>}
          <KV k="Accessible floor">{Math.round(a.accessibleShare * 100)}% of {(a.freeArea / 1e6).toFixed(1)} m² open floor</KV>
          {open.length > 0 && <p className="note">Not yet confirmed: {open.join(', ')}. The checks are only as good as these values.</p>}
          <label className="check-row"><input type="checkbox" checked={st.circulation} onChange={() => st.toggle('circulation')} /> Show circulation on the floor</label>
          <p className="note">Green is floor a {Math.round(rules.route.value)} mm wheelchair route reaches from the aisle, darker where a {Math.round(rules.turning.value)} mm turning circle fits; orange is open floor it cannot reach. Outlines are the approach zones in front of each module.</p>
        </Section>
        <Section title="Plot">
          <ValueRow label="Width" v={b.width} onChange={(v) => st.setBooth({ width: v })} />
          <ValueRow label="Depth" v={b.depth} onChange={(v) => st.setBooth({ depth: v })} />
          <ValueRow label="Height limit" v={b.heightLimit} onChange={(v) => st.setBooth({ heightLimit: v })} />
          <ValueRow label="Hall aisle" v={b.aisle} onChange={(v) => st.setBooth({ aisle: v })} />
          <label className="num-row"><span>Stand type</span>
            <select value={type ?? ''} onChange={(e) => { const t = BOOTH_TYPES.find((x) => x.id === e.target.value); if (t) st.setBooth({ open: { ...t.open } }); }} aria-label="Stand type">
              {!type && <option value="">Custom open sides</option>}
              {BOOTH_TYPES.map((t) => <option key={t.id} value={t.id} title={t.note}>{t.name}</option>)}
            </select>
          </label>
          <div className="sides">
            {SIDES.map((s) => <label key={s} className="check-row"><input type="checkbox" checked={b.open[s]} onChange={(e) => st.setBooth({ open: { ...b.open, [s]: e.target.checked } })} /> {SIDE_LABEL[s]} open</label>)}
          </div>
          <p className="note">The plot is centred on the origin with its front toward −Y. A typed value becomes Project-specific; set the status to Verified once it matches the venue’s allocation.</p>
        </Section>
        <Section title="Accessibility rules" open={false} summary={VERIFICATION[[rules.route, rules.turning, rules.approach, rules.headroom].reduce((x, y) => (VERIFICATION_RANK.indexOf(y.status) < VERIFICATION_RANK.indexOf(x.status) ? y : x)).status].label}>
          <ValueRow label="Route width" v={rules.route} step={5} onChange={(v) => st.setBooth({ rules: { ...rules, route: v } })} />
          <ValueRow label="Turning circle" v={rules.turning} step={5} onChange={(v) => st.setBooth({ rules: { ...rules, turning: v } })} />
          <ValueRow label="Approach depth" v={rules.approach} step={10} onChange={(v) => st.setBooth({ rules: { ...rules, approach: v } })} />
          <ValueRow label="Headroom" v={rules.headroom} step={10} onChange={(v) => st.setBooth({ rules: { ...rules, headroom: v } })} />
          <label className="num-row"><span>Start from</span>
            <select value={rulePresetOf(rules) ?? ''} onChange={(e) => { const p = RULE_PRESETS.find((x) => x.id === e.target.value); if (p) st.setBooth({ rules: { ...p.rules } }); }} aria-label="Rule set">
              {!rulePresetOf(rules) && <option value="">Venue rules (edited)</option>}
              {RULE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <p className="note">Rule sets are starting points, marked Estimated until checked against the standard; hover a row for its reference. The venue manual wins: type its figures in and they become Project-specific.</p>
        </Section>
        <Section title="Service points" summary={`${b.services.length}`}>
          {a.loads.map((l) => (
            <div key={l.point.id} className="svc-row">
              <div className="svc-head">
                <input className="name-input" value={l.point.name} onChange={(e) => setSP(l.point.id, { name: e.target.value })} aria-label="Service point name" />
                <select value={l.point.kind} onChange={(e) => setSP(l.point.id, { kind: e.target.value as ServicePoint['kind'] })}>
                  <option value="power">Power</option><option value="data">Data</option><option value="power-data">Power + data</option>
                </select>
                <button className="icon-btn" title="Remove" onClick={() => st.setBooth({ services: b.services.filter((s) => s.id !== l.point.id) })}>×</button>
              </div>
              <div className="svc-grid">
                <label>X<input type="number" step={100} defaultValue={Math.round(l.point.x)} key={`x${l.point.x}`} onBlur={(e) => setSP(l.point.id, { x: +e.target.value || 0 })} /></label>
                <label>Y<input type="number" step={100} defaultValue={Math.round(l.point.y)} key={`y${l.point.y}`} onBlur={(e) => setSP(l.point.id, { y: +e.target.value || 0 })} /></label>
                <label>Capacity W<input type="number" step={100} placeholder="not stated" defaultValue={l.point.capacityW ?? ''} key={`c${l.point.capacityW}`} onBlur={(e) => setSP(l.point.id, { capacityW: e.target.value === '' ? undefined : +e.target.value, status: e.target.value === '' ? l.point.status : l.point.status === 'placeholder' ? 'project' : l.point.status })} /></label>
              </div>
              <KV k={`Feeds ${l.units.length} module${l.units.length === 1 ? '' : 's'}`} status={l.point.status}><span className={l.over ? 'bad' : ''}>{(l.watts / 1000).toLocaleString('en-GB', { maximumFractionDigits: 2 })} kW stated{l.unknownLive ? ` + ${l.unknownLive} unknown` : ''}</span></KV>
            </div>
          ))}
          <div className="btn-grid">
            <button className="ghost" onClick={() => st.setBooth(addServicePoint(b, 'power-data'))}>+ Power + data</button>
            <button className="ghost" onClick={() => st.setBooth(addServicePoint(b, 'power'))}>+ Power</button>
            <button className="ghost" onClick={() => st.setBooth(addServicePoint(b, 'data'))}>+ Data</button>
          </div>
          <p className="note">Each module is fed from the nearest point of the right kind; runs are plan distances along the floor from the module’s centre, without rise or slack. Loads sum stated figures only.</p>
        </Section>
        <Section title="Decks" summary={`${decks.length}`} open={decks.length > 0}>
          {decks.map((k) => <DeckRow key={k.id} k={k} set={(patch) => setDeck(k.id, patch)} remove={() => st.setBooth({ decks: decks.filter((x) => x.id !== k.id) })} />)}
          <button className="ghost wide" onClick={() => st.setBooth(addDeck(b))}>+ Upper deck</button>
          <p className="note">An upper floor on corner posts, with a stair and optionally a lift standing on the booth floor beside one edge. Stair length follows from the level at {DECK_DEFAULTS.rise.value} mm risers and {DECK_DEFAULTS.going.value} mm goings. Slab, posts, guard rail, stair and lift sizes are Estimated; hover a row for its basis.</p>
        </Section>
        <Section title="Columns" summary={`${cols.length}`} open={cols.length > 0}>
          {cols.map((k) => (
            <div key={k.id} className="svc-row">
              <div className="svc-head">
                <input className="name-input" value={k.name} onChange={(e) => setCol(k.id, { name: e.target.value })} aria-label="Column name" />
                <select className={`vselect ${k.status}`} value={k.status} onChange={(e) => setCol(k.id, { status: e.target.value as Verification })} aria-label={`${k.name} status`}>
                  {statuses.map((x) => <option key={x} value={x}>{VERIFICATION[x].label}</option>)}
                </select>
                <button className="icon-btn" title="Remove" onClick={() => st.setBooth({ columns: cols.filter((c) => c.id !== k.id) })}>×</button>
              </div>
              <div className="svc-grid four">
                {(['x', 'y', 'w', 'd'] as const).map((f) => (
                  <label key={f}>{f === 'w' ? 'Width' : f === 'd' ? 'Depth' : f.toUpperCase()}<input type="number" step={50} defaultValue={Math.round(k[f])} key={`${f}${k[f]}`}
                    onBlur={(e) => { const v = +e.target.value; if (!Number.isFinite(v) || ((f === 'w' || f === 'd') && v <= 0)) return; setCol(k.id, { [f]: v, status: k.status === 'placeholder' ? 'project' : k.status }); }} /></label>
                ))}
              </div>
            </div>
          ))}
          <button className="ghost wide" onClick={() => st.setBooth(addColumn(b))}>+ Column</button>
          <p className="note">Hall columns from the hall plan, centred on the booth origin. They block the route like any part, and a module that runs into one is an error. A typed value becomes Project-specific.</p>
        </Section>
        {changed.size > 0 && (
          <Section title="Edited since placed" summary={`${changed.size}`}>
            {comp.groups.filter((g) => changed.has(g.id)).map((g) => (
              <div key={g.id} className="refresh-row">
                <span><b>{g.name}</b><span className="muted small"> · {changed.get(g.id)}</span></span>
                <button className="ghost" onClick={() => st.refreshPlaced(g.id)}>Refresh</button>
              </div>
            ))}
            <p className="note">Refresh replaces the placed module with the saved version, at the same spot and turned the same way. Changes made to it here on the booth are replaced; undo brings them back.</p>
          </Section>
        )}
        <Section title="Modules" summary={`${a.units.length}`}>
          {a.units.map((u, k) => {
            const s = a.services.find((x) => x.unit === u.id)!, z = a.access.find((x) => x.unit === u.id)!;
            const pt = b.services.find((x) => x.id === s.power?.point);
            return (
              <button key={u.id} className="unit-row" onClick={() => selectUnit(u.id)}>
                <span className="tag-dot">{moduleTag(k)}</span>
                <span className="unit-name">{u.name}</span>
                <span className="muted small">{s.liveCount ? `${(s.watts / 1000).toFixed(2)} kW${pt ? ` · ${pt.name} ${(s.power!.run / 1000).toFixed(1)} m` : ' · no point'}` : 'static'}</span>
                <span className={`acc ${z.approach ? (z.turning ? 'ok' : 'part') : 'bad'}`} title={z.approach ? (z.turning ? 'Accessible approach and turning circle' : 'Accessible approach; no turning circle in front') : 'No accessible approach'}>{z.approach ? '♿' : '✕'}</span>
              </button>
            );
          })}
        </Section>
        <ProjectDocs open={false} />
        <Section title="Saved exhibitions" summary={`${exhibitions.length}`} open={exhibitions.length > 0}>
          {exhibitions.map((c) => <button key={c.id} className="link-row" onClick={() => st.openComp(c)}>{c.name}<span className="muted small"> · {c.groups.length} modules</span></button>)}
          {!exhibitions.length && <p className="note">Save an exhibition to keep it in this browser.</p>}
        </Section>
        <div className="pad col">
          <div className="btn-grid">
            <button className="ghost" onClick={() => st.notify(downloadBoothSheet(comp, parts))}>Booth plan .svg</button>
            <button className="ghost" onClick={() => st.notify(printBoothSheet(comp, parts))}>Print plan</button>
            <button className="ghost" onClick={() => downloadBoothSchedule(comp, parts)}>Schedule .csv</button>
          </div>
          <button className="ghost wide" onClick={st.saveComp}>Save exhibition</button>
          <button className="ghost wide" onClick={st.newComp}>New exhibition</button>
          <div className="btn-grid two">
            <button className="ghost" onClick={() => st.loadSampleBooth('corner')}>Sample corner booth</button>
            <button className="ghost" onClick={() => st.loadSampleBooth('island')}>Sample island booth</button>
          </div>
          <button className="ghost wide" onClick={() => st.loadSampleBooth('two-storey')}>Sample two-storey booth</button>
        </div>
      </div>
    </div>
  );
}

const SIDE_SHORT: Record<BoothSide, string> = { front: 'Front', right: 'Right', back: 'Back', left: 'Left' };

function DeckRow({ k, set, remove }: { k: BoothDeck; set: (p: Partial<BoothDeck>) => void; remove: () => void }) {
  const num = (f: 'x' | 'y' | 'w' | 'd' | 'level', label: string) => (
    <label key={f}>{label}<input type="number" step={50} defaultValue={Math.round(k[f])} key={`${f}${k[f]}`}
      onBlur={(e) => { const v = +e.target.value; if (!Number.isFinite(v) || (f !== 'x' && f !== 'y' && v <= 0) || v === k[f]) return; set({ [f]: v }); }} aria-label={`${k.name} ${label}`} /></label>
  );
  const access = (kind: 'stair' | 'lift') => {
    const a = k[kind];
    const setA = (p: Partial<DeckAccess> | null) => set({ [kind]: p === null ? undefined : { side: 'front', offset: 0, ...(kind === 'stair' ? { width: DECK_DEFAULTS.stairWidth.value } : {}), ...a, ...p } } as Partial<BoothDeck>);
    return (
      <div className="deck-access">
        <span>{kind === 'stair' ? 'Stair' : 'Lift'}</span>
        <select value={a?.side ?? ''} onChange={(e) => setA(e.target.value ? { side: e.target.value as BoothSide } : null)} aria-label={`${k.name} ${kind} side`}>
          <option value="">None</option>
          {SIDES.map((s) => <option key={s} value={s}>{SIDE_SHORT[s]} edge</option>)}
        </select>
        {a && <label>Along<input type="number" step={100} defaultValue={Math.round(a.offset)} key={`o${a.offset}`} onBlur={(e) => { const v = +e.target.value; if (Number.isFinite(v) && v !== a.offset) setA({ offset: v }); }} aria-label={`${k.name} ${kind} offset`} /></label>}
      </div>
    );
  };
  const run = stairRun(k);
  return (
    <div className="svc-row">
      <div className="svc-head">
        <input className="name-input" value={k.name} onChange={(e) => set({ name: e.target.value })} aria-label="Deck name" />
        <select className={`vselect ${k.status}`} value={k.status} onChange={(e) => set({ status: e.target.value as Verification })} aria-label={`${k.name} status`}>
          {statuses.map((x) => <option key={x} value={x}>{VERIFICATION[x].label}</option>)}
        </select>
        <button className="icon-btn" title="Remove" onClick={remove}>×</button>
      </div>
      <div className="svc-grid four">{num('x', 'X')}{num('y', 'Y')}{num('w', 'Width')}{num('d', 'Depth')}</div>
      <div className="svc-grid four">{num('level', 'Level')}</div>
      {access('stair')}
      {access('lift')}
      {k.stair && <p className="note">{run.risers} risers, a {(run.length / 1000).toFixed(2)} m straight run.</p>}
    </div>
  );
}
