import { useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import type { SavedView } from '../core/presentation';
import type { Vec3 } from '../core/schema';
import { MM } from './ShapeView';

/** What the Present workspace can ask of its canvas: render stills, read the camera, move to a view. */
export interface ViewerApi {
  /** which canvas registered it: a canvas being unmounted can still hold the slot for a moment */
  owner: string;
  render: (views: SavedView[], width: number, height: number) => Promise<string[]>;
  current: () => { eye: Vec3; target: Vec3; fov: number } | null;
  go: (v: SavedView, smooth?: boolean) => void;
}
export const viewer: { api: ViewerApi | null } = { api: null };

// composition mm, Z up → three metres, Y up
export const toThree = (v: Vec3) => new THREE.Vector3(v[0] * MM, v[2] * MM, -v[1] * MM);
const fromThree = (v: THREE.Vector3): Vec3 => [Math.round(v.x / MM), Math.round(-v.z / MM), Math.round(v.y / MM)];

/**
 * Registers the canvas with the Present workspace. A still is rendered with its own camera at the requested
 * size, read back as PNG, and the canvas is put back as it was; DOM labels are never in a still.
 */
export function Capture({ owner }: { owner: string }) {
  const { gl, scene, controls, camera } = useThree();
  useEffect(() => {
    if (!controls) return;
    // drei's CameraControls, registered with makeDefault
    const cc = controls as unknown as { setLookAt: (...a: (number | boolean)[]) => Promise<void>; getPosition: (v: THREE.Vector3) => THREE.Vector3; getTarget: (v: THREE.Vector3) => THREE.Vector3 };
    const api: ViewerApi = {
      owner,
      render: async (views, width, height) => {
        const size = gl.getSize(new THREE.Vector2());
        const ratio = gl.getPixelRatio();
        const out: string[] = [];
        // the canvas's own camera is moved for each still and put back: a separate camera renders without shadows here
        const cam = camera as THREE.PerspectiveCamera;
        const saved = { pos: cam.position.clone(), quat: cam.quaternion.clone(), up: cam.up.clone(), fov: cam.fov, aspect: cam.aspect };
        try {
          gl.setPixelRatio(1);
          gl.setSize(width, height, false);
          for (const v of views) {
            cam.fov = v.fov;
            cam.aspect = width / height;
            // a plan looks straight down: keep the front of the booth at the bottom of the frame
            if (Math.abs(v.eye[0] - v.target[0]) < 1 && Math.abs(v.eye[1] - v.target[1]) < 5) cam.up.set(0, 0, -1); else cam.up.set(0, 1, 0);
            cam.position.copy(toThree(v.eye));
            cam.lookAt(toThree(v.target));
            cam.updateProjectionMatrix();
            cam.updateMatrixWorld();
            gl.render(scene, cam);
            out.push(gl.domElement.toDataURL('image/png'));
          }
        } finally {
          cam.position.copy(saved.pos); cam.quaternion.copy(saved.quat); cam.up.copy(saved.up);
          cam.fov = saved.fov; cam.aspect = saved.aspect; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
          gl.setPixelRatio(ratio);
          gl.setSize(size.x, size.y, false);
          gl.render(scene, camera);
        }
        return out;
      },
      current: () => {
        return { eye: fromThree(cc.getPosition(new THREE.Vector3())), target: fromThree(cc.getTarget(new THREE.Vector3())), fov: (camera as THREE.PerspectiveCamera).fov };
      },
      go: (v, smooth = true) => {
        const cam = camera as THREE.PerspectiveCamera;
        if (cam.fov !== v.fov) { cam.fov = v.fov; cam.updateProjectionMatrix(); }
        const e = toThree(v.eye), t = toThree(v.target);
        // a tiny offset keeps a straight-down view from flipping the controls
        const plan = Math.abs(e.x - t.x) < 1e-3 && Math.abs(e.z - t.z) < 5e-3;
        cc.setLookAt(e.x, e.y, plan ? e.z + 1e-3 : e.z, t.x, t.y, t.z, smooth);
      },
    };
    viewer.api = api;
    return () => { if (viewer.api === api) viewer.api = null; };
  }, [gl, scene, controls, camera, owner]);
  return null;
}
