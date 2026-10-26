import { ContactShadows, Environment, Lightformer } from '@react-three/drei';

/** The soft white studio shared by the product viewer and the compose canvas. */
export function Studio({ span, shadows = true }: { span: number; shadows?: boolean }) {
  const s = Math.max(span, 0.5);
  return (
    <>
      <color attach="background" args={['#f4f4f6']} />
      <hemisphereLight args={['#ffffff', '#e6e3de', 0.7]} />
      <directionalLight
        position={[-s * 1.2, s * 2.4, s * 1.6]} intensity={1.6} castShadow={shadows}
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0002} shadow-normalBias={0.02}
        shadow-camera-left={-s * 2} shadow-camera-right={s * 2} shadow-camera-top={s * 2} shadow-camera-bottom={-s * 2}
        shadow-camera-near={0.01} shadow-camera-far={s * 8}
      />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.6} position={[0, 6, 2]} rotation-x={Math.PI / 2} scale={[12, 6, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[-8, 3, 4]} rotation-y={Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer form="rect" intensity={1.2} position={[8, 3, 4]} rotation-y={-Math.PI / 2} scale={[10, 3, 1]} />
        <Lightformer form="ring" intensity={0.5} color="#e8f5d0" position={[0, 3, -9]} scale={5} />
      </Environment>
      {shadows && <ContactShadows position={[0, 0.0005, 0]} scale={s * 6} blur={2.4} opacity={0.42} far={s * 2} resolution={1024} color="#1d1d24" />}
    </>
  );
}
