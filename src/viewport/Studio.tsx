import { ContactShadows, Environment, Lightformer, SoftShadows } from '@react-three/drei';

export type Look = 'studio' | 'hall';

/** colours for each look: the stage background, and the booth floor and aisles drawn by BoothLayer */
// presentation trades some of the image-based light for a stronger key, so shadows read on a pale floor
export const LOOK: Record<Look, { label: string; background: string; floor: string; aisle: string; key: number; fill: number; env: number }> = {
  studio: { label: 'Studio', background: '#f4f4f6', floor: '#efefec', aisle: '#e2e2e6', key: 3.2, fill: 0.35, env: 0.4 },
  hall: { label: 'Hall', background: '#d9dadb', floor: '#8e9194', aisle: '#c7c8ca', key: 3.4, fill: 0.3, env: 0.35 },
};

/**
 * The soft white studio shared by the product viewer and the compose canvas. `contactY` lifts the contact
 * shadow above a booth floor; `soft` turns on percentage-closer soft shadows for presentation stills.
 */
export function Studio({ span, shadows = true, contactY = 0.0005, look = 'studio', soft = false }: { span: number; shadows?: boolean; contactY?: number; look?: Look; soft?: boolean }) {
  const s = Math.max(span, 0.5);
  const L = LOOK[look];
  // presentation tightens the shadow frustum to the scene so shadows stay crisp at booth scale
  const c = soft ? 0.9 : 2;
  // presentation keys from high behind left, so shadows fall forward where the front views can see them;
  // the editor keeps its even, bright light; only presentation uses the look's balance
  const key = soft ? L.key : 1.6, fill = soft ? L.fill : 0.7, env = soft ? L.env : 1;
  return (
    <>
      <color attach="background" args={[L.background]} />
      {soft && <SoftShadows size={22} samples={14} focus={0.4} />}
      <hemisphereLight args={['#ffffff', '#e6e3de', fill]} />
      <directionalLight
        position={soft ? [-s * 0.9, s * 2.6, -s * 0.7] : [-s * 1.2, s * 2.4, s * 1.6]} intensity={key} castShadow={shadows}
        shadow-mapSize={soft ? [4096, 4096] : [2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.02}
        shadow-camera-left={-s * c} shadow-camera-right={s * c} shadow-camera-top={s * c} shadow-camera-bottom={-s * c}
        shadow-camera-near={0.01} shadow-camera-far={s * 8}
      />
      <Environment resolution={256} frames={1} environmentIntensity={env}>
        <Lightformer form="rect" intensity={2.6} position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-8, 3, 4]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[8, 3, 4]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer form="ring" intensity={0.5} color="#e8f5d0" position={[0, 3, -9]} scale={5} />
      </Environment>
      {shadows && <ContactShadows position={[0, contactY, 0]} scale={s * (soft ? 3 : 6)} blur={2.4} opacity={look === 'hall' ? 0.55 : 0.42} far={soft ? Math.min(s, 3) : s * 2} resolution={1024} color="#1d1d24" />}
    </>
  );
}
