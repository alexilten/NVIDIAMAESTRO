import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { Shape } from '../core/geometry/shape';
import { MM, WORLD_ROTATION, makeMaterial, partGeometry } from './ShapeView';

/**
 * A product drawn from its own model as a still on a transparent background, three-quarter from the front left,
 * for the image at the top of the inspector. One offscreen renderer serves every product; stills are cached.
 */
const W = 1200, H = 800;
let renderer: THREE.WebGLRenderer | null = null;
let env: THREE.Texture | null = null;
const cache = new Map<string, string>();

function setup(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  const pm = new THREE.PMREMGenerator(renderer);
  env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  pm.dispose();
  return renderer;
}

/** a PNG data URL of the shape, or null when WebGL is unavailable */
export function heroImage(key: string, shape: Shape): string | null {
  const hit = cache.get(key);
  if (hit) return hit;
  let r: THREE.WebGLRenderer;
  try { r = setup(); } catch { return null; }
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.environmentIntensity = 0.55;
  scene.add(new THREE.HemisphereLight('#ffffff', '#d9d6d0', 0.6));
  const key1 = new THREE.DirectionalLight('#ffffff', 1.6);
  scene.add(key1);
  const root = new THREE.Group();
  root.rotation.copy(WORLD_ROTATION);
  root.scale.setScalar(MM);
  const geoms = shape.parts.map(partGeometry);
  const mats = shape.parts.map((p) => makeMaterial(shape.materials[p.material], false));
  geoms.forEach((g, i) => root.add(new THREE.Mesh(g, mats[i])));
  scene.add(root);
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const centre = box.getCenter(new THREE.Vector3());
  // three-quarter from the front left and a little above; the model's front faces −Y, which is +Z here
  const dir = new THREE.Vector3(-0.62, 0.42, 1).normalize();
  const cam = new THREE.PerspectiveCamera(24, W / H, 0.001, 1000);
  const fit = sphere.radius / Math.sin(THREE.MathUtils.degToRad(cam.fov / 2)) * 1.04;
  cam.position.copy(centre).addScaledVector(dir, fit);
  cam.lookAt(centre);
  cam.near = fit / 100; cam.far = fit * 10; cam.updateProjectionMatrix();
  key1.position.copy(centre).add(new THREE.Vector3(-1, 2.2, 1.6).multiplyScalar(sphere.radius * 3));
  r.render(scene, cam);
  const url = r.domElement.toDataURL('image/png');
  geoms.forEach((g) => g.dispose());
  mats.forEach((m) => m.dispose());
  cache.set(key, url);
  return url;
}
