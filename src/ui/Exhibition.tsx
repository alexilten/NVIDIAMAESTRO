import { useMemo, useState } from 'react';
import { REFERENCE_RULES, SIDES, SIDE_LABEL, addServicePoint, changedModules, unconfirmed } from '../core/booth';
import { moduleTag } from '../core/sheet';
import { TEMPLATES } from '../core/templates';
import { VERIFICATION, VERIFICATION_RANK, type BoothValue, type ServicePoint, type Verification } from '../core/schema';
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
  const exhibitions = saved.filter((c) => c.kind === 'exhibition');
  return (
    <div className="inspector">
      <div className="insp-head"><div className="insp-kicker">Exhibition</div><h2 className="insp-title">{comp.name}</h2>
        <div className="insp-badges"><VBadge status={a.status} /></div>
        <div className="insp-dims">Booth {mm(b.width.value, 0)} × {mm(b.depth.value, 0)} · {a.units.length} module{a.units.length === 1 ? '' : 's'}</div>
      </div>
      <div className="panel-scroll">
        <Section title="Checks" summary={errors || warns ? `${errors} to fix · ${warns} to review` : 'clear'}>
          {a.issues.map((i, k) => (
            <button key={k} className={`issue ${i.level}`} onClick={() => selectUnit(i.unit)} disabled={!i.unit}>{i.text}</button>
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
          <p className="note">Defaults are reference values from the 2010 ADA Standards, marked Estimated until checked against the document. The venue’s own rules replace them; hover a row for its reference.</p>
          <button className="ghost wide" onClick={() => st.setBooth({ rules: { ...REFERENCE_RULES } })}>Reset to reference values</button>
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
          <button className="ghost wide" onClick={st.loadSampleBooth}>Load sample booth</button>
        </div>
      </div>
    </div>
  );
}
