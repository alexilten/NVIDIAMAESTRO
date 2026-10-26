import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import type { MaterialDef, Shape, ShapePart } from '../core/geometry/shape';
import { shapeBounds } from '../core/geometry/shape';

/** World is mm, Z up (core/schema.ts). three.js is Y up metres: one wrapping transform does it. */
export const WORLD_ROTATION = new THREE.Euler(-Math.PI / 2, 0, 0);
export const MM = 0.001;

export function makeMaterial(def: MaterialDef | undefined, xray: boolean, highlight = false): THREE.MeshStandardMaterial {
  const color = new THREE.Color(def?.color ?? '#bbbbbb');
  const m = new THREE.MeshStandardMaterial({
    color,
    roughness: def?.roughness ?? 0.6,
    metalness: def?.metalness ?? 0,
    side: THREE.DoubleSide,
  });
  if (def?.emissive) { m.emissive = color.clone(); m.emissiveIntensity = def.emissive; }
  const opacity = xray ? 0.22 : def?.opacity ?? 1;
  if (opacity < 1) { m.transparent = true; m.opacity = opacity; m.depthWrite = false; }
  if (highlight) { m.emissive = new THREE.Color('#76b900'); m.emissiveIntensity = 0.35; }
  return m;
}

export function partGeometry(p: ShapePart): THREE.BufferGeometry {
  if (p.kind === 'box') {
    const g = new THREE.BoxGeometry(p.max[0] - p.min[0], p.max[1] - p.min[1], p.max[2] - p.min[2]);
    g.translate((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2);
    return g;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p.positions, 3));
  g.setIndex(new THREE.BufferAttribute(p.indices, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function partCenter(p: ShapePart): THREE.Vector3 {
  if (p.kind === 'box') return new THREE.Vector3((p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2);
  const b = new THREE.Box3();
  b.setFromArray(p.positions);
  return b.getCenter(new THREE.Vector3());
}

interface Props {
  shape: Shape;
  xray?: boolean;
  /** 0–1: spread parts away from the centre */
  explode?: number;
  isolate?: number | null;
  highlightPart?: number | null;
  highlight?: boolean;
  onPartClick?: (index: number, e: { stopPropagation: () => void; shiftKey?: boolean }) => void;
  castShadow?: boolean;
}

/** Renders a Shape in its own mm frame (place it inside a group that carries WORLD_ROTATION and MM scale). */
export function ShapeView({ shape, xray = false, explode = 0, isolate = null, highlightPart = null, highlight = false, onPartClick, castShadow = true }: Props) {
  const geoms = useMemo(() => shape.parts.map(partGeometry), [shape]);
  useEffect(() => () => geoms.forEach((g) => g.dispose()), [geoms]);
  const centre = useMemo(() => {
    const b = shapeBounds(shape);
    return new THREE.Vector3((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  }, [shape]);
  const offsets = useMemo(() => shape.parts.map((p) => partCenter(p).sub(centre)), [shape, centre]);
  const mats = useMemo(() => {
    const cache = new Map<string, THREE.MeshStandardMaterial>();
    return shape.parts.map((p, i) => {
      const hl = highlight || highlightPart === i;
      const key = `${p.material}|${hl}`;
      if (!cache.has(key)) cache.set(key, makeMaterial(shape.materials[p.material], xray, hl));
      return cache.get(key)!;
    });
  }, [shape, xray, highlight, highlightPart]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);

  return (
    <group>
      {shape.parts.map((_p, i) => {
        if (isolate != null && isolate !== i) return null;
        const o = offsets[i];
        const k = explode * 0.9;
        return (
          <mesh
            key={i}
            geometry={geoms[i]}
            material={mats[i]}
            position={[o.x * k, o.y * k, o.z * k]}
            castShadow={castShadow && !xray}
            receiveShadow
            onClick={onPartClick ? (e) => onPartClick(i, { stopPropagation: () => e.stopPropagation(), shiftKey: e.nativeEvent.shiftKey }) : undefined}
          />
        );
      })}
    </group>
  );
}
