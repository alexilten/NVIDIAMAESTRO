import { CameraControls, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { resolveRef } from '../core/library';
import { nicheComposition } from '../core/niche/build';
import type { NicheLayout } from '../core/niche/layout';
import { MM, ShapeView, WORLD_ROTATION } from './ShapeView';
import { Studio } from './Studio';

/** The niche in 3D: the same composition that goes to Compose and Rhino, seen from a little left of straight on. */
export function NicheCanvas({ l }: { l: NicheLayout | null }) {
  const comp = useMemo(() => (l ? nicheComposition(l) : null), [l]);
  const shapes = useMemo(() => comp?.items.map((p) => ({ p, shape: resolveRef(p.ref, [])?.shape ?? null })) ?? [], [comp]);
  return (
    <div className="viewer">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, preserveDrawingBuffer: true }}>
        <PerspectiveCamera makeDefault fov={30} near={0.02} far={200} position={[-1.2, 1.8, 4]} />
        <Studio span={3} shadows />
        <group rotation={WORLD_ROTATION} scale={MM}>
          {shapes.map(({ p, shape }) => shape && (
            <group key={p.id} position={p.position} rotation={[0, 0, (p.rotation * Math.PI) / 180]}><ShapeView shape={shape} /></group>
          ))}
        </group>
        <Frame l={l} />
      </Canvas>
      {!l && <div className="viewer-empty">Add hardware on the left to build the niche.</div>}
    </div>
  );
}

function Frame({ l }: { l: NicheLayout | null }) {
  const [c, setC] = useState<CameraControls | null>(null);
  const key = l ? `${l.spec.id}:${Math.round(l.width)}:${Math.round(l.height)}` : '';
  useEffect(() => {
    if (!c || !l) return;
    // looking at the opening's centre from the front left, far enough back for the whole opening
    const cz = l.centre * MM, size = Math.max(l.width, l.height) * MM;
    const dist = size / Math.tan((30 * Math.PI) / 360) * 1.05 + 0.8;
    c.setLookAt(-dist * 0.35, cz + dist * 0.12, dist, 0, cz, -l.depth * MM * 0.5, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, key]);
  return <CameraControls ref={setC} makeDefault smoothTime={0.3} maxDistance={40} />;
}
