// Airliners over a circuit with an airport next door (layout.airport: Crescent
// Park's): now and then one flies over, the runway's way, either coming in to
// land (low, gear down, sinking) or just taken off (climbing). Each is aimed to
// pass over where the camera will be when it gets there, high enough that it's
// over the picture (a thing up high shows further up the screen than the
// ground under it, so its track runs that much nearer the camera). Its lights
// on: red on the left wingtip, green on the right, a white strobe flashing; its
// shadow sweeping over the ground. Scenery only. Engine-free (PlaneRun, unit-
// tested); planeModel/buildPlanes draw it.

import * as THREE from 'three';
import { disposeDeep } from '../engine/render/dispose';
import { mergedByMaterial } from '../engine/render/merge';
import { HIDES } from './town3d';

export const PLANES = {
  /** s between one plane and the next (at least, and up to this much more) */
  wait: 16,
  waitMore: 14,
  /** the first one, s into the race */
  first: 6,
  /** px/s they fly: coming in to land, and climbing away */
  speed: { arrive: 230, depart: 270 },
  /** px up as they pass over: coming in, and climbing away; px/s they sink coming in, and climb going */
  alt: { arrive: 190, depart: 170 },
  sink: 14,
  climb: 45,
  /** px back along their way they come from (just out of the picture), and on beyond the camera they go before they're gone */
  lead: 480,
  beyond: 700,
  /** px to either side of the camera they may pass (the picture is narrow on a phone held upright) */
  aside: 40,
  /** the share of them coming in to land */
  arrivals: 0.6,
};

export interface Flight {
  kind: 'arrive' | 'depart';
  x: number;
  y: number;
  /** px up */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** s since it came on */
  t: number;
  /** its tail's colour */
  tail: number;
}

/** What the camera's on: where, and how fast it's going (px/s). */
export interface PlaneFocus {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
}

const TAILS = [0x2f6fe0, 0xd8323c, 0x2f9a5a, 0xf2a03a, 0x6a3cc8, 0x1f2a5a];

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The planes flying over, the runway's way (`runway`: radians, as Math.atan2 of their run on the map). */
export class PlaneRun {
  flights: Flight[] = [];
  /** planes that have flown over so far */
  flown = 0;
  private wait = PLANES.first;
  private readonly r: () => number;

  constructor(private readonly runway: number, seed = 3) {
    this.r = rng(seed);
  }

  /** `dt` s on, the camera on `focus`. */
  step(dt: number, focus: PlaneFocus): void {
    if (dt <= 0) return;
    for (const f of this.flights) {
      f.t += dt;
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      f.z += f.vz * dt;
    }
    const gone = (f: Flight) => f.t * Math.hypot(f.vx, f.vy) > PLANES.lead + PLANES.beyond;
    this.flown += this.flights.filter(gone).length;
    this.flights = this.flights.filter((f) => !gone(f));
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = PLANES.wait + this.r() * PLANES.waitMore;
    this.launch(focus);
  }

  /** One on its way over: to pass over where the camera will be once it's there. */
  private launch(focus: PlaneFocus): void {
    const kind = this.r() < PLANES.arrivals ? 'arrive' : 'depart';
    const speed = PLANES.speed[kind];
    const alt = PLANES.alt[kind];
    const T = PLANES.lead / speed;
    const ux = Math.cos(this.runway);
    const uy = Math.sin(this.runway);
    // (where the camera will be, by the camera's way, no farther than a plane's lead)
    let ax = (focus.vx ?? 0) * T;
    let ay = (focus.vy ?? 0) * T;
    const ahead = Math.hypot(ax, ay);
    if (ahead > PLANES.lead) [ax, ay] = [(ax * PLANES.lead) / ahead, (ay * PLANES.lead) / ahead];
    // over it in the picture: its track that much nearer the camera (south) than the ground it shows over, and a
    // little to one side or the other
    const aside = (this.r() * 2 - 1) * PLANES.aside;
    const px = focus.x + ax - uy * aside;
    const py = focus.y + ay + ux * aside + alt * HIDES;
    const vz = kind === 'arrive' ? -PLANES.sink : PLANES.climb;
    this.flights.push({
      kind,
      x: px - ux * PLANES.lead,
      y: py - uy * PLANES.lead,
      z: alt - vz * T,
      vx: ux * speed,
      vy: uy * speed,
      vz,
      t: 0,
      tail: TAILS[Math.floor(this.r() * TAILS.length)],
    });
  }
}

/**
 * An airliner, facing +x (up +y, its right +z), about 96 px nose to tail and as wide across its wings: white, its
 * tail coloured, a dark band of windows down each side, two engines under its swept wings; its gear (to let down
 * coming in to land), and its lights.
 */
export function planeModel(tail: number): { group: THREE.Group; gear: THREE.Object3D; strobe: THREE.Mesh } {
  const group = new THREE.Group();
  const lambert = (color: number) => new THREE.MeshLambertMaterial({ color });
  const white = lambert(0xf2f2f6);
  const grey = lambert(0xb8bcc6);
  const dark = lambert(0x22283a);
  const fin = lambert(tail);
  const parts: { geometry: THREE.BufferGeometry; faces: THREE.Material[] }[] = [];
  const add = (geometry: THREE.BufferGeometry, m: THREE.Material) => {
    // (a geometry of one piece, without groups: one group of all of it)
    if (!geometry.groups.length) geometry.addGroup(0, geometry.index ? geometry.index.count : geometry.getAttribute('position').count, 0);
    parts.push({ geometry, faces: geometry.groups.map(() => m) });
  };
  // the fuselage, its nose and its tail cone (round, along x)
  add(new THREE.CylinderGeometry(6, 6, 64, 12).rotateZ(Math.PI / 2), white);
  add(new THREE.SphereGeometry(6, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 2.2, 1).rotateZ(-Math.PI / 2).translate(32, 0, 0), white);
  add(new THREE.ConeGeometry(6, 22, 12).rotateZ(Math.PI / 2).translate(-43, 1.5, 0), white);
  // the windows, a dark band down each side; the cockpit's
  add(new THREE.BoxGeometry(54, 1.4, 12.2).translate(2, 2, 0), dark);
  add(new THREE.BoxGeometry(4, 2, 10).translate(37, 2.5, 0), dark);
  // the wings, swept back, low on the fuselage; the tailplane
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(18, 1.6, 42).translate(0, 0, side * 21).rotateY(-side * 0.5).translate(2, -3, side * 4), grey);
    add(new THREE.BoxGeometry(9, 1.2, 15).translate(0, 0, side * 7.5).rotateY(-side * 0.55).translate(-44, 2, side * 2), grey);
    // the engines, under the wings
    add(new THREE.CylinderGeometry(3.4, 3, 13, 10).rotateZ(Math.PI / 2).translate(3, -6.5, side * 15), grey);
    add(new THREE.CylinderGeometry(2.6, 2.6, 0.4, 10).rotateZ(Math.PI / 2).translate(9.7, -6.5, side * 15), dark);
  }
  // the fin, swept back, in the airline's colour
  add(new THREE.BoxGeometry(16, 18, 1.4).translate(0, 9, 0).applyMatrix4(new THREE.Matrix4().makeShear(0, 0, -0.6, 0, 0, 0)).translate(-40, 4, 0), fin);
  const body = mergedByMaterial(parts);
  body.castShadow = true;
  group.add(body);
  // the gear: nose wheel and two main legs, let down coming in to land
  const gear = mergedByMaterial([
    { geometry: new THREE.BoxGeometry(1, 6, 1).translate(26, -8, 0), faces: Array(6).fill(dark) },
    { geometry: new THREE.BoxGeometry(2.4, 2.4, 2).translate(26, -11, 0), faces: Array(6).fill(dark) },
    ...[-1, 1].flatMap((side) => [
      { geometry: new THREE.BoxGeometry(1.2, 7, 1.2).translate(-2, -8, side * 6), faces: Array(6).fill(dark) },
      { geometry: new THREE.BoxGeometry(4, 2.6, 3).translate(-2, -11.5, side * 6), faces: Array(6).fill(dark) },
    ]),
  ]);
  group.add(gear);
  // the lights: red on the left wingtip, green on the right (unlit, so they glow), and the white strobe on the tail
  const lamp = (color: number, x: number, y: number, z: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2, 1.6, 2), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
    m.position.set(x, y, z);
    group.add(m);
    return m;
  };
  lamp(0xff3030, -18, -3, -41);
  lamp(0x30ff60, -18, -3, 41);
  const strobe = lamp(0xffffff, -54, 3, 0);
  return { group, gear, strobe };
}

/** The planes over a circuit with an airport, in `scene`. Gives back their run, and its step (`dt` s on, the camera on `focus`). */
export function buildPlanes(scene: THREE.Scene, runway: number): { run: PlaneRun; step: (dt: number, focus: PlaneFocus) => void } {
  const run = new PlaneRun(runway);
  /** a model for each plane in the sky (made as they come; at most two or three at once) */
  const shown = new Map<Flight, ReturnType<typeof planeModel>>();
  let time = 0;
  const step = (dt: number, focus: PlaneFocus) => {
    run.step(dt, focus);
    time += dt;
    for (const [f, m] of shown) {
      if (run.flights.includes(f)) continue;
      scene.remove(m.group);
      // (freed: a backdrop plays planes for as long as the menu's up)
      disposeDeep(m.group);
      shown.delete(f);
    }
    for (const f of run.flights) {
      let m = shown.get(f);
      if (!m) {
        m = planeModel(f.tail);
        m.gear.visible = f.kind === 'arrive';
        scene.add(m.group);
        shown.set(f, m);
      }
      m.group.position.set(f.x, f.z, f.y);
      // (along its way, nose up a little climbing away, level coming in)
      m.group.rotation.set(0, -Math.atan2(f.vy, f.vx), Math.atan2(f.vz, Math.hypot(f.vx, f.vy)) + (f.kind === 'arrive' ? 0.05 : 0), 'YXZ');
      // (the strobe: a quick flash, twice a second or so)
      m.strobe.visible = (time + f.tail * 1e-7) % 1.1 < 0.08;
    }
  };
  return { run, step };
}
