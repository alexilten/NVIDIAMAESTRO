import { CameraControls, Line, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { shapeBounds, type Box3, type Shape } from '../core/geometry/shape';
import type { Verification } from '../core/schema';
import { useStore, type CameraPreset } from '../ui/store';
import { MM, ShapeView, WORLD_ROTATION } from './ShapeView';
import { Label } from './Label';
import { Studio } from './Studio';

export interface DimLabel { value: number | null; status: Verification }

interface Props {
  shape: Shape | null;
  dims?: [DimLabel, DimLabel, DimLabel];
  emptyMessage?: string;
  partNames?: string[];
}

/** The Discover viewer: one object, floating in a white studio, with dimensions read from its record. */
export function ProductViewer({ shape, dims, emptyMessage, partNames }: Props) {
  const ortho = useStore((s) => s.ortho);
  const xray = useStore((s) => s.xray);
  const showDims = useStore((s) => s.dims);
  const autoRotate = useStore((s) => s.autoRotate);
  const scaleFigure = useStore((s) => s.scaleFigure);
  const [explode, setExplode] = useState(0);
  const [part, setPart] = useState<number | null>(null);
  const [isolate, setIsolate] = useState(false);
  useEffect(() => { setPart(null); setIsolate(false); setExplode(0); }, [shape]);

  const bounds = useMemo(() => (shape ? shapeBounds(shape) : null), [shape]);
  // the object is centred on its footprint and stands on the floor
  const offset = useMemo<[number, number, number]>(() => (bounds ? [-(bounds.min[0] + bounds.max[0]) / 2, -(bounds.min[1] + bounds.max[1]) / 2, -bounds.min[2]] : [0, 0, 0]), [bounds]);
  const span = bounds ? Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]) * MM : 1;

  return (
    <div className="viewer">
      <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping, preserveDrawingBuffer: true }} onPointerMissed={() => setPart(null)}>
        {ortho ? <OrthographicCamera makeDefault position={[0, 0, 10]} zoom={100} near={-100} far={100} /> : <PerspectiveCamera makeDefault fov={28} near={0.005} far={500} position={[2, 1.5, 3]} />}
        <Studio span={span} />
        {shape && bounds && (
          <group rotation={WORLD_ROTATION} scale={MM}>
            <group position={offset}>
              <ShapeView shape={shape} xray={xray} explode={explode} isolate={isolate ? part : null} highlightPart={part} onPartClick={(i, e) => { e.stopPropagation(); setPart(i); }} />
              {showDims && dims && <Dimensions b={bounds} dims={dims} />}
            </group>
            {scaleFigure && <ScaleFigure x={-(bounds.max[0] - bounds.min[0]) / 2 - 500} />}
          </group>
        )}
        <Rig bounds={bounds} autoRotate={autoRotate} ortho={ortho} />
      </Canvas>
      {!shape && <div className="viewer-empty">{emptyMessage ?? 'No geometry'}</div>}
      {shape && (
        <div className="viewer-tools glass">
          <label className="mini-slider" title="Exploded view: spread the parts apart">
            <span>Explode</span>
            <input type="range" min={0} max={1} step={0.01} value={explode} onChange={(e) => setExplode(+e.target.value)} />
          </label>
          {part != null && (
            <>
              <span className="tool-sep" />
              <span className="part-chip" title="Selected part">{partNames?.[part] ?? shape.parts[part]?.name}</span>
              <button className="chip" onClick={() => setIsolate(!isolate)}>{isolate ? 'Show all' : 'Isolate'}</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_COLOR: Record<Verification, string> = { verified: '#2f8f3e', project: '#3266c8', estimated: '#b06d00', placeholder: '#9a9aa0' };

function Dimensions({ b, dims }: { b: Box3; dims: [DimLabel, DimLabel, DimLabel] }) {
  const pad = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) * 0.08;
  const z0 = b.min[2];
  const y0 = b.min[1] - pad;
  const x1 = b.max[0] + pad;
  const lines: { a: [number, number, number]; b: [number, number, number]; d: DimLabel; axis: string }[] = [
    { a: [b.min[0], y0, z0], b: [b.max[0], y0, z0], d: dims[0], axis: 'W' },
    { a: [x1, b.min[1], z0], b: [x1, b.max[1], z0], d: dims[1], axis: 'D' },
    { a: [x1, y0 + pad, z0], b: [x1, y0 + pad, b.max[2]], d: dims[2], axis: 'H' },
  ];
  return (
    <group>
      {lines.map((l, i) => {
        const mid: [number, number, number] = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2, (l.a[2] + l.b[2]) / 2];
        return (
          <group key={i}>
            <Line points={[l.a, l.b]} color="#1d1d1f" lineWidth={1} transparent opacity={0.55} />
            <Label position={mid} text={`${l.axis}\t${l.d.value == null ? '—' : `${fmt(l.d.value)} mm`}`} dot={STATUS_COLOR[l.d.status]} title={l.d.status} />
          </group>
        );
      })}
    </group>
  );
}

const fmt = (v: number) => (Math.round(v * 10) / 10).toLocaleString('en-GB');

/** A 1.75 m standing figure for scale (a neutral proxy, not a person model). */
function ScaleFigure({ x }: { x: number }) {
  const m = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c9ccd2', roughness: 0.9 }), []);
  return (
    <group position={[x, 0, 0]}>
      <mesh material={m} position={[0, 0, 820]} castShadow><boxGeometry args={[380, 220, 1440]} /></mesh>
      <mesh material={m} position={[0, 0, 1640]} castShadow><sphereGeometry args={[110, 24, 16]} /></mesh>
      <Label position={[0, 0, 1850]} text="1.75 m figure" />
    </group>
  );
}

function Rig({ bounds, autoRotate, ortho }: { bounds: Box3 | null; autoRotate: boolean; ortho: boolean }) {
  // a state ref, so framing runs again once the controls exist (they mount after the first effect)
  const [ctl, setCtl] = useState<CameraControls | null>(null);
  const camera = useStore((s) => s.camera);
  const nonce = useStore((s) => s.cameraNonce);
  useEffect(() => {
    const c = ctl;
    if (!c || !bounds) return;
    const w = (bounds.max[0] - bounds.min[0]) * MM, d = (bounds.max[1] - bounds.min[1]) * MM, h = (bounds.max[2] - bounds.min[2]) * MM;
    const r = Math.max(Math.hypot(w, d, h), 0.08);
    const target = new THREE.Vector3(0, h / 2, 0);
    // three.js: +X right, +Y up, +Z toward the viewer. The product's front (−Y in the mm frame) faces +Z here.
    const dirs: Record<CameraPreset, [number, number, number]> = {
      perspective: [0.8, 0.45, 1.1], front: [0, 0, 1], rear: [0, 0, -1], side: [1, 0, 0], top: [0, 1, 0.0001], iso: [1, 0.82, 1],
    };
    const v = new THREE.Vector3(...dirs[camera]).normalize().multiplyScalar(r * 2.9);
    c.setLookAt(target.x + v.x, target.y + v.y, target.z + v.z, target.x, target.y, target.z, true);
    if (ortho) c.zoomTo(Math.min(2400, 520 / r), true);
  }, [ctl, bounds, camera, nonce, ortho]);
  useEffect(() => {
    if (!autoRotate) return;
    let raf = 0;
    const tick = () => { ctl?.rotate(0.0025, 0, false); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ctl, autoRotate]);
  return <CameraControls ref={setCtl} makeDefault smoothTime={0.35} minDistance={0.02} maxDistance={200} />;
}
