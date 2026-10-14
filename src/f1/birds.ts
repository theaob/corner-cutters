// Flocks of birds over a circuit with them (layout.birds): budgerigars, green
// with yellow heads, in big quick flocks, and a few white cockatoos with
// yellow crests, fewer and slower, each flock wheeling round a wide loop high
// over the middle of the park, where you see them against the sky as you drive
// by. A flock flies as one, each bird a little out of step with the rest, its
// wings beating.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import type { Circuit } from './circuit';
import { lakesOf } from './lakes';

export const BIRDS = {
  /** flocks of budgerigars and of cockatoos, and birds in each (at least, and up to this many more) */
  budgieFlocks: 3,
  budgies: 7,
  budgiesMore: 5,
  cockatooFlocks: 2,
  cockatoos: 3,
  cockatoosMore: 2,
  /** rad/s round their loops, and px up (at least, and up to this much more) */
  budgieSpeed: 0.55,
  cockatooSpeed: 0.3,
  high: 70,
  higher: 40,
  /** px a flock's loop is across (at least, and up to this much more) */
  across: 420,
  wider: 240,
  /** px a bird strays from the flock's middle */
  spread: 22,
};

export type Kind = 'budgie' | 'cockatoo';

export interface Flock {
  kind: Kind;
  /** the loop's middle on the map, its two radii, and how far it's tilted (rad) */
  x: number;
  y: number;
  rx: number;
  ry: number;
  tilt: number;
  /** px up, and rad/s round (negative: anticlockwise) */
  high: number;
  speed: number;
  birds: number;
  phase: number;
}

/** A bird's place at a moment: on the map, px up, its heading (0 = north, clockwise), and its wing beat (0–1). */
export interface BirdAt {
  x: number;
  y: number;
  z: number;
  heading: number;
  beat: number;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The flocks at a circuit with birds (none elsewhere): over the middle of the park, over its lake if it has one. */
export function flocksOf(circuit: Circuit): Flock[] {
  if (!circuit.layout.birds) return [];
  const lake = lakesOf(circuit)[0];
  const pts = lake ?? circuit.track.samples;
  const cx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
  const cy = pts.reduce((a, p) => a + p.y, 0) / pts.length;
  const r = rng(53);
  const out: Flock[] = [];
  const add = (kind: Kind, k: number, n: number, more: number, speed: number) => {
    const sign = k % 2 === 0 ? 1 : -1;
    out.push({
      kind,
      x: cx + (r() - 0.5) * 160,
      y: cy + (r() - 0.5) * 120,
      rx: BIRDS.across + r() * BIRDS.wider,
      ry: (BIRDS.across + r() * BIRDS.wider) * 0.6,
      tilt: r() * Math.PI,
      high: BIRDS.high + r() * BIRDS.higher,
      speed: speed * sign * (0.9 + r() * 0.2),
      birds: n + Math.floor(r() * (more + 1)),
      phase: r() * Math.PI * 2,
    });
  };
  for (let k = 0; k < BIRDS.budgieFlocks; k++) add('budgie', k, BIRDS.budgies, BIRDS.budgiesMore, BIRDS.budgieSpeed);
  for (let k = 0; k < BIRDS.cockatooFlocks; k++) add('cockatoo', k, BIRDS.cockatoos, BIRDS.cockatoosMore, BIRDS.cockatooSpeed);
  return out;
}

/** The flock's birds `t` seconds on. */
export function birdsAt(f: Flock, t: number): BirdAt[] {
  const out: BirdAt[] = [];
  const ct = Math.cos(f.tilt);
  const st = Math.sin(f.tilt);
  const at = (a: number) => {
    const ex = Math.cos(a) * f.rx;
    const ey = Math.sin(a) * f.ry;
    return { x: f.x + ex * ct - ey * st, y: f.y + ex * st + ey * ct };
  };
  for (let k = 0; k < f.birds; k++) {
    // (a little ahead of or behind the flock's middle, and to the side, each in its own place)
    const a = f.phase + t * f.speed + Math.sin(k * 12.9898) * 0.06;
    const p = at(a);
    const q = at(a + 0.01 * Math.sign(f.speed));
    const side = Math.sin(k * 78.233 + 1) * BIRDS.spread;
    const heading = Math.atan2(q.x - p.x, -(q.y - p.y));
    out.push({
      x: p.x + Math.cos(heading) * side,
      y: p.y + Math.sin(heading) * side,
      z: f.high + Math.sin(k * 3.1 + t * 0.8) * 6,
      heading,
      beat: (((t * (f.kind === 'budgie' ? 5 : 2.6) + k * 0.31) % 1) + 1) % 1,
    });
  }
  return out;
}

const GREEN = new THREE.MeshBasicMaterial({ color: 0x4ec24a });
const YELLOW = new THREE.MeshBasicMaterial({ color: 0xf7d94a });
const WHITE = new THREE.MeshBasicMaterial({ color: 0xf6f4ee });
const BLUE = new THREE.MeshBasicMaterial({ color: 0x3a8fd8 });

/** A bird, 1 unit = 1 px, facing +x: a body, a head, and two wings to beat. */
function bird(kind: Kind): { group: THREE.Group; wings: THREE.Object3D[] } {
  const group = new THREE.Group();
  const big = kind === 'cockatoo';
  const body = new THREE.Mesh(new THREE.BoxGeometry(big ? 5.4 : 3.6, 1.3, 1.3), big ? WHITE : GREEN);
  group.add(body);
  const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.3, 1.3), big ? WHITE : YELLOW);
  head.position.x = big ? 3.2 : 2.3;
  group.add(head);
  if (big) {
    // (the crest, swept up and back)
    const crest = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.5), YELLOW);
    crest.position.set(2.6, 1, 0);
    crest.rotation.z = 0.5;
    group.add(crest);
  } else {
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.4, 0.5), BLUE);
    tail.position.x = -2.8;
    group.add(tail);
  }
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(big ? 2.8 : 1.8, 0.3, big ? 5.6 : 3.8), big ? WHITE : GREEN);
    wing.position.z = side * (big ? 2.8 : 1.9);
    pivot.add(wing);
    group.add(pivot);
    return pivot;
  });
  return { group, wings };
}

/** The flocks in `scene`; animate(t) flies them (t: seconds). */
export function buildBirds(scene: THREE.Scene, circuit: Circuit): { animate(t: number): void } {
  const flocks = flocksOf(circuit);
  const flying = flocks.map((f) => Array.from({ length: f.birds }, () => {
    const b = bird(f.kind);
    scene.add(b.group);
    return b;
  }));
  const animate = (t: number) => {
    flocks.forEach((f, i) => {
      birdsAt(f, t).forEach((at, k) => {
        const { group, wings } = flying[i][k];
        group.position.set(at.x, groundAt(circuit.grid, at.x, at.y).h + at.z, at.y);
        group.rotation.y = Math.PI / 2 - at.heading;
        const flap = Math.sin(at.beat * Math.PI * 2) * 0.6;
        wings[0].rotation.x = -0.2 - flap;
        wings[1].rotation.x = 0.2 + flap;
      });
    });
  };
  animate(0);
  return { animate };
}
