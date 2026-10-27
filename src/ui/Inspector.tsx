import { useMemo, useState } from 'react';
import { FAMILY_BY_ID, MODEL_BY_ID, PHYSICAL_BY_ID } from '../core/catalog/products';
import { SOURCE_BY_ID } from '../core/catalog/sources';
import { KIT_BY_ID, resolveParams } from '../core/geometry/kit';
import { productEntries, resolveRef } from '../core/library';
import { CATEGORY_LABEL, KIT_CATEGORY_LABEL, LOD, MODEL_KIND_LABEL, VERIFICATION, type ItemRef, type Spec } from '../core/schema';
import { checkState } from '../ingest/pipeline';
import { useStore } from './store';
import { Icon, KV, LodBadge, Section, VBadge, dims3, mm } from './common';
import { exportItemFile } from './exportActions';
import { ProductHero } from './ProductHero';

export function Inspector({ refItem }: { refItem: ItemRef | null }) {
  const parts = useStore((s) => s.parts);
  const r = useMemo(() => (refItem ? resolveRef(refItem, parts) : null), [refItem, parts]);
  if (!refItem || !r) return <div className="inspector empty small muted">Select an item in the library.</div>;
  return (
    <div className="inspector">
      <Header r={r} refItem={refItem} />
      {refItem.kind === 'product' && <ProductDetail id={refItem.id} />}
      {refItem.kind === 'kit' && <KitDetail refItem={refItem} />}
      {refItem.kind === 'ingested' && <PartDetail id={refItem.id} version={refItem.version} />}
    </div>
  );
}

function Header({ r, refItem }: { r: NonNullable<ReturnType<typeof resolveRef>>; refItem: ItemRef }) {
  const parts = useStore((s) => s.parts);
  const fav = useStore((s) => s.favorites);
  const toggleFav = useStore((s) => s.toggleFavorite);
  const add = useStore((s) => s.addToCanvas);
  const notify = useStore((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const e = r.entry;
  const physical = !!r.shape;
  return (
    <div className="insp-head">
      <ProductHero refItem={refItem} entry={e} shape={r.shape} />
      <div className="insp-kicker">{e.subtitle}</div>
      <h2 className="insp-title">{e.name}</h2>
      <div className="insp-badges">
        <VBadge status={e.verification} />
        {e.physical && <LodBadge lod={e.lod} />}
        {e.section === 'project' && <span className="lodbadge private"><Icon name="lock" size={10} /> Private</span>}
      </div>
      <div className="insp-dims">{e.physical ? dims3(e.dims) : `${e.kind ? MODEL_KIND_LABEL[e.kind] : 'Software'}: no single physical object`}</div>
      <div className="actions">
        <button className="primary wide" disabled={!physical} onClick={() => add(refItem, e.name)}><Icon name="plus" /> Add to canvas</button>
        <div className="action-row">
          <button className="ghost" disabled={!physical || busy} onClick={async () => { setBusy(true); try { notify(await exportItemFile(refItem, e.name, parts)); } catch (err) { notify(`Export failed: ${(err as Error).message}`); } finally { setBusy(false); } }}><Icon name="download" /> {busy ? 'Exporting…' : 'Download .3dm'}</button>
          <button className={`ghost ${fav.includes(e.key) ? 'on' : ''}`} onClick={() => toggleFav(e.key)} title="Add to collection"><Icon name="star" /> {fav.includes(e.key) ? 'In collection' : 'Collect'}</button>
        </div>
      </div>
    </div>
  );
}

function SpecValue({ s, unit }: { s: Spec<string | number>; unit?: string }) {
  const src = s.sourceId ? SOURCE_BY_ID.get(s.sourceId) : undefined;
  return (
    <>
      {s.value == null ? '—' : typeof s.value === 'number' ? `${s.value.toLocaleString('en-GB')}${unit ? ` ${unit}` : ''}` : s.value}
      <i className={`dot ${s.status}`} title={`${VERIFICATION[s.status].label}${src ? ` · ${src.publisher}: ${src.title}` : ''}${s.note ? ` · ${s.note}` : ''}`} />
    </>
  );
}

function ProductDetail({ id }: { id: string }) {
  const m = MODEL_BY_ID.get(id)!;
  const fam = FAMILY_BY_ID.get(m.familyId)!;
  const pa = m.physicalAssetId ? PHYSICAL_BY_ID.get(m.physicalAssetId) : undefined;
  const select = useStore((s) => s.select);
  const [tech, setTech] = useState(false);
  const entries = productEntries();
  const go = (rid: string) => { const e = entries.find((x) => x.ref.kind === 'product' && x.ref.id === rid); if (e) select(e); };
  return (
    <div className="panel-scroll">
      <Section title="About">
        <p className="prose">{m.description}</p>
        <p className="prose muted">{m.purpose}</p>
        <KV k="Kind">{MODEL_KIND_LABEL[m.kind]}</KV>
        <KV k="Family">{fam.name}</KV>
        <KV k="Category">{CATEGORY_LABEL[fam.category]}</KV>
        <KV k="Status">{m.status}</KV>
        {m.industries.length > 0 && <KV k="Applications">{m.industries.join(', ')}</KV>}
      </Section>
      {pa && (
        <Section title="Physical" summary={pa.dims.width.value == null ? 'not recorded' : undefined}>
          <KV k="Width (X)"><SpecValue s={pa.dims.width} unit="mm" /></KV>
          <KV k="Depth (Y)"><SpecValue s={pa.dims.depth} unit="mm" /></KV>
          <KV k="Height (Z)"><SpecValue s={pa.dims.height} unit="mm" /></KV>
          {pa.weightKg && <KV k="Weight"><SpecValue s={pa.weightKg} unit="kg" /></KV>}
          {pa.rackUnits && <KV k="Rack units"><SpecValue s={pa.rackUnits} unit="U" /></KV>}
          {[pa.dims.width, pa.dims.depth, pa.dims.height].filter((d) => d.note).map((d, i) => <p key={i} className="note">{d.note}</p>)}
          {pa.interfaces.length > 0 && <div className="sub-label">Interfaces</div>}
          {pa.interfaces.map((f, i) => <KV key={i} k={f.side}>{f.name}<i className={`dot ${f.status}`} title={f.note} /></KV>)}
        </Section>
      )}
      {m.specs.length > 0 && (
        <Section title="Technical">
          {m.specs.map((s) => <KV key={s.label} k={s.label}><SpecValue s={s.spec} unit={s.unit} /></KV>)}
        </Section>
      )}
      {m.implementations && (
        <Section title="Physical implementations">
          {m.implementations.length ? m.implementations.map((x) => <button key={x} className="link-row" onClick={() => go(x)}>{MODEL_BY_ID.get(x)?.name}</button>) : <p className="note">No physical SKU recorded yet. A platform name is not one fixed enclosure: add each partner rack as its own record when its mechanical specification is published.</p>}
        </Section>
      )}
      {pa && pa.digitalAssets.length > 0 && (
        <Section title="3D asset">
          {pa.digitalAssets.map((a) => (
            <div key={a.id}>
              <KV k="Quality">{LOD[a.lod].label}</KV>
              <KV k="Version">v{a.version} · {a.createdAt}</KV>
              <p className="note">{a.provenance}</p>
            </div>
          ))}
        </Section>
      )}
      {m.related && m.related.length > 0 && (
        <Section title="Related">
          {m.related.map((x) => <button key={x} className="link-row" onClick={() => go(x)}>{MODEL_BY_ID.get(x)?.name ?? x}</button>)}
        </Section>
      )}
      <Section title="Sources" summary={`reviewed ${m.lastReviewed}`} open={tech}>
        {m.sources.length === 0 && <p className="note">No source attached. Values stay Placeholder until one is.</p>}
        {m.sources.map((s) => {
          const src = SOURCE_BY_ID.get(s);
          return src ? <div key={s} className="source"><a href={src.url} target="_blank" rel="noreferrer">{src.title}</a><div className="muted small">{src.publisher}{src.reference ? ` · ${src.reference}` : ''} · read {src.accessed} · {src.kind.replace('-', ' ')}</div></div> : null;
        })}
      </Section>
      <button className="disclose" onClick={() => setTech(!tech)}>{tech ? 'Hide technical data' : 'View technical data'}</button>
      {tech && <pre className="json">{JSON.stringify({ model: m, physical: pa }, null, 2)}</pre>}
    </div>
  );
}

function KitDetail({ refItem }: { refItem: Extract<ItemRef, { kind: 'kit' }> }) {
  const k = KIT_BY_ID.get(refItem.id)!;
  const setRef = useStore((s) => s.setSelectedRef);
  const params = resolveParams(k.id, refItem.params);
  return (
    <div className="panel-scroll">
      <Section title="Parameters" summary={KIT_CATEGORY_LABEL[k.category]}>
        {k.params.map((p) => (
          <div className="ctl" key={p.key}>
            <div className="ctl-row"><span className="ctl-label">{p.label}</span><span className="ctl-value">{p.unit === 'mm' ? mm(params[p.key], 0) : p.key === 'screen' ? (params[p.key] ? `${params[p.key]}″` : 'None') : params[p.key]}</span></div>
            <input className="slider" type="range" min={p.min} max={p.max} step={p.step} value={params[p.key]} style={{ ['--pct' as string]: `${((params[p.key] - p.min) / (p.max - p.min)) * 100}%` }} onChange={(e) => setRef({ kind: 'kit', id: k.id, params: { ...params, [p.key]: +e.target.value } })} />
          </div>
        ))}
      </Section>
      <Section title="About">
        <p className="prose">{k.description}</p>
        <p className="note">{k.note}</p>
      </Section>
    </div>
  );
}

function PartDetail({ id, version }: { id: string; version: number }) {
  const part = useStore((s) => s.parts.find((p) => p.id === id && p.version === version));
  const setWorkspace = useStore((s) => s.setWorkspace);
  if (!part) return null;
  const discrepancies = part.checks.filter((c) => checkState(c) === 'discrepancy');
  return (
    <div className="panel-scroll">
      <Section title="Provenance">
        <KV k="Project">{part.project}</KV>
        <KV k="Source file">{part.source.fileName}</KV>
        <KV k="Block">{part.source.block}</KV>
        {part.source.derivedFrom && <KV k="Derived from">{part.source.derivedFrom}</KV>}
        <KV k="Units">{part.source.units} → mm</KV>
        <KV k="SHA-256"><code>{part.source.sha256.slice(0, 16)}…</code></KV>
        {part.source.originNote && <KV k="Origin">{part.source.originNote}</KV>}
        <KV k="Status">{part.status === 'approved' ? `Approved v${part.version} · ${part.approvedAt?.slice(0, 10)}` : part.status}</KV>
      </Section>
      <Section title="Geometry">
        <KV k="Source objects">{part.stats.breps} B-reps · {part.stats.extrusions} extrusions{part.stats.meshes ? ` · ${part.stats.meshes} meshes` : ''}</KV>
        <KV k="Nested blocks">{part.stats.nestedInstances}</KV>
        <KV k="Viewport mesh">{part.stats.triangles.toLocaleString('en-GB')} triangles</KV>
        {part.stats.approximatedFaces > 0 && <p className="note">{part.stats.approximatedFaces} of {part.stats.faces} faces are curved and drawn approximately in the viewport. The export uses the exact source geometry.</p>}
        {part.stats.skipped > 0 && <p className="note">{part.stats.skipped} annotation object{part.stats.skipped === 1 ? '' : 's'} ({part.stats.skippedTypes.join(', ')}) not carried into the library.</p>}
        <p className="note">Fixed geometry: this part keeps its source shape and has no recovered parameters.</p>
      </Section>
      <Section title="Documentation" summary={`${part.docs.filter((d) => d.origin !== 'suggested').length} confirmed`}>
        {part.docs.filter((d) => d.origin !== 'suggested').map((d) => <KV key={d.id} k={`p. ${d.page}`}>{d.title}{d.status ? ` · ${d.status}` : ''}</KV>)}
        {!part.docs.length && <p className="note">No documentation linked.</p>}
      </Section>
      <Section title="Dimension checks" summary={discrepancies.length ? `${discrepancies.length} discrepanc${discrepancies.length === 1 ? 'y' : 'ies'}` : undefined}>
        {part.checks.map((c) => (
          <KV key={c.id} k={c.label}>{mm(c.model)} model · {c.drawing == null ? '—' : mm(c.drawing)} drawing <span className={`cstate ${checkState(c)}`}>{checkState(c) === 'discrepancy' ? (c.resolution === 'open' ? 'open' : c.resolution) : checkState(c)}</span></KV>
        ))}
      </Section>
      <button className="disclose" onClick={() => setWorkspace('ingest')}>Review in Ingest</button>
    </div>
  );
}
