import { useEffect, useMemo, useRef, useState } from 'react';
import { KIT_CATEGORY_LABEL, type KitCategory } from '../core/schema';
import { resolveRef } from '../core/library';
import { ProductViewer, type DimLabel } from '../viewport/ProductViewer';
import { addCheck, approvalBlockers, approve, checkState, measures, suggestDocs } from '../ingest/pipeline';
import { inspectSource, openDoc, type SourceSummary } from '../ingest/rhino';
import { download, loadRhino } from '../ingest/rhinoBrowser';
import type { DimCheck, DocLink, IngestedPart } from '../ingest/types';
import { applyReview, exportReview, parseReview } from '../ingest/review';
import { kitCandidates, planBatch, reviseFromSource, runBatch, type BatchResult, type PlanState } from '../ingest/batch';
import { exportBundle, readBundle } from '../ingest/bundle';
import { approveReady, checkAll, confirmPage, drawingGroups, sharedMeasures, type DrawingGroup } from '../ingest/groupReview';
import { CHANGE_LABEL, blockPrints, diffCsv, diffSources, libraryImpact, type Change, type DiffRow, type SourcePrint } from '../ingest/revision';
import { Icon, KV, Section, VBadge, dims3, mm } from './common';
import { useStore } from './store';

/** Files opened in this session. They are read in the browser and never stored or sent; only extracted parts are kept. */
const sessionFiles = { rhino: new Map<string, { file: File; bytes: Uint8Array; summary: SourceSummary; prints: SourcePrint | null }>(), pdf: new Map<string, File>() };

/** two versions of a source model being compared */
interface Revision { from: SourceSummary; to: SourceSummary; rows: DiffRow[] }

export function Ingest() {
  const parts = useStore((s) => s.parts);
  const [summary, setSummary] = useState<SourceSummary | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [revision, setRevision] = useState<Revision | null>(null);
  const [groupKey, setGroupKey] = useState<string | null>(null);
  const groups = useMemo(() => drawingGroups(parts), [parts]);
  // the open group keeps its approved parts, so the sheet shows what happened to each
  const group = useMemo(() => (groupKey ? drawingGroups(parts, true).find((g) => g.key === groupKey) ?? null : null), [parts, groupKey]);
  const part = parts.find((p) => `${p.id}@${p.version}` === selected) ?? null;
  const shape = useMemo(() => (part ? resolveRef({ kind: 'ingested', id: part.id, version: part.version }, parts)?.shape ?? null : null), [part, parts]);
  const dims = part ? (part.dims.map((v) => ({ value: v, status: part.status === 'approved' ? 'project' : 'estimated' })) as [DimLabel, DimLabel, DimLabel]) : undefined;
  return (
    <>
      {part ? <ProductViewer shape={shape} dims={dims} partNames={part.mesh.map((m) => m.material)} /> : <div className="viewer blank" />}
      <aside className="panel left glass"><SourcesPanel summary={summary} setSummary={(s) => { setSummary(s); setSelected(null); setRevision(null); setGroupKey(null); }} selected={selected} setSelected={(k) => { setSelected(k); if (k) { setRevision(null); setGroupKey(null); } }} onRevision={(r) => { setRevision(r); setSelected(null); setGroupKey(null); }} revision={revision} groups={groups} groupKey={groupKey} onGroup={(k) => { setGroupKey(k); setSelected(null); setRevision(null); }} /></aside>
      {group && !part && <GroupSheet group={group} onClose={() => setGroupKey(null)} onOpen={(k) => setSelected(k)} />}
      {revision && !part && !group && <RevisionSheet rev={revision} onClose={() => setRevision(null)} onOpen={(k) => setSelected(k)} />}
      {summary && !part && !revision && !group && <BlockSheet summary={summary} onDone={(k) => setSelected(k)} />}
      {!summary && !part && !group && <IngestIntro />}
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

function SourcesPanel({ summary, setSummary, selected, setSelected, revision, onRevision, groups, groupKey, onGroup }: { summary: SourceSummary | null; setSummary: (s: SourceSummary | null) => void; selected: string | null; setSelected: (k: string | null) => void; revision: Revision | null; onRevision: (r: Revision) => void; groups: DrawingGroup[]; groupKey: string | null; onGroup: (k: string) => void }) {
  const parts = useStore((s) => s.parts);
  const docs = useStore((s) => s.docs);
  const saveDoc = useStore((s) => s.saveDoc);
  const savePart = useStore((s) => s.savePart);
  const notify = useStore((s) => s.notify);
  const [busy, setBusy] = useState<string | null>(null);
  const rhinoInput = useRef<HTMLInputElement>(null);
  const pdfInput = useRef<HTMLInputElement>(null);
  const reviewInput = useRef<HTMLInputElement>(null);
  const revisionInput = useRef<HTMLInputElement>(null);
  const bundleInput = useRef<HTMLInputElement>(null);

  const openRhino = async (f: File) => {
    setBusy(`Reading ${f.name}…`);
    try {
      const rh = await loadRhino();
      const bytes = new Uint8Array(await f.arrayBuffer());
      const s = await inspectSource(rh, bytes, f.name);
      setBusy(`Fingerprinting ${s.blocks.length} blocks…`);
      const prints = fingerprint(rh, bytes, f.name);
      sessionFiles.rhino.set(s.sha256, { file: f, bytes, summary: s, prints });
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
  const openRevision = async (f: File) => {
    if (!summary) return;
    const base = sessionFiles.rhino.get(summary.sha256);
    setBusy(`Comparing ${f.name}…`);
    try {
      const rh = await loadRhino();
      const bytes = new Uint8Array(await f.arrayBuffer());
      const s = await inspectSource(rh, bytes, f.name);
      const prints = fingerprint(rh, bytes, f.name);
      sessionFiles.rhino.set(s.sha256, { file: f, bytes, summary: s, prints });
      if (!base?.prints || !prints) throw new Error('One of the files could not be fingerprinted.');
      onRevision({ from: summary, to: s, rows: diffSources(base.prints, prints) });
    } catch (e) { notify(`Could not compare ${f.name}: ${(e as Error).message}`); }
    setBusy(null);
  };
  const importBundle = async (f: File) => {
    try {
      const r = readBundle(await f.text(), parts, f.name);
      for (const p of r.add) await savePart(p);
      const extra = [r.same.length ? `${r.same.length} already here` : '', r.conflicts.length ? `${r.conflicts.length} kept as they are here because the bundle’s version differs (${r.conflicts.map((c) => `${c.local.name} v${c.local.version}`).join(', ')})` : '', r.damaged.length ? `${r.damaged.length} damaged and skipped` : ''].filter(Boolean).join('; ');
      notify(`Added ${r.add.length} part${r.add.length === 1 ? '' : 's'} from ${f.name}.${extra ? ` ${extra}.` : ''}`);
    } catch (e) { notify((e as Error).message); }
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
      <input ref={revisionInput} type="file" accept=".3dm" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) openRevision(f); e.target.value = ''; }} />
      <input ref={bundleInput} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importBundle(f); e.target.value = ''; }} />
      <div className="pad col">
        <button className="primary wide" onClick={() => rhinoInput.current?.click()} disabled={!!busy}><Icon name="cube" /> Open Rhino model</button>
        <button className="ghost wide" onClick={() => pdfInput.current?.click()} disabled={!!busy}><Icon name="file" /> Attach fabrication PDF</button>
        {busy && <div className="busy small">{busy}</div>}
      </div>
      {summary && (
        <button className={`source-card ${!selected && !revision ? 'on' : ''}`} onClick={() => setSummary(summary)}>
          <b>{summary.fileName}</b>
          <span className="muted small">{summary.units} · {summary.blocks.length} blocks · {summary.layers.length} layers · {(summary.fileSize / 1e6).toFixed(1)} MB</span>
        </button>
      )}
      {revision && (
        <div className={`source-card ${!selected ? 'on' : ''}`}>
          <b>Compared with {revision.to.fileName}</b>
          <span className="muted small">{revision.rows.filter((r) => r.change !== 'unchanged').length} of {revision.rows.length} blocks differ</span>
        </div>
      )}
      {summary && <div className="pad col"><button className="ghost wide" onClick={() => revisionInput.current?.click()} disabled={!!busy} title="Open a later version of this model and see what changed, block by block">Compare with a revision…</button></div>}
      {docs.map((d) => (
        <div key={d.id} className="source-card static">
          <b>{d.name}</b><span className="muted small">{d.pages.length} pages indexed{sessionFiles.pdf.has(d.id) ? '' : ' · re-attach to preview'}</span>
        </div>
      ))}
      {groups.length > 0 && (
        <>
          <div className="sub-head">Review together</div>
          <div className="tree-list">
            {groups.map((g) => (
              <button key={g.key} className={`tree-item ${groupKey === g.key ? 'on' : ''}`} onClick={() => onGroup(g.key)} title={`${g.parts.length} proposed parts are linked to ${g.document}, page ${g.page}`}>
                <span>{g.document} · p.{g.page}</span><span className="pstate proposed">{g.parts.length} parts</span>
              </button>
            ))}
          </div>
        </>
      )}
      <div className="sub-head">Proposed &amp; approved parts</div>
      <div className="tree-list">
        {[...parts].sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
          <button key={`${p.id}@${p.version}`} className={`tree-item ${selected === `${p.id}@${p.version}` ? 'on' : ''}`} onClick={() => setSelected(`${p.id}@${p.version}`)}>
            <span>{p.name}</span><span className={`pstate ${p.status}`}>{p.status === 'approved' ? `v${p.version} ✓` : p.status}</span>
          </button>
        ))}
        {!parts.length && <div className="note">None yet.</div>}
      </div>
      <div className="pad col">
        {parts.length > 0 && <button className="text-btn" onClick={() => download(JSON.stringify(exportReview(parts), null, 2), 'maestro-review.maestro-review.json', 'application/json')}>Export review notes</button>}
        {parts.length > 0 && <button className="text-btn" onClick={() => reviewInput.current?.click()}>Import review notes</button>}
        {parts.some((p) => p.status === 'approved') && <button className="text-btn" onClick={() => { const b = exportBundle(parts, `MAESTRO library ${new Date().toISOString().slice(0, 10)}`, { app: __APP_VERSION__ }); download(JSON.stringify(b), `${b.name.replace(/\s+/g, '-')}.maestro-library.json`, 'application/json'); notify(`Bundled ${b.parts.length} approved part${b.parts.length === 1 ? '' : 's'}. Share it through the project’s private storage, never the public repository.`); }}>Export library bundle</button>}
        <button className="text-btn" onClick={() => bundleInput.current?.click()}>Import library bundle</button>
        <p className="note">A bundle carries approved parts with their source geometry, so a teammate can use them without the original model. It is project material: keep it in private storage.</p>
      </div>
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

  const parts = useStore((s) => s.parts);
  const [progress, setProgress] = useState<string | null>(null);
  const [results, setResults] = useState<BatchResult[] | null>(null);
  const prints = sessionFiles.rhino.get(summary.sha256)?.prints ?? null;
  const plan = useMemo(() => new Map(planBatch(summary, prints, summary.blocks.map((b) => b.name), parts).map((r) => [r.block, r])), [summary, prints, parts]);

  const extract = async () => {
    const src = sessionFiles.rhino.get(summary.sha256);
    if (!src) return;
    setBusy(true);
    setResults(null);
    try {
      const rh = await loadRhino();
      const doc = openDoc(rh, src.bytes);
      const rows = [...chosen].map((n) => plan.get(n)!).filter(Boolean);
      const res = await runBatch(rh, doc, summary, rows, project || 'Unassigned project', {
        docs, categories: cats,
        // let the browser paint the progress line between blocks
        onProgress: async (d, t, b) => { setProgress(b ? `Extracting ${d + 1} of ${t}: ${b}` : null); await new Promise((r) => setTimeout(r, 0)); },
      });
      doc.delete?.();
      for (const r of res) if (r.part) await savePart(r.part);
      setResults(res);
      const ok = res.filter((r) => r.ok);
      notify(`Extracted ${ok.length} part${ok.length === 1 ? '' : 's'} for review${res.length > ok.length ? `; ${res.length - ok.length} skipped or failed` : ''}.`);
      if (ok.length === 1) onDone(`${ok[0].part!.id}@${ok[0].part!.version}`);
      setChosen(new Set());
    } catch (e) { notify(`Extraction failed: ${(e as Error).message}`); }
    setProgress(null);
    setBusy(false);
  };
  const candidates = kitCandidates(summary);

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
      <div className="batch-bar">
        <input className="field" placeholder="Filter blocks" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <button className="ghost" onClick={() => setChosen(new Set(candidates.filter((n) => plan.get(n)?.state === 'new')))} title="Blocks placed in the model or not used inside another block, that the library does not hold yet">Select new kit candidates ({candidates.filter((n) => plan.get(n)?.state === 'new').length})</button>
        <button className="ghost" onClick={() => setChosen(new Set(blocks.map((b) => b.name)))} disabled={!blocks.length}>Select shown</button>
        <button className="ghost" onClick={() => setChosen(new Set())} disabled={!chosen.size}>Clear</button>
      </div>
      {progress && <div className="busy small">{progress}</div>}
      {results && results.some((r) => !r.ok) && (
        <div className="batch-report">
          <b>{results.filter((r) => r.ok).length} extracted · {results.filter((r) => r.skipped).length} skipped · {results.filter((r) => r.error).length} failed</b>
          {results.filter((r) => !r.ok).map((r) => <div key={r.block} className={`small ${r.error ? 'bad' : 'muted'}`}>{r.block}: {r.error ?? r.skipped}</div>)}
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th /><th>Block</th><th>Library</th><th>Category</th><th>Objects</th><th>Nested</th><th>Used in</th><th>Placed</th></tr></thead>
          <tbody>
            {blocks.map((b) => (
              <tr key={b.name} className={chosen.has(b.name) ? 'on' : ''}>
                <td><input type="checkbox" checked={chosen.has(b.name)} onChange={() => { const s = new Set(chosen); if (s.has(b.name)) s.delete(b.name); else s.add(b.name); setChosen(s); }} /></td>
                <td><div className="b-name">{b.name}</div>{b.description && <div className="b-desc">{b.description}</div>}</td>
                <td>{(() => { const r = plan.get(b.name); return r && r.state !== 'new' ? <span className={`pstate ${STATE_CLASS[r.state]}`} title={r.note}>{STATE_LABEL[r.state]}</span> : null; })()}</td>
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

const STATE_LABEL: Record<PlanState, string> = { new: 'new', 'in-library': 'in library', 'same-geometry': 'same geometry', duplicate: 'duplicate' };
const STATE_CLASS: Record<PlanState, string> = { new: 'proposed', 'in-library': 'approved', 'same-geometry': 'approved', duplicate: 'rejected' };

/** fingerprints for a whole model, or null if this one cannot be read that way */
function fingerprint(rh: unknown, bytes: Uint8Array, name: string): SourcePrint | null {
  try {
    const doc = openDoc(rh, bytes);
    try { return blockPrints(rh, doc, name); } finally { doc.delete?.(); }
  } catch { return null; }
}

const CHANGE_FILTERS: Change[] = ['changed', 'nested', 'renamed', 'added', 'removed', 'described', 'unchanged'];

function RevisionSheet({ rev, onClose, onOpen }: { rev: Revision; onClose: () => void; onOpen: (key: string) => void }) {
  const parts = useStore((s) => s.parts);
  const savePart = useStore((s) => s.savePart);
  const notify = useStore((s) => s.notify);
  const [show, setShow] = useState<Set<Change>>(new Set(CHANGE_FILTERS.filter((c) => c !== 'unchanged')));
  const [busy, setBusy] = useState<string | null>(null);
  const counts = new Map<Change, number>();
  for (const r of rev.rows) counts.set(r.change, (counts.get(r.change) ?? 0) + 1);
  const impact = useMemo(() => libraryImpact(rev.rows, parts, rev.from.fileName), [rev, parts]);
  const pending = (id: string) => parts.some((p) => p.id === id && p.status === 'proposed' && p.source.sha256 === rev.to.sha256);
  const proposeRevision = async (p: IngestedPart, block: string) => {
    const src = sessionFiles.rhino.get(rev.to.sha256);
    if (!src) return;
    setBusy(p.id);
    try {
      const rh = await loadRhino();
      const doc = openDoc(rh, src.bytes);
      const next = reviseFromSource(rh, doc, rev.to, src.prints, p, block);
      doc.delete?.();
      await savePart(next);
      notify(`${p.name} v${next.version} proposed from ${rev.to.fileName}. v${p.version} stays in use until it is approved.`);
      onOpen(`${next.id}@${next.version}`);
    } catch (e) { notify(`Could not revise ${p.name}: ${(e as Error).message}`); }
    setBusy(null);
  };
  const toCsv = () => {
    const a = sessionFiles.rhino.get(rev.from.sha256)?.prints, b = sessionFiles.rhino.get(rev.to.sha256)?.prints;
    if (a && b) download(diffCsv(a, b, rev.rows), `${rev.to.fileName.replace(/\.3dm$/i, '')}.revision.csv`, 'text/csv');
  };
  const rows = rev.rows.filter((r) => show.has(r.change));
  return (
    <div className="sheet glass">
      <div className="sheet-head">
        <div>
          <h2>{rev.from.fileName} → {rev.to.fileName}</h2>
          <div className="muted small">{rev.rows.length} blocks compared by exact geometry, nested blocks included · units {rev.from.units}{rev.to.units !== rev.from.units ? ` → ${rev.to.units}` : ''}</div>
        </div>
        <div className="sheet-actions">
          <button className="ghost" onClick={toCsv}>Report .csv</button>
          <button className="ghost" onClick={onClose}>Back to blocks</button>
        </div>
      </div>
      {impact.length > 0 && (
        <div className="impact">
          <div className="sub-head">Library parts affected</div>
          {impact.map((i) => (
            <div key={i.part.id} className="impact-row">
              <div><b>{i.part.name}</b> <span className="muted small">v{i.part.version} · {i.part.status} · from {i.part.source.block}</span><div className="small muted">{i.row.detail}</div></div>
              {i.action === 'revise' && (pending(i.part.id)
                ? <span className="pstate proposed">revision proposed</span>
                : <button className="primary" disabled={busy === i.part.id} onClick={() => proposeRevision(i.part, i.row.name)}>{busy === i.part.id ? 'Extracting…' : `Propose v${i.part.version + 1}`}</button>)}
              {i.action === 'relink' && <button className="ghost" onClick={() => savePart({ ...i.part, source: { ...i.part.source, block: i.row.name, revision: rev.to.fileName } }).then(() => notify(`${i.part.name} now points at ${i.row.name}; its geometry is unchanged.`))}>Follow rename</button>}
              {i.action === 'orphaned' && <span className="pstate rejected" title="The block is gone from the revision; the part stays in the library as it is">source removed</span>}
            </div>
          ))}
          <p className="note">A revised block becomes a new proposed version with fresh dimension checks; the approved version stays in use until the new one is reviewed and approved.</p>
        </div>
      )}
      <div className="chip-row">
        {CHANGE_FILTERS.map((c) => (
          <button key={c} className={`chip ${show.has(c) ? 'on' : ''}`} disabled={!counts.get(c)} onClick={() => { const n = new Set(show); if (n.has(c)) n.delete(c); else n.add(c); setShow(n); }}>{CHANGE_LABEL[c]} {counts.get(c) ?? 0}</button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Block</th><th>Change</th><th>Before</th><th>After</th><th>Δ W × D × H</th><th>Detail</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.change}:${r.name}`}>
                <td><div className="b-name">{r.name}</div>{r.from && <div className="b-desc">was {r.from}</div>}</td>
                <td><span className={`chg ${r.change}`}>{CHANGE_LABEL[r.change]}</span></td>
                <td className="small">{r.before ? dims3(r.before.dims) : '—'}</td>
                <td className="small">{r.after ? dims3(r.after.dims) : '—'}</td>
                <td className="small num">{r.delta && r.delta.some((d) => Math.abs(d) > 0.05) ? r.delta.map((d) => (d > 0 ? `+${d}` : `${d}`)).join(' × ') : ''}</td>
                <td className="small">{r.detail}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted small">Nothing to show with these filters.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** review the proposed parts that share one drawing page in a single pass; each part still has to clear the usual approval rules */
function GroupSheet({ group, onClose, onOpen }: { group: DrawingGroup; onClose: () => void; onOpen: (key: string) => void }) {
  const savePart = useStore((s) => s.savePart);
  const notify = useStore((s) => s.notify);
  // only proposed parts are changed; approved ones are shown as they are
  const open = useMemo(() => group.parts.filter((p) => p.status === 'proposed'), [group.parts]);
  const shared = useMemo(() => sharedMeasures(group.parts), [group.parts]);
  const [measure, setMeasure] = useState(shared[0] ?? '');
  const [drawing, setDrawing] = useState('');
  const [tolerance, setTolerance] = useState('2');
  const [blocked, setBlocked] = useState<{ name: string; blockers: string[] }[]>([]);
  const m = shared.includes(measure) ? measure : shared[0] ?? '';
  const value = Number(drawing);
  const saveAll = async (ps: IngestedPart[]) => { for (const p of ps) await savePart(p); };

  const confirm = async () => {
    await saveAll(confirmPage(group, open));
    notify(`Confirmed ${group.document} p.${group.page} for ${open.length} part${open.length === 1 ? '' : 's'}.`);
  };
  const check = async () => {
    const r = checkAll(group, open, m, value, Number(tolerance) || 0);
    await saveAll(r.parts);
    notify(`Compared ${m} with ${value} mm on ${r.parts.length} part${r.parts.length === 1 ? '' : 's'}.${r.skipped.length ? ` ${r.skipped.length} had no such measure.` : ''}`);
  };
  const approveAll = async () => {
    const r = approveReady(open, 'Reviewer');
    await saveAll(r.approved);
    setBlocked(r.blocked.map((b) => ({ name: b.part.name, blockers: b.blockers })));
    notify(`Approved ${r.approved.length} part${r.approved.length === 1 ? '' : 's'}.${r.blocked.length ? ` ${r.blocked.length} still blocked.` : ''}`);
  };

  return (
    <div className="sheet glass">
      <div className="sheet-head">
        <div>
          <h2>{group.document} · page {group.page}</h2>
          <div className="muted small">{group.title}{group.reference ? ` · ${group.reference}` : ''} · {open.length} of {group.parts.length} parts still proposed · page confirmed on {group.confirmed}</div>
        </div>
        <div className="sheet-actions">
          <button className="ghost" onClick={onClose}>Close</button>
        </div>
      </div>
      <p className="note">These parts all point at the same drawing page. Confirm the page and compare a shared dimension for all of them at once, then approve the ones that are clear. Each part still has to meet the usual rules on its own: a discrepancy on one part blocks only that part.</p>
      <div className="batch-bar">
        <button className="ghost" onClick={confirm} disabled={!open.some((p) => p.docs.some((d) => d.document === group.document && d.page === group.page && d.origin === 'suggested'))}>Confirm page for all</button>
        <select className="mini-select" value={m} onChange={(e) => setMeasure(e.target.value)} disabled={!shared.length} aria-label="Measure">
          {shared.map((x) => <option key={x} value={x}>{x}</option>)}
        </select>
        <input className="field num-field" inputMode="decimal" placeholder="Drawing mm" value={drawing} onChange={(e) => setDrawing(e.target.value)} aria-label="Drawing value in mm" />
        <input className="field num-field" inputMode="decimal" value={tolerance} onChange={(e) => setTolerance(e.target.value)} aria-label="Tolerance in mm" title="Tolerance, mm" />
        <button className="ghost" onClick={check} disabled={!open.length || !m || !drawing || !Number.isFinite(value)}>Check all</button>
        <button className="primary" onClick={approveAll} disabled={!open.length}>Approve ready parts</button>
      </div>
      {blocked.length > 0 && (
        <div className="batch-report">
          <b>{blocked.length} part{blocked.length === 1 ? '' : 's'} still blocked</b>
          {blocked.map((b) => <div key={b.name} className="small bad">{b.name}: {b.blockers.join(' ')}</div>)}
        </div>
      )}
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Part</th><th>Page</th><th>{m || 'Measure'}</th><th>Drawing</th><th>Check</th><th>Status</th></tr></thead>
          <tbody>
            {group.parts.map((p) => {
              const link = p.docs.find((d) => d.document === group.document && d.page === group.page);
              const mv = measures(p).find((x) => x.measure === m)?.value;
              const c = p.checks.find((x) => x.measure === m && x.docLinkId === link?.id) ?? p.checks.find((x) => x.measure === m);
              const st = c ? checkState(c) : 'missing';
              const b = p.status === 'approved' ? [] : approvalBlockers(p);
              return (
                <tr key={`${p.id}@${p.version}`}>
                  <td><button className="text-btn" onClick={() => onOpen(`${p.id}@${p.version}`)}>{p.name}</button></td>
                  <td className="small">{link?.origin === 'suggested' ? 'suggested' : 'confirmed'}</td>
                  <td className="num">{mv != null ? mm(mv) : '—'}</td>
                  <td className="num">{c?.drawing != null ? mm(c.drawing) : '—'}</td>
                  <td><span className={`pstate ${st === 'match' ? 'approved' : st === 'discrepancy' ? (c?.resolution === 'open' ? 'rejected' : 'approved') : 'proposed'}`}>{st === 'discrepancy' && c?.resolution !== 'open' ? 'resolved' : st}</span></td>
                  <td className="small">{p.status === 'approved' ? <span className="pstate approved">v{p.version} ✓</span> : b.length ? <span className="muted" title={b.join(' ')}>{b.length} to do</span> : '✓ ready'}</td>
                </tr>
              );
            })}
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
          {part.source.revision && <KV k="Revision">{part.source.revision}</KV>}
          {part.supersedes && <KV k="Replaces">v{part.supersedes}</KV>}
          {part.sharedFrom && <KV k="Shared from">{part.sharedFrom.bundle}{part.sharedFrom.by ? ` · ${part.sharedFrom.by}` : ''}</KV>}
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
