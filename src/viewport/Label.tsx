import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * A screen-space text label pinned to a point in the scene. It is a plain DOM element moved every frame,
 * not a nested React root, so it can mount and unmount with the scene at any time.
 * (drei's <Html> unmounts its own React root inside the scene's commit, which React 19 rejects.)
 */
export function Label({ position, text, className = 'dim-label', dot, title }: { position: [number, number, number]; text: string; className?: string; dot?: string; title?: string }) {
  const { gl, camera, size } = useThree();
  const anchor = useRef<THREE.Object3D>(null);
  const el = useMemo(() => {
    const d = document.createElement('div');
    d.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;z-index:2;will-change:transform;';
    return d;
  }, []);
  useEffect(() => {
    const target = gl.domElement.parentElement;
    target?.appendChild(el);
    return () => { el.remove(); };
  }, [gl, el]);
  useEffect(() => {
    el.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = className;
    if (title) inner.title = title;
    const [head, ...rest] = text.split('\t');
    if (rest.length) { const b = document.createElement('b'); b.textContent = head; inner.append(b, ` ${rest.join(' ')}`); } else inner.textContent = text;
    if (dot) { const i = document.createElement('i'); i.style.background = dot; inner.append(i); }
    el.append(inner);
  }, [el, text, className, dot, title]);
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const o = anchor.current;
    if (!o) return;
    o.getWorldPosition(v);
    v.project(camera);
    const hidden = v.z > 1 || !o.visible;
    el.style.display = hidden ? 'none' : '';
    el.style.transform = `translate3d(${((v.x + 1) / 2) * size.width}px, ${((1 - v.y) / 2) * size.height}px, 0) translate(-50%, -50%)`;
  });
  return <object3D ref={anchor} position={position} />;
}
