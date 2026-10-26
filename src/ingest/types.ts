import type { Box3, MaterialDef } from '../core/geometry/shape';
import type { KitCategory, Vec3 } from '../core/schema';
import type { ExtractStats, PartGeometry, ViewMesh } from './rhino';

/** A reference from a part to a page of a source document (a fabrication deck, a drawing set). */
export interface DocLink {
  id: string;
  document: string;
  page: number;
  title: string;
  /** drawing number, sign-off state and similar, as read from the page */
  reference?: string;
  status?: string;
  /** how the link was made */
  origin: 'suggested' | 'confirmed' | 'manual';
  matched?: string[];
}

/** One dimension compared between the model and a drawing. Discrepancies are resolved explicitly, never silently. */
export interface DimCheck {
  id: string;
  label: string;
  /** what was measured in the model, e.g. "overall width" or "material ‘Niche Shelf White’ · width" */
  measure: string;
  model: number | null;
  drawing: number | null;
  docLinkId?: string;
  tolerance: number;
  resolution: 'open' | 'model' | 'drawing' | 'noted';
  note?: string;
}

export type IngestStatus = 'proposed' | 'approved' | 'rejected';

export interface IngestedPart {
  schema: 'maestro.ingested-part';
  id: string;
  version: number;
  name: string;
  category: KitCategory;
  status: IngestStatus;
  /** project the part was built for, e.g. "Spring Expo 2027" */
  project: string;
  tags: string[];
  createdAt: string;
  approvedAt?: string;
  approvedBy?: string;
  source: {
    fileName: string;
    fileSize: number;
    sha256: string;
    units: string;
    block: string;
    description: string;
    /** the block in an upstream model this one was copied from, when the source says so */
    derivedFrom?: string;
    originNote?: string;
    revision?: string;
    /** fingerprint of the block's geometry, nested blocks included (ingest/revision.ts) */
    geometryHash?: string;
  };
  /** extents of the source geometry in the part frame, mm */
  bbox: Box3;
  dims: Vec3;
  geometry: PartGeometry;
  mesh: ViewMesh[];
  materials: Record<string, MaterialDef>;
  stats: ExtractStats;
  docs: DocLink[];
  checks: DimCheck[];
  notes: string;
  /** earlier approved versions this one replaces */
  supersedes?: number;
  /** set when the part came from a teammate's library bundle rather than this browser's own extraction */
  sharedFrom?: { bundle: string; by?: string; importedAt: string };
}

export const isFixedGeometry = (_p: IngestedPart) => true;
export const partKey = (p: { id: string; version: number }) => `${p.id}@${p.version}`;
