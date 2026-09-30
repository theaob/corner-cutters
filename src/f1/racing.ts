// F1 racing rules: a closed track as a smooth centreline,
// the speed each part of it can be taken at, lap and sector timing, race
// standings, and AI drivers that follow the racing line. Engine-free and
// unit-tested; the circuit layout and rendering live in circuit.ts and race.ts.

import { DEFAULT_HANDLING, angleDiff, speedOf, type Car, type CarClass, type DriveInput, type HandlingParams } from '../engine/driving';

/**
 * Race handling: the driving rules with lighter crash damage, so a nudge
 * doesn't end a race, but damage that costs pace: a car on its last legs has
 * lost 30% of its top speed. The tyre limit and slide scrub (lateralGrip,
 * slideScrub) are off: that version made the race too hard, so races play
 * like the first prototype, where an F1 car takes most bends flat out.
 */
export const RACE_HANDLING: HandlingParams = { ...DEFAULT_HANDLING, allowReverse: true, crashDamage: 0.2, damageSlow: 0.3 };

/**
 * The racing line's corner speed for a car: the fastest it can follow a bend of
 * curvature k: its turn rate (speed ≤ turn rate ÷ k) and, if the tyres have a
 * limit, what they hold (speed² × k ≤ lateral grip), with a safety margin.
 */
export function lineCornerSpeed(cls: CarClass, p: HandlingParams = RACE_HANDLING, margin = 0.9): (absCurve: number) => number {
  return (k) => {
    const c = Math.max(k, 1e-6);
    const byTurn = (margin * cls.turnRate) / c;
    const byTyres = Number.isFinite(p.lateralGrip) ? Math.sqrt((margin * p.lateralGrip * cls.grip) / c) : Infinity;
    return Math.min(cls.topSpeed, byTurn, byTyres);
  };
}

/** How hard the racing line brakes: a share of the car's full braking. */
export const lineDecel = (cls: CarClass, share = 0.7) => (cls.topSpeed / cls.brakeTime) * share;

export interface Pt {
  x: number;
  y: number;
}

export interface TrackSample extends Pt {
  /** px from the start/finish line along the centreline */
  s: number;
  /** direction of travel, radians: 0 = north (up the screen), clockwise positive */
  dir: number;
  /** signed curvature (1/px): positive turns right (clockwise), negative left */
  curve: number;
  /** px/s the racing line can be taken at here, braking for what's ahead included */
  speed: number;
}

export interface Track {
  samples: TrackSample[];
  /** px between samples */
  spacing: number;
  /** px round the loop */
  length: number;
}

/** A closed Catmull-Rom spline through `points`, resampled every `spacing` px. The first point is the start line. */
export function smoothLoop(points: Pt[], spacing: number): Pt[] {
  const n = points.length;
  const dense: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];
    for (let k = 0; k < 24; k++) {
      const t = k / 24;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push({ x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  // walk the dense curve, dropping a point every `spacing` px
  const out: Pt[] = [dense[0]];
  let carry = 0;
  for (let i = 0; i < dense.length; i++) {
    const a = dense[i];
    const b = dense[(i + 1) % dense.length];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    let at = spacing - carry;
    while (at <= seg) {
      const t = at / seg;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      at += spacing;
    }
    carry = seg - (at - spacing);
  }
  // the last point may sit on top of the first
  const last = out[out.length - 1];
  if (Math.hypot(last.x - out[0].x, last.y - out[0].y) < spacing * 0.5) out.pop();
  return out;
}

const headingOf = (dx: number, dy: number) => Math.atan2(dx, -dy);

/**
 * Build a track from control points. `cornerSpeed(|curvature|)` is how fast a
 * bend can be taken; `decel` (px/s²) is how hard the line brakes into it.
 */
export function buildTrack(control: Pt[], spacing: number, cornerSpeed: (absCurve: number) => number, decel: number): Track {
  const pts = smoothLoop(control, spacing);
  const n = pts.length;
  const at = (i: number) => pts[((i % n) + n) % n];
  const dirs = pts.map((_, i) => headingOf(at(i + 1).x - at(i - 1).x, at(i + 1).y - at(i - 1).y));
  const raw = dirs.map((_, i) => angleDiff(dirs[(i + 1) % n], dirs[(i - 1 + n) % n]) / (2 * spacing));
  // smooth the curvature a little so single wobbles don't read as corners
  const curve = raw.map((_, i) => {
    let sum = 0;
    for (let k = -3; k <= 3; k++) sum += raw[(((i + k) % n) + n) % n];
    return sum / 7;
  });
  const speed = curve.map((k) => cornerSpeed(Math.abs(k)));
  // braking: nothing can be faster than what still lets it slow for the bend ahead (twice round the loop)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = speed[(i + 1) % n];
      speed[i] = Math.min(speed[i], Math.sqrt(next * next + 2 * decel * spacing));
    }
  }
  const samples = pts.map((p, i) => ({ x: p.x, y: p.y, s: i * spacing, dir: dirs[i], curve: curve[i], speed: speed[i] }));
  return { samples, spacing, length: n * spacing };
}

/** Index of the sample nearest (x, y): a local search from `hint` when given, else the whole track. */
export function nearestSample(track: Track, x: number, y: number, hint?: number): number {
  const n = track.samples.length;
  const d2 = (i: number) => {
    const p = track.samples[((i % n) + n) % n];
    return (p.x - x) ** 2 + (p.y - y) ** 2;
  };
  let best = 0;
  let bestD = Infinity;
  if (hint !== undefined) {
    for (let k = -40; k <= 40; k++) {
      const d = d2(hint + k);
      if (d < bestD) [best, bestD] = [(((hint + k) % n) + n) % n, d];
    }
    // lost (reset, or cut across the infield): fall back to a full search
    if (bestD < 200 * 200) return best;
  }
  for (let i = 0; i < n; i++) {
    const d = d2(i);
    if (d < bestD) [best, bestD] = [i, d];
  }
  return best;
}

export const SECTORS = 3;

export interface RaceProgress {
  /** completed laps */
  lap: number;
  /** nearest track sample */
  idx: number;
  /** sectors passed this lap, in order (a lap counts only with all of them) */
  sector: number;
  /** race time when this lap started; undefined before the first crossing */
  lapStart?: number;
  lapTimes: number[];
  /** race time at the chequered flag */
  finished?: number;
  /** seconds spent facing the wrong way (for the warning) */
  wrongWay: number;
  /** seconds added to the finish time (overtaking under the safety car) */
  penalty: number;
  /** out of the race (wrecked, and cleared off the track): classified last, as DNF */
  retired?: boolean;
}

export const newProgress = (idx: number): RaceProgress => ({ lap: 0, idx, sector: 0, lapTimes: [], wrongWay: 0, penalty: 0 });

/**
 * Update a racer's progress. Cars start just behind the line: the first
 * crossing starts lap 1's clock; later crossings complete a lap when every
 * sector was passed in order.
 */
export function stepProgress(p: RaceProgress, track: Track, car: Car, raceTime: number, laps: number, dt: number): RaceProgress {
  const n = track.samples.length;
  const idx = nearestSample(track, car.x, car.y, p.idx);
  // after the flag only the position keeps updating (for the cool-down lap)
  if (p.finished !== undefined) return { ...p, idx };
  const next: RaceProgress = { ...p, idx };
  const per = Math.floor(n / SECTORS);
  // passing a sector boundary in the right order
  const boundary = (next.sector + 1) * per;
  if (next.sector < SECTORS - 1 && idx >= boundary && idx < boundary + per && p.idx < boundary) next.sector++;
  // crossing the line: index wraps from the end of the loop to the start
  const crossed = p.idx > n - 60 && idx < 60;
  if (crossed) {
    if (next.lapStart === undefined) {
      next.lapStart = raceTime;
    } else if (next.sector === SECTORS - 1) {
      next.lapTimes = [...p.lapTimes, raceTime - next.lapStart];
      next.lap = p.lap + 1;
      next.lapStart = raceTime;
      if (next.lap >= laps) next.finished = raceTime;
    }
    next.sector = 0;
  }
  // wrong way: heading against the track direction while moving
  const along = angleDiff(car.heading, track.samples[idx].dir);
  next.wrongWay = Math.abs(along) > Math.PI * 0.6 && speedOf(car) > 20 ? p.wrongWay + dt : 0;
  return next;
}

/** Race order: finishers by time (penalties added), then by laps done, then by distance round the current lap; retired cars last. */
export function standings(racers: RaceProgress[], track: Track): number[] {
  const n = track.samples.length;
  // on the grid (before the first crossing) a car is behind the line: idx − n
  const score = (p: RaceProgress) => (p.lapStart === undefined ? p.idx - n : p.lap * n + p.idx);
  return racers
    .map((_, i) => i)
    .sort((a, b) => {
      const pa = racers[a];
      const pb = racers[b];
      // retired cars go to the back, the one that got furthest first
      if (pa.retired || pb.retired) {
        if (!pa.retired) return -1;
        if (!pb.retired) return 1;
        return score(pb) - score(pa);
      }
      if (pa.finished !== undefined || pb.finished !== undefined) {
        if (pa.finished === undefined) return 1;
        if (pb.finished === undefined) return -1;
        return pa.finished + pa.penalty - (pb.finished + pb.penalty);
      }
      return score(pb) - score(pa);
    });
}

export interface AiDriver {
  /** px to the right of the centreline this driver aims for */
  lane: number;
  /** share of the line's speed it drives at (skill) */
  pace: number;
}

/** The lateral offset (px, + = right of the centreline) of point (x, y) near sample i. */
export function lateralOffset(track: Track, i: number, x: number, y: number): number {
  const p = track.samples[i];
  return (x - p.x) * Math.cos(p.dir) + (y - p.y) * Math.sin(p.dir);
}

/** The pad as the player holds it: the stick (screen space, length 0…1) and the A and B buttons. */
export interface Pad {
  stick: { x: number; y: number };
  a: boolean;
  b: boolean;
}

/** The driving input for the player from the touch thumbstick: it points where to go, and how far it's pushed is the throttle; B drifts. */
export function playerInput(pad: Pad): DriveInput {
  const { stick, b } = pad;
  return { steer: stick.x || stick.y ? stick : undefined, handbrake: b };
}

/** Keys and gamepads drive the car itself: steering (−1 left … 1 right), gas and brake (0…1), and drift. */
export interface WheelPad {
  turn: number;
  gas: number;
  brake: number;
  drift: boolean;
}

/** How hard the wheel turns at full lock (a share of the car's turn rate): a steering key is always at full lock. */
export const WHEEL_LOCK = 0.8;
/** px/s: slower than this (forwards), the brake reverses instead */
const REVERSE_BELOW = 10;

/** The wheel from the arrow keys (or WASD): up gas, down brake, left and right steer. */
export const keysWheel = (keys: { up: boolean; down: boolean; left: boolean; right: boolean }, drift: boolean): WheelPad => ({
  turn: (keys.right ? 1 : 0) - (keys.left ? 1 : 0), gas: keys.up ? 1 : 0, brake: keys.down ? 1 : 0, drift,
});

/**
 * The driving input for keys or a gamepad: the wheel turns the car (a gentle
 * curve on an analogue stick, for fine corrections), the gas pulls, the brake
 * brakes, and held once stopped (off the gas) it reverses.
 */
export function wheelInput(w: WheelPad, car: Car): DriveInput {
  const turn = Math.sign(w.turn) * Math.min(1, Math.abs(w.turn)) ** 1.5 * WHEEL_LOCK;
  const forward = car.vx * Math.sin(car.heading) - car.vy * Math.cos(car.heading);
  const braking = w.brake > 0.2;
  if (braking && w.gas < 0.1 && forward < REVERSE_BELOW) return { wheel: { turn, gas: 0, reverse: true }, handbrake: w.drift };
  return { wheel: { turn, gas: w.gas, reverse: false }, handbrake: w.drift, brake: braking };
}

/** Race control's orders for a driver: a speed limit, and whether it may overtake. */
export interface Orders {
  /** px/s: never faster than this (the safety car's limiter) */
  limit?: number;
  /** stay in line behind the car ahead instead of moving over to pass */
  noOvertaking?: boolean;
}

/**
 * Drive the racing line: aim at a point ahead (further at speed), at the
 * driver's lane, and hold the speed the line allows there, braking when over it.
 * `others` are the other cars, so an AI can move over rather than run into one,
 * and holds the speed of a car right ahead in its lane rather than hit it.
 */
/** px of straight a tow needs ahead to be used (room to brake from the extra speed), on top of 1.1 s at the car's speed */
const TOW_ROOM = 120;

export function aiInput(car: Car, track: Track, idx: number, ai: AiDriver, others: Car[] = [], orders: Orders = {}, boost = 1): DriveInput {
  const n = track.samples.length;
  const v = speedOf(car);
  const ahead = Math.round((40 + v * 0.3) / track.spacing);
  const t = track.samples[(idx + ahead) % n];
  // the line's speed a little ahead (it already includes braking for what's beyond); on worn tyres
  // the car turns less, so it takes the bends (and the braking into them) that much slower
  const line = track.samples[(idx + 2) % n].speed;
  const straight = line >= car.cls.topSpeed - 1;
  const cornering = straight ? 1 : car.tyreGrip ?? 1;
  // room: the straight goes on for more than a braking distance ahead
  let room = straight;
  for (let k = 2; room && k * track.spacing < TOW_ROOM + v * 1.1; k += 2) room = track.samples[(idx + k) % n].speed >= car.cls.topSpeed - 1;
  // a tow in the slipstream (`boost`, × top speed) takes it faster down a straight, while there's room to brake
  // from the extra speed; into a bend it aims for the same speed as ever (the stick asks for a share of the car's
  // top speed, which the tow has raised)
  const free = line * ai.pace * cornering * (room ? boost : 1);
  let lane = ai.lane;
  /** speed of the slowest car close ahead in our way (Infinity = none) */
  let follow = Infinity;
  const here = track.samples[idx];
  const fx = Math.sin(here.dir);
  const fy = -Math.cos(here.dir);
  const mine = lateralOffset(track, idx, car.x, car.y);
  for (const o of others) {
    const dx = o.x - car.x;
    const dy = o.y - car.y;
    const along = dx * fx + dy * fy;
    const across = lateralOffset(track, idx, o.x, o.y) - mine;
    // look further ahead the faster we're closing on it
    const closing = v - speedOf(o);
    // (a wreck is always steered round, never followed: it isn't going anywhere)
    if ((!orders.noOvertaking || o.wrecked) && along > 0 && along < 40 + Math.max(0, closing) * 0.8 && Math.abs(across) < 18 && closing > 0) lane = across > 0 ? lane - 26 : lane + 26;
    // too close to get by (a pack braking into a hairpin): don't drive into its gearbox. Watched across
    // nearly two car widths, so a car merging from the side (off the grid, into a corner) counts too
    if (!o.wrecked && along > 0 && along < 44 + Math.max(0, closing) * 0.7 && Math.abs(across) < 26) follow = Math.min(follow, speedOf(o));
  }
  lane = Math.max(-32, Math.min(32, lane));
  const tx = t.x + Math.cos(t.dir) * lane;
  const ty = t.y + Math.sin(t.dir) * lane;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const d = Math.hypot(dx, dy) || 1;
  const want = Math.min(free, follow, orders.limit ?? Infinity);
  const mag = Math.max(0.05, Math.min(1, want / (car.cls.topSpeed * boost)));
  return { steer: { x: (dx / d) * mag, y: (dy / d) * mag }, handbrake: false, brake: v > want + 12, limit: orders.limit };
}

/**
 * After the flag: pull over to the side and carry on round at an easy pace,
 * without hard braking, so the cars still racing behind don't run into a
 * finisher slowing on the line.
 */
export function coolDownInput(car: Car, track: Track, idx: number, others: Car[] = []): DriveInput {
  return { ...aiInput(car, track, idx, { lane: 30, pace: 0.85 }, others), brake: false };
}

