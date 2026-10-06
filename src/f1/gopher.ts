// A gopher at Twin Lakes (layout.gophers): now and then one pops up out of its
// hole just past the edge of the track, up the road from the camera, looks
// about, and scurries across to its hole on the other side, where it ducks back
// in. It only sets off with no car near; caught on the track by one, it freezes
// a moment (a gopher in the headlights), then bolts for the nearer hole, three
// times as fast. A car that hits it sends it flying, tumbling head over heels,
// the way the car was going: it lands on its feet, sits dazed a while, stars
// round its head, then shakes it off and scurries off the track to the nearer
// hole (or digs a new one beside the track, flung far from both). No harm done
// to it or the car: scenery, never in the car's way. Engine-free (GopherRun)
// and unit-tested; gopherModel/buildGopher draw it.

import * as THREE from 'three';
import { groundAt, type Grid } from '../engine/sim';
import { HALF_WIDTH } from './circuit';
import { lateralOffset, nearestSample, type Track } from './racing';

type Sample = Track['samples'][number];

export const GOPHER = {
  /** s between one crossing and the next (at least, and up to this much more) */
  wait: 12,
  waitMore: 16,
  /** px along the lap ahead of the camera's focus a crossing may be: out of sight, far enough on that it's out on the track by the time a car gets there */
  ahead: { from: 520, to: 820 },
  /** px out past the track's edge each hole is */
  holeOut: 22,
  /** px/s it scurries; × that when a car catches it on the track */
  speed: 46,
  bolt: 3,
  /** s it takes to pop up out of the hole and look about, and to duck back in */
  peek: 1.1,
  duck: 0.4,
  /** px: no car this near the crossing for it to set off; one this near while it's crossing freezes it, then sends it bolting */
  clear: 200,
  danger: 130,
  /** s it freezes, caught on the track by a car, before it bolts */
  freeze: 0.5,
  /** px from a car's middle that the car hits it (half a car's width, and half its own length, at its size), and the least px/s that does */
  hit: 18,
  hitSpeed: 40,
  /** flung: a share of the car's speed it flies at, px/s up off the bonnet (and a share of the car's speed more), px/s² it falls, radians/s it tumbles */
  fling: 0.6,
  lift: 110,
  liftMore: 0.15,
  gravity: 420,
  tumble: 13,
  /** s it sits dazed where it lands */
  dazed: 1.4,
  /** px: flung no farther than this from one of its holes, it runs back to it; farther, it digs a new one beside the track */
  home: 160,
  /** × its size (and its holes'): life size is lost among the cars from the camera's height */
  size: 1.8,
};

/** A car, as the gopher sees it. */
export interface GopherCar {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Where it is (and how high in the air, px), which way it faces (radians, as the track's), how far up out of the ground (0 in its hole, 1 out), its stride, how far it's tumbled head over heels (radians), and whether it's dazed. */
export interface GopherPose {
  x: number;
  y: number;
  z: number;
  heading: number;
  up: number;
  step: number;
  running: boolean;
  tumble: number;
  dazed: boolean;
}

type Phase = 'peek' | 'run' | 'freeze' | 'bolt' | 'flung' | 'dazed' | 'duck';

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The gopher's crossings of the track. */
export class GopherRun {
  /**
   * the crossing under way: where it's going from and to, how far (0…1), and what it's doing; its holes (the two it
   * crossed between, and one it dug, flung far from them); in the air: where, and how fast
   */
  crossing?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    done: number;
    phase: Phase;
    t: number;
    back: boolean;
    holes: { x: number; y: number }[];
    air?: { x: number; y: number; z: number; vx: number; vy: number; vz: number; tumble: number; heading: number };
  };
  /** crossings made, those it bolted from, and the times a car hit it */
  crossings = 0;
  bolts = 0;
  hits = 0;
  private wait: number;
  private readonly r: () => number;
  private stride = 0;

  constructor(private readonly track: Track, seed = 5) {
    this.r = rng(seed);
    this.wait = GOPHER.wait * 0.5 + this.r() * GOPHER.waitMore;
  }

  /** `dt` s on, near `focus` (the camera's), with `cars` about. */
  step(dt: number, cars: GopherCar[], focus: { x: number; y: number }): void {
    if (dt <= 0) return;
    const c = this.crossing;
    if (!c) {
      this.wait -= dt;
      if (this.wait > 0) return;
      this.start(cars, focus);
      return;
    }
    c.t += dt;
    if (c.phase === 'flung') {
      this.fly(dt);
      return;
    }
    const at = this.where();
    // hit: a car going by over it (not as it ducks into its hole)
    const hitBy = c.phase !== 'duck' && cars.find((k) => Math.hypot(k.x - at.x, k.y - at.y) < GOPHER.hit && Math.hypot(k.vx, k.vy) > GOPHER.hitSpeed);
    if (hitBy) {
      this.flung(at, hitBy);
      return;
    }
    if (c.phase === 'peek') {
      if (c.t >= GOPHER.peek) Object.assign(c, { phase: 'run', t: 0 });
      return;
    }
    if (c.phase === 'dazed') {
      // (shaking it off: away to the hole, as fast as it can)
      if (c.t >= GOPHER.dazed) Object.assign(c, { phase: 'bolt', t: 0 });
      return;
    }
    const danger = cars.some((k) => Math.hypot(k.x - at.x, k.y - at.y) < GOPHER.danger);
    if (c.phase === 'run' && danger) {
      // caught on the track: frozen to the spot a moment, then for the nearer hole, as fast as it can
      Object.assign(c, { phase: 'freeze', t: 0, back: c.done < 0.5 });
      return;
    }
    if (c.phase === 'freeze') {
      if (c.t >= GOPHER.freeze) {
        Object.assign(c, { phase: 'bolt', t: 0 });
        this.bolts++;
      }
      return;
    }
    if (c.phase === 'run' || c.phase === 'bolt') {
      const length = Math.max(1, Math.hypot(c.to.x - c.from.x, c.to.y - c.from.y));
      const speed = GOPHER.speed * (c.phase === 'bolt' ? GOPHER.bolt : 1);
      this.stride += speed * dt;
      c.done += ((c.back ? -1 : 1) * speed * dt) / length;
      if (c.done >= 1 || c.done <= 0) {
        c.done = Math.max(0, Math.min(1, c.done));
        Object.assign(c, { phase: 'duck', t: 0 });
      }
      return;
    }
    if (c.t >= GOPHER.duck) this.end();
  }

  /** Hit by `car` at `at`: up off its bonnet, the way it was going, tumbling. */
  private flung(at: { x: number; y: number }, car: GopherCar): void {
    const c = this.crossing!;
    const speed = Math.hypot(car.vx, car.vy);
    // (a little off to one side or the other, as it glances off)
    const aside = (this.r() - 0.5) * 0.5;
    const dir = Math.atan2(car.vy, car.vx) + aside;
    const v = speed * GOPHER.fling;
    c.air = { x: at.x, y: at.y, z: 0, vx: Math.cos(dir) * v, vy: Math.sin(dir) * v, vz: GOPHER.lift + speed * GOPHER.liftMore, tumble: 0, heading: dir };
    Object.assign(c, { phase: 'flung', t: 0 });
    this.hits++;
  }

  /** Through the air, `dt` s on; down: dazed where it lands, then off the track to a hole. */
  private fly(dt: number): void {
    const c = this.crossing!;
    const a = c.air!;
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.vz -= GOPHER.gravity * dt;
    a.z += a.vz * dt;
    a.tumble += GOPHER.tumble * dt;
    if (a.z > 0) return;
    // landed (on its feet): for the nearer of its holes if it's near, or a new one, off the track beside where it is
    const land = { x: a.x, y: a.y };
    const near = [...c.holes].sort((p, q) => Math.hypot(p.x - land.x, p.y - land.y) - Math.hypot(q.x - land.x, q.y - land.y))[0];
    let to = near;
    if (Math.hypot(near.x - land.x, near.y - land.y) > GOPHER.home) {
      const k = nearestSample(this.track, land.x, land.y);
      const p = this.track.samples[k];
      const side = Math.sign(lateralOffset(this.track, k, land.x, land.y)) || 1;
      const out = HALF_WIDTH + GOPHER.holeOut;
      to = { x: p.x + Math.cos(p.dir) * out * side, y: p.y + Math.sin(p.dir) * out * side };
      c.holes.push(to);
    }
    Object.assign(c, { from: land, to, done: 0, back: false, phase: 'dazed', t: 0, air: undefined });
  }

  /** Off across the track up the road from `focus`: at a spot with no car near, if there's one. */
  private start(cars: GopherCar[], focus: { x: number; y: number }): void {
    const { samples } = this.track;
    const n = samples.length;
    const spacing = samples[1].s - samples[0].s;
    const at = nearestSample(this.track, focus.x, focus.y);
    const ahead = [];
    for (let k = Math.ceil(GOPHER.ahead.from / spacing); k <= GOPHER.ahead.to / spacing && k < n; k++) ahead.push(samples[(at + k) % n]);
    const clear = ahead.filter((p) => cars.every((k) => Math.hypot(k.x - p.x, k.y - p.y) > GOPHER.clear));
    if (!clear.length) {
      // (none clear: it tries again a moment later)
      this.wait = 1.5;
      return;
    }
    const out = HALF_WIDTH + GOPHER.holeOut;
    const hole = (p: Sample, s: number, along: number) => ({ x: p.x + Math.cos(p.dir) * out * s + Math.sin(p.dir) * along, y: p.y + Math.sin(p.dir) * out * s - Math.cos(p.dir) * along });
    // (its holes in the grass: not on another stretch of the lap running by)
    const offTrack = (h: { x: number; y: number }) => Math.abs(lateralOffset(this.track, nearestSample(this.track, h.x, h.y), h.x, h.y)) > HALF_WIDTH + GOPHER.holeOut / 2;
    const p = clear[Math.floor(this.r() * clear.length)];
    const side = this.r() < 0.5 ? 1 : -1;
    // (a little aslant, as an animal crosses)
    const lean = (this.r() - 0.5) * 30;
    const from = hole(p, side, -lean);
    const to = hole(p, -side, lean);
    if (!offTrack(from) || !offTrack(to)) {
      this.wait = 1.5;
      return;
    }
    this.crossing = { from, to, done: 0, phase: 'peek', t: 0, back: false, holes: [from, to] };
  }

  private end(): void {
    const c = this.crossing;
    if (c && c.phase === 'duck' && (c.done >= 1 || c.done <= 0)) this.crossings++;
    this.crossing = undefined;
    this.wait = GOPHER.wait + this.r() * GOPHER.waitMore;
  }

  /** Where it is on its way. */
  private where(): { x: number; y: number } {
    const c = this.crossing!;
    return { x: c.from.x + (c.to.x - c.from.x) * c.done, y: c.from.y + (c.to.y - c.from.y) * c.done };
  }

  /** How it looks now (none: it's in its hole). */
  pose(): GopherPose | undefined {
    const c = this.crossing;
    if (!c) return undefined;
    if (c.air) return { x: c.air.x, y: c.air.y, z: c.air.z, heading: c.air.heading, up: 1, step: 0, running: false, tumble: c.air.tumble, dazed: false };
    const at = this.where();
    const dir = Math.atan2(c.to.y - c.from.y, c.to.x - c.from.x) + (c.back ? Math.PI : 0);
    const up = c.phase === 'peek' ? Math.min(1, c.t / (GOPHER.peek * 0.4)) : c.phase === 'duck' ? Math.max(0, 1 - c.t / GOPHER.duck) : 1;
    return { ...at, z: 0, heading: dir, up, step: this.stride / 5, running: c.phase === 'run' || c.phase === 'bolt', tumble: 0, dazed: c.phase === 'dazed' };
  }
}

const FUR = new THREE.MeshLambertMaterial({ color: 0x8a5a32 });
const BELLY = new THREE.MeshLambertMaterial({ color: 0xc89a6a });
const DARK = new THREE.MeshLambertMaterial({ color: 0x2a1a10 });
const TEETH = new THREE.MeshLambertMaterial({ color: 0xf4efe0 });
const DIRT = new THREE.MeshLambertMaterial({ color: 0x5e4630 });

/** A gopher, about 12 px nose to tail, facing +x (drawn GOPHER.size times that). */
export function gopherModel(): { group: THREE.Group; body: THREE.Group; feet: THREE.Object3D[] } {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    body.add(m);
  };
  part(new THREE.BoxGeometry(6, 3.4, 3.6), FUR, 0, 2.3);
  part(new THREE.BoxGeometry(4.4, 1, 3), BELLY, 0.3, 0.9);
  part(new THREE.BoxGeometry(2.8, 2.8, 3), FUR, 3.6, 3.2);
  part(new THREE.BoxGeometry(1, 1.3, 1.6), BELLY, 5.2, 2.7);
  part(new THREE.BoxGeometry(0.5, 0.9, 1), TEETH, 5.7, 1.9);
  part(new THREE.BoxGeometry(0.5, 0.6, 0.6), DARK, 5.8, 3.2);
  for (const z of [-1, 1]) {
    part(new THREE.BoxGeometry(0.5, 0.5, 0.5), DARK, 4.7, 3.9, z * 1.1);
    part(new THREE.BoxGeometry(0.6, 0.9, 0.7), FUR, 3, 4.7, z * 1.2);
  }
  part(new THREE.BoxGeometry(2.4, 0.8, 0.8), FUR, -3.8, 1.8);
  group.add(body);
  const feet: THREE.Object3D[] = [];
  for (const [x, z] of [[2, 1.3], [2, -1.3], [-2, 1.3], [-2, -1.3]]) {
    const foot = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1), DARK);
    foot.position.set(x, 0.6, z);
    body.add(foot);
    feet.push(foot);
  }
  return { group, body, feet };
}

/** The gopher at a circuit with them, in `scene`. Gives back its crossings, and its step (`dt` s on, with `cars` about, near `focus`). */
export function buildGopher(scene: THREE.Scene, grid: Grid, track: Track): { run: GopherRun; step: (dt: number, cars: GopherCar[], focus: { x: number; y: number }) => void } {
  const run = new GopherRun(track);
  const { group, body, feet } = gopherModel();
  // its two holes: a dark hole in a ring of dug earth, either side of the track
  const hole = () => {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5, 1, 10), DIRT);
    mound.position.y = 0.3;
    const pit = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.2, 10), DARK);
    pit.position.y = 0.85;
    g.add(mound, pit);
    g.scale.setScalar(GOPHER.size);
    g.visible = false;
    scene.add(g);
    return g;
  };
  // (its two holes, and one it digs flung far from them)
  const holes = [hole(), hole(), hole()];
  group.scale.setScalar(GOPHER.size);
  group.visible = false;
  scene.add(group);
  // dazed: stars going round over its head
  const starMat = new THREE.MeshBasicMaterial({ color: 0xffe14a, toneMapped: false });
  const stars = Array.from({ length: 3 }, () => {
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(1.5, 0), starMat);
    star.visible = false;
    group.add(star);
    return star;
  });
  let shown: GopherRun['crossing'];
  let shownHoles = 0;
  let time = 0;
  const step = (dt: number, cars: GopherCar[], focus: { x: number; y: number }) => {
    run.step(dt, cars, focus);
    time += dt;
    const c = run.crossing;
    // (the holes stay while it's out, gone once it's in and off elsewhere)
    if (c !== shown || (c && c.holes.length !== shownHoles)) {
      shown = c;
      shownHoles = c?.holes.length ?? 0;
      holes.forEach((h, k) => {
        const at = c?.holes[k];
        h.visible = !!at;
        if (at) h.position.set(at.x, groundAt(grid, at.x, at.y).h, at.y);
      });
    }
    const pose = run.pose();
    group.visible = !!pose && pose.up > 0;
    if (!pose) return;
    const ground = groundAt(grid, pose.x, pose.y).h;
    // (popping up out of the hole: rising from under the ground; running: bobbing with its stride; flung: up in the air)
    const bob = pose.running ? Math.abs(Math.sin(pose.step * Math.PI)) * 0.8 : 0;
    group.position.set(pose.x, ground + pose.z + (-(1 - pose.up) * 6 + bob) * GOPHER.size, pose.y);
    group.rotation.y = -pose.heading;
    // (tumbling head over heels in the air; sitting up dazed, swaying; sat up on its haunches looking about)
    body.rotation.z = pose.tumble ? -pose.tumble : pose.dazed ? 0.35 : pose.running ? 0 : 0.35 * pose.up;
    body.rotation.x = pose.dazed ? Math.sin(time * 5) * 0.2 : 0;
    body.position.y = pose.tumble ? 2.5 : 0;
    feet.forEach((f, k) => (f.position.x = (k < 2 ? 2 : -2) + (pose.running ? Math.sin(pose.step * Math.PI * 2 + (k % 2) * Math.PI) * 0.8 : 0)));
    stars.forEach((star, k) => {
      star.visible = pose.dazed;
      if (!pose.dazed) return;
      const a = time * 4 + (k * Math.PI * 2) / stars.length;
      star.position.set(2.5 + Math.cos(a) * 3.2, 8, Math.sin(a) * 3.2);
      star.rotation.y = time * 6;
    });
  };
  return { run, step };
}
