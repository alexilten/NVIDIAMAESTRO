/**
 * The NVIDIA MAESTRO data model.
 *
 * Conventions (every subsystem relies on these):
 *   • lengths in millimetres, masses in kilograms
 *   • Z up; the FRONT of every object faces −Y (toward the viewer standing in front of it)
 *   • an object's origin sits at the centre of its footprint at floor level unless its record says otherwise
 *     (ingested Rhino parts keep the origin the source block was authored with and record it in `originNote`)
 *
 * Physical facts and marketing copy are stored apart: `specs`, `dims`, `weight` hold facts, each with a
 * verification status and a source; `description` / `purpose` hold prose.
 */

export type Vec3 = [number, number, number];

/** How much a value can be trusted. Shown on every value in the interface. */
export type Verification = 'verified' | 'project' | 'estimated' | 'placeholder';

export const VERIFICATION: Record<Verification, { label: string; meaning: string }> = {
  verified: { label: 'Verified', meaning: 'Confirmed by authoritative manufacturer documentation or approved project records.' },
  project: { label: 'Project-specific', meaning: 'Supplied and validated for a particular exhibition configuration.' },
  estimated: { label: 'Estimated', meaning: 'Inferred, measured or taken from a secondary source; not authoritative.' },
  placeholder: { label: 'Placeholder', meaning: 'Awaiting reliable technical data.' },
};

/** Ordered from weakest to strongest; a combined status is the weakest of its parts. */
export const VERIFICATION_RANK: Verification[] = ['placeholder', 'estimated', 'project', 'verified'];
export function weakest(...xs: Verification[]): Verification {
  return xs.reduce((a, b) => (VERIFICATION_RANK.indexOf(b) < VERIFICATION_RANK.indexOf(a) ? b : a), 'verified' as Verification);
}

export type Lod = 0 | 1 | 2 | 3;
export const LOD: Record<Lod, { label: string; meaning: string }> = {
  0: { label: 'LOD 0 · Envelope', meaning: 'Accurate overall dimensions as a clean bounding volume.' },
  1: { label: 'LOD 1 · Proxy', meaning: 'Recognisable shape, principal materials and connection locations.' },
  2: { label: 'LOD 2 · Presentation', meaning: 'High-quality exterior geometry for design and client presentation.' },
  3: { label: 'LOD 3 · Detailed', meaning: 'Manufacturer-informed, high-fidelity product model.' },
};

export interface SpecSource {
  id: string;
  kind: 'manufacturer-doc' | 'manufacturer-page' | 'partner-page' | 'secondary' | 'project-model' | 'project-drawing';
  title: string;
  publisher: string;
  url?: string;
  /** document number, drawing number or page, when there is one */
  reference?: string;
  /** ISO date the source was read */
  accessed: string;
  /** confidential sources never leave the private library */
  confidential: boolean;
}

/** One stated fact with its provenance. */
export interface Spec<T = number> {
  value: T | null;
  status: Verification;
  sourceId?: string;
  note?: string;
}

export interface Dimensions {
  /** along X, across the front */
  width: Spec;
  /** along Y, front to back */
  depth: Spec;
  /** along Z */
  height: Spec;
}

export type Category = 'data-center' | 'networking' | 'workstation' | 'gpu' | 'edge' | 'robotics' | 'automotive' | 'software';
export const CATEGORY_LABEL: Record<Category, string> = {
  'data-center': 'Data center & AI infrastructure',
  networking: 'Networking',
  workstation: 'Workstations & desktop AI',
  gpu: 'GPUs & boards',
  edge: 'Edge & embedded',
  robotics: 'Robotics & physical AI',
  automotive: 'Automotive',
  software: 'Software platforms',
};

export interface ProductFamily {
  id: string;
  name: string;
  manufacturer: string;
  category: Category;
  description: string;
}

export type ModelKind = 'system' | 'rack' | 'board' | 'devkit' | 'module' | 'reference-architecture' | 'software-platform';
export const MODEL_KIND_LABEL: Record<ModelKind, string> = {
  system: 'System',
  rack: 'Rack-scale system',
  board: 'Board / card',
  devkit: 'Developer kit',
  module: 'Production module',
  'reference-architecture': 'Reference architecture',
  'software-platform': 'Software platform (no physical object)',
};

export interface ProductModel {
  id: string;
  familyId: string;
  name: string;
  manufacturer: string;
  kind: ModelKind;
  revision?: string;
  status: 'shipping' | 'announced' | 'legacy';
  description: string;
  purpose: string;
  industries: string[];
  /** technical facts other than the physical envelope */
  specs: { label: string; spec: Spec<string | number>; unit?: string }[];
  /** the physical object this record describes, absent for software platforms and reference architectures */
  physicalAssetId?: string;
  /** a reference architecture points at the physical SKUs that implement it */
  implementations?: string[];
  softwarePlatforms?: string[];
  related?: string[];
  tags: string[];
  sources: string[];
  lastReviewed: string;
}

export interface Interface {
  name: string;
  side: 'front' | 'rear' | 'left' | 'right' | 'top' | 'bottom';
  status: Verification;
  sourceId?: string;
}

export interface PhysicalAsset {
  id: string;
  modelId: string;
  dims: Dimensions;
  weightKg?: Spec;
  rackUnits?: Spec;
  interfaces: Interface[];
  /** service and viewing clearances, mm */
  clearances?: { front?: Spec; rear?: Spec; sides?: Spec; top?: Spec };
  digitalAssets: DigitalAsset[];
}

export interface DigitalAsset {
  id: string;
  kind: 'procedural-proxy' | 'rhino-source' | 'viewport-mesh' | 'image';
  lod: Lod;
  label: string;
  /** what the geometry is and is not */
  provenance: string;
  version: number;
  createdAt: string;
}

// ── exhibition kit of parts ───────────────────────────────────────────────────────────────────────

export type KitCategory = 'counter' | 'kiosk' | 'pedestal' | 'niche' | 'wall' | 'av' | 'signage' | 'robot-cell' | 'desk' | 'other';
export const KIT_CATEGORY_LABEL: Record<KitCategory, string> = {
  counter: 'Demo counters',
  kiosk: 'Demo kiosks',
  pedestal: 'Pedestals & light tables',
  niche: 'Gallery niches',
  wall: 'Walls & gallery structure',
  av: 'Displays & AV',
  signage: 'Signage',
  'robot-cell': 'Robot cells',
  desk: 'Desks',
  other: 'Other',
};

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  unit: 'mm' | 'count' | 'deg';
}

/** A generic, genuinely parametric kit component (public, not derived from client drawings). */
export interface ParametricKitPart {
  id: string;
  name: string;
  category: KitCategory;
  description: string;
  params: ParamDef[];
  status: Verification;
  note: string;
  tags: string[];
}

// ── references and composition ─────────────────────────────────────────────────────────────────────

export type ItemRef =
  | { kind: 'product'; id: string }
  | { kind: 'kit'; id: string; params: Record<string, number> }
  | { kind: 'ingested'; id: string; version: number };

export interface Placement {
  id: string;
  ref: ItemRef;
  name: string;
  /** mm, origin of the item in the composition */
  position: Vec3;
  /** degrees about +Z */
  rotation: number;
  groupId?: string;
  /** the item's envelope when it was placed, so a later catalog change is detected rather than silently applied */
  snapshot: { width: number; depth: number; height: number; version: number };
}

export interface Group {
  id: string;
  name: string;
}

export interface Composition {
  schema: 'maestro.composition';
  version: 1;
  id: string;
  name: string;
  /** what this composition is: a demo module or an exhibition */
  kind: 'module' | 'exhibition';
  items: Placement[];
  groups: Group[];
  updatedAt: string;
}

/** Reusable demo module metadata (Round 03 extends this; stored with the composition). */
export interface DemoModuleMeta {
  title: string;
  theme: string;
  participants?: number;
  staffing?: string;
  power?: string;
  network?: string;
}
