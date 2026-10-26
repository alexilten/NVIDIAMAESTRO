import { useEffect, useMemo, useState } from 'react';
import { uid } from '../core/compose';
import { DOC_KIND_LABEL, EYE_HEIGHT, STILL_SIZES, safeUrl, viewsFor, type DocKind, type ProjectDoc, type SavedView } from '../core/presentation';
import type { Vec3 } from '../core/schema';
import { moduleTag } from '../core/sheet';
import { ComposeCanvas } from '../viewport/ComposeCanvas';
import { viewer } from '../viewport/Capture';
import { Icon, Section, VBadge } from './common';
import { clientViewFor, downloadClientView, downloadStill, previewClientView } from './exportActions';
import { extentOf, useStore } from './store';

/** the extent the generated views frame: the items and, for an exhibition, the booth plot */
function useExtent(): { min: Vec3; max: Vec3 } | null {
  const comp = useStore((s) => s.comp);
  const parts = useStore((s) => s.parts);
  return useMemo(() => {
    const ex = comp.items.map((p) => extentOf(p, parts)).filter(Boolean) as { min: Vec3; max: Vec3 }[];
    const b = comp.booth;
    if (b) ex.push({ min: [-b.width.value / 2, -b.depth.value / 2, 0], max: [b.width.value / 2, b.depth.value / 2, 2400] });
    if (!ex.length) return null;
    return { min: [0, 1, 2].map((k) => Math.min(...ex.map((e) => e.min[k]))) as Vec3, max: [0, 1, 2].map((k) => Math.max(...ex.map((e) => e.max[k]))) as Vec3 };
  }, [comp, parts]);
}

/** Present: camera views and stills of the current module or exhibition, its document links, and the client view. */
export function Present() {
  const comp = useStore((s) => s.comp);
  const extent = useExtent();
  const views = useMemo(() => viewsFor(comp, extent), [comp, extent]);
  const [active, setActive] = useState<string>('preset-hero');
  const view = views.find((v) => v.id === active) ?? views[0];

  // move to the active view once the canvas is up, and again when the composition changes
  const key = `${comp.id}|${view?.id}|${view?.eye.join(',')}`;
  useEffect(() => {
    if (!view) return;
    // the first move after the canvas mounts is a cut; later ones glide
    const first = !viewer.api;
    let raf = 0, tries = 0;
    const go = () => { if (viewer.api) viewer.api.go(view, !first); else if (tries++ < 240) raf = requestAnimationFrame(go); };
    go();
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <>
      <div className="stage">
        <div className="stage-frame">
          <ComposeCanvas mode="translate" present />
          <div className="stage-caption"><b>{comp.name}</b><span>{view?.name ?? ''}</span></div>
          {!comp.items.length && <div className="viewer-empty">Nothing to present yet. Compose a module or lay out an exhibition first.</div>}
        </div>
      </div>
      <aside className="panel left glass"><ViewsPanel views={views} active={view?.id} onPick={setActive} /></aside>
      <aside className="panel right glass"><ClientPanel /></aside>
    </>
  );
}

function ViewsPanel({ views, active, onPick }: { views: SavedView[]; active?: string; onPick: (id: string) => void }) {
  const comp = useStore((s) => s.comp);
  const stills = useStore((s) => s.stills);
  const st = useStore();
  const [size, setSize] = useState<string>('hd');
  const [busy, setBusy] = useState<string | null>(null);
  const mine = stills.filter((s) => s.compId === comp.id);
  const saveView = () => {
    const c = viewer.api?.current();
    if (!c) return;
    const n = (comp.views ?? []).length + 1;
    const v: SavedView = { id: uid('view'), name: `View ${n}`, ...c };
    st.patchComp({ views: [...(comp.views ?? []), v] });
    onPick(v.id);
    st.notify(`Saved the current camera as View ${n}.`);
  };
  const render = async (vs: SavedView[]) => {
    if (!viewer.api || !vs.length) return;
    const sz = STILL_SIZES.find((s) => s.id === size) ?? STILL_SIZES[0];
    setBusy(vs.length === 1 ? `Rendering ${vs[0].name}…` : `Rendering ${vs.length} views…`);
    try {
      const srcs = await viewer.api.render(vs, sz.w, sz.h);
      const made = vs.map((v, k) => ({ id: uid('still'), compId: comp.id, name: v.name, src: srcs[k], width: sz.w, height: sz.h }));
      // a new still of a view replaces the old one
      st.setStills([...useStore.getState().stills.filter((s) => !(s.compId === comp.id && made.some((m) => m.name === s.name))), ...made]);
      st.notify(`${made.length} still${made.length === 1 ? '' : 's'} rendered at ${sz.label}.`);
    } catch (e) { st.notify(`Render failed: ${(e as Error).message}`); }
    setBusy(null);
  };
  const setView = (id: string, patch: Partial<SavedView>) => st.patchComp({ views: (comp.views ?? []).map((v) => (v.id === id ? { ...v, ...patch } : v)) });
  return (
    <div className="present-left">
      <div className="pad">
        <div className="segmented sm wide-seg" aria-label="What to present">
          <button className={comp.kind === 'module' ? 'on' : ''} onClick={() => st.presentKind('module')}>Module</button>
          <button className={comp.kind === 'exhibition' ? 'on' : ''} onClick={() => st.presentKind('exhibition')}>Exhibition</button>
        </div>
        <div className="present-title">{comp.name}</div>
        <div className="muted small">{comp.items.length} items{comp.groups.length ? ` · ${comp.groups.length} ${comp.kind === 'exhibition' ? 'modules' : 'groups'}` : ''}</div>
      </div>
      <div className="panel-scroll">
        <div className="sub-head">Views</div>
        {views.map((v) => (
          <div key={v.id} className={`view-row ${v.id === active ? 'on' : ''}`}>
            {v.preset
              ? <button className="view-name" onClick={() => onPick(v.id)}>{v.name}</button>
              : <input className="view-name" value={v.name} onFocus={() => onPick(v.id)} onChange={(e) => setView(v.id, { name: e.target.value })} aria-label="View name" />}
            <span className="muted small">{v.fov}°</span>
            {!v.preset && <button className="icon-btn" title="Delete view" onClick={() => st.patchComp({ views: (comp.views ?? []).filter((x) => x.id !== v.id) })}><Icon name="trash" size={13} /></button>}
          </div>
        ))}
        <div className="pad col">
          <button className="ghost wide" onClick={saveView} disabled={!comp.items.length}>Save current camera as a view</button>
          <p className="note">Orbit the stage, then save. Saved views travel with the module or exhibition; the generated ones follow its extent. Visitor eye level stands {EYE_HEIGHT.value} mm high in the aisle (Estimated).</p>
        </div>
        <div className="sub-head">Stills</div>
        <div className="pad col">
          <div className="segmented sm wide-seg">
            {STILL_SIZES.map((s) => <button key={s.id} className={size === s.id ? 'on' : ''} onClick={() => setSize(s.id)}>{s.label}</button>)}
          </div>
          <div className="btn-grid">
            <button className="ghost" disabled={!!busy || !comp.items.length} onClick={() => render(views.filter((v) => v.id === active))}>Render view</button>
            <button className="primary" disabled={!!busy || !comp.items.length} onClick={() => render(views)}>Render all</button>
          </div>
          {busy && <p className="note">{busy}</p>}
        </div>
        <div className="stills">
          {mine.map((s) => (
            <figure key={s.id} className="still">
              <img src={s.src} alt={s.name} />
              <figcaption><span>{s.name}</span>
                <button className="icon-btn" title="Download PNG" onClick={() => downloadStill(s.name, comp.name, s.src)}><Icon name="download" size={13} /></button>
                <button className="icon-btn" title="Remove" onClick={() => st.setStills(stills.filter((x) => x.id !== s.id))}><Icon name="x" size={13} /></button>
              </figcaption>
            </figure>
          ))}
        </div>
        {!mine.length && <p className="note pad">Stills are rendered in this browser at the size above, without labels or analysis overlays, and kept until the page is closed.</p>}
      </div>
    </div>
  );
}

function ClientPanel() {
  const comp = useStore((s) => s.comp);
  const parts = useStore((s) => s.parts);
  const stills = useStore((s) => s.stills);
  const st = useStore();
  const [by, setBy] = useState('');
  const [withStills, setWithStills] = useState(true);
  const mine = stills.filter((s) => s.compId === comp.id);
  const build = useMemo(() => clientViewFor(comp, parts, withStills ? mine.map((s) => ({ name: s.name, src: s.src })) : [], by), [comp, parts, mine, withStills, by]);
  const shared = (comp.docs ?? []).filter((d) => !d.confidential).length;
  return (
    <div className="inspector">
      <div className="insp-head"><div className="insp-kicker">Client view</div><h2 className="insp-title">{comp.name}</h2>
        <div className="insp-dims">{build.pkg.items.reduce((n, r) => n + r.count, 0)} items · {shared} shared document{shared === 1 ? '' : 's'}</div>
      </div>
      <div className="panel-scroll">
        <Section title="What the client sees" summary={`${build.pkg.items.length} rows`}>
          {build.pkg.items.map((r) => (
            <div key={`${r.source}|${r.name}`} className="client-row"><div><div>{r.name}</div><div className="muted small">{r.source}</div></div><span className="client-qty">× {r.count}</span><VBadge status={r.status} /></div>
          ))}
          {!build.pkg.items.length && <p className="note">Nothing placed yet.</p>}
          <p className="note">Names, counts, overall sizes and the status of each value. Left out: source files, block names, drawing references, approvals, notes, positions and every confidential document.</p>
        </Section>
        <ProjectDocs />
        <Section title="Package">
          <label className="num-row"><span>Prepared by</span><input value={by} placeholder="optional" onChange={(e) => setBy(e.target.value)} style={{ textAlign: 'left' }} /></label>
          <label className="check-row"><input type="checkbox" checked={withStills} onChange={(e) => setWithStills(e.target.checked)} /> Include {mine.length} still{mine.length === 1 ? '' : 's'}</label>
          <div className={`audit ${build.leaks.length ? 'bad' : 'ok'}`} role="status">
            <Icon name={build.leaks.length ? 'x' : 'lock'} size={14} />
            {build.leaks.length
              ? <span>{build.leaks.length} private value{build.leaks.length === 1 ? '' : 's'} would be shown: {build.leaks.slice(0, 3).map((l) => l.what).join('; ')}. Rename the item or module, or mark the document confidential.</span>
              : <span>Checked against {build.checked} private value{build.checked === 1 ? '' : 's'} of the parts and documents in this {comp.kind}: none appear.</span>}
          </div>
          <div className="btn-grid">
            <button className="ghost" disabled={!comp.items.length || !!build.leaks.length} onClick={() => st.notify(previewClientView(build))}>Preview</button>
            <button className="primary" disabled={!comp.items.length || !!build.leaks.length} onClick={() => st.notify(downloadClientView(build, comp))}>Save .html</button>
          </div>
          <p className="note">One self-contained page with the stills inline, no scripts and no outside requests. It opens offline and prints to PDF. Check it before sending: the audit covers the private record of imported parts and confidential links, not what you type into names.</p>
        </Section>
      </div>
    </div>
  );
}

const KINDS = Object.keys(DOC_KIND_LABEL) as DocKind[];

/** Links to project documents kept elsewhere, for a module, an exhibition or one of its modules. */
export function ProjectDocs({ open = true }: { open?: boolean }) {
  const comp = useStore((s) => s.comp);
  const imported = useStore((s) => s.docs);
  const st = useStore();
  const docs = comp.docs ?? [];
  const blank = { title: '', kind: 'drawing' as DocKind, url: '', reference: '', moduleId: '', confidential: true };
  const [draft, setDraft] = useState(blank);
  const urlOk = !draft.url.trim() || !!safeUrl(draft.url);
  const add = () => {
    if (!draft.title.trim() || !urlOk) return;
    const d: ProjectDoc = { id: uid('doc'), title: draft.title.trim(), kind: draft.kind, url: safeUrl(draft.url), reference: draft.reference.trim() || undefined, confidential: draft.confidential, moduleId: draft.moduleId || undefined, addedAt: new Date().toISOString() };
    st.patchComp({ docs: [...docs, d] });
    setDraft(blank);
  };
  const set = (id: string, patch: Partial<ProjectDoc>) => st.patchComp({ docs: docs.map((d) => (d.id === id ? { ...d, ...patch } : d)) });
  const groupName = (id?: string) => { const k = comp.groups.findIndex((g) => g.id === id); return k < 0 ? null : `${moduleTag(k)} · ${comp.groups[k].name}`; };
  return (
    <Section title="Project documents" summary={`${docs.length}`} open={open}>
      {docs.map((d) => (
        <div key={d.id} className="doc-row">
          <div className="doc-main">
            {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer">{d.title}</a> : <span>{d.title}</span>}
            <span className="muted small"> · {DOC_KIND_LABEL[d.kind]}{d.reference ? ` · ${d.reference}` : ''}{groupName(d.moduleId) ? ` · ${groupName(d.moduleId)}` : ''}</span>
          </div>
          <button className={`chip sm ${d.confidential ? 'conf' : 'shared'}`} title={d.confidential ? 'Confidential: never in the client view. Click to share it.' : 'Shared: listed in the client view. Click to make it confidential.'} onClick={() => set(d.id, { confidential: !d.confidential })}>
            {d.confidential ? 'Confidential' : 'Shared'}
          </button>
          <button className="icon-btn" title="Remove link" onClick={() => st.patchComp({ docs: docs.filter((x) => x.id !== d.id) })}><Icon name="x" size={13} /></button>
        </div>
      ))}
      <div className="doc-form">
        <input placeholder="Title, e.g. Booth build drawings" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Document title" />
        <input placeholder="https:// link (optional)" value={draft.url} className={urlOk ? '' : 'invalid'} onChange={(e) => setDraft({ ...draft, url: e.target.value })} aria-label="Document link" />
        <div className="doc-form-row">
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as DocKind })} aria-label="Document kind">{KINDS.map((k) => <option key={k} value={k}>{DOC_KIND_LABEL[k]}</option>)}</select>
          <input placeholder="Ref / rev" value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} aria-label="Reference" />
        </div>
        {comp.groups.length > 0 && (
          <select value={draft.moduleId} onChange={(e) => setDraft({ ...draft, moduleId: e.target.value })} aria-label="Belongs to">
            <option value="">Whole {comp.kind}</option>
            {comp.groups.map((g, k) => <option key={g.id} value={g.id}>{moduleTag(k)} · {g.name}</option>)}
          </select>
        )}
        <label className="check-row"><input type="checkbox" checked={draft.confidential} onChange={(e) => setDraft({ ...draft, confidential: e.target.checked })} /> Confidential (kept out of the client view)</label>
        <button className="ghost wide" disabled={!draft.title.trim() || !urlOk} onClick={add}>Add link</button>
        {!urlOk && <p className="note bad">Only http and https links can be stored.</p>}
        {imported.length > 0 && (
          <p className="note">From Import: {imported.map((d) => (
            <button key={d.id} className="inline-link" onClick={() => setDraft({ ...blank, title: d.name, kind: 'deck' })}>{d.name}</button>
          ))}</p>
        )}
      </div>
      <p className="note">MAESTRO keeps the link and its reference, never the document. New links are confidential until you share them.</p>
    </Section>
  );
}
