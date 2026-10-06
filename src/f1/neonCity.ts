// The city of lights round a street circuit at night (layout.neon: Neon
// Strip's): hotel and casino towers on the town's plots behind the barriers,
// dark glass lit window by window, each crowned with a band of neon in its own
// colour and neon signs down its front; and the landmarks: a giant sphere of
// lights, its colours swirling; a great observation wheel, lit round its rim,
// turning slowly; and a black glass pyramid with a beam of light straight up
// into the sky from its tip. None hides the track from the camera (the towers
// as the town's do; the landmarks tested). Engine-free (their spots and
// sizes, unit-tested); buildNeonCity draws it.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import { canvas } from '../engine/render/sprites';
import { pixelTexture } from '../engine/render/textures';
import { mergedByMaterial } from '../engine/render/merge';
import { HALF_WIDTH, type Circuit } from './circuit';
import type { Pt } from './racing';
import { seeOver, townBlocks, type Block } from './town3d';

export const NEON = {
  /** the sphere: px across (radius); the wheel: px across (radius) and its hub's height; the pyramid: px across its base (half) and high */
  sphere: 80,
  wheel: 70,
  pyramid: 70,
  pyramidHigh: 80,
  /** px from the track the towers start (behind the barriers), and px beyond that they go on (out of sight past it) */
  keep: 70,
  reach: 200,
  /** px square the towers are drawn in pieces of (each a mesh: those out of the picture not drawn) */
  tile: 600,
};

const NEON_COLORS = [0xff3fa8, 0x3ff0ff, 0xb05cff, 0x5cff7a, 0xffa23f, 0xff4a4a, 0xfff04a];
const GLASS = ['#1a1830', '#22183a', '#141e30', '#2a1a2a', '#16222a'];

/** The landmarks' spots (on the map; none at a circuit without them). */
export function neonOf(circuit: Circuit): { sphere: Pt; wheel: Pt; pyramid: Pt } | undefined {
  const n = circuit.layout.neon;
  if (!n) return undefined;
  const { scale } = circuit.layout;
  const at = ([x, y]: [number, number]) => ({ x: x * scale - circuit.offset.x, y: y * scale - circuit.offset.y });
  return { sphere: at(n.sphere), wheel: at(n.wheel), pyramid: at(n.pyramid) };
}

/** The landmarks' footprints, to keep the towers off them: each its middle and half its width and depth. */
function footprints(n: NonNullable<ReturnType<typeof neonOf>>) {
  return [
    { x: n.sphere.x, y: n.sphere.y, w: NEON.sphere * 2 + 20, d: NEON.sphere * 2 + 20 },
    { x: n.wheel.x, y: n.wheel.y, w: NEON.wheel * 2 + 30, d: 40 },
    { x: n.pyramid.x, y: n.pyramid.y, w: NEON.pyramid * 2 + 20, d: NEON.pyramid * 2 + 20 },
  ];
}

/** The towers: on the town's plots behind the barriers, off the landmarks, never so tall they hide the track. */
export function towersOf(circuit: Circuit): Block[] {
  const n = neonOf(circuit);
  const samples = circuit.track.samples;
  const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
  let seed = 17;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const keep = HALF_WIDTH + (circuit.layout.street?.runoff ?? 28) + NEON.keep;
  // (only those in sight of the track: past that, the city is dark ground)
  return townBlocks(circuit, [], fromTrack, keep, r, n ? footprints(n) : []).filter((b) => fromTrack(b.x, b.y) < keep + NEON.reach);
}

/** A tower's glass: dark, one bay of one storey, its window (in `lit`: whether it's lit, for the glow). */
function glassTexture(wall: string, lit: boolean): THREE.Texture {
  const [c, x] = canvas(8, 8);
  x.fillStyle = lit ? '#000000' : wall;
  x.fillRect(0, 0, 8, 8);
  // (a lit window, in some bays; warm or cool)
  x.fillStyle = lit ? '#ffe7a8' : '#2c2a40';
  x.fillRect(1, 2, 6, 4);
  const t = pixelTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A texture of lit and dark windows, `cols` × `rows` of them, scattered lit (for the glow map). */
function windowsLit(cols: number, rows: number, r: () => number): THREE.Texture {
  const [c, x] = canvas(cols * 4, rows * 4);
  x.fillStyle = '#000000';
  x.fillRect(0, 0, cols * 4, rows * 4);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (r() < 0.45) continue;
      x.fillStyle = r() < 0.75 ? '#ffd890' : '#9ad8ff';
      x.fillRect(i * 4 + 1, j * 4 + 1, 2, 2);
    }
  }
  const t = pixelTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The sphere's lights: bands of colour, swirling (its texture scrolls). */
function sphereTexture(): THREE.Texture {
  const [c, x] = canvas(64, 32);
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 32; j++) {
      const v = Math.sin(i * 0.3 + j * 0.45) + Math.sin(i * 0.12 - j * 0.2);
      const hue = (v * 60 + 280) % 360;
      x.fillStyle = `hsl(${hue}, 95%, ${55 + v * 8}%)`;
      x.fillRect(i, j, 1, 1);
    }
  }
  const t = pixelTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** The city in `scene`. Gives back its step (`dt` s on): the sphere's lights and the wheel turning, the neon flickering on. */
export function buildNeonCity(scene: THREE.Scene, circuit: Circuit): (dt: number) => void {
  const grid = circuit.grid;
  const ground = (x: number, y: number) => groundAt(grid, x, y).h;
  let seed = 29;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // the towers: dark glass, lit windows (glowing), a band of neon round each top, a neon sign down the front of some
  const towers = towersOf(circuit);
  const glass = GLASS.map((wall) => {
    const lit = windowsLit(4, 6, r);
    return new THREE.MeshLambertMaterial({ map: glassTexture(wall, false), emissive: 0xffffff, emissiveMap: lit, emissiveIntensity: 1.2 });
  });
  const roof = new THREE.MeshLambertMaterial({ color: 0x2c2a44, emissive: 0x100c22 });
  const neon = NEON_COLORS.map((color) => new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  // (in tiles of the map: each a mesh of its own, so those out of the picture aren't drawn)
  const tiles = new Map<string, { geometry: THREE.BufferGeometry; faces: THREE.Material[] }[]>();
  let parts: { geometry: THREE.BufferGeometry; faces: THREE.Material[] }[] = [];
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    parts.push({ geometry: g, faces: g.groups.map(() => m) });
    return g;
  };
  towers.forEach((b, k) => {
    const key = `${Math.floor(b.x / NEON.tile)},${Math.floor(b.y / NEON.tile)}`;
    parts = tiles.get(key) ?? tiles.set(key, []).get(key)!;
    const foot = ground(b.x, b.y);
    const walls = new THREE.BoxGeometry(b.w, b.h, b.d);
    // (the windows a bay and a storey each, by the tower's size)
    const uv = walls.attributes.uv;
    for (let f = 0; f < 6; f++) {
      const across = f < 2 ? b.d : b.w;
      const up = f === 2 || f === 3 ? b.d : b.h;
      for (let v = f * 4; v < f * 4 + 4; v++) uv.setXY(v, (uv.getX(v) * across) / 8, (uv.getY(v) * up) / 8);
    }
    walls.translate(b.x, foot + b.h / 2, b.y);
    const g = glass[k % glass.length];
    parts.push({ geometry: walls, faces: [g, g, roof, roof, g, g] });
    const n = neon[(k * 3) % neon.length];
    // (the crown: a band of neon round the top)
    const top = foot + b.h;
    box(b.w + 1.4, 1.6, 1.4, b.x, top - 1, b.y - b.d / 2, n);
    box(b.w + 1.4, 1.6, 1.4, b.x, top - 1, b.y + b.d / 2, n);
    box(1.4, 1.6, b.d + 1.4, b.x - b.w / 2, top - 1, b.y, n);
    box(1.4, 1.6, b.d + 1.4, b.x + b.w / 2, top - 1, b.y, n);
    // (a sign down one corner, on most)
    if (k % 3 !== 2 && b.h > 30) box(2, b.h * 0.6, 2, b.x + (k % 2 ? 1 : -1) * (b.w / 2 + 1), foot + b.h * 0.5, b.y + b.d / 2 + 1, neon[(k * 5 + 2) % neon.length]);
  });
  for (const list of tiles.values()) {
    const city = mergedByMaterial(list);
    city.castShadow = city.receiveShadow = true;
    scene.add(city);
  }
  const n = neonOf(circuit);
  if (!n) return () => {};
  // the sphere: a giant ball of lights, on a low plinth, its colours swirling
  const sphereTex = sphereTexture();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(NEON.sphere, 24, 16), new THREE.MeshBasicMaterial({ map: sphereTex, toneMapped: false }));
  sphere.position.set(n.sphere.x, ground(n.sphere.x, n.sphere.y) + NEON.sphere * 0.92, n.sphere.y);
  scene.add(sphere);
  // the wheel: a ring on two legs, its rim lit, cabins round it, turning slowly (across the camera's view: seen whole)
  const wheel = new THREE.Group();
  const hub = ground(n.wheel.x, n.wheel.y) + NEON.wheel + 10;
  wheel.position.set(n.wheel.x, hub, n.wheel.y);
  const steel = new THREE.MeshLambertMaterial({ color: 0xc8ccd8 });
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(3, hub - ground(n.wheel.x, n.wheel.y) + 4, 3).translate(0, -(hub - ground(n.wheel.x, n.wheel.y)) / 2, 0), steel);
    leg.position.x = side * 14;
    leg.rotation.z = side * 0.18;
    wheel.add(leg);
  }
  const spin = new THREE.Group();
  wheel.add(spin);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(NEON.wheel, 1.6, 6, 48), new THREE.MeshBasicMaterial({ color: 0xff4ad8, toneMapped: false }));
  spin.add(rim);
  const cabins: THREE.Mesh[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.8, NEON.wheel, 0.8).translate(0, NEON.wheel / 2, 0), steel);
    spoke.rotation.z = a;
    spin.add(spoke);
    const cabin = new THREE.Mesh(new THREE.SphereGeometry(4.5, 8, 6).scale(1.3, 1, 1), new THREE.MeshBasicMaterial({ color: k % 2 ? 0x9af0ff : 0xfff0c0, toneMapped: false }));
    cabin.position.set(Math.cos(a) * NEON.wheel, Math.sin(a) * NEON.wheel, 0);
    spin.add(cabin);
    cabins.push(cabin);
  }
  scene.add(wheel);
  // the pyramid: black glass, its edges lit, and a beam of light straight up from its tip
  const pyramidFoot = ground(n.pyramid.x, n.pyramid.y);
  const pyramid = new THREE.Mesh(
    new THREE.ConeGeometry(NEON.pyramid * Math.SQRT2, NEON.pyramidHigh, 4).rotateY(Math.PI / 4),
    new THREE.MeshLambertMaterial({ color: 0x2a2a44, emissive: 0x141030, flatShading: true }),
  );
  pyramid.position.set(n.pyramid.x, pyramidFoot + NEON.pyramidHigh / 2, n.pyramid.y);
  pyramid.castShadow = true;
  scene.add(pyramid);
  // (its four edges lit gold, from its corners up to its tip)
  const gold = new THREE.MeshBasicMaterial({ color: 0xffc84a, toneMapped: false });
  const tip = new THREE.Vector3(n.pyramid.x, pyramidFoot + NEON.pyramidHigh, n.pyramid.y);
  for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const corner = new THREE.Vector3(n.pyramid.x + u * NEON.pyramid, pyramidFoot, n.pyramid.y + v * NEON.pyramid);
    scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(corner, tip), 1, 1.2, 4), gold));
  }
  // the beam: a bright core straight up from the tip, in a soft halo
  const beamMat = (color: number, opacity: number) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const [r0, r1, color, opacity] of [[1.5, 2.5, 0xffffff, 0.9], [6, 12, 0x9ac8ff, 0.18]] as const) {
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, 900, 10, 1, true), beamMat(color, opacity));
    beam.position.set(n.pyramid.x, pyramidFoot + NEON.pyramidHigh + 450, n.pyramid.y);
    scene.add(beam);
  }
  let time = 0;
  return (dt: number) => {
    time += dt;
    sphereTex.offset.x = time * 0.03;
    sphereTex.offset.y = Math.sin(time * 0.2) * 0.1;
    spin.rotation.z = -time * 0.08;
    // (the cabins hang level as the wheel turns)
    for (const c of cabins) c.rotation.z = time * 0.08;
    (rim.material as THREE.MeshBasicMaterial).color.setHSL((time * 0.05) % 1, 0.9, 0.6);
  };
}

/** Whether `kind`'s landmark hides any of the track from the camera (it mustn't): its height at its spot against what the camera sees over there. */
export function landmarkHides(circuit: Circuit, kind: 'sphere' | 'wheel' | 'pyramid'): boolean {
  const n = neonOf(circuit);
  if (!n) return false;
  const at = n[kind];
  const [w, d, h] =
    kind === 'sphere' ? [NEON.sphere * 2, NEON.sphere * 2, NEON.sphere * 1.92]
    : kind === 'wheel' ? [NEON.wheel * 2 + 10, 10, NEON.wheel * 2 + 10]
    : [NEON.pyramid * 2, NEON.pyramid * 2, NEON.pyramidHigh];
  return seeOver(circuit, at.x, at.y, w, d) < h;
}
