import { Component, useEffect, useState, type ReactNode } from 'react';
import { Compose } from './Compose';
import { Discover } from './Discover';
import { Ingest } from './Ingest';
import { Niches } from './Niches';
import { Present } from './Present';
import { ShowPicker } from './ShowPicker';
import { Icon } from './common';
import { exportCompositionFile, saveCompositionJson } from './exportActions';
import { useStore, type Workspace } from './store';

export const APP_LABEL = `MAESTRO ${__APP_VERSION__} · build ${__APP_BUILD__}`;

export function App() {
  const workspace = useStore((s) => s.workspace);
  const loadPrivate = useStore((s) => s.loadPrivate);
  const loadBuiltInShows = useStore((s) => s.loadBuiltInShows);
  const [about, setAbout] = useState(false);
  useEffect(() => { loadPrivate(); loadBuiltInShows(); }, [loadPrivate, loadBuiltInShows]);
  return (
    <div className={`app ws-${workspace}`}>
      <Toolbar onAbout={() => setAbout(true)} />
      <Guard key={workspace} area={workspace}>
        {workspace === 'discover' && <Discover />}
        {(workspace === 'compose' || workspace === 'exhibition') && <Compose />}
        {workspace === 'niches' && <Niches />}
        {workspace === 'present' && <Present />}
        {workspace === 'ingest' && <Ingest />}
      </Guard>
      {about && <About onClose={() => setAbout(false)} />}
      <Toast />
    </div>
  );
}

const TABS: { id: Workspace; label: string; title?: string }[] = [
  { id: 'discover', label: 'Discover' },
  { id: 'compose', label: 'Compose', title: 'Compose demo modules' },
  { id: 'exhibition', label: 'Exhibition', title: 'Lay modules out on a booth and check circulation and services' },
  { id: 'niches', label: 'Niches', title: 'Build hardware niches from a show’s placement rules: sizes, label positions, dimensions' },
  { id: 'present', label: 'Present', title: 'Views, stills, document links and the client view' },
  { id: 'ingest', label: 'Import' },
];

function Toolbar({ onAbout }: { onAbout: () => void }) {
  const workspace = useStore((s) => s.workspace);
  const setWorkspace = useStore((s) => s.setWorkspace);
  const comp = useStore((s) => s.comp);
  const parts = useStore((s) => s.parts);
  const notify = useStore((s) => s.notify);
  const [busy, setBusy] = useState(false);
  const exportModule = async () => {
    setBusy(true);
    try { notify(await exportCompositionFile(comp, parts)); } catch (e) { notify(`Export failed: ${(e as Error).message}`); }
    setBusy(false);
  };
  return (
    <header className="toolbar glass">
      <div className="tb-group">
        <button className="logo" onClick={onAbout} title="About MAESTRO"><span className="logo-mark" />MAESTRO</button>
        <span className="tb-sep" />
        <nav className="segmented" aria-label="Workspace">
          {TABS.map((t) => (
            <button key={t.id} className={workspace === t.id ? 'on' : ''} title={t.title} onClick={() => setWorkspace(t.id)}>{t.label}</button>
          ))}
        </nav>
      </div>
      <div className="tb-group">
        {workspace === 'exhibition' && <ShowPicker />}
        {(workspace === 'compose' || workspace === 'exhibition') && (
          <>
            <button className="ghost" onClick={() => saveCompositionJson(comp)} disabled={!comp.items.length}>Save .json</button>
            <button className="primary" onClick={exportModule} disabled={!comp.items.length || busy}><Icon name="download" /> {busy ? 'Exporting…' : 'Export .3dm'}</button>
          </>
        )}
        {workspace === 'present' && <span className="tb-note">Concept visualisation · not for construction</span>}
        {workspace === 'niches' && <span className="tb-note">Placement rules: GTC Berlin 2026</span>}
        {workspace !== 'compose' && workspace !== 'exhibition' && workspace !== 'present' && workspace !== 'niches' && <span className="tb-note">{parts.filter((p) => p.status === 'approved').length} project parts in this browser</span>}
      </div>
    </header>
  );
}

function About({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal" onClick={onClose}>
      <div className="modal-body glass about" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><b>About MAESTRO</b><button className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" /></button></div>
        <p className="prose">MAESTRO is a working tool for designing exhibition demos around NVIDIA hardware: a catalog of products with their sources, a kit of display parts, a composer for demo modules, an exhibition planner that checks circulation and services, and an import path for parts from earlier projects. Everything exports to Rhino in millimetres.</p>
        <p className="prose"><b>MAESTRO is an internal working title. It is not an NVIDIA product and is not endorsed by NVIDIA.</b> Product names belong to their owners. Specifications are taken from the public documents listed with each product, and every value carries its status.</p>
        <dl className="legend-list">
          <dt><span className="vbadge verified">Verified</span></dt><dd>Read from a published manufacturer document, cited with the value.</dd>
          <dt><span className="vbadge project">Project-specific</span></dt><dd>From an approved project model or drawing; true for that build only.</dd>
          <dt><span className="vbadge estimated">Estimated</span></dt><dd>Derived or measured from an image or a related product; check before fabrication.</dd>
          <dt><span className="vbadge placeholder">Placeholder</span></dt><dd>Not known yet. Nothing is drawn to a placeholder size.</dd>
        </dl>
        <p className="note">Project files opened in Import are read in this browser and kept in its private library. They are never uploaded or included in the public build.</p>
        <p className="note mono">{APP_LABEL}</p>
      </div>
    </div>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  const notify = useStore((s) => s.notify);
  if (!toast) return null;
  return <div className="toast glass" role="status" onClick={() => notify(null)}>{toast}</div>;
}

class Guard extends Component<{ children: ReactNode; area: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { console.error(`[MAESTRO] ${this.props.area} failed`, error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash glass" role="alert">
        <b>The {this.props.area} workspace stopped working.</b>
        <p className="small muted">{this.state.error.message}</p>
        <button className="ghost" onClick={() => this.setState({ error: null })}>Try again</button>
        <p className="small muted mono">{APP_LABEL}</p>
      </div>
    );
  }
}
