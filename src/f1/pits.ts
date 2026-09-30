// The pit lane and pit stops. The lane runs beside the main straight, behind
// a pit wall: a car that leaves the track at the pit entry is committed, and
// from there it drives itself: down the lane on the speed limiter, into its
// team's box, stopped while the crew fits new tyres and repairs its damage, and
// back out onto the track at the exit. Engine-free, so a stop runs in a test as in the game.

import { speedOf, type Car, type DriveInput } from '../engine/driving';
import { lateralOffset, type Pt, type Track } from './racing';
import { stopNow, wearPerLap, type TyreSet } from './tyres';

export const PIT = {
  /** px from the track's centreline out to the lane's centre */
  offset: 96,
  /** px along the track the lane takes to move out from the track, and back in */
  taper: 160,
  /** px from the centreline where the lane starts and ends, on the track */
  joinAt: 24,
  /** px/s: the pit lane speed limit (an F1 car's top speed is 320) */
  limit: 120,
  /** px across the lane (+ = away from the track) of the fast lane, and of the boxes beside it */
  fastLane: -8,
  boxLane: 14,
  /** boxes along the lane, one per team, and the px between them */
  boxes: 5,
  boxSpacing: 44,
  /** seconds a stop takes with nothing to repair (new tyres on, jacks down) */
  stop: 1.2,
  /** seconds to repair a car from no health to full; a stop repairs its share of that */
  repair: 3,
  /** px off the track edge on the pit side, inside the pit zone, that commits a car to the pit lane */
  commit: 52,
  /** px/s² a car brakes at into its box */
  decel: 300,
  /** after the race: seconds a car sits in its box before the crew pushes it back into the garage, and seconds the push takes */
  garageWait: 0.6,
  garagePush: 2.2,
  /** px along from the garage's middle where a team's first and second car home end up, side by side */
  garageSlots: [10, -10] as const,
  /** after the race: px past the start line of the top three's parking spots (P1, P2, P3), and px out from the centreline on the pit side */
  podium: [170, 115, 60] as const,
  podiumAcross: 30,
};

/** Where a circuit's pit lane is: px along the lap from the start line (negative = before it), and which side. */
export interface PitSpec {
  from: number;
  to: number;
  /** −1 = left of the track, in the direction of the race; 1 = right */
  side: -1 | 1;
}

export interface PitLanePoint extends Pt {
  /** px along the lane from its start */
  s: number;
  /** direction of travel, radians (as the track's) */
  dir: number;
  /** the track sample beside it */
  idx: number;
  /** px out from the track's centreline */
  off: number;
}

export interface PitLane {
  side: -1 | 1;
  /** the lane's centreline, entry to exit, one point per track sample */
  points: PitLanePoint[];
  /** px along the lane */
  length: number;
  /** track samples where it leaves the track and rejoins it */
  entry: number;
  exit: number;
  /** track samples between which the lane is fully out, behind the pit wall */
  wallFrom: number;
  wallTo: number;
  /** px along the lane of each box */
  boxes: number[];
  /** after the race: the top three's parking spots on the main straight (P1 furthest on), as a track sample and px to the right of it */
  podium: { idx: number; lane: number }[];
}

const ease = (t: number) => (1 - Math.cos(Math.max(0, Math.min(1, t)) * Math.PI)) * 0.5;
const wrap = (i: number, n: number) => ((i % n) + n) % n;

/** The pit lane for `spec` beside `track`. */
export function buildPitLane(track: Track, spec: PitSpec): PitLane {
  const n = track.samples.length;
  const entry = wrap(Math.round(spec.from / track.spacing), n);
  const count = Math.round((spec.to - spec.from) / track.spacing) + 1;
  const along = (count - 1) * track.spacing;
  const taper = Math.min(PIT.taper, along / 3);
  const raw = Array.from({ length: count }, (_, k) => {
    const idx = wrap(entry + k, n);
    const p = track.samples[idx];
    const d = k * track.spacing;
    const off = PIT.joinAt + (PIT.offset - PIT.joinAt) * Math.min(ease(d / taper), ease((along - d) / taper));
    const o = off * spec.side;
    return { x: p.x + Math.cos(p.dir) * o, y: p.y + Math.sin(p.dir) * o, idx, off };
  });
  let s = 0;
  const points = raw.map((p, k) => {
    if (k) s += Math.hypot(p.x - raw[k - 1].x, p.y - raw[k - 1].y);
    const a = raw[Math.max(0, k - 1)];
    const b = raw[Math.min(count - 1, k + 1)];
    return { ...p, s, dir: Math.atan2(b.x - a.x, -(b.y - a.y)) };
  });
  const tapered = Math.round(taper / track.spacing);
  const wallFrom = wrap(entry + tapered, n);
  const wallTo = wrap(entry + count - 1 - tapered, n);
  // the boxes: centred along the fully-out part, closer together if it's short
  const s0 = points[tapered].s + 30;
  const s1 = points[count - 1 - tapered].s - 30;
  const gap = Math.min(PIT.boxSpacing, (s1 - s0) / Math.max(1, PIT.boxes - 1));
  const mid = (s0 + s1) / 2;
  const boxes = Array.from({ length: PIT.boxes }, (_, b) => mid + (b - (PIT.boxes - 1) / 2) * gap);
  // the podium spots: on the pit side of the main straight, just past the line, clear of the cool-down lane on the other side
  const podium = PIT.podium.map((d) => ({ idx: wrap(Math.round(d / track.spacing), n), lane: PIT.podiumAcross * spec.side }));
  return { side: spec.side, points, length: s, entry, exit: wrap(entry + count - 1, n), wallFrom, wallTo, boxes, podium };
}

/** Whether track sample `idx` is between `from` and `to` (inclusive), going the way of the race. */
export function between(idx: number, from: number, to: number, n: number): boolean {
  return wrap(idx - from, n) <= wrap(to - from, n);
}

/** Index of the lane point nearest (x, y): near `hint` when given, else along the whole lane. */
export function nearestLanePoint(pit: PitLane, x: number, y: number, hint?: number): number {
  let best = hint ?? 0;
  let bestD = Infinity;
  const from = hint === undefined ? 0 : Math.max(0, hint - 12);
  const to = hint === undefined ? pit.points.length - 1 : Math.min(pit.points.length - 1, hint + 12);
  for (let k = from; k <= to; k++) {
    const p = pit.points[k];
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bestD) [best, bestD] = [k, d];
  }
  return best;
}

/** A car's way through the pit lane. */
export interface PitStop {
  /** 'in': down the lane to its box; 'stopped': being repaired; 'out': on to the exit; after the race, 'garage': pushed back into (and then in) the garage */
  phase: 'in' | 'stopped' | 'out' | 'garage';
  /** the lane point it's nearest */
  at: number;
  /** the box it stops at (an index into the lane's boxes) */
  box: number;
  /** seconds of the stop left */
  left: number;
  /** seconds the stop takes in all */
  time: number;
  /** after the race: the car's way home, to its box and back into its garage (no stop, no repairs), to end up this many px along from the garage's middle */
  home?: number;
  /** pushed into the garage: where it stopped in the box, and seconds of the push done */
  push?: { x: number; y: number; heading: number; done: number };
}

/** Seconds a stop takes for `car`: the fixed part, and the repair its damage needs. */
export const stopTime = (car: Car) => PIT.stop + PIT.repair * (1 - car.health / car.cls.health);

/** Whether `car`, on the track near sample `idx`, has turned into the pit entry (and so is committed to the lane). */
export function entersPit(pit: PitLane, track: Track, car: Car, idx: number): boolean {
  if (car.wrecked || !between(idx, pit.entry, pit.wallTo, track.samples.length)) return false;
  return lateralOffset(track, idx, car.x, car.y) * pit.side > PIT.commit;
}

/** A pit stop starting at the entry, heading for `box`; with `home`, the car's way back to its garage after the race (to end up `home` px along from its middle). */
export function newPitStop(pit: PitLane, car: Car, box: number, home?: number): PitStop {
  return { phase: 'in', at: nearestLanePoint(pit, car.x, car.y), box: Math.max(0, Math.min(pit.boxes.length - 1, box)), left: 0, time: 0, home };
}

/** px across the lane (+ = away from the track) of the middle of the garages behind it (just past its outer edge) */
export const GARAGE_ACROSS = 50;

/**
 * Where a car that's home after the race is, `done` s into the crew's push back
 * into its garage: it rolls backwards from its box, turning to face out, and
 * ends up inside, nose to the door. Moves the car there, stopped.
 */
export function pushIntoGarage(pit: PitLane, stop: PitStop, car: Car): void {
  const push = stop.push!;
  const q = pit.points.find((p) => p.s >= pit.boxes[stop.box]) ?? pit.points[pit.points.length - 1];
  const across = GARAGE_ACROSS * pit.side;
  const along = stop.home ?? 0;
  const to = {
    x: q.x + Math.cos(q.dir) * across + Math.sin(q.dir) * along,
    y: q.y + Math.sin(q.dir) * across - Math.cos(q.dir) * along,
    heading: q.dir - (pit.side * Math.PI) / 2,
  };
  const t = ease(push.done / PIT.garagePush);
  // the turn first, then the roll back
  const turn = ease(Math.min(1, (push.done / PIT.garagePush) * 1.6));
  const d = Math.atan2(Math.sin(to.heading - push.heading), Math.cos(to.heading - push.heading));
  car.x = push.x + (to.x - push.x) * t;
  car.y = push.y + (to.y - push.y) * t;
  car.heading = push.heading + d * turn;
  car.vx = car.vy = 0;
}

/**
 * A would-be race engineer: whether a car at the pit entry should stop now,
 * weighing the time its worn tyres and damage will cost over the laps left
 * against the stop (see tyres.ts), stopping now, later or not at all.
 * `lapTime` is a lap on new tyres.
 */
export function wantsPit(car: Car, tyres: TyreSet, lapsLeft: number, lapTime: number, damageSlow: number, trackLength: number): boolean {
  if (car.wrecked) return false;
  return stopNow({
    lapsLeft, lapTime, wear: tyres.wear, perLap: wearPerLap(tyres, trackLength),
    damage: 1 - car.health / car.cls.health, damageSlow, stopTime: stopTime(car),
  });
}

/** px across the lane (+ = away from the track) a car in `stop` aims for at lane position `s`. */
function laneTarget(pit: PitLane, stop: PitStop, s: number): number {
  const box = pit.boxes[stop.box];
  if (stop.phase === 'out' && s > box + 40) return PIT.fastLane;
  if (stop.phase === 'stopped') return PIT.boxLane;
  // swing over into the box over the last few car lengths before it (more gently to park), and back out after
  const t = stop.phase === 'in' ? 1 - (box - s) / 60 : 1 - (s - box) / 40;
  return PIT.fastLane + (PIT.boxLane - PIT.fastLane) * ease(t);
}

/**
 * Drive `car` through the pit lane: to its box on the limiter, stopped there,
 * then out to the exit, keeping behind a car ahead in the same line. Moves the
 * stop on (the box, the repair, the way out); returns the input for this step
 * and whether the car has reached the exit.
 */
export function pitStep(pit: PitLane, stop: PitStop, car: Car, others: Car[], dt: number): { input: DriveInput; done: boolean; stopped: boolean } {
  stop.at = nearestLanePoint(pit, car.x, car.y, stop.at);
  const here = pit.points[stop.at];
  const v = speedOf(car);
  const box = pit.boxes[stop.box];
  let stopped = false;
  if (stop.home !== undefined && stop.phase === 'in' && here.s >= box - 6 && v < 8) {
    // home after the race: a moment in the box, then the crew push it back into the garage
    stop.phase = 'stopped';
    stop.time = stop.left = PIT.garageWait;
  }
  if (stop.home !== undefined && stop.phase === 'stopped') {
    stop.left -= dt;
    if (stop.left <= 0) {
      stop.phase = 'garage';
      stop.push = { x: car.x, y: car.y, heading: car.heading, done: 0 };
    }
    return { input: { handbrake: true, brake: true }, done: false, stopped };
  }
  if (stop.phase === 'garage') {
    stop.push!.done = Math.min(PIT.garagePush, stop.push!.done + dt);
    pushIntoGarage(pit, stop, car);
    return { input: { handbrake: true, brake: true }, done: false, stopped };
  }
  if (stop.phase === 'in' && here.s >= box - 6 && v < 8) {
    stop.phase = 'stopped';
    stop.time = stop.left = stopTime(car);
    stopped = true;
    // the fire's out, and the repair starts
    car.burn = undefined;
  }
  if (stop.phase === 'stopped') {
    const rate = car.cls.health / PIT.repair;
    car.health = Math.min(car.cls.health, car.health + rate * dt);
    stop.left -= dt;
    if (stop.left > 0) return { input: { handbrake: true, brake: true }, done: false, stopped };
    car.health = car.cls.health;
    stop.phase = 'out';
  }
  if (stop.at >= pit.points.length - 1 || (stop.phase === 'out' && here.s >= pit.length - 4)) return { input: { handbrake: false }, done: true, stopped };

  // aim a little ahead along the lane, in this car's line across it
  const ahead = pit.points[Math.min(pit.points.length - 1, stop.at + Math.max(2, Math.round((20 + v * 0.25) / 8)))];
  const across = laneTarget(pit, stop, ahead.s) * pit.side;
  const tx = ahead.x + Math.cos(ahead.dir) * across;
  const ty = ahead.y + Math.sin(ahead.dir) * across;
  let want = PIT.limit;
  if (stop.phase === 'in') want = Math.min(want, Math.sqrt(2 * PIT.decel * Math.max(0, box - here.s)) + 4);
  // a car ahead in the same line: keep behind it (a car stopped in a box further down isn't in the way)
  const mine = laneTarget(pit, stop, here.s);
  const fx = Math.sin(here.dir);
  const fy = -Math.cos(here.dir);
  for (const o of others) {
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const along = dx * fx + dy * fy;
    if (along <= 0 || along > 60) continue;
    const theirs = ((o.x - here.x) * Math.cos(here.dir) + (o.y - here.y) * Math.sin(here.dir)) * pit.side;
    if (Math.abs(theirs - mine) > 12) continue;
    want = Math.min(want, along < 34 ? 0 : speedOf(o));
  }
  const dx = tx - car.x;
  const dy = ty - car.y;
  const d = Math.hypot(dx, dy) || 1;
  const mag = Math.max(0.05, Math.min(1, want / car.cls.topSpeed));
  return { input: { steer: { x: (dx / d) * mag, y: (dy / d) * mag }, handbrake: false, brake: v > want + 6 || want === 0, limit: PIT.limit }, done: false, stopped };
}
