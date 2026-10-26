import { CameraControls, Grid, PerspectiveCamera, TransformControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { resolveRef } from '../core/library';
import type { Placement, Vec3 } from '../core/schema';
import { extentOf, useStore } from '../ui/store';
import { Label } from './Label';
import { MM, ShapeView, WORLD_ROTATION } from './ShapeView';
import { Studio } from './Studio';

/** The Compose canvas: placed items at their composition transforms, selection, and a move/rotate gizmo. */
export function ComposeCanvas({ mode }: { mode: 'translate' | 'rotate' }) {
  const comp = useStore((s) => s.comp);
  const parts = useStore((s) => s.parts);
  const selection = useStore((s) => s.selection);
  const selectItems = useStore((s) => s.selectItems);
  const xray = useStore((s) => s.xray);

  const extents = useMemo(() => comp.items.map((p) => extentOf(p, parts)).filter(Boolean) as { min: Vec3; max: Vec3 }[], [comp, parts]);
  const span = extents.length ? Math.max(...extents.map((e) => e.max[0]), 2000) - Math.min(...extents.map((e) => e.min[0]), -2000) : 6000;

  return (
    <div className="viewer">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, preserveDrawingBuffer: true }} onPointerMissed={(e) => { if (e.type === 'click') selectItems([]); }}>
        <PerspectiveCamera makeDefault fov={30} near={0.02} far={800} position={[6, 5, 9]} />
        <Studio span={span * MM} shadows />
        <Grid position={[0, 0.0002, 0]} args={[60, 60]} cellSize={0.1} cellThickness={0.5} cellColor="#d9d9de" sectionSize={1} sectionThickness={1} sectionColor="#c3c3ca" fadeDistance={40} fadeStrength={1.2} infiniteGrid />
        <group rotation={WORLD_ROTATION} scale={MM}>
          {comp.items.map((p) => <Item key={p.id} p={p} selected={selection.includes(p.id)} xray={xray} />)}
        </group>
        <Gizmo mode={mode} />
        <FrameAll />
      </Canvas>
      {!comp.items.length && <div className="viewer-empty">Add products, kit parts or project parts from the library to start a module.</div>}
    </div>
  );
}

function Item({ p, selected, xray }: { p: Placement; selected: boolean; xray: boolean }) {
  const parts = useStore((s) => s.parts);
  const selectItems = useStore((s) => s.selectItems);
  const r = useMemo(() => resolveRef(p.ref, parts), [p.ref, parts]);
  if (!r?.shape) {
    return (
      <Label position={p.position} text={`${p.name}: missing from library`} className="dim-label warn" />
    );
  }
  return (
    <group position={p.position} rotation={[0, 0, (p.rotation * Math.PI) / 180]}>
      <ShapeView shape={r.shape} xray={xray} highlight={selected} onPartClick={(_i, e) => { e.stopPropagation(); selectItems([p.id], e.shiftKey); }} />
    </group>
  );
}

/** One gizmo at the selection's centre; on release the change is applied to the composition as one step. */
function Gizmo({ mode }: { mode: 'translate' | 'rotate' }) {
  const comp = useStore((s) => s.comp);
  const selection = useStore((s) => s.selection);
  const move = useStore((s) => s.move);
  const rotate = useStore((s) => s.rotate);
  const [obj] = useState(() => new THREE.Object3D());
  const start = useRef<{ p: THREE.Vector3; r: number } | null>(null);
  const sel = comp.items.filter((i) => selection.includes(i.id));
  const centre = useMemo(() => {
    if (!sel.length) return null;
    const c = sel.reduce((a, i) => [a[0] + i.position[0], a[1] + i.position[1], a[2] + i.position[2]], [0, 0, 0]);
    return [c[0] / sel.length, c[1] / sel.length, c[2] / sel.length];
  }, [sel]);
  useEffect(() => {
    if (!centre) return;
    // mm Z-up → three Y-up metres
    obj.position.set(centre[0] * MM, centre[2] * MM, -centre[1] * MM);
    obj.rotation.set(0, 0, 0);
    obj.updateMatrixWorld();
  }, [centre, obj]);
  if (!centre) return null;
  return (
    <>
      <primitive object={obj} />
      <TransformControls
        object={obj}
        mode={mode}
        size={0.8}
        showY={mode === 'rotate'}
        showX={mode === 'translate'}
        showZ={mode === 'translate'}
        translationSnap={0.01}
        rotationSnap={Math.PI / 12}
        onMouseDown={() => { start.current = { p: obj.position.clone(), r: obj.rotation.y }; }}
        onMouseUp={() => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          if (mode === 'translate') {
            const d = obj.position.clone().sub(s.p);
            const delta: Vec3 = [Math.round(d.x / MM), Math.round(-d.z / MM), 0];
            if (delta[0] || delta[1]) move(delta);
          } else {
            const deg = Math.round(((obj.rotation.y - s.r) * 180) / Math.PI / 15) * 15;
            if (deg) rotate(deg);
          }
        }}
      />
    </>
  );
}

function FrameAll() {
  const [c, setC] = useState<CameraControls | null>(null);
  const comp = useStore((s) => s.comp);
  const parts = useStore((s) => s.parts);
  const nonce = useStore((s) => s.cameraNonce);
  const id = comp.id;
  useEffect(() => {
    if (!c) return;
    const ex = comp.items.map((p) => extentOf(p, parts)).filter(Boolean) as { min: Vec3; max: Vec3 }[];
    if (!ex.length) { c.setLookAt(5, 4, 7, 0, 0.8, 0, true); return; }
    const min = [0, 1, 2].map((k) => Math.min(...ex.map((e) => e.min[k])));
    const max = [0, 1, 2].map((k) => Math.max(...ex.map((e) => e.max[k])));
    const box = new THREE.Box3(new THREE.Vector3(min[0] * MM, min[2] * MM, -max[1] * MM), new THREE.Vector3(max[0] * MM, max[2] * MM, -min[1] * MM));
    // a three-quarter view from the front left, far enough back to clear the side panels
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const fov = ((c.camera as THREE.PerspectiveCamera).fov ?? 35) * (Math.PI / 180);
    const dist = Math.max(sphere.radius, 0.4) / Math.sin(fov / 2) * 1.35;
    const dir = new THREE.Vector3(-0.55, 0.5, 1).normalize().multiplyScalar(dist);
    c.setLookAt(sphere.center.x + dir.x, sphere.center.y + dir.y, sphere.center.z + dir.z, sphere.center.x, sphere.center.y, sphere.center.z, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c, id, nonce, comp.items.length === 0]);
  return <CameraControls ref={setC} makeDefault smoothTime={0.3} maxDistance={300} />;
}
