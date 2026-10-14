// Kangaroos at a circuit with them (layout.kangaroos): a few mobs of three to
// five, bounding one behind another on the grass just past the barriers, out
// along a stretch of track and back, where you see them as you drive by.
// They share the camels' loops (camels.ts), kept clear of the track, the
// pit lane, the grandstands, the trees and the lake. A kangaroo goes by
// hops: both hind legs together, its body rising and falling in an arc with
// each, its tail swinging for balance.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import { camelsAt as walkersAt, herdsOf, type Caravan, type CamelAt } from './camels';
import type { Circuit } from './circuit';

export const KANGAROOS = {
  /** mobs round the lap, and kangaroos in one (at least, and up to this many more) */
  caravans: 6,
  least: 3,
  more: 2,
  /** px/s they bound (about 4 m/s: a lazy hop) */
  speed: 22,
  /** px between one kangaroo and the next, and px a hop covers */
  apart: 30,
  stride: 34,
  /** the arc of a hop: px up at the top */
  height: 9,
  /** a loop: px long (at least, and up to this much more), and px between its out and back lines (camels.ts) */
  length: 260,
  longer: 160,
  out: 0,
  further: 16,
  clearTrack: 24,
  clearPalm: 9,
};

/** The mobs at a circuit with kangaroos (none elsewhere): spread round the lap, each beside a stretch of track. */
export function mobsOf(circuit: Circuit): Caravan[] {
  if (!circuit.layout.kangaroos) return [];
  return herdsOf(circuit, { ...KANGAROOS, seed: 29 });
}

/** The mob's kangaroos `t` seconds on, the leader first; `step` is how far into a hop (0–1). */
export function kangaroosAt(c: Caravan, t: number): CamelAt[] {
  const out: CamelAt[] = [];
  for (let k = 0; k < c.camels; k++) {
    const s = c.start + t * KANGAROOS.speed - k * KANGAROOS.apart;
    const p = walkersAt({ ...c, camels: 1, start: s }, 0)[0];
    // (a little out of step with the one ahead)
    const step = (((s / KANGAROOS.stride + k * 0.23) % 1) + 1) % 1;
    out.push({ x: p.x, y: p.y, heading: p.heading, step });
  }
  return out;
}

const FUR = new THREE.MeshLambertMaterial({ color: 0xb4733c });
const BELLY = new THREE.MeshLambertMaterial({ color: 0xe2c9a0 });
const DARK = new THREE.MeshLambertMaterial({ color: 0x7a4a26 });

/** A kangaroo, 1 unit = 1 px, facing +x, sitting up: body, head with ears, tail, little arms, and big hind legs pivoting at the hip. */
function kangarooModel(): { group: THREE.Group; tail: THREE.Object3D; legs: THREE.Object3D[] } {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  // (leaning forward as it bounds)
  part(body, new THREE.BoxGeometry(4.2, 8.5, 4.4), FUR, 0, 10.5, 0, -0.35);
  part(body, new THREE.BoxGeometry(2, 5, 3.4), BELLY, 0.9, 10, 0, -0.35);
  part(body, new THREE.BoxGeometry(3.6, 2.6, 2.6), FUR, 3.6, 16, 0, -0.2);
  part(body, new THREE.BoxGeometry(2.2, 1.6, 1.6), DARK, 5.8, 15.6);
  for (const z of [-1, 1]) part(body, new THREE.BoxGeometry(0.8, 3, 0.8), FUR, 3, 18.4, z, 0.1);
  for (const z of [-2.3, 2.3]) part(body, new THREE.BoxGeometry(0.9, 3, 0.9), DARK, 3.4, 11.6, z, -0.7);
  const tail = new THREE.Group();
  tail.position.set(-2.4, 7, 0);
  part(tail, new THREE.BoxGeometry(9, 1.8, 1.8), FUR, -4.5, -0.8, 0, 0.35);
  body.add(tail);
  group.add(body);
  const legs: THREE.Object3D[] = [];
  for (const z of [1.4, -1.4]) {
    const hip = new THREE.Group();
    hip.position.set(-0.4, 7, z);
    part(hip, new THREE.BoxGeometry(3.6, 3.6, 1.6), FUR, 0.4, -1.6, 0, -0.3);
    part(hip, new THREE.BoxGeometry(1.2, 4.6, 1.2), DARK, 0.6, -4.6, 0, 0.3);
    part(hip, new THREE.BoxGeometry(3.4, 0.9, 1.2), DARK, 1.4, -6.8);
    body.add(hip);
    legs.push(hip);
  }
  return { group, tail, legs };
}

/** The mobs in `scene`; animate(t) bounds them (t: seconds). */
export function buildKangaroos(scene: THREE.Scene, circuit: Circuit): { animate(t: number): void } {
  const mobs = mobsOf(circuit);
  const roos = mobs.map((m) => Array.from({ length: m.camels }, () => {
    const k = kangarooModel();
    scene.add(k.group);
    return k;
  }));
  const animate = (t: number) => {
    mobs.forEach((m, i) => {
      kangaroosAt(m, t).forEach((at, k) => {
        const { group, tail, legs } = roos[i][k];
        // (a hop is an arc up and down; the legs swing back to push off, forward to land)
        const arc = Math.sin(at.step * Math.PI);
        group.position.set(at.x, groundAt(circuit.grid, at.x, at.y).h + arc * KANGAROOS.height, at.y);
        group.rotation.y = Math.PI / 2 - at.heading;
        const swing = Math.cos(at.step * Math.PI);
        legs.forEach((leg) => (leg.rotation.z = swing * 0.5));
        tail.rotation.z = -swing * 0.25;
      });
    });
  };
  animate(0);
  return { animate };
}
