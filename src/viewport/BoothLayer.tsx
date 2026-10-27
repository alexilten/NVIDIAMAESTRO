import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CELL, SIDES, plotEdges, plotOutline } from '../core/booth';
import type { BoothSide } from '../core/schema';
import { useStore } from '../ui/store';
import { useBoothAnalysis } from '../ui/useBooth';
import { Label } from './Label';
import { LOOK } from './Studio';

/**
 * The booth plot in the Compose canvas frame (mm, Z up): floor, aisles, closed walls, circulation and service points.
 * `present` keeps the floor, aisles and walls only.
 */
export function BoothLayer({ present = false }: { present?: boolean }) {
  const booth = useStore((s) => s.comp.booth);
  const show = useStore((s) => s.circulation) && !present;
  const look = LOOK[useStore((s) => s.presentLook)];
  const floor = present ? look.floor : LOOK.studio.floor, aisleColor = present ? look.aisle : LOOK.studio.aisle;
  const a = useBoothAnalysis();
  const tex = useMemo(() => {
    if (!a) return null;
    const { nx, ny, cls } = a.grid;
    const data = new Uint8Array(nx * ny * 4);
    const colour: Record<number, [number, number, number, number]> = {
      [CELL.tight]: [242, 150, 40, 170], [CELL.route]: [118, 185, 0, 46], [CELL.turning]: [118, 185, 0, 78],
    };
    for (let i = 0; i < nx * ny; i++) { const c = colour[cls[i]]; if (c) data.set(c, i * 4); }
    const t = new THREE.DataTexture(data, nx, ny, THREE.RGBAFormat);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.needsUpdate = true;
    return t;
  }, [a]);
  useEffect(() => () => tex?.dispose(), [tex]);
  const floorShape = useMemo(() => (booth ? new THREE.Shape(plotOutline(booth).map(([x, y]) => new THREE.Vector2(x, y))) : null), [booth]);
  if (!booth || !a) return null;
  const W = booth.width.value, D = booth.depth.value, A = booth.aisle.value;
  const g = a.grid;
  const wallH = 2500;
  // columns run to the hall ceiling; drawn a little over the height limit so they read as building, not stand
  const colH = Math.max(booth.heightLimit.value + 1500, 5000);
  const wall: Record<BoothSide, { pos: [number, number, number]; size: [number, number, number] }> = {
    front: { pos: [0, -D / 2, wallH / 2], size: [W, 20, wallH] }, back: { pos: [0, D / 2, wallH / 2], size: [W, 20, wallH] },
    left: { pos: [-W / 2, 0, wallH / 2], size: [20, D, wallH] }, right: { pos: [W / 2, 0, wallH / 2], size: [20, D, wallH] },
  };
  const aisle: Record<BoothSide, { pos: [number, number, number]; size: [number, number] }> = {
    front: { pos: [0, -D / 2 - A / 2, 0.5], size: [W + 2 * A, A] }, back: { pos: [0, D / 2 + A / 2, 0.5], size: [W + 2 * A, A] },
    left: { pos: [-W / 2 - A / 2, 0, 0.6], size: [A, D] }, right: { pos: [W / 2 + A / 2, 0, 0.6], size: [A, D] },
  };
  const labelAt: Record<BoothSide, [number, number, number]> = { front: [0, -D / 2 - A / 2, 0], back: [0, D / 2 + A / 2, 0], left: [-W / 2 - A / 2, 0, 0], right: [W / 2 + A / 2, 0, 0] };
  return (
    <group>
      {/* floor, aisles and overlay are a few mm apart and pushed back in depth, so they never fight at booth scale */}
      <mesh position={[0, 0, 2]} receiveShadow>
        {booth.outline && floorShape ? <shapeGeometry args={[floorShape]} /> : <planeGeometry args={[W, D]} />}
        <meshStandardMaterial color={floor} roughness={0.9} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>
      {SIDES.filter((s) => booth.open[s]).map((s) => (
        <group key={s}>
          <mesh position={aisle[s].pos}><planeGeometry args={aisle[s].size} /><meshBasicMaterial color={aisleColor} transparent opacity={0.7} depthWrite={false} polygonOffset polygonOffsetFactor={3} polygonOffsetUnits={3} /></mesh>
          {!present && <Label position={labelAt[s]} text={`Aisle\t${Math.round(A)} mm`} />}
        </group>
      ))}
      {booth.outline
        ? plotEdges(booth).filter((e) => !e.open).map((e, i) => {
          const len = Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]);
          return <mesh key={i} position={[(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2, wallH / 2]} rotation={[0, 0, Math.atan2(e.b[1] - e.a[1], e.b[0] - e.a[0])]}><boxGeometry args={[len, 20, wallH]} /><meshStandardMaterial color="#c9c9d0" transparent opacity={0.28} depthWrite={false} /></mesh>;
        })
        : SIDES.filter((s) => !booth.open[s]).map((s) => (
          <mesh key={s} position={wall[s].pos}><boxGeometry args={wall[s].size} /><meshStandardMaterial color="#c9c9d0" transparent opacity={0.28} depthWrite={false} /></mesh>
        ))}
      {show && tex && (
        <mesh position={[g.x0 - g.g / 2 + (g.nx * g.g) / 2, g.y0 - g.g / 2 + (g.ny * g.g) / 2, 8]} renderOrder={1}>
          <planeGeometry args={[g.nx * g.g, g.ny * g.g]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      )}
      {show && a.access.map((z) => <Zone key={z.unit} min={z.zone.min} max={z.zone.max} ok={z.approach} />)}
      {(booth.columns ?? []).map((k) => (
        <group key={k.id} position={[k.x, k.y, 0]}>
          <mesh position={[0, 0, colH / 2]} castShadow receiveShadow><boxGeometry args={[k.w, k.d, colH]} /><meshStandardMaterial color="#b9bab7" roughness={0.85} /></mesh>
          {!present && <Label position={[0, 0, colH + 80]} text={`${k.name}\t${Math.round(k.w)} × ${Math.round(k.d)}`} />}
        </group>
      ))}
      {!present && booth.services.map((sp) => (
        <group key={sp.id} position={[sp.x, sp.y, 0]}>
          <mesh position={[0, 0, 12]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[130, 130, 24, 24]} /><meshStandardMaterial color="#e39a1a" /></mesh>
          <Label position={[0, 0, 60]} text={`${sp.name}\t${sp.kind === 'power-data' ? 'power + data' : sp.kind}`} />
        </group>
      ))}
    </group>
  );
}

function Zone({ min, max, ok }: { min: [number, number]; max: [number, number]; ok: boolean }) {
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]].map(([x, y]) => new THREE.Vector3(x, y, 12)));
    return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: ok ? '#4f8a00' : '#e5342b' }));
  }, [min, max, ok]);
  useEffect(() => () => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }, [line]);
  return <primitive object={line} />;
}
