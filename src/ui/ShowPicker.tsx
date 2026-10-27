import { useEffect, useMemo, useRef, useState } from 'react';
import { plotOutline } from '../core/booth';
import { sampleExhibition } from '../core/exhibitionSample';
import { showsOf, type ShowPreset } from '../core/showPresets';
import type { Composition, Placement } from '../core/schema';
import type { IngestedPart } from '../ingest/types';
import { Icon } from './common';
import { extentOf, useStore } from './store';

const SAMPLES = 'Samples';
const MINE = 'Mine';

/**
 * Show presets: the booths the team has built, by show, to start an exhibition from. A category row and a
 * thumbnail grid, as in Stagework. The published shows ship with the site; more load from a presets file.
 */
export function ShowPicker() {
  const comp = useStore((s) => s.comp);
  const presets = useStore((s) => s.showPresets);
  const parts = useStore((s) => s.parts);
  const savedComps = useStore((s) => s.savedComps);
  const start = useStore((s) => s.startShowPreset);
  const loadFile = useStore((s) => s.loadShowPresets);
  const clear = useStore((s) => s.clearShowPresets);
  const loadSample = useStore((s) => s.loadSampleBooth);
  const openComp = useStore((s) => s.openComp);
  const [open, setOpen] = useState(false);
  const current = presets.find((p) => p.id === comp.presetId);
  const shows = showsOf(presets);
  const [cat, setCat] = useState<string>(current?.show ?? shows[0] ?? SAMPLES);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sample = useMemo(() => sampleExhibition(), []);
  const mine = savedComps.filter((c) => c.kind === 'exhibition');

  // a presets file just loaded: show its first show
  const firstShow = shows[0];
  useEffect(() => { if (firstShow) setCat((c) => (c === SAMPLES ? firstShow : c)); }, [firstShow]);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', esc);
    return () => { window.removeEventListener('pointerdown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  const pickFile = async (f: File) => { await loadFile(await f.text()); };
  const label = current ? current.show : 'Show preset';
  const tabs = [...shows, SAMPLES, MINE];
  const list = presets.filter((p) => p.show === cat);

  return (
    <div className="preset-wrap" ref={wrapRef}>
      <button className={`preset-btn ${open ? 'on' : ''}`} title="Start from a booth the team has built" onClick={() => { setCat(current?.show ?? (tabs.includes(cat) ? cat : tabs[0])); setOpen(!open); }}>
        <span className="preset-btn-cat">{label}</span>
        <span className="preset-btn-name">{current ? current.name : comp.name}</span>
        <Icon name="chevron" />
      </button>
      {open && (
        <div className="preset-menu glass" role="dialog" aria-label="Show presets">
          <nav className="segmented sm" aria-label="Show">
            {tabs.map((t) => <button key={t} className={cat === t ? 'on' : ''} onClick={() => setCat(t)}>{t}</button>)}
          </nav>
          {cat === SAMPLES && (
            <>
              <p className="preset-blurb">A synthetic booth to try the tools on. Its plot, limits and service points are placeholders.</p>
              <div className="preset-grid">
                <button className="preset-card" onClick={() => { loadSample(); setOpen(false); }}>
                  <PlanThumb comp={sample} parts={parts} />
                  <span className="preset-name">{sample.name}</span>
                  <span className="preset-sum">Corner plot, two open sides, six modules</span>
                </button>
              </div>
            </>
          )}
          {cat === MINE && (
            <div className="preset-mine">
              {!mine.length && <p className="preset-blurb">No exhibitions saved in this browser yet.</p>}
              {mine.map((c) => (
                <button key={c.id} className="preset-mine-row" onClick={() => { openComp(c); setOpen(false); }}>
                  <span>{c.name}</span><span className="muted small">{new Date(c.updatedAt).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          )}
          {cat !== SAMPLES && cat !== MINE && (
            <div className="preset-grid">
              {list.map((p) => (
                <button key={p.id} className={`preset-card ${p.id === comp.presetId ? 'on' : ''}`} title={p.sources.length ? `From ${p.sources.join('; ')}` : undefined} onClick={() => { start(p); setOpen(false); }}>
                  <PlanThumb comp={p.comp} parts={parts} />
                  <span className="preset-name">{p.name}{p.edition ? ` · ${p.edition}` : ''}</span>
                  <span className="preset-sum">{p.summary}</span>
                </button>
              ))}
            </div>
          )}
          {cat !== SAMPLES && cat !== MINE && list.some((p) => p.builtIn) && (
            <p className="preset-blurb">As built, from the show's Rhino model. Parts not yet checked against the fabrication drawings are marked Estimated.</p>
          )}
          {!presets.length && cat !== MINE && (
            <p className="preset-blurb">No show presets yet. Load a <span className="mono">.maestro-shows.json</span> file to add booths here. It stays in this browser.</p>
          )}
          <div className="preset-foot">
            <button className="ghost" onClick={() => fileRef.current?.click()}>Load show presets…</button>
            {presets.some((p) => !p.builtIn) && <button className="ghost" onClick={clear}>Remove loaded presets</button>}
          </div>
          <input ref={fileRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }} />
        </div>
      )}
    </div>
  );
}

/** a small plan of a booth: the plot outline and each item's footprint */
export function PlanThumb({ comp, parts }: { comp: Composition; parts: IngestedPart[] }) {
  const b = comp.booth;
  if (!b) return <span className="preset-thumb" />;
  const o = plotOutline(b);
  const xs = o.map((p) => p[0]), ys = o.map((p) => p[1]);
  const pad = Math.max(b.width.value, b.depth.value) * 0.04;
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  // plan view: +Y (back) up, so flip y
  const pts = o.map(([x, y]) => `${x},${-y}`).join(' ');
  // a part this browser has not fetched yet is drawn from the size recorded when it was placed
  const boxes = comp.items.map((p) => ({ id: p.id, e: extentOf(p, parts) ?? snapshotExtent(p) }));
  return (
    <span className="preset-thumb">
      <svg viewBox={`${x0} ${-y1} ${x1 - x0} ${y1 - y0}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
        <polygon points={pts} className="pt-plot" />
        {boxes.map(({ id, e }) => <rect key={id} x={e.min[0]} y={-e.max[1]} width={e.max[0] - e.min[0]} height={e.max[1] - e.min[1]} className="pt-item" />)}
        {(b.columns ?? []).map((k) => <rect key={k.id} x={k.x - k.w / 2} y={-k.y - k.d / 2} width={k.w} height={k.d} className="pt-col" />)}
      </svg>
    </span>
  );
}

function snapshotExtent(p: Placement) {
  const a = (p.rotation * Math.PI) / 180, w = p.snapshot.width / 2, d = p.snapshot.depth / 2;
  const hx = Math.abs(w * Math.cos(a)) + Math.abs(d * Math.sin(a)), hy = Math.abs(w * Math.sin(a)) + Math.abs(d * Math.cos(a));
  return { min: [p.position[0] - hx, p.position[1] - hy, 0], max: [p.position[0] + hx, p.position[1] + hy, 0] };
}

export type { ShowPreset };
