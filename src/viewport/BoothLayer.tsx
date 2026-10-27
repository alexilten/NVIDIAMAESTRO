import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { CELL, DECK_DEFAULTS, SIDES, accessRect, deckRect, stairRun } from '../core/booth';
import type { BoothDeck, BoothSide } from '../core/schema';
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
        <planeGeometry args={[W, D]} />
        <meshStandardMaterial color={floor} roughness={0.9} polygonOffset polygonOffsetFactor={2} polygonOffsetUnits={2} />
      </mesh>
      {SIDES.filter((s) => booth.open[s]).map((s) => (
        <group key={s}>
          <mesh position={aisle[s].pos}><planeGeometry args={aisle[s].size} /><meshBasicMaterial color={aisleColor} transparent opacity={0.7} depthWrite={false} polygonOffset polygonOffsetFactor={3} polygonOffsetUnits={3} /></mesh>
          {!present && <Label position={labelAt[s]} text={`Aisle\t${Math.round(A)} mm`} />}
        </group>
      ))}
      {SIDES.filter((s) => !booth.open[s]).map((s) => (
        <mesh key={s} position={wall[s].pos}><boxGeometry args={wall[s].size} /><meshStandardMaterial color="#c9c9d0" transparent opacity={0.28} depthWrite={false} /></mesh>
      ))}
      {show && tex && (
        <mesh position={[g.x0 - g.g / 2 + (g.nx * g.g) / 2, g.y0 - g.g / 2 + (g.ny * g.g) / 2, 8]} renderOrder={1}>
          <planeGeometry args={[g.nx * g.g, g.ny * g.g]} />
          <meshBasicMaterial map={tex} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      )}
      {show && a.access.map((z) => <Zone key={z.unit} min={z.zone.min} max={z.zone.max} ok={z.approach} z={(booth.decks ?? []).find((k) => k.id === z.deck)?.level ?? 0} />)}
      {(booth.decks ?? []).map((k) => <Deck key={k.id} k={k} label={!present} />)}
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

function Zone({ min, max, ok, z = 0 }: { min: [number, number]; max: [number, number]; ok: boolean; z?: number }) {
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]].map(([x, y]) => new THREE.Vector3(x, y, z + 12)));
    return new THREE.LineLoop(g, new THREE.LineBasicMaterial({ color: ok ? '#4f8a00' : '#e5342b' }));
  }, [min, max, ok, z]);
  useEffect(() => () => { line.geometry.dispose(); (line.material as THREE.Material).dispose(); }, [line]);
  return <primitive object={line} />;
}

const DECK_COLOR = '#d8d8d4';

/** an upper deck: floor slab on corner posts, a glass guard rail, a stepped stair and a lift shaft */
function Deck({ k, label }: { k: BoothDeck; label: boolean }) {
  const r = deckRect(k), slab = DECK_DEFAULTS.slab.value, post = DECK_DEFAULTS.post.value, guard = DECK_DEFAULTS.guard.value;
  const corners: [number, number][] = [[r.min[0] + post / 2, r.min[1] + post / 2], [r.max[0] - post / 2, r.min[1] + post / 2], [r.min[0] + post / 2, r.max[1] - post / 2], [r.max[0] - post / 2, r.max[1] - post / 2]];
  const rails: { pos: [number, number, number]; size: [number, number, number] }[] = [
    { pos: [k.x, r.min[1], k.level + guard / 2], size: [k.w, 20, guard] }, { pos: [k.x, r.max[1], k.level + guard / 2], size: [k.w, 20, guard] },
    { pos: [r.min[0], k.y, k.level + guard / 2], size: [20, k.d, guard] }, { pos: [r.max[0], k.y, k.level + guard / 2], size: [20, k.d, guard] },
  ];
  const steps = useMemo(() => {
    if (!k.stair) return [];
    const s = accessRect(k, k.stair, 'stair'), run = stairRun(k), rise = k.level / run.risers, going = run.length / run.risers;
    return Array.from({ length: run.risers }, (_, i) => {
      const h = rise * (i + 1), t = going * (run.risers - i);
      // each step is a slab at its tread height reaching from the deck edge; stacked, they make the solid flight
      const [x0, y0, x1, y1] = k.stair!.side === 'front' ? [s.min[0], s.max[1] - t, s.max[0], s.max[1]] : k.stair!.side === 'back' ? [s.min[0], s.min[1], s.max[0], s.min[1] + t] : k.stair!.side === 'left' ? [s.max[0] - t, s.min[1], s.max[0], s.max[1]] : [s.min[0], s.min[1], s.min[0] + t, s.max[1]];
      return { pos: [(x0 + x1) / 2, (y0 + y1) / 2, h / 2] as [number, number, number], size: [x1 - x0, y1 - y0, rise] as [number, number, number], z: h - rise / 2 };
    });
  }, [k]);
  const lift = k.lift ? accessRect(k, k.lift, 'lift') : null;
  const liftH = k.level + 2300;
  return (
    <group>
      <mesh position={[k.x, k.y, k.level - slab / 2]} castShadow receiveShadow><boxGeometry args={[k.w, k.d, slab]} /><meshStandardMaterial color={DECK_COLOR} roughness={0.8} /></mesh>
      {corners.map(([x, y], i) => <mesh key={i} position={[x, y, (k.level - slab) / 2]} castShadow><boxGeometry args={[post, post, k.level - slab]} /><meshStandardMaterial color="#9a9b98" roughness={0.6} metalness={0.3} /></mesh>)}
      {rails.map((g, i) => <mesh key={i} position={g.pos}><boxGeometry args={g.size} /><meshStandardMaterial color="#cfe3ea" transparent opacity={0.35} depthWrite={false} /></mesh>)}
      {steps.map((st, i) => <mesh key={i} position={[st.pos[0], st.pos[1], st.z]} castShadow receiveShadow><boxGeometry args={st.size} /><meshStandardMaterial color={DECK_COLOR} roughness={0.85} /></mesh>)}
      {lift && <mesh position={[(lift.min[0] + lift.max[0]) / 2, (lift.min[1] + lift.max[1]) / 2, liftH / 2]}><boxGeometry args={[lift.max[0] - lift.min[0], lift.max[1] - lift.min[1], liftH]} /><meshStandardMaterial color="#cfe3ea" transparent opacity={0.4} depthWrite={false} /></mesh>}
      {label && <Label position={[k.x, k.y, k.level + guard + 120]} text={`${k.name}\t+${Math.round(k.level)} · ${Math.round(k.w)} × ${Math.round(k.d)}`} />}
    </group>
  );
}
