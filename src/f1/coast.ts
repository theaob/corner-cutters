// The coast (layout.coast: Dune Coast's): the sea beyond the dunes (one of
// the layout's lakes, its edge the shore), the surf rolling in along it,
// beach huts in a row along the top of the beach (wherever they're clear of the
// track, the pits and the grandstands), kites flying over the beach on the sea
// breeze, gulls wheeling over it all, and a windmill on a dune in the infield,
// its sails turning. Engine-free (where everything stands, unit-tested);
// buildCoast draws it.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';
import { mergedByMaterial } from '../engine/render/merge';
import { HALF_WIDTH, RUNOFF, type Circuit } from './circuit';
import { GARAGE_ACROSS } from './pits';
import { STAND, standsOf } from './stands';
import type { Pt } from './racing';

export const COAST = {
  /** px between beach huts along the shore, px up the beach from the water they stand, and px clear of the track's run-off, the garages and the grandstands they keep */
  hutEvery: 20,
  hutBack: 22,
  hutClear: 30,
  /** px from the track the beach goes on having huts (beyond, out of sight) */
  hutReach: 420,
  /** kites over the beach: how many, px up, px they sway */
  kites: 5,
  kiteHigh: 70,
  sway: 10,
  /** gulls wheeling over the shore: how many, px up, px round they circle */
  gulls: 7,
  gullHigh: 55,
  gullCircle: 70,
  /** px the surf runs up the beach and back */
  surf: 7,
};

export interface Hut {
  x: number;
  y: number;
  /** the way its front faces (radians, as Math.atan2 of it on the map): down the beach to the sea */
  facing: number;
  color: number;
}

const HUT_COLORS = [0xd8323c, 0x3d7fc4, 0xf2c14e, 0x3d9a5a, 0xf4f4f8, 0x5fe0d0, 0xf08a2a];

/** The coast at `circuit` (none: undefined): its shore (on the map), the way out to sea from each point of it, and the windmill's spot. */
export function coastOf(circuit: Circuit): { shore: Pt[]; seaward: Pt[]; windmill: Pt } | undefined {
  const c = circuit.layout.coast;
  if (!c) return undefined;
  const { scale } = circuit.layout;
  const { offset } = circuit;
  const at = ([x, y]: [number, number]) => ({ x: x * scale - offset.x, y: y * scale - offset.y });
  const shore = c.shore.map(at);
  // (out to sea: away from the track, square to the shore)
  const mid = shore[Math.floor(shore.length / 2)];
  const track = circuit.track.samples;
  const nearest = track.reduce((a, p) => (Math.hypot(p.x - mid.x, p.y - mid.y) < Math.hypot(a.x - mid.x, a.y - mid.y) ? p : a));
  const seaward = shore.map((_, i) => {
    const a = shore[Math.max(0, i - 1)];
    const b = shore[Math.min(shore.length - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let n = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
    if (n.x * (nearest.x - mid.x) + n.y * (nearest.y - mid.y) > 0) n = { x: -n.x, y: -n.y };
    return n;
  });
  return { shore, seaward, windmill: at(c.windmill) };
}

/** Points every `every` px along `line`, each with its index (the segment it's on) and how far along that. */
function along(line: Pt[], every: number): { p: Pt; i: number }[] {
  const out: { p: Pt; i: number }[] = [];
  let carry = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i];
    const b = line[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = carry; d < len; d += every) out.push({ p: { x: a.x + ((b.x - a.x) * d) / len, y: a.y + ((b.y - a.y) * d) / len }, i });
    carry = (((carry - len) % every) + every) % every;
  }
  return out;
}

/** Whether (x, y) is clear of the track and its run-off, the garages and the grandstands, by `clear` px. */
function clearOf(circuit: Circuit, x: number, y: number, clear: number): boolean {
  if (circuit.track.samples.some((p) => Math.hypot(p.x - x, p.y - y) < HALF_WIDTH + RUNOFF + clear)) return false;
  if (circuit.pit.points.some((p) => Math.hypot(p.x - x, p.y - y) < GARAGE_ACROSS + 20 + clear)) return false;
  return !standsOf(circuit).some((s) => Math.hypot(s.x - x, s.y - y) < s.len / 2 + STAND.depth + clear);
}

/** The beach huts: a row along the top of the beach, facing the sea, wherever they're clear. */
export function hutsOf(circuit: Circuit): Hut[] {
  const coast = coastOf(circuit);
  if (!coast) return [];
  return along(coast.shore, COAST.hutEvery)
    .map(({ p, i }, k) => {
      const out = coast.seaward[i];
      return { x: p.x - out.x * COAST.hutBack, y: p.y - out.y * COAST.hutBack, facing: Math.atan2(out.y, out.x), color: HUT_COLORS[(k * 5) % HUT_COLORS.length] };
    })
    .filter((h) => clearOf(circuit, h.x, h.y, COAST.hutClear) && circuit.track.samples.some((p) => Math.hypot(p.x - h.x, p.y - h.y) < COAST.hutReach));
}

/** Where the kites' flyers stand on the beach: spread along it where the huts are (the beach in sight of the track). */
export function kitesOf(circuit: Circuit): { x: number; y: number; out: Pt }[] {
  const coast = coastOf(circuit);
  if (!coast) return [];
  const spots = along(coast.shore, COAST.hutEvery * 3)
    .map(({ p, i }) => ({ x: p.x - coast.seaward[i].x * 8, y: p.y - coast.seaward[i].y * 8, out: coast.seaward[i] }))
    .filter((s) => clearOf(circuit, s.x, s.y, COAST.hutClear));
  // (as near the track as they come, a few of them)
  const near = (s: Pt) => Math.min(...circuit.track.samples.map((p) => Math.hypot(p.x - s.x, p.y - s.y)));
  return spots.sort((a, b) => near(a) - near(b)).slice(0, COAST.kites);
}

/** A beach hut, facing +x: a little gabled shed in its colour, a white roof and a door. */
function hutParts(color: THREE.Material, roof: THREE.Material, door: THREE.Material, h: Hut, ground: number) {
  const m = new THREE.Matrix4().makeRotationY(-h.facing).setPosition(h.x, ground, h.y);
  const g = (geometry: THREE.BufferGeometry, mat: THREE.Material) => {
    geometry.applyMatrix4(m);
    if (!geometry.groups.length) geometry.addGroup(0, geometry.index ? geometry.index.count : geometry.getAttribute('position').count, 0);
    return { geometry, faces: geometry.groups.map(() => mat) };
  };
  return [
    g(new THREE.BoxGeometry(9, 9, 10).translate(0, 4.5, 0), color),
    // (the roof: a ridge running front to back, its two slopes)
    g(new THREE.CylinderGeometry(7.4, 7.4, 11, 3, 1).rotateZ(Math.PI / 2).rotateX(Math.PI / 6).scale(1, 0.45, 1).translate(0, 10.6, 0), roof),
    g(new THREE.BoxGeometry(0.6, 6, 4).translate(4.6, 3, 0), door),
  ];
}

/** A kite: a diamond in two colours, with a tail of bows. */
function kite(colorA: number, colorB: number): THREE.Group {
  const g = new THREE.Group();
  const half = (color: number, side: number) => {
    const shape = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 7, 0), new THREE.Vector3(side * 5, 1.5, 0), new THREE.Vector3(0, -7, 0)]);
    shape.computeVertexNormals();
    const m = new THREE.Mesh(shape, new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    g.add(m);
  };
  half(colorA, 1);
  half(colorB, -1);
  for (let k = 0; k < 4; k++) {
    const bow = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 0.3), new THREE.MeshBasicMaterial({ color: k % 2 ? colorA : colorB }));
    bow.position.set(0, -9 - k * 3.2, 0);
    g.add(bow);
  }
  return g;
}

/** A gull: white wings in a shallow V either side of a little body, to flap. */
function gull(): { group: THREE.Group; wings: THREE.Object3D[] } {
  const group = new THREE.Group();
  const white = new THREE.MeshBasicMaterial({ color: 0xf6f6f8 });
  const grey = new THREE.MeshBasicMaterial({ color: 0x9aa0aa });
  const body = new THREE.Mesh(new THREE.BoxGeometry(5, 1.4, 1.6), white);
  group.add(body);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.4, 6), side < 0 ? grey : white);
    wing.position.z = side * 3;
    pivot.add(wing);
    group.add(pivot);
    return pivot;
  });
  return { group, wings };
}

/** The windmill: a tapering eight-sided tower, its cap, and four sails turning in the sea breeze (facing the sea). */
function windmill(): { group: THREE.Group; sails: THREE.Group } {
  const group = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(9, 14, 46, 8), new THREE.MeshLambertMaterial({ color: 0x5a3a2a, flatShading: true }));
  tower.position.y = 23;
  tower.castShadow = tower.receiveShadow = true;
  group.add(tower);
  // (a white gallery round it, part way up)
  const gallery = new THREE.Mesh(new THREE.CylinderGeometry(15, 15, 1.4, 8), new THREE.MeshLambertMaterial({ color: 0xf4f4f8 }));
  gallery.position.y = 18;
  group.add(gallery);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(11, 12, 8), new THREE.MeshLambertMaterial({ color: 0x3a4a3a, flatShading: true }));
  cap.position.y = 52;
  cap.castShadow = true;
  group.add(cap);
  const sails = new THREE.Group();
  sails.position.set(11, 48, 0);
  const wood = new THREE.MeshLambertMaterial({ color: 0x8a5a32 });
  const cloth = new THREE.MeshLambertMaterial({ color: 0xf2ece0, side: THREE.DoubleSide });
  for (let k = 0; k < 4; k++) {
    const arm = new THREE.Group();
    arm.rotation.x = (k * Math.PI) / 2;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(1.2, 40, 1.2).translate(0, 20, 0), wood);
    stock.castShadow = true;
    const sail = new THREE.Mesh(new THREE.BoxGeometry(0.4, 30, 7).translate(0, 23, 4), cloth);
    sail.castShadow = true;
    arm.add(stock, sail);
    sails.add(arm);
  }
  group.add(sails);
  return { group, sails };
}

/** The coast in `scene` (on `grid`'s ground). Gives back its step (`dt` s on). */
export function buildCoast(scene: THREE.Scene, grid: Grid, circuit: Circuit): (dt: number) => void {
  const coast = coastOf(circuit);
  if (!coast) return () => {};
  const ground = (x: number, y: number) => groundAt(grid, x, y).h;
  // the beach huts, all one mesh (a draw call a colour)
  const roof = new THREE.MeshLambertMaterial({ color: 0xf4f4f8 });
  const door = new THREE.MeshLambertMaterial({ color: 0x2a2a36 });
  const colors = new Map<number, THREE.Material>();
  const huts = hutsOf(circuit);
  if (huts.length) {
    const parts = huts.flatMap((h) => {
      const color = colors.get(h.color) ?? colors.set(h.color, new THREE.MeshLambertMaterial({ color: h.color })).get(h.color)!;
      return hutParts(color, roof, door, h, ground(h.x, h.y));
    });
    const mesh = mergedByMaterial(parts);
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }
  // the surf: lines of foam along the water's edge, running up the beach and back
  const surf = [0, 1].map((k) => {
    const pts = coast.shore.map((p, i) => new THREE.Vector3(p.x + coast.seaward[i].x * (4 + k * 9), 0, p.y + coast.seaward[i].y * (4 + k * 9)));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xf4f8fa, transparent: true, opacity: 0.85 }));
    scene.add(line);
    return line;
  });
  const shoreHeight = coast.shore.map((p) => ground(p.x, p.y));
  // the kites, each on its string from its flyer on the beach, flying up the beach on the sea breeze
  const kiteColors: [number, number][] = [[0xd8323c, 0xf2c14e], [0x3d7fc4, 0xf4f4f8], [0x8a3cc8, 0x5fe0d0], [0xf08a2a, 0x3d9a5a], [0xff5fb8, 0xf4f4f8]];
  const kites = kitesOf(circuit).map((s, k) => {
    const g = kite(...kiteColors[k % kiteColors.length]);
    scene.add(g);
    const flyer = new THREE.Mesh(new THREE.BoxGeometry(2, 5, 2).translate(0, 2.5, 0), new THREE.MeshLambertMaterial({ color: kiteColors[k % kiteColors.length][0] }));
    flyer.position.set(s.x, ground(s.x, s.y), s.y);
    flyer.castShadow = true;
    scene.add(flyer);
    const string = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xe8e8ee }));
    scene.add(string);
    return { s, g, string, phase: k * 1.7, base: ground(s.x, s.y) };
  });
  // the gulls, wheeling over the shore
  const gulls = Array.from({ length: COAST.gulls }, (_, k) => {
    const g = gull();
    scene.add(g.group);
    const at = coast.shore[Math.floor(((k + 0.5) / COAST.gulls) * coast.shore.length)];
    return { ...g, at, phase: k * 2.1, speed: 0.5 + (k % 3) * 0.12, dir: k % 2 ? 1 : -1 };
  });
  // the windmill, on its dune, its sails to the sea
  const mill = windmill();
  mill.group.position.set(coast.windmill.x, ground(coast.windmill.x, coast.windmill.y) - 1, coast.windmill.y);
  const out = coast.seaward[Math.floor(coast.seaward.length / 2)];
  mill.group.rotation.y = -Math.atan2(out.y, out.x);
  scene.add(mill.group);
  let time = 0;
  const step = (dt: number) => {
    time += dt;
    // (the surf: the waves running up the beach and back, the foam fading as it does)
    surf.forEach((line, k) => {
      const run = Math.sin(time * 0.9 + k * Math.PI) * COAST.surf;
      const pos = line.geometry.getAttribute('position') as THREE.BufferAttribute;
      coast.shore.forEach((p, i) => pos.setXYZ(i, p.x + coast.seaward[i].x * (4 + k * 9 - run), shoreHeight[i] + 0.4, p.y + coast.seaward[i].y * (4 + k * 9 - run)));
      pos.needsUpdate = true;
      (line.material as THREE.LineBasicMaterial).opacity = 0.5 + 0.4 * Math.max(0, Math.sin(time * 0.9 + k * Math.PI + 1));
    });
    for (const k of kites) {
      // (up the beach from the flyer, downwind; bobbing and swaying on the breeze)
      const sway = Math.sin(time * 0.8 + k.phase) * COAST.sway;
      const kx = k.s.x - k.s.out.x * 34 + -k.s.out.y * sway;
      const ky = k.s.y - k.s.out.y * 34 + k.s.out.x * sway;
      const kz = k.base + COAST.kiteHigh + Math.sin(time * 1.3 + k.phase) * 5;
      k.g.position.set(kx, kz, ky);
      k.g.rotation.set(0, -Math.atan2(k.s.out.y, k.s.out.x) + Math.PI / 2, Math.sin(time * 1.1 + k.phase) * 0.3);
      const pos = k.string.geometry.getAttribute('position') as THREE.BufferAttribute;
      pos.setXYZ(0, k.s.x, k.base + 4, k.s.y);
      pos.setXYZ(1, kx, kz - 6, ky);
      pos.needsUpdate = true;
    }
    for (const g of gulls) {
      const a = time * g.speed * g.dir + g.phase;
      const r = COAST.gullCircle * (0.7 + 0.3 * Math.sin(g.phase));
      g.group.position.set(g.at.x + Math.cos(a) * r, COAST.gullHigh + Math.sin(time * 0.7 + g.phase) * 8 + ground(g.at.x, g.at.y), g.at.y + Math.sin(a) * r);
      // (flying round the circle: facing along it)
      g.group.rotation.y = -(a + (g.dir * Math.PI) / 2);
      const flap = Math.sin(time * 9 + g.phase) * 0.5;
      g.wings[0].rotation.x = -0.25 - flap;
      g.wings[1].rotation.x = 0.25 + flap;
    }
    mill.sails.rotation.x = -time * 0.9;
  };
  step(0);
  return step;
}
