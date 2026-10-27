import { create } from 'zustand';
import { NICHE_EXAMPLES, fromExample } from '../core/niche/examples';
import { newNiche } from '../core/niche/build';
import type { NicheItem, NicheSpec } from '../core/niche/layout';
import { RULE_SET_BY_ID, RULE_SETS, withOverrides, type NicheRuleSet, type RuleKey, type RuleValue } from '../core/niche/rules';

/** The Niches workspace: the niche being built, niches saved in this browser, and rule values changed here. */

const SPEC_KEY = 'maestro.niche.v1';
const SAVED_KEY = 'maestro.niches.v1';
const RULES_KEY = 'maestro.niche-rules.v1';

function readLocal<T>(k: string, fallback: T): T {
  try { const raw = localStorage.getItem(k); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
}
function writeLocal(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }

type Overrides = Record<string, Partial<Record<RuleKey, RuleValue>>>;

interface NicheState {
  spec: NicheSpec;
  saved: NicheSpec[];
  overrides: Overrides;
  /** the row new hardware goes into */
  target: number;
  view: 'elevation' | '3d';
  closeUp: boolean;
  setCloseUp: (v: boolean) => void;
  setView: (v: NicheState['view']) => void;
  patch: (p: Partial<Omit<NicheSpec, 'rows' | 'schema' | 'version' | 'id'>>) => void;
  setTarget: (row: number) => void;
  addRow: () => void;
  removeRow: (row: number) => void;
  moveRow: (row: number, dir: -1 | 1) => void;
  addToRow: (item: NicheItem | null, row?: number) => void;
  removeCell: (row: number, col: number) => void;
  moveCell: (row: number, col: number, dir: -1 | 1) => void;
  setCell: (row: number, col: number, patch: Partial<NicheItem>) => void;
  setRule: (key: RuleKey, v: RuleValue) => void;
  resetRule: (key: RuleKey) => void;
  rules: () => NicheRuleSet;
  loadExample: (code: string) => void;
  newSpec: () => void;
  save: () => void;
  open: (s: NicheSpec) => void;
  remove: (id: string) => void;
}

const firstExample = () => fromExample(NICHE_EXAMPLES.find((e) => e.spec.code === '03') ?? NICHE_EXAMPLES[0]);

export const useNiche = create<NicheState>((set, get) => {
  const commit = (spec: NicheSpec) => {
    const s = { ...spec, updatedAt: new Date().toISOString() };
    writeLocal(SPEC_KEY, s);
    set({ spec: s, target: Math.min(get().target, Math.max(s.rows.length - 1, 0)) });
  };
  const rows = () => get().spec.rows.map((r) => [...r]);
  return {
    spec: readLocal<NicheSpec>(SPEC_KEY, firstExample()),
    saved: readLocal<NicheSpec[]>(SAVED_KEY, []),
    overrides: readLocal<Overrides>(RULES_KEY, {}),
    target: 0,
    view: 'elevation',
    closeUp: false,
    setCloseUp: (v) => set({ closeUp: v }),
    setView: (v) => set({ view: v }),
    patch: (p) => commit({ ...get().spec, ...p }),
    setTarget: (row) => set({ target: row }),
    addRow: () => { const r = rows(); r.unshift([]); commit({ ...get().spec, rows: r }); set({ target: 0 }); },
    removeRow: (row) => { const r = rows(); r.splice(row, 1); commit({ ...get().spec, rows: r.length ? r : [[]] }); },
    moveRow: (row, dir) => {
      const r = rows(); const to = row + dir;
      if (to < 0 || to >= r.length) return;
      [r[row], r[to]] = [r[to], r[row]];
      commit({ ...get().spec, rows: r });
      set({ target: to });
    },
    addToRow: (item, row) => {
      const r = rows(); const i = row ?? get().target;
      if (!r[i]) r[i] = [];
      r[i].push(item);
      commit({ ...get().spec, rows: r });
    },
    removeCell: (row, col) => { const r = rows(); r[row].splice(col, 1); commit({ ...get().spec, rows: r }); },
    moveCell: (row, col, dir) => {
      const r = rows(); const to = col + dir;
      if (to < 0 || to >= r[row].length) return;
      [r[row][col], r[row][to]] = [r[row][to], r[row][col]];
      commit({ ...get().spec, rows: r });
    },
    setCell: (row, col, p) => { const r = rows(); const c = r[row][col]; if (!c) return; r[row][col] = { ...c, ...p }; commit({ ...get().spec, rows: r }); },
    setRule: (key, v) => {
      const id = get().spec.rulesId;
      const o = { ...get().overrides, [id]: { ...(get().overrides[id] ?? {}), [key]: v } };
      writeLocal(RULES_KEY, o);
      set({ overrides: o });
    },
    resetRule: (key) => {
      const id = get().spec.rulesId;
      const mine = { ...(get().overrides[id] ?? {}) };
      delete mine[key];
      const o = { ...get().overrides, [id]: mine };
      writeLocal(RULES_KEY, o);
      set({ overrides: o });
    },
    rules: () => withOverrides(RULE_SET_BY_ID.get(get().spec.rulesId) ?? RULE_SETS[0], get().overrides[get().spec.rulesId]),
    loadExample: (code) => { const e = NICHE_EXAMPLES.find((x) => x.spec.code === code); if (e) { commit(fromExample(e)); set({ target: 0 }); } },
    newSpec: () => { commit(newNiche(String(get().saved.length + 1).padStart(2, '0'))); set({ target: 0 }); },
    save: () => {
      const s = get().spec;
      const saved = [...get().saved.filter((x) => x.id !== s.id), s];
      writeLocal(SAVED_KEY, saved);
      set({ saved });
    },
    open: (s) => { commit(s); set({ target: 0 }); },
    remove: (id) => { const saved = get().saved.filter((x) => x.id !== id); writeLocal(SAVED_KEY, saved); set({ saved }); },
  };
});
