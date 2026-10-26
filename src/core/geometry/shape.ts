import type { Vec3 } from '../schema';

/**
 * A renderable, exportable description of one catalog item in its own frame (mm, Z up, front −Y).
 * Procedural items are boxes; ingested items are triangle meshes tessellated from their Rhino source.
 * The viewport and the Rhino export both read this, so what is drawn is what is exported.
 */

export interface MaterialDef {
  name: string;
  color: string;
  roughness: number;
  metalness: number;
  emissive?: number;
  opacity?: number;
}

export type ShapePart =
  | { kind: 'box'; name: string; material: string; min: Vec3; max: Vec3; layer?: string }
  | { kind: 'mesh'; name: string; material: string; positions: Float32Array; indices: Uint32Array; layer?: string };

export interface Shape {
  parts: ShapePart[];
  materials: Record<string, MaterialDef>;
}

export interface Box3 { min: Vec3; max: Vec3 }

export function emptyBox(): Box3 {
  return { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
}

export function expand(b: Box3, p: ArrayLike<number>, o = 0) {
  for (let k = 0; k < 3; k++) {
    if (p[o + k] < b.min[k]) b.min[k] = p[o + k];
    if (p[o + k] > b.max[k]) b.max[k] = p[o + k];
  }
}

export function shapeBounds(s: Shape): Box3 {
  const b = emptyBox();
  for (const p of s.parts) {
    if (p.kind === 'box') { expand(b, p.min); expand(b, p.max); }
    else for (let i = 0; i < p.positions.length; i += 3) expand(b, p.positions, i);
  }
  return b;
}

export const boxSize = (b: Box3): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

/** Shared material library for procedural geometry. */
export const MATERIALS: Record<string, MaterialDef> = {
  chassis: { name: 'Anodised chassis', color: '#c9c6bf', roughness: 0.38, metalness: 0.75 },
  champagne: { name: 'Champagne metal', color: '#c8b48a', roughness: 0.32, metalness: 0.85 },
  graphite: { name: 'Graphite', color: '#2a2b2e', roughness: 0.5, metalness: 0.4 },
  black: { name: 'Black', color: '#141416', roughness: 0.55, metalness: 0.1 },
  grille: { name: 'Grille', color: '#3a3b3f', roughness: 0.7, metalness: 0.5 },
  ports: { name: 'Ports', color: '#0e0e10', roughness: 0.4, metalness: 0.2 },
  nvgreen: { name: 'NVIDIA Green', color: '#76b900', roughness: 0.45, metalness: 0 },
  led: { name: 'LED', color: '#9fe870', roughness: 0.3, metalness: 0, emissive: 0.8 },
  copper: { name: 'PCB edge', color: '#b07a3a', roughness: 0.4, metalness: 0.8 },
  laminateBlack: { name: 'Matte black laminate', color: '#2a2b2e', roughness: 0.7, metalness: 0 },
  walnut: { name: 'Walnut worktop', color: '#7a5233', roughness: 0.55, metalness: 0 },
  white: { name: 'Matte white panel', color: '#f2f2f0', roughness: 0.8, metalness: 0 },
  opal: { name: 'Opal acrylic', color: '#fbfbf7', roughness: 0.2, metalness: 0, emissive: 0.35 },
  screen: { name: 'Display', color: '#16181d', roughness: 0.15, metalness: 0.2 },
  fabric: { name: 'Fabric', color: '#b9bbbd', roughness: 0.95, metalness: 0 },
  envelope: { name: 'Envelope', color: '#d9dadd', roughness: 0.8, metalness: 0, opacity: 0.35 },
  placeholder: { name: 'Placeholder', color: '#e6e1d6', roughness: 0.9, metalness: 0 },
};

export const box = (name: string, material: string, min: Vec3, max: Vec3, layer?: string): ShapePart => ({ kind: 'box', name, material, min, max, layer });

/** A box centred on x/y with its base at z0. */
export const cbox = (name: string, material: string, cx: number, cy: number, z0: number, w: number, d: number, h: number, layer?: string): ShapePart =>
  box(name, material, [cx - w / 2, cy - d / 2, z0], [cx + w / 2, cy + d / 2, z0 + h], layer);
