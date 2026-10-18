// Moose at a circuit with them (layout.moose): a few small groups of one to
// three, ambling along the grass beyond the barriers, out along a stretch of
// track and back, where you see them as you drive by. They share the camels'
// loops (camels.ts), kept clear of the track, the pit lane, the grandstands,
// the trees and the water. A moose walks slowly and heavily, head low, its
// legs swinging in opposite pairs.

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import { camelsAt as walkersAt, herdsOf, type Caravan, type CamelAt } from './camels';
import type { Circuit } from './circuit';

export const MOOSE = {
  /** groups round the lap, and moose in one (at least, and up to this many more) */
  caravans: 5,
  least: 1,
  more: 2,
  /** px/s they walk, and px between one moose and the next */
  speed: 7,
  apart: 26,
  /** how much bigger than life-size it's drawn, so it reads from the camera */
  size: 1.5,
  /** px a moose covers in a stride */
  stride: 16,
  /** a loop: px long (at least, and up to this much more), and px between its out and back lines (camels.ts) */
  length: 220,
  longer: 140,
  out: 6,
  further: 22,
  clearTrack: 30,
  clearPalm: 10,
};

/** The groups at a circuit with moose (none elsewhere): spread round the lap, each beside a stretch of track. */
export function herdsOfMoose(circuit: Circuit): Caravan[] {
  if (!circuit.layout.moose) return [];
  return herdsOf(circuit, { ...MOOSE, seed: 83 });
}

/** The group's moose `t` seconds on, the leader first; `step` is how far into a stride (0–1). */
export function mooseAt(c: Caravan, t: number): CamelAt[] {
  const out: CamelAt[] = [];
  for (let k = 0; k < c.camels; k++) {
    const s = c.start + t * MOOSE.speed - k * MOOSE.apart;
    const p = walkersAt({ ...c, camels: 1, start: s }, 0)[0];
    out.push({ x: p.x, y: p.y, heading: p.heading, step: (((s / MOOSE.stride + k * 0.29) % 1) + 1) % 1 });
  }
  return out;
}

const COAT = new THREE.MeshLambertMaterial({ color: 0x5b3d26 });
const LEG = new THREE.MeshLambertMaterial({ color: 0xc9b79a });
const DARK = new THREE.MeshLambertMaterial({ color: 0x3a2616 });
const ANTLER = new THREE.MeshLambertMaterial({ color: 0xd9c9a3 });

/** A moose, 1 unit = 1 px (about 12 px nose to tail), facing +x: a humped body, long legs pivoting at the hips and shoulders, a low long-nosed head, and broad flat antlers. */
function mooseModel(bull: boolean): { group: THREE.Group; legs: THREE.Object3D[] } {
  const group = new THREE.Group();
  const part = (parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.z = rz;
    m.castShadow = true;
    parent.add(m);
    return m;
  };
  part(group, new THREE.BoxGeometry(7, 3.6, 3.4), COAT, 0, 7.4);
  // (the shoulder hump, the neck, and the long head held low)
  part(group, new THREE.BoxGeometry(3, 2.2, 3), DARK, 1.6, 9.6);
  part(group, new THREE.BoxGeometry(3, 2.2, 2), COAT, 4.4, 8.4, 0, -0.5);
  part(group, new THREE.BoxGeometry(3.6, 1.8, 1.8), COAT, 6.4, 6.6, 0, -0.15);
  part(group, new THREE.BoxGeometry(1, 1.4, 1.2), DARK, 8.4, 6.2);
  // (a short tail)
  part(group, new THREE.BoxGeometry(0.8, 1, 0.8), DARK, -3.6, 8.2);
  if (bull) {
    for (const z of [-1, 1]) {
      part(group, new THREE.BoxGeometry(1, 0.4, 2.6), ANTLER, 5.6, 8, z * 2.2, 0);
      part(group, new THREE.BoxGeometry(1.8, 0.4, 1.4), ANTLER, 5.8, 8.4, z * 3.6);
    }
  }
  const legs: THREE.Object3D[] = [];
  for (const [x, z] of [[2.6, 1.2], [-2.6, -1.2], [2.6, -1.2], [-2.6, 1.2]]) {
    const hip = new THREE.Group();
    hip.position.set(x, 6, z);
    part(hip, new THREE.BoxGeometry(1.1, 6, 1.1), LEG, 0, -3);
    group.add(hip);
    legs.push(hip);
  }
  return { group, legs };
}

/** The moose in `scene`; animate(t) walks them (t: seconds). */
export function buildMoose(scene: THREE.Scene, circuit: Circuit): { animate(t: number): void } {
  const herds = herdsOfMoose(circuit);
  const moose = herds.map((h, i) => Array.from({ length: h.camels }, (_, k) => {
    // (the leader of a group a bull, with antlers)
    const m = mooseModel(k === 0 && i % 2 === 0);
    m.group.scale.setScalar(MOOSE.size);
    scene.add(m.group);
    return m;
  }));
  const animate = (t: number) => {
    herds.forEach((h, i) => {
      mooseAt(h, t).forEach((at, k) => {
        const { group, legs } = moose[i][k];
        const swing = Math.sin(at.step * Math.PI * 2);
        group.position.set(at.x, groundAt(circuit.grid, at.x, at.y).h, at.y);
        group.rotation.y = Math.PI / 2 - at.heading;
        // (a walk: diagonal pairs swing together)
        legs.forEach((leg, j) => (leg.rotation.z = (j < 2 ? 1 : -1) * swing * 0.35));
      });
    });
  };
  animate(0);
  return { animate };
}
