import { useEffect, useMemo, useRef, useState } from 'react';
import { KIT_CATEGORY_LABEL, type KitCategory } from '../core/schema';
import { resolveRef } from '../core/library';
import { ProductViewer, type DimLabel } from '../viewport/ProductViewer';
import { addCheck, approvalBlockers, approve, checkState, measures, proposePart, suggestDocs } from '../ingest/pipeline';
import { extractPart, inspectSource, openDoc, type SourceSummary } from '../ingest/rhino';
import { download, loadRhino } from '../ingest/rhinoBrowser';
import type { DimCheck, DocLink, IngestedPart } from '../ingest/types';
import { applyReview, exportReview, parseReview } from '../ingest/review';
import { Icon, KV, Section, VBadge, dims3, mm } from './common';
import { useStore } from './store';

/** Files opened in this session. They are read in the browser and never stored or sent; only extracted parts are kept. */
const sessionFiles = { rhino: new Map<string, { file: File; bytes: Uint8Array; summary: SourceSummary }>(), pdf: new Map<string, File>() };

export function Ingest() {
  const parts = useStore((s) => s.parts);
  const [summary, setSummary] = useState<SourceSummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const part = parts.find((p) => `${p.id}@${p.version}` === selected) ?? null;
  const shape = useMemo(() => (part ? resolveRef({ kind: 'ingested', id: part.id, version: part.version }, parts)?.shape ?? null : null), [part, parts]);
  const dims = part ? (part.dims.map((v) => ({ value: v, status: part.status === 'approved' ? 'project' : 'estimated' })) as [DimLabel, DimLabel, DimLabel]) : undefined;
  return (
    <>
      {part ? <ProductViewer shape={shape} dims={dims} partNames={part.mesh.map((m) => m.material)} /> : <div className="viewer blank" />}
      <aside className="panel left glass"><SourcesPanel summary={summary} setSummary={(s) => { setSummary(s); setSelected(null); }} selected={selected} setSelected={setSelected} /></aside>
      {summary && !part && <BlockSheet summary={summary} onDone={(k) => setSelected(k)} />}
      {!summary && !part && <IngestIntro />}
      <aside className="panel right glass">{part ? <ReviewPanel part={part} /> : <div className="inspector empty small muted">Open a Rhino model, extract blocks, then select a proposed part to review it here.</div>}</aside>
    </>
  );
}

function IngestIntro() {
  return (
    <div className="sheet glass intro">
      <h2>Import a project model</h2>
      <ol className="steps">
        <li><b>Open a Rhino .3dm</b> from the project. It is read in this browser; nothing is uploaded.</li>
        <li><b>Choose blocks</b> to bring in as kit-of-parts components. Each keeps its exact source geometry.</li>
        <li><b>Attach the fabrication deck</b> (PDF). Pages are matched to each part for you to confirm.</li>
        <li><b>Check dimensions</b> against the drawings and resolve every discrepancy explicitly.</li>
        <li><b>Approve</b> to publish the part to the private project library, ready for Compose and Rhino export.</li>
      </ol>
      <p className="note">Project files and everything extracted from them stay in this browser’s private library. The public build of MAESTRO contains none of it.</p>
    </div>
  );
}

function SourcesPanel({ summary, setSummary, selected, setSelected }: { summary: SourceSummary | null; setSummary: (s: SourceSummary | null) => void; selected: string | null; setSelected: (k: string | null) => void }) {
  const parts = useStore((s) => s.parts);
  const docs = useStore((s) => s.docs);
  const saveDoc = useStore((s) => s.saveDoc);
  const savePart = useStore((s) => s.savePart);
  const notify = useStore((s) => s.notify);
  const [busy, setBusy] = useState<string | null>(null);
  const rhinoInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const reviewInput = useRef<HTMLInputElement>(null);

  const openRhino = async (f: File) => {
    setBusy(`Reading ${f.name}…`);
    try {
      const rh = await loadRhino();
      const bytes = new Uint8Array(await f.arrayBuffer());
      const s = await inspectSource(rh, bytes, f.name);
      sessionFiles.rhino.set(s.sha256, { file: f, bytes, summary: s });
      setSummary(s);
    } catch (e) { notify(`Could not read ${f.name}: ${(e as Error).message}`); }
    setBusy(null);
  };
  const openPdf = async (f: File) => {
    setBusy(`Indexing ${f.name}…`);
    try {
      const { indexPdf } = await import('../ingest/pdf');
      const pages = await indexPdf(f, (d, t) => setBusy(`Indexing ${f.name}… ${d}/${t}`));
      const id = `${f.name}:${f.size}`;
      sessionFiles.pdf.set(id, f);
      await saveDoc({ id, name: f.name, size: f.size, pages, addedAt: new Date().toISOString() });
      // suggest pages for every part that has none yet
      for (const p of parts) if (!p.docs.some((d) => d.document === f.name)) await savePart({ ...p, docs: [...p.docs, ...suggestDocs(f.name, pages, p)] });
      notify(`Indexed ${pages.length} pages of ${f.name}.`);
    } catch (e) { notify(`Could not read ${f.name}: ${(e as Error).message}`); }
    setBusy(null);
  };
  const importReview = async (f: File) => {
    try {
      const r = parseReview(await f.text());
      let n = 0;
      for (const p of parts) { const q = applyReview(p, r); if (q !== p) { await savePart(q); n++; } }
      notify(`Applied review notes to ${n} part${n === 1 ? '' : 's'}.`);
    } catch (e) { notify(`Could not apply review notes: ${(e as Error).message}`); }
  };

  return (
    <div className="sources">
      <div className="sub-head">Sources</div>
      <input ref={rhinoInput} type="file" accept=".3dm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openRhino(f); e.target.value = ''; }} />
      <input ref={pdfInput} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openPdf(f); e.target.value = ''; }} />
      <input ref={reviewInput} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importReview(f); e.target.value = ''; }} />
      <div className="pad col">
        <button className="primary wide" onClick={() => rhinoInput.current?.click()} disabled={!!busy}><Icon name="cube" /> Open Rhino model</button>
        <button className="ghost wide" onClick={() => pdfInput.current?.click()} disabled={!!busy}><Icon name="file" /> Attach fabrication PDF</button>
        {busy && <div className="busy small">{busy}</div>}
      </div>
      {summary && (
        <button className={`source-card ${!selected ? 'on' : ''}`} onClick={() => setSelected(null)}>
          <b>{summary.fileName}</b>
          <span className="muted small">{summary.units} · {summary.blocks.length} blocks · {summary.layers.length} layers · {(summary.fileSize / 1e6).toFixed(1)} MB</span>
        </button>
      )}
      {docs.map((d) => (
        <div key={d.id} className="source-card static">
          <b>{d.name}</b><span className="muted small">{d.pages.length} pages indexed{sessionFiles.pdf.has(d.id) ? '' : ' · re-attach to preview'}</span>
        </div>
      ))}
      <div className="sub-head">Proposed &amp; approved parts</div>
      <div className="tree-list">
        {[...parts].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
          <button key={`${p.id}@${p.version}`} className={`tree-item ${selected === `${p.id}@${p.version}` ? 'on' : ''}`} onClick={() => setSelected(`${p.id}@${p.version}`)}>
            <span>{p.name}</span><span className={`pstate ${p.status}`}>{p.status === 'approved' ? `v${p.version} ✓` : p.status}</span>
          </button>
        ))}
        {!parts.length && <div className="note">None yet.</div>}
      </div>
      {parts.length > 0 && (
        <div className="pad col">
          <button className="text-btn" onClick={() => download(JSON.stringify(exportReview(parts), null, 2), 'maestro-review.maestro-review.json', 'application/json')}>Export review notes</button>
          <button className="text-btn" onClick={() => reviewInput.current?.click()}>Import review notes</button>
        </div>
      )}
    </div>
  );
}

function BlockSheet({ summary, onDone }: { summary: SourceSummary; onDone: (key: string) => void }) {
  const savePart = useStore((s) => s.savePart);
  const docs = useStore((s) => s.docs);
  const notify = useStore((s) => s.notify);
  const [project, setProject] = useState('');
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [cats, setCats] = useState<Record<string, KitCategory>>({});
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  const blocks = summary.blocks.filter((b) => !filter || `${b.name} ${b.description}`.toLowerCase().includes(filter.toLowerCase()));

  const extract = async () => {
    const src = sessionFiles.rhino.get(summary.sha256);
    if (!src) return;
    setBusy(true);
    try {
      const rh = await loadRhino();
      const doc = openDoc(rh, src.bytes);
      let last = '';
      for (const name of chosen) {
        const c = summary.blocks.find((b) => b.name === name)!;
        const x = extractPart(rh, doc, name);
        let p = proposePart(summary, { ...c, category: cats[name] ?? c.category }, x, project || 'Unassigned project');
        for (const d of docs) p = { ...p, docs: [...p.docs, ...suggestDocs(d.name, d.pages, p)] };
        await savePart(p);
        last = `${p.id}@${p.version}`;
      }
      doc.delete?.();
      notify(`Extracted ${chosen.size} part${chosen.size === 1 ? '' : 's'} for review.`);
      if (last) onDone(last);
    } catch (e) { notify(`Extraction failed: ${(e as Error).message}`); }
    setBusy(false);
  };

  return (
    <div className="sheet glass">
      <div className="sheet-head">
        <div>
          <h2>{summary.fileName}</h2>
          <div className="muted small">Units {summary.units} (× {summary.unitScale} to mm) · tolerance {summary.tolerance} · {summary.objectCount.toLocaleString('en-GB')} objects · {summary.materialCount} materials · sha256 <code>{summary.sha256.slice(0, 12)}…</code></div>
        </div>
        <div className="sheet-actions">
          <input className="field" placeholder="Project, e.g. Spring Expo 2027" value={project} onChange={(e) => setProject(e.target.value)} />
          <button className="primary" disabled={!chosen.size || busy} onClick={extract}>{busy ? 'Extracting…' : `Extract ${chosen.size || ''} block${chosen.size === 1 ? '' : 's'}`}</button>
        </div>
      </div>
      <p className="note">Each block definition is a candidate kit-of-parts component. Blocks used only inside other blocks are sub-assemblies: they come along with their parent. Extraction keeps the exact source geometry and makes a separate viewport mesh.</p>
      <input className="field wide" placeholder="Filter blocks" value={filter} onChange={(e) => setFilter(e.target.value)} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th /><th>Block</th><th>Category</th><th>Objects</th><th>Nested</th><th>Used in</th><th>Placed</th></tr></thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b.name} className={chosen.has(b.name) ? 'on' : ''}>
                <td><input type="checkbox" checked={chosen.has(b.name)} onChange={() => { const s = new Set(chosen); if (s.has(b.name)) s.delete(b.name); else s.add(b.name); setChosen(s); }} /></td>
                <td><div className="b-name">{b.name}</div>{b.description && <div className="b-desc">{b.description}</div>}</td>
                <td>
                  <select className="mini-select" value={cats[b.name] ?? b.category} onChange={(e) => setCats({ ...cats, [b.name]: e.target.value as KitCategory })}>
                    {Object.entries(KIT_CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </td>
                <td className="num">{b.objectCount}</td>
                <td className="small">{b.nested.join(', ')}</td>
                <td className="small">{b.usedIn.length ? b.usedIn.join(', ') : '—'}</td>
                <td className="num">{b.placements}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ReviewPanel({ part }: { part: IngestedPart }) {
  const savePart = useStore((s) => s.savePart);
  const deletePart = useStore((s) => s.deletePart);
  const add = useStore((s) => s.addToCanvas);
  const docs = useStore((s) => s.docs);
  const notify = useStore((s) => s.notify);
  const [preview, setPreview] = useState<DocLink | null>(null);
  const [newCheck, setNewCheck] = useState({ measure: 'overall width', drawing: '' });
  const ms = useMemo(() => measures(part), [part]);
  const save = (p: IngestedPart) => savePart(p);
  const setDoc = (id: string, patch: Partial<DocLink> | null) => save({ ...part, docs: patch ? part.docs.map((d) => (d.id === id ? { ...d, ...patch } : d)) : part.docs.filter((d) => d.id !== id) });
  const setCheck = (id: string, patch: Partial<DimCheck> | null) => save({ ...part, checks: patch ? part.checks.map((c) => (c.id === id ? { ...c, ...patch } : c)) : part.checks.filter((c) => c.id !== id) });
  const blockers = approvalBlockers(part);
  const locked = part.status === 'approved';

  return (
    <div className="inspector">
      <div className="insp-head">
        <div className="insp-kicker">{part.project} · {part.source.fileName}</div>
        <input className="name-input title" value={part.name} disabled={locked} onChange={(e) => save({ ...part, name: e.target.value })} />
        <div className="insp-badges"><VBadge status={locked ? 'project' : 'estimated'} /><span className={`pstate ${part.status}`}>{part.status}</span><span className="lodbadge">v{part.version}</span></div>
        <div className="insp-dims">{dims3(part.dims)}</div>
      </div>
      <div className="panel-scroll">
        <Section title="Source">
          <KV k="Block">{part.source.block}</KV>
          {part.source.derivedFrom && <KV k="Derived from">{part.source.derivedFrom}</KV>}
          {part.source.originNote && <KV k="Origin">{part.source.originNote}</KV>}
          <KV k="Units">{part.source.units} → mm</KV>
          <KV k="Category">
            <select className="mini-select" disabled={locked} value={part.category} onChange={(e) => save({ ...part, category: e.target.value as KitCategory })}>
              {Object.entries(KIT_CATEGORY_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </KV>
          <KV k="Geometry">{part.stats.breps} B-reps · {part.stats.extrusions} extrusions · {part.stats.nestedInstances} nested</KV>
          {part.stats.approximatedFaces > 0 && <p className="note">{part.stats.approximatedFaces}/{part.stats.faces} curved faces are approximated in the viewport only.</p>}
        </Section>

        <Section title="Documentation" summary={`${part.docs.filter((d) => d.origin !== 'suggested').length} confirmed · ${part.docs.filter((d) => d.origin === 'suggested').length} suggested`}>
          {!docs.length && <p className="note">Attach the fabrication deck to get page suggestions.</p>}
          {[...part.docs].sort((a, b) => Number(a.origin === 'suggested') - Number(b.origin === 'suggested')).map((d) => (
            <div key={d.id} className={`doc-row ${d.origin}`}>
              <button className="doc-open" onClick={() => setPreview(d)} title="Preview page">p. {d.page}</button>
              <div className="doc-text"><div>{d.title}</div><div className="muted small">{[d.status, d.reference, d.origin === 'suggested' && d.matched ? `matched ${d.matched.join(', ')}` : null].filter(Boolean).join(' · ')}</div></div>
              {!locked && d.origin === 'suggested' && <button className="icon-btn sm" title="Confirm" onClick={() => setDoc(d.id, { origin: 'confirmed' })}><Icon name="check" size={13} /></button>}
              {!locked && <button className="icon-btn sm" title="Remove" onClick={() => setDoc(d.id, null)}><Icon name="x" size={12} /></button>}
            </div>
          ))}
          {!locked && part.docs.some((d) => d.origin === 'suggested') && <button className="text-btn" onClick={() => save({ ...part, docs: part.docs.filter((d) => d.origin !== 'suggested') })}>Dismiss remaining suggestions</button>}
          {!locked && docs.length > 0 && <AddPage docs={docs.map((d) => d.name)} onAdd={(doc, page) => save({ ...part, docs: [...part.docs, { id: `doc-${Date.now()}`, document: doc, page, title: docs.find((x) => x.name === doc)?.pages[page - 1]?.text.slice(0, 70) ?? `Page ${page}`, origin: 'manual' }] })} />}
        </Section>

        <Section title="Dimension checks" summary={`${part.checks.filter((c) => checkState(c) === 'discrepancy').length} discrepancies`}>
          {part.checks.map((c) => {
            const state = checkState(c);
            return (
              <div key={c.id} className={`check ${state}`}>
                <div className="check-top"><b>{c.label}</b><span className={`cstate ${state}`}>{state === 'discrepancy' ? `Δ ${mm(Math.abs((c.model ?? 0) - (c.drawing ?? 0)))}` : state}</span></div>
                <div className="check-grid">
                  <span className="muted small">{c.measure}</span>
                  <span>Model {mm(c.model)}</span>
                  <label>Drawing <input type="number" disabled={locked} value={c.drawing ?? ''} placeholder="mm" onChange={(e) => setCheck(c.id, { drawing: e.target.value === '' ? null : +e.target.value, resolution: 'open' })} /></label>
                  <label>± <input type="number" disabled={locked} value={c.tolerance} onChange={(e) => setCheck(c.id, { tolerance: +e.target.value })} /></label>
                </div>
                {state === 'discrepancy' && (
                  <div className="resolve-row">
                    {(['model', 'drawing', 'noted'] as const).map((r) => (
                      <button key={r} disabled={locked} className={`chip ${c.resolution === r ? 'on' : ''}`} onClick={() => setCheck(c.id, { resolution: r })}>{r === 'model' ? 'Model governs' : r === 'drawing' ? 'Drawing governs' : 'Noted'}</button>
                    ))}
                  </div>
                )}
                {(state === 'discrepancy' || c.note) && <input className="field wide note-input" disabled={locked} placeholder="Note for the record" value={c.note ?? ''} onChange={(e) => setCheck(c.id, { note: e.target.value })} />}
                {c.resolution === 'drawing' && <p className="note">The drawing governs this dimension. The source geometry is kept as it is and the part is flagged for correction in the source model; MAESTRO never remodels it silently.</p>}
                {!locked && <button className="text-btn danger" onClick={() => setCheck(c.id, null)}>Remove check</button>}
              </div>
            );
          })}
          {!locked && (
            <div className="add-check">
              <select className="mini-select" value={newCheck.measure} onChange={(e) => setNewCheck({ ...newCheck, measure: e.target.value })}>
                {ms.map((m) => <option key={m.measure} value={m.measure}>{m.measure} ({mm(m.value)})</option>)}
              </select>
              <input type="number" placeholder="Drawing mm" value={newCheck.drawing} onChange={(e) => setNewCheck({ ...newCheck, drawing: e.target.value })} />
              <button className="ghost" onClick={() => { const m = ms.find((x) => x.measure === newCheck.measure); save(addCheck(part, newCheck.measure, newCheck.measure, m?.value ?? null, newCheck.drawing === '' ? null : +newCheck.drawing)); setNewCheck({ ...newCheck, drawing: '' }); }}>Add</button>
            </div>
          )}
        </Section>

        <Section title="Notes">
          <textarea className="field wide" rows={3} disabled={locked} value={part.notes} onChange={(e) => save({ ...part, notes: e.target.value })} placeholder="Review notes, open questions, fabricator confirmations" />
        </Section>

        <div className="pad col">
          {locked ? (
            <>
              <div className="approved">Approved {part.approvedAt?.slice(0, 10)} by {part.approvedBy}. Published to the project library as v{part.version}.</div>
              <button className="primary wide" onClick={() => add({ kind: 'ingested', id: part.id, version: part.version }, part.name)}><Icon name="plus" /> Add to canvas</button>
            </>
          ) : (
            <>
              {blockers.length > 0 && <ul className="blockers">{blockers.map((b) => <li key={b}>{b}</li>)}</ul>}
              <button className="primary wide" disabled={blockers.length > 0} onClick={async () => { try { await save(approve(part, 'Reviewer')); notify(`${part.name} approved and published to the project library.`); } catch (e) { notify((e as Error).message); } }}><Icon name="check" /> Approve &amp; publish</button>
              <button className="ghost wide" onClick={() => add({ kind: 'ingested', id: part.id, version: part.version }, part.name)}>Try on canvas (unapproved)</button>
              <button className="text-btn danger" onClick={() => deletePart(part)}>Discard proposal</button>
            </>
          )}
        </div>
      </div>
      {preview && <PagePreview link={preview} onClose={() => setPreview(null)} />}
    </div>
  );
}

function AddPage({ docs, onAdd }: { docs: string[]; onAdd: (doc: string, page: number) => void }) {
  const [doc, setDoc] = useState(docs[0]);
  const [page, setPage] = useState('');
  return (
    <div className="add-check">
      <select className="mini-select" value={doc} onChange={(e) => setDoc(e.target.value)}>{docs.map((d) => <option key={d}>{d}</option>)}</select>
      <input type="number" placeholder="Page" value={page} onChange={(e) => setPage(e.target.value)} />
      <button className="ghost" disabled={!page} onClick={() => { onAdd(doc, +page); setPage(''); }}>Link page</button>
    </div>
  );
}

function PagePreview({ link, onClose }: { link: DocLink; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = [...sessionFiles.pdf.entries()].find(([k]) => k.startsWith(`${link.document}:`))?.[1];
  const [err, setErr] = useState<string | null>(file ? null : 'Re-attach the PDF in this session to preview its pages.');
  useEffect(() => {
    if (!file || !canvas.current) return;
    import('../ingest/pdf').then(({ renderPage }) => renderPage(file, link.page, canvas.current!, Math.min(1100, window.innerWidth - 120))).catch((e) => setErr(String(e)));
  }, [file, link.page]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body glass" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>{link.document} · page {link.page}</b><button className="icon-btn" onClick={onClose}><Icon name="x" /></button></div>
        {err ? <p className="note">{err}</p> : <canvas ref={canvas} />}
      </div>
    </div>
  );
}
