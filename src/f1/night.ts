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
  /** px up the lamp's head is */
  lampHigh: 30,
  /** px across the stretch of track a lamp lights (so none is put where it would light another stretch) */
  pool: 120,
  /** the spotlights: how many shine at once (the lamps nearest the camera, the rest dark), their intensity, how far they reach, the cone's half angle (rad) and softness, and how far from the camera they fade out */
  spots: 10,
  spotIntensity: 12,
  spotReach: 340,
  spotAngle: 1.05,
  spotSoft: 0.7,
  spotFade: [380, 560],
};

/** `sky` (a weather's, by day) at night: a dark violet sky, the light cool moonlight and the city's warm glow, as much darker as the weather is dull. */
export function nightSky(sky: SkyState): SkyState {
  // (how bright the day would be: a clear day's 2.6 down to an overcast one's)
  const day = Math.min(1, sky.keyIntensity / 2.6);
  return {
    ...sky,
    background: 0x15133a,
    sky: 0x7a7ad0,
    ground: 0x6a4658,
    ambient: 1.7 + 0.3 * (1 - day),
    key: 0xbcc6ff,
    keyIntensity: 0.5 + 0.5 * day,
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
  // (samples this close along the lap are the lamp's own stretch of track)
  const alongside = Math.ceil(300 / spacing);
  for (let i = 0; i < samples.length; i += step) {
    const p = samples[i];
    // (staggered: one side, then the other half a step on)
    const side = (i / step) % 2 === 0 ? 1 : -1;
    const x = p.x + Math.cos(p.dir) * off * side;
    const y = p.y + Math.sin(p.dir) * off * side;
    // (a lamp is never on the racing surface, nor does its arm or its pool of light reach over another stretch of track: where
    // the road doubles back close by, it is left out)
    const lamp = { x, y, dir: p.dir + (side > 0 ? Math.PI : 0), reach: off - HALF_WIDTH * 0.4 };
    const ax = Math.cos(lamp.dir);
    const ay = Math.sin(lamp.dir);
    const spots = [
      { x, y, r: HALF_WIDTH + 10 },
      { x: x + ax * lamp.reach * 0.55, y: y + ay * lamp.reach * 0.55, r: HALF_WIDTH + 10 },
      { x: x + ax * lamp.reach, y: y + ay * lamp.reach, r: HALF_WIDTH + NIGHT.pool * 0.35 },
    ];
    const clear = samples.every((q, j) => {
      const gap = Math.abs(j - i);
      if (Math.min(gap, samples.length - gap) < alongside) return true;
      return spots.every((c) => Math.hypot(q.x - c.x, q.y - c.y) >= c.r);
    });
    if (!clear) continue;
    out.push(lamp);
  }
  return out;
}

/** The street lamps in `scene` (on `grid`'s ground): their posts and arms and glowing heads, and the spotlights that light the track from them. Returns the step that keeps those lights on the lamps nearest `focus`. */
export function buildStreetLights(scene: THREE.Scene, grid: Grid, circuit: Circuit): (focus: { x: number; y: number }) => void {
  const lamps = lampsOf(circuit);
  if (!lamps.length) return () => {};
  const post = new THREE.InstancedMesh(new THREE.BoxGeometry(2, NIGHT.lampHigh, 2).translate(0, NIGHT.lampHigh / 2, 0), new THREE.MeshLambertMaterial({ color: 0x3a3c48 }), lamps.length);
  const arm = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 1.4, 1).translate(0, 0, 0.5), new THREE.MeshLambertMaterial({ color: 0x3a3c48 }), lamps.length);
  const head = new THREE.InstancedMesh(new THREE.BoxGeometry(6, 1.6, 3), new THREE.MeshBasicMaterial({ color: 0xffe2a8, toneMapped: false }), lamps.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  // (where each lamp's light comes from: its head; and where it points: the track under the arm's tip)
  const spots = lamps.map((l, k) => {
    const h = groundAt(grid, l.x, l.y).h;
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
    const px = l.x + ax * l.reach;
    const py = l.y + ay * l.reach;
    return { from: new THREE.Vector3(hx, h + NIGHT.lampHigh - 2, hy), to: new THREE.Vector3(px, groundAt(grid, px, py).h, py) };
  });
  post.castShadow = true;
  for (const mesh of [post, arm, head]) {
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  // the spotlights themselves: a few, kept on the lamps nearest the camera (every light costs every surface a little, so not one a lamp)
  const lights = Array.from({ length: Math.min(NIGHT.spots, lamps.length) }, () => {
    const light = new THREE.SpotLight(0xffd9a0, 0, NIGHT.spotReach, NIGHT.spotAngle, NIGHT.spotSoft, 0);
    scene.add(light, light.target);
    return light;
  });
  const [near, far] = NIGHT.spotFade;
  return (focus) => {
    const dist = (i: number) => Math.hypot(spots[i].to.x - focus.x, spots[i].to.z - focus.y);
    const nearest = spots.map((_, i) => i).sort((i, j) => dist(i) - dist(j)).slice(0, lights.length);
    nearest.forEach((i, k) => {
      const light = lights[k];
      light.position.copy(spots[i].from);
      light.target.position.copy(spots[i].to);
      light.target.updateMatrixWorld();
      // (fading in and out with the camera's distance, so a lamp coming into range doesn't light up with a pop)
      light.intensity = NIGHT.spotIntensity * Math.min(1, Math.max(0, (far - dist(i)) / (far - near)));
    });
  };
}
