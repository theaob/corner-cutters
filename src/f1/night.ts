// Racing at night (layout.night: Neon Strip's): the sky dark, the light
// moonlight and the city's glow; street lamps along both sides of the track,
// each throwing a warm pool of light onto it, so the racing reads in the dark.
// The sky for any weather made its night (nightSky, unit-tested); the lamps'
// spots along the lap (lampsOf, unit-tested); buildStreetLights draws them.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';
import type { SkyState } from '../engine/render/daylight';
import { HALF_WIDTH, type Circuit } from './circuit';

export const NIGHT = {
  /** the glow (bloom) at night, stronger than by day: the neon and the lamps shine */
  bloom: 0.7,
  /** px between lamps along each side, and px out past the track's edge they stand */
  lampEvery: 150,
  lampOut: 14,
  /** px up the lamp's head is; px across the pool of light it throws */
  lampHigh: 30,
  pool: 120,
};

/** `sky` (a weather's, by day) at night: a dark violet sky, the light cool moonlight and the city's warm glow, as much darker as the weather is dull. */
export function nightSky(sky: SkyState): SkyState {
  // (how bright the day would be: a clear day's 2.6 down to an overcast one's)
  const day = Math.min(1, sky.keyIntensity / 2.6);
  return {
    ...sky,
    background: 0x0b0a24,
    sky: 0x4a4a9a,
    ground: 0x3a2030,
    ambient: 0.9 + 0.25 * (1 - day),
    key: 0xa8b4ff,
    keyIntensity: 0.25 + 0.35 * day,
    moon: true,
    lights: 1,
  };
}

/** Where the lamps stand: along both sides of the track, every so often, just past its edge, and which way their arms reach (over the track). */
export function lampsOf(circuit: Circuit): { x: number; y: number; dir: number; reach: number }[] {
  const { samples, spacing } = circuit.track;
  const step = Math.max(1, Math.round(NIGHT.lampEvery / spacing));
  const out: { x: number; y: number; dir: number; reach: number }[] = [];
  const runoff = circuit.layout.street?.runoff ?? 72;
  const off = HALF_WIDTH + runoff + NIGHT.lampOut;
  for (let i = 0; i < samples.length; i += step) {
    const p = samples[i];
    // (staggered: one side, then the other half a step on)
    const side = (i / step) % 2 === 0 ? 1 : -1;
    const x = p.x + Math.cos(p.dir) * off * side;
    const y = p.y + Math.sin(p.dir) * off * side;
    // (not where another stretch of track runs: a lamp is never on the racing surface)
    if (samples.some((q) => Math.hypot(q.x - x, q.y - y) < HALF_WIDTH + 10)) continue;
    out.push({ x, y, dir: p.dir + (side > 0 ? Math.PI : 0), reach: off - HALF_WIDTH * 0.4 });
  }
  return out;
}

/** A soft round pool of light: bright in the middle, fading to nothing at its edge. */
function poolTexture(): THREE.Texture {
  const N = 64;
  const c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(255,226,170,0.9)');
  g.addColorStop(0.45, 'rgba(255,210,150,0.45)');
  g.addColorStop(1, 'rgba(255,200,140,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The street lamps in `scene` (on `grid`'s ground): their posts and arms, their glowing heads, and the pools of light they throw on the track. */
export function buildStreetLights(scene: THREE.Scene, grid: Grid, circuit: Circuit): void {
  const lamps = lampsOf(circuit);
  if (!lamps.length) return;
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(2, NIGHT.lampHigh, 2).translate(0, NIGHT.lampHigh / 2, 0), new THREE.MeshLambertMaterial({ color: 0x3a3c48 }), lamps.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.4, 1).translate(0, 0, 0.5), new THREE.MeshLambertMaterial({ color: 0x3a3c48 }), lamps.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 1.6, 3), new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false }), lamps.length);
  const pool = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(NIGHT.pool, NIGHT.pool).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: poolTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55, toneMapped: false }),
    lamps.length,
  );
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  lamps.forEach((l, k) => {
    const h = groundAt(grid, l.x, l.y).h;
    // (the arm reaches out over the track, toward its middle: `dir` is the way across, from the lamp)
    const ax = Math.cos(l.dir);
    const ay = Math.sin(l.dir);
    q.setFromAxisAngle(up, -l.dir + Math.PI / 2);
    m.compose(new THREE.Vector3(l.x, h, l.y), q, one);
    post.setMatrixAt(k, m);
    m.compose(new THREE.Vector3(l.x, h + NIGHT.lampHigh, l.y), q, new THREE.Vector3(1, 1, l.reach * 0.55));
    arm.setMatrixAt(k, m);
    const hx = l.x + ax * l.reach * 0.55;
    const hy = l.y + ay * l.reach * 0.55;
    m.compose(new THREE.Vector3(hx, h + NIGHT.lampHigh - 1, hy), q, one);
    head.setMatrixAt(k, m);
    // (its pool on the track under it, just above the ground)
    const px = l.x + ax * l.reach;
    const py = l.y + ay * l.reach;
    m.compose(new THREE.Vector3(px, groundAt(grid, px, py).h + 0.6, py), new THREE.Quaternion(), one);
    pool.setMatrixAt(k, m);
  });
  post.castShadow = true;
  pool.renderOrder = 2;
  for (const mesh of [post, arm, head, pool]) {
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
}
