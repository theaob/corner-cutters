// A bronze cow charging through a steel arch, on a grassy rise by the track
// (layout.statue: the Alpine Ring's, beside its long straight). The cow's
// faceted, its weathered bronze cut through with a lattice of holes, its bell
// and its short horns gold; it leaps through the arch the way the cars run,
// head down, front legs up off the ground. Big: taller than the trees round
// it. The forest keeps clear of it (STATUE.clearing), and it stands behind the
// track from the camera, so it hides none of it. Scenery only: engine-free
// (where it stands and what it keeps clear of, unit-tested); buildCowStatue
// draws it.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';
import { pixelTexture } from '../engine/render/textures';
import { canvas } from '../engine/render/sprites';

export const STATUE = {
  /** how big the arch and the cow are, over the sizes they're modelled at below */
  scale: 1.5,
  /** px from its middle that the rise reaches, and the forest keeps clear of */
  clearing: 100,
  /** the grassy rise it stands on: px across (radius) and px high */
  mound: 84,
  rise: 6,
  /** the arch, as modelled: px to the middle of its band, the band's px across and deep; its middle's px above the rise */
  arch: 44,
  band: 6,
  depth: 4,
  centre: 26,
  /** px tall at most, the arch's top (for what it may hide behind it) */
  height: 6 + 1.5 * (26 + 44 + 3),
};

export interface Statue {
  x: number;
  y: number;
  /** the way the cow charges (radians, as Math.atan2 of its run on the map) */
  heading: number;
}

/** The statue a layout has (none: undefined). */
export function statueOf(layout: { statue?: { at: [number, number]; heading: number } }): Statue | undefined {
  const s = layout.statue;
  return s && { x: s.at[0], y: s.at[1], heading: s.heading };
}

const BRONZE = 0x8a4a26;
const GOLD = 0xe0b040;
const STEEL = 0xb8bcc6;
const GRASS = 0x4f8a3c;

/** The bronze's lattice: irregular holes cut through it, a few px each, the metal between them (transparent where cut). */
function latticeTexture(): THREE.Texture {
  const N = 32;
  const [c, x] = canvas(N, N);
  x.fillStyle = '#ffffff';
  x.fillRect(0, 0, N, N);
  let seed = 41;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // (a hole in each cell of a staggered grid, each its own shard of a shape, a thin web of metal between them)
  x.globalCompositeOperation = 'destination-out';
  for (let j = 0; j < 3; j++) {
    for (let i = 0; i < 3; i++) {
      const cx = i * 11 + (j % 2) * 5 + 1 + r() * 2;
      const cy = j * 11 + 1 + r() * 2;
      x.beginPath();
      x.moveTo(cx + r() * 2, cy);
      x.lineTo(cx + 6 + r() * 3, cy + 1 + r() * 2);
      x.lineTo(cx + 4 + r() * 4, cy + 6 + r() * 2);
      x.lineTo(cx, cy + 4 + r() * 3);
      x.closePath();
      x.fill();
    }
  }
  const t = pixelTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A box `w` × `h` × `d` with its texture tiled every `tile` px over each face (not stretched over it). */
function tiledBox(w: number, h: number, d: number, tile: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  // (faces +x, −x, +y, −y, +z, −z; each face's width and height)
  const size = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) {
    for (let v = f * 4; v < f * 4 + 4; v++) uv.setXY(v, (uv.getX(v) * size[f][0]) / tile, (uv.getY(v) * size[f][1]) / tile);
  }
  return g;
}

/** The cow, facing +x, its feet at y 0: leaping, rear legs planted, front legs up, head down. */
function cow(): THREE.Group {
  const g = new THREE.Group();
  const bronze = new THREE.MeshLambertMaterial({ color: BRONZE, map: latticeTexture(), alphaTest: 0.5, side: THREE.DoubleSide });
  const gold = new THREE.MeshPhongMaterial({ color: GOLD, specular: 0xfff0c0, shininess: 80, emissive: 0x3a2800 });
  /** a part: a box of bronze `w` long, `h` high, `d` wide, its middle at (x, y, z), pitched `pitch` (nose up +) */
  const part = (w: number, h: number, d: number, x: number, y: number, pitch = 0, z = 0) => {
    const m = new THREE.Mesh(tiledBox(w, h, d, 14), bronze);
    m.position.set(x, y, z);
    m.rotation.z = pitch;
    m.castShadow = m.receiveShadow = true;
    g.add(m);
    return m;
  };
  /** a piece of gold */
  const shine = (geometry: THREE.BufferGeometry, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(geometry, gold);
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
    return m;
  };
  // the body: a long, deep barrel (no hump: a cow's back runs level), square hips behind, the chest before it
  part(18, 20, 18, -19, 31, 0.15);
  part(30, 22, 20, -2, 34, 0.2);
  part(14, 20, 18, 14, 39, 0.2);
  // the udder under the belly, behind; its teats
  part(9, 5, 9, -12, 21, 0.2);
  for (const [tx, tz] of [[-14, -2], [-14, 2], [-10, -2], [-10, 2]]) part(1.4, 3, 1.4, tx, 17.5, 0.2, tz);
  // the neck, and the head down low: long-faced, the broad muzzle at its end; ears out to the sides
  part(11, 13, 12, 23, 39, -0.45);
  part(15, 9, 9, 30, 31, -1.0);
  part(6, 6, 10, 33, 24, -1.0);
  for (const side of [-1, 1]) {
    const ear = part(5, 2, 4, 26, 37, -0.3, side * 7);
    ear.rotation.x = side * 0.5;
    // (the horns: short, out and up from the top of the head, gold)
    const horn = shine(new THREE.ConeGeometry(1.2, 6, 6).translate(0, 3, 0), 27, 37, side * 4);
    horn.rotation.set(side * 0.9, 0, -0.3);
  }
  // the bell on its collar, under its neck (gold)
  part(3, 2, 13, 22, 32, -0.45);
  shine(new THREE.CylinderGeometry(1.6, 2.8, 5, 8), 22.5, 28, 0);
  // the rear legs, planted, pushing off: thigh, then shin down to the hoof, slanted back
  for (const side of [-1, 1]) {
    part(8, 16, 6, -22, 21, -0.35, side * 5.5);
    part(4.5, 16, 4.5, -27, 8, 0.25, side * 6);
    part(5, 3, 5, -29, 1.5, 0, side * 6);
  }
  // the front legs, up off the ground: forearms reaching forward, shins folded back under
  for (const side of [-1, 1]) {
    part(5.5, 15, 5, 17, 27, 1.0 + side * 0.15, side * 6);
    part(4.5, 13, 4.5, 18 + side * 2, 16, -0.6, side * 6);
  }
  // the tail, swinging out behind, its tuft at the end
  part(1.6, 16, 1.6, -31, 32, 0.6);
  part(3, 5, 3, -36, 25, 0.6);
  return g;
}

/** The statue in `scene` (on `grid`'s ground): the rise, the arch, and the cow charging through it. */
export function buildCowStatue(scene: THREE.Scene, grid: Grid, statue: Statue): THREE.Group {
  const group = new THREE.Group();
  const foot = groundAt(grid, statue.x, statue.y).h;
  group.position.set(statue.x, foot, statue.y);
  group.rotation.y = -statue.heading;
  // the rise: a low grassy dome, its edge down into the ground round it
  const mound = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(STATUE.mound, STATUE.rise + 2, STATUE.mound).translate(0, -2, 0),
    new THREE.MeshLambertMaterial({ color: GRASS, flatShading: true }),
  );
  mound.receiveShadow = true;
  group.add(mound);
  // the arch and the cow, at the statue's size, on top of the rise
  const sculpture = new THREE.Group();
  sculpture.position.y = STATUE.rise;
  sculpture.scale.setScalar(STATUE.scale);
  group.add(sculpture);
  // the arch: a band of steel, a loop standing up out of the rise (the part under it not there), square across
  const { arch, band, depth, centre } = STATUE;
  const under = Math.asin(Math.min(1, centre / arch));
  const loop = new THREE.Mesh(
    new THREE.TorusGeometry(arch, band / 2, 4, 40, Math.PI + 2 * under).rotateZ(-under).scale(1, 1, depth / band),
    new THREE.MeshPhongMaterial({ color: STEEL, specular: 0xffffff, shininess: 60, flatShading: true }),
  );
  // (facing the camera more than across the cow's way, as in the photos: the cow through it at a slant, and the
  // loop seen open, not edge on)
  loop.rotation.y = 0.9;
  loop.position.y = centre;
  loop.castShadow = loop.receiveShadow = true;
  sculpture.add(loop);
  // the cow: its shoulders through the arch, its haunches behind it
  const c = cow();
  c.position.set(-4, -1, 0);
  sculpture.add(c);
  scene.add(group);
  return group;
}
