// The volcano (layout.volcano: Volcano Isle's): a great cone of dark rock
// north of the circuit (behind it from the camera, so it hides none of it), its
// crater glowing, lava streaming down its face and smoke rising from it,
// drifting off on the wind; a river of lava from its foot round the outside of
// the circuit and across the Lava Run just past the jump's lip (the cars fly
// over it), into a lava lake in the infield. The lava glows (unlit, so the
// bloom takes it), its crust flowing on it. Scenery only: the trees and the
// grandstands keep clear of it (nearLava). Engine-free (where it all is,
// unit-tested); buildVolcano draws it.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';
import { pixelTexture } from '../engine/render/textures';
import { canvas } from '../engine/render/sprites';
import type { Circuit } from './circuit';
import type { Pt } from './racing';

export const VOLCANO = {
  /** the cone: px across its foot (radius) and its crater (radius), px high */
  foot: 500,
  crater: 80,
  height: 360,
  /** px across the lava river, and its lake (radius) */
  river: 26,
  lake: 120,
  /** px of crust (dark, cooled rock) along the river's banks and round the lake */
  bank: 8,
  /** puffs of smoke over the crater: how many, px/s they rise, s each lasts */
  puffs: 18,
  rise: 26,
  life: 9,
  /** px/s the lava's crust flows along the river */
  flow: 14,
};

export interface Volcano {
  /** the cone's middle (its foot on the map) */
  cone: Pt;
  /** the lava river, from the volcano's foot to the lake */
  river: Pt[];
  /** the lava lake's middle */
  lake: Pt;
}

/** The volcano at `circuit` (none: undefined), on the map. */
export function volcanoOf(circuit: Circuit): Volcano | undefined {
  const v = circuit.layout.volcano;
  if (!v) return undefined;
  const { scale } = circuit.layout;
  const at = ([x, y]: [number, number]) => ({ x: x * scale - circuit.offset.x, y: y * scale - circuit.offset.y });
  return { cone: at(v.cone), river: v.river.map(at), lake: at(v.lake) };
}

/** px from (x, y) to the polyline `line`. */
export function toLine(line: Pt[], x: number, y: number): number {
  let best = Infinity;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / (dx * dx + dy * dy || 1)));
    best = Math.min(best, Math.hypot(a.x + t * dx - x, a.y + t * dy - y));
  }
  return best;
}

/** Whether (x, y) is on the lava (river, lake, or the volcano's foot), or within `margin` px of it. */
export function nearLava(v: Volcano | undefined, x: number, y: number, margin = 0): boolean {
  if (!v) return false;
  return (
    toLine(v.river, x, y) < VOLCANO.river / 2 + VOLCANO.bank + margin ||
    Math.hypot(x - v.lake.x, y - v.lake.y) < VOLCANO.lake + VOLCANO.bank + margin ||
    Math.hypot(x - v.cone.x, y - v.cone.y) < VOLCANO.foot + margin
  );
}

/** The lava: molten orange and yellow, glowing, its dark crust in plates on it (tiles along the river, flowing). */
function lavaTexture(): THREE.Texture {
  const N = 32;
  const [c, x] = canvas(N, N);
  let seed = 7;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  x.fillStyle = '#ff7a1a';
  x.fillRect(0, 0, N, N);
  for (let k = 0; k < 40; k++) {
    x.fillStyle = r() < 0.5 ? '#ffd23a' : '#ffae2a';
    x.fillRect(Math.floor(r() * N), Math.floor(r() * N), 1 + Math.floor(r() * 3), 1);
  }
  // (plates of crust, dark red-black, cracked between)
  for (let k = 0; k < 7; k++) {
    x.fillStyle = r() < 0.5 ? '#3a1410' : '#5a1e12';
    x.fillRect(Math.floor(r() * N), Math.floor(r() * N), 3 + Math.floor(r() * 5), 2 + Math.floor(r() * 3));
  }
  const t = pixelTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A ribbon `width` px across along `line`, laid on the ground `lift` px above it; its texture's v along it, every `tile` px. */
function ribbon(line: Pt[], width: number, ground: (x: number, y: number) => number, lift: number, tile: number): THREE.BufferGeometry {
  // (the line, every few px, so the ribbon follows the ground's rise and fall)
  const pts: Pt[] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
    for (let k = 0; k < n; k++) pts.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  pts.push(line[line.length - 1]);
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  let along = 0;
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const nx = -(b.y - a.y) / len;
    const ny = (b.x - a.x) / len;
    if (i) along += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y);
    for (const side of [-1, 1]) {
      const x = p.x + nx * side * (width / 2);
      const y = p.y + ny * side * (width / 2);
      // (on the ground where it is: the river's banks and its lava both follow it, the lava just above its banks)
      pos.push(x, ground(x, y) + lift, y);
      uv.push((side + 1) / 2, along / tile);
    }
    if (i) index.push(2 * i - 2, 2 * i - 1, 2 * i, 2 * i - 1, 2 * i + 1, 2 * i);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

/** The volcano in `scene` (on `grid`'s ground). Gives back its step (`dt` s on). */
export function buildVolcano(scene: THREE.Scene, grid: Grid, circuit: Circuit): (dt: number) => void {
  const v = volcanoOf(circuit);
  if (!v) return () => {};
  const ground = (x: number, y: number) => groundAt(grid, x, y).h;
  const lava = lavaTexture();
  const molten = new THREE.MeshBasicMaterial({ map: lava, toneMapped: false, color: 0xffffff });
  const crust = new THREE.MeshLambertMaterial({ color: 0x241a18 });
  // the river: a bank of dark crust, the lava flowing in it
  const bank = new THREE.Mesh(ribbon(v.river, VOLCANO.river + VOLCANO.bank * 2, ground, 0.3, 32), crust);
  bank.receiveShadow = true;
  const river = new THREE.Mesh(ribbon(v.river, VOLCANO.river, ground, 1.2, 32), molten);
  scene.add(bank, river);
  // the lake: crust round it, the lava in it
  const lakeAt = ground(v.lake.x, v.lake.y);
  const lakeRim = new THREE.Mesh(new THREE.CircleGeometry(VOLCANO.lake + VOLCANO.bank, 24).rotateX(-Math.PI / 2), crust);
  lakeRim.position.set(v.lake.x, lakeAt + 0.3, v.lake.y);
  const lakeTex = lava.clone();
  lakeTex.needsUpdate = true;
  lakeTex.repeat.set(6, 6);
  const lake = new THREE.Mesh(new THREE.CircleGeometry(VOLCANO.lake, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: lakeTex, toneMapped: false }));
  lake.position.set(v.lake.x, lakeAt + 0.7, v.lake.y);
  scene.add(lakeRim, lake);
  // the cone: rugged dark rock, flat-shaded, its slopes rough
  const foot = ground(v.cone.x, v.cone.y);
  const coneGeo = new THREE.CylinderGeometry(VOLCANO.crater, VOLCANO.foot, VOLCANO.height, 18, 6, true);
  const p = coneGeo.getAttribute('position') as THREE.BufferAttribute;
  let seed = 3;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    // (not the rim or the foot: roughened between)
    if (Math.abs(y) > VOLCANO.height / 2 - 1) continue;
    const k = 1 + (r() - 0.5) * 0.12;
    p.setXYZ(i, p.getX(i) * k, y + (r() - 0.5) * 16, p.getZ(i) * k);
  }
  coneGeo.computeVertexNormals();
  const cone = new THREE.Mesh(coneGeo, new THREE.MeshLambertMaterial({ color: 0x3a302e, flatShading: true }));
  cone.position.set(v.cone.x, foot + VOLCANO.height / 2 - 6, v.cone.y);
  cone.castShadow = cone.receiveShadow = true;
  scene.add(cone);
  // its crater: glowing lava a little below the rim
  const top = foot + VOLCANO.height - 6;
  const craterTex = lava.clone();
  craterTex.needsUpdate = true;
  craterTex.repeat.set(4, 4);
  const crater = new THREE.Mesh(new THREE.CircleGeometry(VOLCANO.crater - 4, 18).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: craterTex, toneMapped: false }));
  crater.position.set(v.cone.x, top - 10, v.cone.y);
  scene.add(crater);
  // lava streaming down its face toward the circuit (its south side, the camera's), from the rim to its foot
  const streams = [-0.35, 0.12, 0.5].map((a, k) => {
    const dir = Math.PI / 2 + a; // (south, and a little either way)
    const pts: THREE.Vector3[] = [];
    for (let t = 0; t <= 1; t += 0.1) {
      const rad = VOLCANO.crater + (VOLCANO.foot - VOLCANO.crater) * t;
      const wob = Math.sin(t * 9 + k) * 0.05;
      pts.push(new THREE.Vector3(v.cone.x + Math.cos(dir + wob) * rad, top - VOLCANO.height * t + 4, v.cone.y + Math.sin(dir + wob) * rad));
    }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 5 - k, 4), molten);
    scene.add(tube);
    return tube;
  });
  void streams;
  // the smoke: puffs rising out of the crater, swelling and drifting off east on the wind, fading
  const smokeMat = Array.from({ length: VOLCANO.puffs }, () => new THREE.MeshLambertMaterial({ color: 0x5a5658, transparent: true, opacity: 0.5, depthWrite: false }));
  const puffs = smokeMat.map((m, k) => {
    const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), m);
    scene.add(puff);
    return { puff, m, t: (k / VOLCANO.puffs) * VOLCANO.life, a: r() * Math.PI * 2 };
  });
  let time = 0;
  const step = (dt: number) => {
    time += dt;
    // (the crust flowing along the river, and churning on the lake and in the crater)
    lava.offset.y = -(time * VOLCANO.flow) / 32;
    lakeTex.offset.set(Math.sin(time * 0.2) * 0.3, time * 0.05);
    craterTex.offset.set(time * 0.04, Math.cos(time * 0.3) * 0.2);
    for (const s of puffs) {
      s.t = (s.t + dt) % VOLCANO.life;
      const u = s.t / VOLCANO.life;
      const size = 26 + u * 70;
      s.puff.scale.set(size, size * 0.8, size);
      s.puff.position.set(v.cone.x + Math.cos(s.a) * 20 + u * 260, top + 10 + s.t * VOLCANO.rise, v.cone.y + Math.sin(s.a) * 20 - u * 60);
      s.puff.rotation.y = s.a + u;
      s.m.opacity = 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.4));
    }
  };
  step(0);
  return step;
}
