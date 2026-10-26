import { create } from 'zustand';
import { placeOn, snapDelta, supportSurfaces } from '../core/arrange';
import { insertComposition, type Template } from '../core/templates';
import { addItem, alignItems, distributeX, duplicateItems, expandToGroups, groupItems, moveItems, newComposition, nextSlot, removeItems, rotateItems, ungroup, updateItem } from '../core/compose';
import { resolveRef, type LibraryEntry } from '../core/library';
import { boxSize, shapeBounds } from '../core/geometry/shape';
import type { Composition, ItemRef, Placement, Vec3 } from '../core/schema';
import { compStore, partsStore, docsStore, type DocIndex } from '../ingest/store';
import type { IngestedPart } from '../ingest/types';

export type Workspace = 'discover' | 'compose' | 'ingest';
export type CameraPreset = 'perspective' | 'front' | 'rear' | 'side' | 'top' | 'iso';

const COMP_KEY = 'maestro.composition.v1';
const FAV_KEY = 'maestro.favorites.v1';

function readLocal<T>(k: string, fallback: T): T {
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function writeLocal(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }

interface State {
  workspace: Workspace;
  setWorkspace: (w: Workspace) => void;

  // discover
  selectedKey: string | null;
  selectedRef: ItemRef | null;
  select: (e: LibraryEntry | null) => void;
  setSelectedRef: (r: ItemRef) => void;
  camera: CameraPreset;
  cameraNonce: number;
  setCamera: (c: CameraPreset) => void;
  ortho: boolean;
  xray: boolean;
  dims: boolean;
  autoRotate: boolean;
  scaleFigure: boolean;
  toggle: (k: 'ortho' | 'xray' | 'dims' | 'autoRotate' | 'scaleFigure' | 'snap') => void;
  favorites: string[];
  toggleFavorite: (key: string) => void;

  // private library
  parts: IngestedPart[];
  docs: DocIndex[];
  loadPrivate: () => Promise<void>;
  savePart: (p: IngestedPart) => Promise<void>;
  deletePart: (p: IngestedPart) => Promise<void>;
  saveDoc: (d: DocIndex) => Promise<void>;

  // compose
  comp: Composition;
  savedComps: Composition[];
  selection: string[];
  history: Composition[];
  future: Composition[];
  setComp: (c: Composition, record?: boolean) => void;
  undo: () => void;
  redo: () => void;
  /** `exact` selects the given items alone, without the rest of their groups */
  selectItems: (ids: string[], additive?: boolean, exact?: boolean) => void;
  addToCanvas: (ref: ItemRef, name: string) => void;
  duplicate: () => void;
  remove: () => void;
  group: () => void;
  ungroupSel: () => void;
  move: (delta: Vec3) => void;
  rotate: (deg: number) => void;
  align: (axis: 0 | 1 | 2) => void;
  distribute: () => void;
  snap: boolean;
  lastSnap: string | null;
  placeOnSurface: () => void;
  supportFor: (id: string) => Placement | null;
  insertTemplate: (t: Template) => void;
  setItem: (id: string, patch: Partial<Pick<Placement, 'position' | 'rotation' | 'name' | 'ref' | 'snapshot' | 'live'>>) => void;
  saveComp: () => Promise<void>;
  openComp: (c: Composition) => void;
  newComp: () => void;

  toast: string | null;
  notify: (s: string | null) => void;
}

export function extentOf(p: Placement, parts: IngestedPart[]) {
  const r = resolveRef(p.ref, parts);
  if (!r?.shape) return null;
  const b = shapeBounds(r.shape);
  const a = (p.rotation * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const xs: number[] = [], ys: number[] = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) { xs.push(p.position[0] + x * c - y * s); ys.push(p.position[1] + x * s + y * c); }
  return { min: [Math.min(...xs), Math.min(...ys), p.position[2] + b.min[2]] as Vec3, max: [Math.max(...xs), Math.max(...ys), p.position[2] + b.max[2]] as Vec3 };
}

export const useStore = create<State>((set, get) => {
  const commit = (c: Composition) => {
    const { comp, history } = get();
    writeLocal(COMP_KEY, c);
    set({ comp: c, history: [...history.slice(-80), comp], future: [] });
  };
  return {
    workspace: 'discover',
    setWorkspace: (w) => set({ workspace: w }),

    selectedKey: 'product:nv-dgx-spark',
    selectedRef: { kind: 'product', id: 'nv-dgx-spark' },
    select: (e) => set({ selectedKey: e?.key ?? null, selectedRef: e?.ref ?? null, cameraNonce: get().cameraNonce + 1, camera: 'perspective' }),
    setSelectedRef: (r) => set({ selectedRef: r }),
    camera: 'perspective',
    cameraNonce: 0,
    setCamera: (c) => set({ camera: c, cameraNonce: get().cameraNonce + 1 }),
    ortho: false,
    xray: false,
    dims: true,
    autoRotate: false,
    scaleFigure: false,
    toggle: (k) => set({ [k]: !get()[k] } as Partial<State>),
    favorites: readLocal<string[]>(FAV_KEY, []),
    toggleFavorite: (key) => {
      const f = get().favorites.includes(key) ? get().favorites.filter((x) => x !== key) : [...get().favorites, key];
      writeLocal(FAV_KEY, f);
      set({ favorites: f });
    },

    parts: [],
    docs: [],
    loadPrivate: async () => {
      try {
        const [parts, docs, comps] = await Promise.all([partsStore.all(), docsStore.all(), compStore.all()]);
        set({ parts, docs, savedComps: comps });
      } catch { /* IndexedDB unavailable (private window): the private library is off */ }
    },
    savePart: async (p) => {
      await partsStore.put(p);
      set({ parts: [...get().parts.filter((x) => !(x.id === p.id && x.version === p.version)), p] });
    },
    deletePart: async (p) => {
      await partsStore.remove(p);
      set({ parts: get().parts.filter((x) => !(x.id === p.id && x.version === p.version)) });
    },
    saveDoc: async (d) => {
      await docsStore.put(d);
      set({ docs: [...get().docs.filter((x) => x.id !== d.id), d] });
    },

    comp: readLocal<Composition>(COMP_KEY, newComposition()),
    savedComps: [],
    selection: [],
    history: [],
    future: [],
    setComp: (c, record = true) => { if (record) commit(c); else { writeLocal(COMP_KEY, c); set({ comp: c }); } },
    undo: () => { const { history, comp, future } = get(); if (!history.length) return; const prev = history[history.length - 1]; writeLocal(COMP_KEY, prev); set({ comp: prev, history: history.slice(0, -1), future: [comp, ...future] }); },
    redo: () => { const { history, comp, future } = get(); if (!future.length) return; writeLocal(COMP_KEY, future[0]); set({ comp: future[0], history: [...history, comp], future: future.slice(1) }); },
    selectItems: (ids, additive, exact) => {
      const { comp, selection } = get();
      const exp = exact ? ids : expandToGroups(comp, ids);
      if (!additive) { set({ selection: exp }); return; }
      const already = ids.every((i) => selection.includes(i));
      set({ selection: already ? selection.filter((x) => !exp.includes(x)) : [...new Set([...selection, ...exp])] });
    },
    addToCanvas: (ref, name) => {
      const { comp, parts } = get();
      const r = resolveRef(ref, parts);
      if (!r?.shape) { get().notify('This item has no physical geometry to place.'); return; }
      const dims = boxSize(shapeBounds(r.shape));
      const version = ref.kind === 'ingested' ? ref.version : 1;
      // with one kit part selected, the new item goes onto it; otherwise to the right of everything
      const { selection } = get();
      const host = selection.length === 1 && ref.kind !== 'kit' ? comp.items.find((i) => i.id === selection[0] && i.ref.kind === 'kit') : undefined;
      const at = host ? host.position : nextSlot(comp, (p) => extentOf(p, parts), dims[0]);
      let { comp: c, id } = addItem(comp, ref, name, dims, at, version);
      let where = c.name;
      if (host) {
        const on = placeOn(c, id, host.id, (p) => resolveRef(p.ref, parts)?.shape ?? null);
        if (on) { c = on.comp; where = `${host.name}${on.overhang ? ' (it overhangs the surface)' : ''}`; }
      }
      commit(c);
      set({ selection: [id], workspace: 'compose' });
      get().notify(`${name} added to ${where}.`);
    },
    duplicate: () => {
      const { comp, selection, parts } = get();
      if (!selection.length) return;
      const ext = selection.map((id) => extentOf(comp.items.find((i) => i.id === id)!, parts)).filter(Boolean) as { min: Vec3; max: Vec3 }[];
      const w = ext.length ? Math.max(...ext.map((e) => e.max[0])) - Math.min(...ext.map((e) => e.min[0])) : 1000;
      const r = duplicateItems(comp, selection, [Math.round(w + 400), 0, 0]);
      commit(r.comp);
      set({ selection: r.ids });
    },
    remove: () => { const { comp, selection } = get(); if (!selection.length) return; commit(removeItems(comp, selection)); set({ selection: [] }); },
    group: () => {
      const { comp, selection } = get();
      if (selection.length < 2) return;
      const n = comp.groups.length + 1;
      const r = groupItems(comp, selection, `Station ${n}`);
      commit(r.comp);
      get().notify(`Grouped ${selection.length} items as Station ${n}.`);
    },
    ungroupSel: () => {
      const { comp, selection } = get();
      const gids = new Set(comp.items.filter((i) => selection.includes(i.id) && i.groupId).map((i) => i.groupId!));
      let c = comp;
      for (const g of gids) c = ungroup(c, g);
      commit(c);
    },
    move: (delta) => {
      const { comp, selection, parts, snap } = get();
      if (!selection.length) return;
      let d = delta, note: string | null = null;
      if (snap) {
        const mine = comp.items.filter((i) => selection.includes(i.id)).map((p) => extentOf(p, parts)).filter(Boolean) as { min: Vec3; max: Vec3 }[];
        const others = comp.items.filter((i) => !selection.includes(i.id)).map((p) => extentOf(p, parts)).filter(Boolean) as { min: Vec3; max: Vec3 }[];
        if (mine.length) {
          const ext = { min: [0, 1, 2].map((k) => Math.min(...mine.map((e) => e.min[k]))) as Vec3, max: [0, 1, 2].map((k) => Math.max(...mine.map((e) => e.max[k]))) as Vec3 };
          const s = snapDelta(ext, others, delta);
          d = s.delta; note = s.note;
        }
      }
      commit(moveItems(comp, selection, d));
      set({ lastSnap: note });
      if (note) get().notify(`Snapped: ${note}.`);
    },
    rotate: (deg) => { const { comp, selection } = get(); if (selection.length) commit(rotateItems(comp, selection, deg)); },
    align: (axis) => { const { comp, selection } = get(); if (selection.length > 1) commit(alignItems(comp, selection, axis)); },
    distribute: () => { const { comp, selection } = get(); if (selection.length > 2) commit(distributeX(comp, selection)); },
    setItem: (id, patch) => commit(updateItem(get().comp, id, patch)),
    snap: true,
    lastSnap: null,
    supportFor: (id) => {
      const { comp, parts } = get();
      const me = comp.items.find((i) => i.id === id);
      if (!me) return null;
      const [x, y] = me.position;
      // the largest other item under the item's plan centre that offers a surface
      const under = comp.items.filter((o) => o.id !== id).map((o) => ({ o, e: extentOf(o, parts), s: resolveRef(o.ref, parts)?.shape }))
        .filter((c) => c.e && c.s && supportSurfaces(c.s).length && x >= c.e.min[0] && x <= c.e.max[0] && y >= c.e.min[1] && y <= c.e.max[1])
        .sort((a, b) => (b.e!.max[0] - b.e!.min[0]) * (b.e!.max[1] - b.e!.min[1]) - (a.e!.max[0] - a.e!.min[0]) * (a.e!.max[1] - a.e!.min[1]));
      return under[0]?.o ?? null;
    },
    placeOnSurface: () => {
      const { comp, selection, parts } = get();
      if (selection.length !== 1) return;
      const host = get().supportFor(selection[0]);
      if (!host) { get().notify('Move the item over a counter, table, niche or other item first.'); return; }
      const r = placeOn(comp, selection[0], host.id, (p) => resolveRef(p.ref, parts)?.shape ?? null);
      if (!r) return;
      commit(r.comp);
      get().notify(`On ${host.name}, ${r.surface.toLowerCase().replace(/_/g, ' ')}${r.overhang ? '; it overhangs the surface' : ''}.`);
    },
    insertTemplate: (tpl) => {
      const { comp, parts } = get();
      const src = tpl.build();
      const srcEx = src.items.map((p) => extentOf(p, [])).filter(Boolean) as { min: Vec3; max: Vec3 }[];
      const minX = Math.min(...srcEx.map((e) => e.min[0]));
      const w = Math.max(...srcEx.map((e) => e.max[0])) - minX;
      const slot = nextSlot(comp, (p) => extentOf(p, parts), w);
      const r = insertComposition(comp, src, [Math.round(slot[0] - w / 2 - minX), 0, 0], tpl.name);
      commit(r.comp);
      set({ selection: r.ids, workspace: 'compose' });
      get().notify(`${tpl.name} inserted as a group of ${r.ids.length}.`);
    },
    saveComp: async () => {
      const c = get().comp;
      try {
        await compStore.put(c);
        set({ savedComps: [...get().savedComps.filter((x) => x.id !== c.id), c] });
        get().notify(`Saved “${c.name}” in this browser.`);
      } catch { get().notify('Could not save: browser storage is unavailable.'); }
    },
    openComp: (c) => { commit(c); set({ selection: [], workspace: 'compose' }); },
    newComp: () => { commit(newComposition()); set({ selection: [] }); },

    toast: null,
    notify: (s) => {
      set({ toast: s });
      if (s) setTimeout(() => { if (get().toast === s) set({ toast: null }); }, 3600);
    },
  };
});
