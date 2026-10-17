// Geese at a circuit with them (layout.geese): now and then a flock of Canada
// geese crosses the sky in a V, high over the circuit, honking-quiet and far
// above the cars: scenery, never in anyone's way. A flock flies in one
// straight line across the whole map, wings beating together, and is gone
// until the next. Hidden for a device asking for less motion (the game passes
// no time then).

import * as THREE from 'three';
import { groundAt } from '../engine/sim';
import type { Circuit } from './circuit';
import { TILE as T } from './circuit';

export const GEESE = {
  /** geese in a flock (at least, and up to this many more) */
  least: 7,
  more: 4,
  /** px/s they fly, and px up (at least, and up to this much more) */
  speed: 120,
  high: 90,
  higher: 40,
  /** px between one goose and the next along the V's arm, and how far back and out each steps */
  back: 11,
  out: 9,
  /** seconds between one flock setting out and the next */
  every: 60,
  /** wing beats per second */
  beat: 2.2,
};

export interface Goose {
  x: number;
  y: number;
  z: number;
  /** 0 = north, clockwise */
  heading: number;
  beat: number;
}

/** The flight at `t` s on: where the V is and its heading, or nothing between flocks. Each flock crosses the map on its own line, through a point on the lap so it's seen from the track. */
export function flightAt(circuit: Circuit, t: number): { x: number; y: number; heading: number; n: number; high: number } | undefined {
  const W = circuit.width * T;
  const H = circuit.height * T;
  const k = Math.floor(t / GEESE.every);
  const into = t - k * GEESE.every;
  const length = Math.hypot(W, H) + 200;
  const flown = into * GEESE.speed;
  if (flown > length) return undefined;
  const heading = (k * 2.399 + 0.7) % (Math.PI * 2);
  const dx = Math.sin(heading);
  const dy = -Math.cos(heading);
  // (the line passes over a point of the lap, a different one each flock)
  const { samples } = circuit.track;
  const over = samples[Math.floor(((k * 0.618) % 1) * samples.length)];
  // (the V is over that point `half` px along its line, so it's overhead when `flown` is that far)
  const half = length / 2;
  const along = flown - half;
  return {
    x: over.x + dx * along,
    y: over.y + dy * along,
    heading,
    n: GEESE.least + (k * 3) % (GEESE.more + 1),
    high: GEESE.high + ((k * 17) % 10) * (GEESE.higher / 10),
  };
}

/** The geese of the flight, the leader first, in a V behind it. */
export function geeseAt(f: NonNullable<ReturnType<typeof flightAt>>, t: number): Goose[] {
  const out: Goose[] = [];
  const dx = Math.sin(f.heading);
  const dy = -Math.cos(f.heading);
  for (let k = 0; k < f.n; k++) {
    // (alternating sides: the second and third a step back to each side, and so on)
    const rank = Math.ceil(k / 2);
    const side = k === 0 ? 0 : k % 2 === 1 ? 1 : -1;
    const back = rank * GEESE.back;
    const out_ = rank * GEESE.out * side;
    out.push({
      x: f.x - dx * back + -dy * out_,
      y: f.y - dy * back + dx * out_,
      z: f.high + Math.sin(t * 0.7 + k) * 2,
      heading: f.heading,
      beat: (((t * GEESE.beat + k * 0.13) % 1) + 1) % 1,
    });
  }
  return out;
}

const BODY = new THREE.MeshBasicMaterial({ color: 0x8a7a66 });
const NECK = new THREE.MeshBasicMaterial({ color: 0x1c1a18 });
const CHIN = new THREE.MeshBasicMaterial({ color: 0xf3f0ea });

/** A goose, 1 unit = 1 px, facing +x: a body, long black neck and head with a white chin strap, and two wings to beat. */
function gooseModel(): { group: THREE.Group; wings: THREE.Object3D[] } {
  const group = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    group.add(m);
  };
  part(new THREE.BoxGeometry(5, 1.6, 1.8), BODY, 0, 0);
  part(new THREE.BoxGeometry(3.4, 0.9, 0.9), NECK, 3.8, 0.2);
  part(new THREE.BoxGeometry(1.4, 1, 1.2), NECK, 5.6, 0.2);
  part(new THREE.BoxGeometry(0.5, 0.4, 1.3), CHIN, 5.4, -0.1);
  part(new THREE.BoxGeometry(1.4, 0.5, 1.2), BODY, -3, 0.2);
  const wings = [-1, 1].map((side) => {
    const pivot = new THREE.Group();
    const wing = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.3, 6), BODY);
    wing.position.z = side * 3;
    pivot.add(wing);
    group.add(pivot);
    return pivot;
  });
  return { group, wings };
}

/** The geese in `scene`; animate(t) flies them (t: seconds, or none to hide them: reduced motion). */
export function buildGeese(scene: THREE.Scene, circuit: Circuit): { animate(t?: number): void } {
  const max = GEESE.least + GEESE.more;
  const flock = Array.from({ length: max }, () => {
    const g = gooseModel();
    g.group.visible = false;
    scene.add(g.group);
    return g;
  });
  const animate = (t?: number) => {
    const f = t === undefined ? undefined : flightAt(circuit, t);
    if (!f) {
      for (const g of flock) g.group.visible = false;
      return;
    }
    const geese = geeseAt(f, t!);
    flock.forEach((g, k) => {
      const at = geese[k];
      g.group.visible = !!at;
      if (!at) return;
      g.group.position.set(at.x, groundAt(circuit.grid, at.x, at.y).h + at.z, at.y);
      g.group.rotation.y = Math.PI / 2 - at.heading;
      const flap = Math.sin(at.beat * Math.PI * 2) * 0.6;
      g.wings[0].rotation.x = -0.2 - flap;
      g.wings[1].rotation.x = 0.2 + flap;
    });
  };
  animate(0);
  return { animate };
}
