// Rotating 3D previews for the shop (carShop.ts): each tile's car, as the race draws it (createCarMesh), turning slowly.
// One small WebGL renderer draws every tile in turn into a canvas of its own, so a phone holds one context for the
// whole shop however many looks it lists. A helmet's tile moves in on the cockpit, a livery's shows the whole car.

import * as THREE from 'three';
import { createCarMesh, type CarLook } from '../../engine/render/vehicles3d';

export interface Preview3d {
  /** the canvas to put in the tile */
  canvas: HTMLCanvasElement;
  look: Partial<CarLook>;
  /** move in on the helmet, not the whole car */
  closeUp: boolean;
}

const FOV = 28;
/** A turn takes this many seconds, and a frame is drawn at most this often. */
const TURN = 7;
const FRAME = 1 / 30;
/** The helmet's place on the car (vehicles3d.ts), and how much of the car a close-up takes in. */
const HELMET = new THREE.Vector3(0, 7.2, 0.5);
const CLOSE_RADIUS = 14;

/**
 * Draw each of `previews` turning (still, from a three-quarter view, when `still`: less motion asked for), `size` px
 * square. Gives back a stop, or undefined when this device has no WebGL (the tiles keep whatever they show then).
 */
export function startPreviews3d(previews: Preview3d[], size: number, still: boolean): (() => void) | undefined {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
  } catch {
    return undefined;
  }
  renderer.setPixelRatio(1);
  renderer.setSize(size, size, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(-30, 60, 40);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(FOV, 1, 1, 400);

  const items = previews.map((p) => {
    const mesh = createCarMesh('f1', p.look);
    mesh.visible = false;
    scene.add(mesh);
    // (the camera: the car's bounding sphere, or the helmet's, filling the view)
    const sphere = new THREE.Box3().setFromObject(mesh).getBoundingSphere(new THREE.Sphere());
    const target = p.closeUp ? HELMET : sphere.center;
    const dist = ((p.closeUp ? CLOSE_RADIUS : sphere.radius) / Math.sin(THREE.MathUtils.degToRad(FOV / 2))) * 1.12;
    return { mesh, ctx: p.canvas.getContext('2d')!, target, dist, phase: Math.random() };
  });

  let stopped = false;
  let last = -Infinity;
  const draw = (now: number) => {
    if (stopped) return;
    requestAnimationFrame(draw);
    const t = now / 1000;
    if (t - last < FRAME) return;
    last = t;
    for (const it of items) {
      it.mesh.visible = true;
      // (a three-quarter view from above and in front, the car turning on the spot)
      it.mesh.rotation.y = still ? Math.PI * 0.8 : ((t / TURN + it.phase) % 1) * Math.PI * 2;
      camera.position.set(it.target.x, it.target.y + it.dist * 0.5, it.target.z + it.dist * 0.86);
      camera.lookAt(it.target);
      renderer.render(scene, camera);
      it.mesh.visible = false;
      it.ctx.clearRect(0, 0, size, size);
      it.ctx.drawImage(renderer.domElement, 0, 0, size, size);
    }
    // (the still view is drawn once, then left)
    if (still) stop();
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const it of items) it.mesh.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
    });
    renderer.dispose();
  };
  requestAnimationFrame(draw);
  return stop;
}
