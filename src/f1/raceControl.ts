// Race control: runs the whole field for one step (start lights, inputs,
// driving, contact, lap timing) and applies the race rules around it. A
// wrecked car is cleared off the track and retires; a big crash brings out the
// safety car, which joins ahead of the leader and leads the field at a limited
// pace, with no overtaking, until it goes in and racing resumes. After the flag
// each car does an in-lap: the top three park in their numbered spots on the
// main straight, and the rest drive down the pit lane to their garages. Cutting
// the inside of a marked corner is a strike: warnings first, then seconds added
// (trackLimits.ts). Engine-free,
// so a whole race, crashes and all, runs in a test exactly as in the game.

import { blueFlags } from './blueFlags';
import { gridFor, sameLevel } from './bridge';
import { applyDamage, carClass, collideCars, newCar, speedOf, stepCar, type Car, type DriveInput, type HandlingParams, type StepEvents } from '../engine/driving';
import type { Grid } from '../engine/sim';
import { PIT, between, entersPit, newPitStop, pitStep, pushIntoGarage, wantsPit, type PitLane, type PitStop } from './pits';
import { fitTyres, freshTyres, tyreFor, wearTyres, type TyreSet } from './tyres';
import { stepTow, towBoost, towFrom } from './slipstream';
import { judge, markCorners, newLimits, offTrack, type Corner, type Limits } from './trackLimits';
import type { WeatherId } from './weather';
import { aiInput, coolDownInput, lateralOffset, nearestSample, newProgress, standings, stepProgress, type AiDriver, type Orders, type RaceProgress, type Track } from './racing';

export const SAFETY_CAR = {
  /** px/s it leads the field at (an F1 car's top speed is 320) */
  speed: 150,
  /** px/s: the field's limiter while it's out, quick enough to close up the queue behind it */
  limit: 200,
  /** a hit that takes at least this share of a car's health in one go is a big crash */
  bigHit: 0.4,
  /** px ahead of the leader it joins the track */
  joinAhead: 160,
  /** px: the leader counts as lined up behind it within this gap */
  queueGap: 120,
  /** px: a player who has got this far alongside or ahead of it drops back behind it */
  dropBack: 300,
  /** seconds it stays out once the leader is lined up behind it */
  leadFor: 12,
  /** seconds it stays out at most, however the field lines up */
  maxOut: 40,
  /** seconds added for each car passed while it's out */
  penalty: 5,
};

/**
 * Holding station under the safety car (or the virtual one): the player's limiter follows the car they must stay
 * behind (a car ahead of them when it came out, or the safety car itself), closing on it at its speed plus a little
 * for each px past the gap, less once inside it, and brakes when well over: the car settles into place a gap behind
 * instead of running into the queue or past it (and taking a penalty).
 */
export const HOLD = {
  /** px from the car ahead (along the track, middle to middle: about a car and a half's daylight) to settle at */
  gap: 72,
  /** px ahead it looks for that car */
  reach: 320,
  /** px/s of closing speed for each px past the gap (1/s) */
  close: 1.4,
  /** px/s: the least the limiter asks, however close (it never stops the car dead) */
  crawl: 40,
  /** px/s over the limiter before the brakes go on */
  over: 12,
  /** inside this share of the gap and closing on the car ahead, the brakes go on whatever the limiter says */
  tight: 0.7,
};

/**
 * The virtual safety car: called for a big crash the car survives (its nose, maybe more, on the track), where a wreck
 * brings out the safety car itself. Every car on a limiter and no overtaking (passing costs as under the safety car),
 * but nobody to queue behind: the gaps hold. Out for a set time (as long as the debris lies), its end called a few
 * seconds before the green.
 */
export const VSC = {
  /** px/s: everyone's limiter while it's out (about 60% of an F1 car's top speed) */
  limit: 190,
  /** seconds it's out */
  length: 10,
  /** seconds before the green that its end is called */
  warn: 3,
};

/** Seconds after lights out before the AI makes passing and defending moves: the pack sorts itself out first. */
export const SETTLE = 15;

/** Seconds a wreck stays on track before the marshals clear it and the car retires. */
export const CLEAR_AFTER = 2.5;
/** Seconds of the start lights before the earliest lights-out. */
export const LIGHTS = 3.6;
/** px a car waiting on the grid may creep from its slot (on a sloping grid; on a flat one it never gets that far) */
export const GRID_HOLD = 2;

export interface Entrant {
  car: Car;
  /** where it lined up on the grid (kept to it till the lights go out) */
  slot?: { x: number; y: number; heading: number };
  /** the AI driving it; undefined for the player */
  ai?: AiDriver;
  progress: RaceProgress;
  /** race time it was wrecked */
  wreckedAt?: number;
  /** its team's box in the pit lane */
  box: number;
  /** on its way through the pit lane */
  pit?: PitStop;
  /** just out of the pits: px of track left to drive along the blend line (at the pit side's edge, no overtaking), up to speed before it crosses to the racing line */
  blend?: number;
  /** pit stops made */
  stops: number;
  /** the set of tyres it's on */
  tyres: TyreSet;
  /** how much it's being towed along in the slipstream of a car ahead, 0…1 */
  tow: number;
  /** its track-limits strikes */
  limits: Limits;
  /** the player's limiter this step under the safety car (or the virtual one): px/s, or undefined when there's none */
  held?: number;
  /** blue flags: the car lapping it, close behind (its index), while they're out */
  blue?: number;
  /** after its flag: px driven on its in-lap, and where it's going once it's back at the pits (a podium spot 0–2, or its garage) */
  inLap?: { driven: number; to?: 'garage' | number; parked?: boolean };
}

export interface SafetyCar {
  car: Car;
  idx: number;
  /** seconds the leader has been lined up behind it */
  led: number;
  /** seconds since it came out */
  out: number;
}

export type RaceEvent =
  | { kind: 'lights-out' }
  /** a big crash (a wreck, or a big share of a car's health lost at once): `vx`, `vy` how it was moving into it (px/s), `hit` the share of its health lost, `wrecked` whether it's a wreck */
  | { kind: 'crash'; who: number; vx: number; vy: number; hit: number; wrecked: boolean }
  | { kind: 'wreck'; who: number }
  | { kind: 'retired'; who: number }
  | { kind: 'safety-car' }
  /** the virtual safety car out, and its end called (the green follows) */
  | { kind: 'vsc' }
  | { kind: 'vsc-ending' }
  | { kind: 'green' }
  | { kind: 'penalty'; who: number; seconds: number }
  | { kind: 'pit-in'; who: number }
  | { kind: 'pit-stop'; who: number; seconds: number }
  | { kind: 'pit-out'; who: number }
  /** the stop done: the car repaired, new parts on */
  | { kind: 'pit-repaired'; who: number }
  | { kind: 'mistake'; who: number; what: 'late' | 'wide' }
  | { kind: 'blue'; who: number; by: number }
  /** a cut across a corner's inside: strike number `strike`, costing `seconds` (0: a warning) */
  | { kind: 'track-limits'; who: number; strike: number; seconds: number }
  /** all four wheels past the white line, either side (anywhere: against the clock, it deletes the lap) */
  | { kind: 'off-track'; who: number };

export interface Race {
  track: Track;
  grid: Grid;
  /** the track's marked corners, for track limits */
  corners: Corner[];
  /** the circuit's pit lane (none: no stops) */
  pit?: PitLane;
  /** the track's weather: it sets which tyres the crews fit and how they do */
  weather: WeatherId;
  handling: HandlingParams;
  laps: number;
  entrants: Entrant[];
  phase: 'lights' | 'racing';
  /** race time (s): counts up to `lightsOut` during the lights, from 0 once they go out */
  clock: number;
  /** the clock time the lights go out */
  lightsOut: number;
  sc?: SafetyCar;
  /** the virtual safety car, while it's out: seconds since it came out */
  vsc?: { out: number };
  /** per entrant: the entrants it has to stay behind while the safety car (or the virtual one) is out */
  holdBehind: Set<number>[];
}

/**
 * A race about to start: the lights come on, then go out `lightsOut` s after the
 * fifth. With a `pit` lane, cars can stop there, each at its `box`. Every car
 * starts on the tyres for the `weather`.
 */
export function newRace(
  track: Track, grid: Grid, handling: HandlingParams, laps: number, field: { car: Car; ai?: AiDriver; box?: number }[], lightsOut = 0.5, pit?: PitLane,
  weather: WeatherId = 'dry',
): Race {
  const entrants = field.map((f) => ({ ...f, box: f.box ?? 0, stops: 0, tow: 0, limits: newLimits(), tyres: freshTyres(tyreFor(weather)), progress: newProgress(track.samples.length - 4) }));
  for (const e of entrants) fitTyres(e.tyres, e.car, weather);
  return { track, grid, corners: markCorners(track), pit, weather, handling, laps, entrants, phase: 'lights', clock: -LIGHTS, lightsOut, holdBehind: entrants.map(() => new Set()) };
}

/** Samples before the pit entry from which an AI car that wants to stop heads in. */
const PIT_CALL = 20;

/** A lap's time on new tyres, to plan a stop by: the entrant's best so far, or a guess before it has one. */
export const planLapTime = (race: Race, e: Entrant) => (e.progress.lapTimes.length ? Math.min(...e.progress.lapTimes) : race.track.length / 300);

/** Whether an AI entrant heads into the pit lane now: it's at the entry, and new tyres and repairs are worth a stop now. */
function aiPits(race: Race, e: Entrant): boolean {
  const { pit, track } = race;
  const n = track.samples.length;
  if (!pit || e.progress.lapStart === undefined || !between(e.progress.idx, pit.entry - PIT_CALL, pit.entry + 4, n)) return false;
  const lapsLeft = race.laps - e.progress.lap - e.progress.idx / n;
  return wantsPit(e.car, e.tyres, lapsLeft, planLapTime(race, e), race.handling.damageSlow, track.length);
}

/** px of track a car just out of the pits drives along the blend line, at the pit side's edge */
const BLEND_LINE = 400;

/** Share of a lap a car drives after its flag before it heads for its parking place (at the pit entry, or the line). */
const IN_LAP = 0.5;

/**
 * Where a car that has finished parks: at the pit entry on its in-lap, a top
 * three finisher carries on to its podium spot, and the rest head down the pit
 * lane to their garage (side by side with a teammate already there). Without a
 * pit lane everyone else just carries on cooling down.
 */
function parkAfterRace(race: Race, i: number): void {
  const e = race.entrants[i];
  const lap = e.inLap!;
  const { pit, track } = race;
  const n = track.samples.length;
  if (lap.to !== undefined || lap.driven < track.length * IN_LAP) return;
  const atEntry = pit ? between(e.progress.idx, pit.entry - PIT_CALL, pit.entry + 4, n) : between(e.progress.idx, n - PIT_CALL, n - 1, n);
  if (!atEntry) return;
  const place = order(race).filter((j) => race.entrants[j].progress.finished !== undefined).indexOf(i);
  if (place < PIT.podium.length) lap.to = place;
  else if (pit) {
    lap.to = 'garage';
    const first = !race.entrants.some((o) => o !== e && o.box === e.box && o.inLap?.to === 'garage');
    e.pit = newPitStop(pit, e.car, e.box, PIT.garageSlots[first ? 0 : 1]);
  }
}

/** px/s² a car brakes at into its podium spot, and px/s it drives there at most */
const PARK = { decel: 220, speed: 160 };

/** The input that drives a car to its podium spot `spot` and stops it there. */
function podiumInput(race: Race, e: Entrant, spot: number, others: Car[]): DriveInput {
  const { track, pit } = race;
  const n = track.samples.length;
  const lap = e.inLap!;
  const at = pit!.podium[spot];
  const ahead = ((at.idx - e.progress.idx + n) % n) * track.spacing;
  // passed it (a sample or two over): stop where it is
  const left = ahead > track.length / 2 ? 0 : ahead;
  if (left < 6) {
    if (speedOf(e.car) < 4) lap.parked = true;
    return { handbrake: true, brake: true };
  }
  const want = Math.min(PARK.speed, Math.sqrt(2 * PARK.decel * left));
  return { ...aiInput(e.car, track, e.progress.idx, { lane: at.lane, pace: 0.7 }, others), limit: want, brake: speedOf(e.car) > want + 10 };
}

/**
 * Skip to the end: every car still racing is given the finish its pace would
 * bring it (the laps it has left at its average lap), a wreck retires, and every
 * finisher is put where its in-lap would end: the top three stopped in their
 * spots on the straight, the rest in their garages. No safety car. Returns the
 * top three (indexes into `entrants`).
 */
export function skipToParked(race: Race): number[] {
  const { track, pit, entrants } = race;
  const n = track.samples.length;
  race.phase = 'racing';
  race.sc = undefined;
  race.vsc = undefined;
  race.holdBehind = entrants.map(() => new Set());
  for (const e of entrants) {
    const p = e.progress;
    if (p.retired) continue;
    if (e.car.wrecked) {
      e.progress = { ...p, retired: true };
      continue;
    }
    if (p.finished !== undefined) continue;
    const times = p.lapTimes;
    const lap = times.length ? times.reduce((a, b) => a + b, 0) / times.length : planLapTime(race, e);
    const left = Math.max(0, race.laps - p.lap - (p.lapStart === undefined ? 0 : p.idx / n));
    e.progress = { ...p, lap: race.laps, finished: race.clock + left * lap };
  }
  const finishers = order(race).filter((i) => entrants[i].progress.finished !== undefined);
  const home = new Set<number>();
  finishers.forEach((i, place) => {
    const e = entrants[i];
    const car = e.car;
    car.vx = car.vy = 0;
    e.inLap = { driven: track.length, to: place < PIT.podium.length && pit ? place : 'garage', parked: true };
    if (!pit) return;
    if (place < PIT.podium.length) {
      const spot = pit.podium[place];
      const s = track.samples[spot.idx];
      car.x = s.x + Math.cos(s.dir) * spot.lane;
      car.y = s.y + Math.sin(s.dir) * spot.lane;
      car.heading = s.dir;
      e.pit = undefined;
    } else {
      const slot = PIT.garageSlots[home.has(e.box) ? 1 : 0];
      home.add(e.box);
      const q = pit.points.find((pt) => pt.s >= pit.boxes[e.box]) ?? pit.points[pit.points.length - 1];
      e.pit = { phase: 'garage', at: 0, box: e.box, left: 0, time: 0, home: slot, push: { x: q.x, y: q.y, heading: q.dir, done: PIT.garagePush } };
      pushIntoGarage(pit, e.pit, car);
    }
    e.progress = { ...e.progress, idx: nearestSample(track, car.x, car.y) };
  });
  return finishers.slice(0, PIT.podium.length);
}

/** Still on the track: not retired (a wreck counts until it's cleared). */
export const running = (e: Entrant) => !e.progress.retired;

/** Whether a car's damage this step makes a big crash: it was wrecked, or lost a big share of its health at once. */
export function isBigCrash(car: Car, healthBefore: number, wreckedNow: boolean): boolean {
  return wreckedNow || healthBefore - car.health >= SAFETY_CAR.bigHit * car.cls.health;
}

/** A dive's contact: `closing` px/s into the car ahead. Both take a hard hit; the car hit spins half round and slows. */
export const INCIDENT = { damage: 0.25, spin: 2.6, slow: 0.5 };

export function racingIncident(diver: Car, hit: Car, closing: number, p: HandlingParams): void {
  applyDamage(diver, closing * INCIDENT.damage, p);
  applyDamage(hit, closing * INCIDENT.damage * 1.2, p);
  // (spun the way the dive pushed it: its tail round)
  const side = Math.sign((hit.x - diver.x) * Math.cos(hit.heading) + (hit.y - diver.y) * Math.sin(hit.heading)) || 1;
  hit.heading += side * INCIDENT.spin * (0.7 + 0.3 * Math.min(1, closing / 150));
  hit.vx *= INCIDENT.slow;
  hit.vy *= INCIDENT.slow;
}

/** Race order (indexes into `entrants`). */
export const order = (race: Race) => standings(race.entrants.map((e) => e.progress), race.track);

/** The virtual safety car out now: everyone on the limiter where they are, and nobody may pass anyone ahead of them now. */
export function callVsc(race: Race): RaceEvent {
  const ranked = order(race);
  race.vsc = { out: 0 };
  race.holdBehind = race.entrants.map((_, i) => new Set(ranked.slice(0, ranked.indexOf(i))));
  return { kind: 'vsc' };
}

/** The safety car joins `ahead` px up the track from `car`, heading the way of the race at no more than its own speed. */
function safetyCarAhead(track: Track, car: Car, idx: number): SafetyCar {
  const n = track.samples.length;
  const i = (idx + Math.round(SAFETY_CAR.joinAhead / track.spacing)) % n;
  const s = track.samples[i];
  const sc = newCar(carClass('f1'), s.x, s.y, s.dir);
  const v = Math.min(SAFETY_CAR.speed, speedOf(car));
  sc.vx = Math.sin(s.dir) * v;
  sc.vy = -Math.cos(s.dir) * v;
  return { car: sc, idx: i, led: 0, out: 0 };
}

export interface StepResult {
  /** each entrant's driving events this step (skids, rough ground…) */
  cars: StepEvents[];
  race: RaceEvent[];
}

/**
 * One step of the race. `player` gives the input for an entrant without an AI
 * (the race applies the safety car's limiter on top).
 */
export function stepRace(race: Race, dt: number, player: (e: Entrant) => DriveInput = () => ({ handbrake: false })): StepResult {
  const { track, grid, handling: p, entrants } = race;
  const out: RaceEvent[] = [];
  race.clock += dt;
  if (race.phase === 'lights' && race.clock >= race.lightsOut) {
    race.phase = 'racing';
    race.clock = 0;
    out.push({ kind: 'lights-out' });
  }
  const racing = race.phase === 'racing';
  const sc = race.sc;
  const vsc = race.vsc;
  const orders: Orders = sc ? { limit: SAFETY_CAR.limit, noOvertaking: true } : vsc ? { limit: VSC.limit, noOvertaking: true } : {};
  const onTrack = entrants.filter(running);
  const n = track.samples.length;
  /** px along the track from an entrant up to the safety car (Infinity when it's not out) */
  const toSafetyCar = (e: Entrant) => (sc ? ((((sc.idx - e.progress.idx) % n) + n) % n) * track.spacing : Infinity);
  // (a car in its garage after the race is out of everyone's way)
  const cars = [...onTrack.filter((e) => e.pit?.phase !== 'garage').map((e) => e.car), ...(sc ? [sc.car] : [])];
  /**
   * The player's limiter under the safety car (or the virtual one): the field's limit, held to station behind the car
   * ahead (HOLD); and whether it's too close and closing (brakes on).
   */
  const playerLimit = (e: Entrant, i: number): { limit?: number; tight: boolean } => {
    if (!sc && !vsc) return { tight: false };
    // alongside or just past the safety car: dropping back behind it
    if (sc && n * track.spacing - toSafetyCar(e) <= SAFETY_CAR.dropBack) return { limit: SAFETY_CAR.speed * 0.6, tight: false };
    let limit = sc ? SAFETY_CAR.limit : VSC.limit;
    let tight = false;
    const ahead = [...race.holdBehind[i]]
      .map((j) => entrants[j])
      .filter((o) => running(o) && !o.pit && !o.car.wrecked && o.progress.finished === undefined)
      .map((o) => ({ car: o.car, idx: o.progress.idx }));
    if (sc) ahead.push({ car: sc.car, idx: sc.idx });
    for (const a of ahead) {
      const d = ((((a.idx - e.progress.idx) % n) + n) % n) * track.spacing;
      if (d > HOLD.reach) continue;
      limit = Math.min(limit, Math.max(HOLD.crawl, speedOf(a.car) + HOLD.close * (d - HOLD.gap)));
      if (d < HOLD.gap * HOLD.tight && speedOf(e.car) > speedOf(a.car)) tight = true;
    }
    return { limit, tight };
  };

  // blue flags: a car about to be lapped (racing, not under either safety car)
  {
    const eligible = entrants.map((e) => racing && !sc && !vsc && running(e) && !e.pit && !e.car.wrecked && e.progress.finished === undefined && race.clock > SETTLE);
    const blue = blueFlags(entrants.map((e) => e.progress), eligible, entrants.map((e) => e.blue), n, track.spacing);
    entrants.forEach((e, i) => {
      if (blue[i] !== undefined && blue[i] !== e.blue) out.push({ kind: 'blue', who: i, by: blue[i]! });
      e.blue = blue[i];
    });
  }

  // drive
  const before = entrants.map((e) => e.car.health);
  // (how each car was moving going into the step: a crash throws its parts on that way)
  const moving = entrants.map((e) => ({ vx: e.car.vx, vy: e.car.vy }));
  const events = entrants.map((e, i): StepEvents => {
    const quiet: StepEvents = { damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0 };
    if (!running(e)) return quiet;
    // (the cars on its level: not one on a bridge over it, or underneath it)
    const others = cars.filter((c) => c !== e.car && sameLevel(c, e.car));
    // the pit lane: turning in at the entry commits a car; from there it drives itself through
    const pit = race.pit;
    // after the flag: the in-lap, and then to its parking place
    if (e.progress.finished !== undefined && !e.car.wrecked) {
      e.inLap ??= { driven: 0 };
      e.inLap.driven += speedOf(e.car) * dt;
      if (!e.pit) parkAfterRace(race, i);
    }
    if (pit && racing && !e.pit && e.progress.finished === undefined && (e.ai ? aiPits(race, e) : entersPit(pit, track, e.car, e.progress.idx))) {
      e.pit = newPitStop(pit, e.car, e.box);
      e.stops++;
      out.push({ kind: 'pit-in', who: i });
    }
    if (pit && e.pit) {
      // (it keeps behind the cars in the pits with it; the cars racing past the entry and exit roads, on the track, aren't in its lane)
      const r = pitStep(pit, e.pit, e.car, race.entrants.filter((o) => o !== e && o.pit).map((o) => o.car), dt);
      if (e.pit.phase === 'garage') {
        // in the crew's hands: pushed, not driven (and through the garage's walls)
        if (e.pit.push!.done >= PIT.garagePush) e.inLap!.parked = true;
        return quiet;
      }
      if (r.stopped) {
        // new tyres on, the right ones for the weather
        e.tyres = freshTyres(tyreFor(race.weather));
        fitTyres(e.tyres, e.car, race.weather);
        out.push({ kind: 'pit-stop', who: i, seconds: e.pit.time });
      }
      if (r.repaired) out.push({ kind: 'pit-repaired', who: i });
      if (!r.done) return stepCar(e.car, r.input, p, dt, gridFor(track, grid, e.progress.idx));
      e.pit = undefined;
      e.blend = BLEND_LINE;
      out.push({ kind: 'pit-out', who: i });
    }
    let input: DriveInput;
    const lap = e.inLap;
    if (!racing) input = { handbrake: true, brake: true };
    else if (lap && typeof lap.to === 'number' && pit) input = podiumInput(race, e, lap.to, others);
    else if (e.progress.finished !== undefined) input = { ...coolDownInput(e.car, track, e.progress.idx, others), limit: orders.limit };
    // (no passing or defending moves while the pack is still bunched from the start)
    // the start: an AI car still reacting to the lights going out sits on its brakes
    else if (e.ai && race.clock < (e.ai.reaction ?? 0) && e.progress.lapStart === undefined) input = { handbrake: false, brake: true };
    else if (e.ai) {
      const slip = e.ai.slip;
      const lunging = !!e.ai.lunge;
      // (just out of the pits: along the blend line first)
      const blending = pit && e.blend !== undefined && e.blend > 0;
      if (blending) e.blend! -= speedOf(e.car) * dt;
      const ai = blending ? { ...e.ai, lane: pit.side * PIT.joinAt } : e.ai;
      const lapping = entrants.filter((o) => o.blue === i).map((o) => o.car);
      const spare = entrants.find((o) => !o.ai)?.car;
      const given = { ...orders, spare, ...(e.blue === undefined && !lapping.length ? {} : { blue: e.blue === undefined ? undefined : entrants[e.blue].car, lapping }) };
      input = aiInput(e.car, track, e.progress.idx, ai, others, race.clock < SETTLE || blending ? { ...given, noOvertaking: true } : given, towBoost(e.tow));
      if (e.ai.slip && e.ai.slip !== slip) out.push({ kind: 'mistake', who: i, what: e.ai.slip });
      // (a dive at the car ahead: a lock-up into the bend)
      if (e.ai.lunge && !lunging) out.push({ kind: 'mistake', who: i, what: 'late' });
    }
    // the player's limiter: holding station behind the car ahead (or the safety car), and the brakes on when well over it
    else {
      const { limit, tight } = playerLimit(e, i);
      e.held = limit;
      const given = player(e);
      input = limit !== undefined && (tight || speedOf(e.car) > limit + HOLD.over) ? { ...given, limit, brake: true } : { ...given, limit };
    }
    if (!racing) {
      // waiting for the lights: kept to its grid slot (on a sloping grid, like Twin Lakes's, the brakes alone let it
      // creep away), never more than GRID_HOLD px from where it lined up
      const slot = (e.slot ??= { x: e.car.x, y: e.car.y, heading: e.car.heading });
      const ev = stepCar(e.car, input, p, dt, gridFor(track, grid, e.progress.idx));
      const off = Math.hypot(e.car.x - slot.x, e.car.y - slot.y);
      if (off > GRID_HOLD) {
        const k = GRID_HOLD / off;
        Object.assign(e.car, { x: slot.x + (e.car.x - slot.x) * k, y: slot.y + (e.car.y - slot.y) * k, heading: slot.heading, vx: 0, vy: 0 });
      }
      return ev;
    }
    return stepCar(e.car, input, p, dt, gridFor(track, grid, e.progress.idx));
  });
  // the tyres wear with the driving
  entrants.forEach((e, i) => {
    if (running(e)) wearTyres(e.tyres, e.car, events[i], dt * (track.tyreWear ?? 1), race.weather);
  });
  // the slipstream: in a car's wake, a higher top speed for the next step (on top of the tyres'); racing only:
  // not in the pit lane, under the safety car, or after the flag
  entrants.forEach((e) => {
    if (!running(e)) return;
    const towing = racing && !e.pit && !race.sc && !race.vsc && e.progress.finished === undefined;
    e.tow = stepTow(e.tow, towing ? towFrom(e.car, cars.filter((c) => sameLevel(c, e.car))) : 0, dt);
    e.car.speedScale = (e.car.speedScale ?? 1) * towBoost(e.tow);
  });
  if (sc) {
    // it drives the line at its own pace, moving round a slower car in its way (a backmarker it joined
    // behind, or a player dropping back) rather than queueing behind it
    const inTheWay = cars.filter((c) => c !== sc.car && sameLevel(c, sc.car));
    stepCar(sc.car, aiInput(sc.car, track, sc.idx, { lane: 0, pace: 1 }, inTheWay, { limit: SAFETY_CAR.speed }), p, dt, gridFor(track, grid, sc.idx));
    sc.idx = nearestSample(track, sc.car.x, sc.car.y, sc.idx);
  }
  // contact (the safety car takes knocks but no damage)
  // (a dive's first contact with the car it's diving at is a racing incident: a hard hit to both, the car hit
  // spun round; and the dive's over)
  const diving = new Map<Car, Entrant>();
  for (const e of entrants) if (e.ai?.lunge) diving.set(e.car, e);
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      // (one on a bridge, the other underneath it: they pass)
      if (!sameLevel(cars[i], cars[j])) continue;
      const closing = collideCars(cars[i], cars[j], p);
      if (closing <= 0) continue;
      const diver = diving.get(cars[i])?.ai?.lunge?.car === cars[j] ? diving.get(cars[i]) : diving.get(cars[j])?.ai?.lunge?.car === cars[i] ? diving.get(cars[j]) : undefined;
      if (!diver?.ai?.lunge) continue;
      const hit = diver.ai.lunge.car;
      diver.ai.lunge = undefined;
      racingIncident(diver.car, hit, closing, p);
    }
  }
  if (sc) sc.car.health = sc.car.cls.health;
  if (racing) for (const e of onTrack) e.progress = stepProgress(e.progress, track, e.car, race.clock, race.laps, dt);

  // track limits: a cut across a corner's inside (racing only: not in the pit lane, a wreck, or after the flag)
  if (racing) {
    entrants.forEach((e, i) => {
      if (!running(e) || e.car.wrecked || e.pit || e.progress.finished !== undefined) return;
      const cut = judge(e.limits, track, race.corners, e.progress.idx, e.car.x, e.car.y, e.car.cls.width);
      // (off onto the pit entry road, on its side within the pit zone, isn't off the track)
      const pit = race.pit;
      const toPits = !!pit && between(e.progress.idx, pit.entry, pit.wallTo, track.samples.length) && lateralOffset(track, e.progress.idx, e.car.x, e.car.y) * pit.side > 0;
      if (offTrack(e.limits, track, e.progress.idx, e.car.x, e.car.y, e.car.cls.width, toPits)) out.push({ kind: 'off-track', who: i });
      if (!cut) return;
      if (cut.seconds) e.progress = { ...e.progress, penalty: e.progress.penalty + cut.seconds };
      out.push({ kind: 'track-limits', who: i, ...cut });
    });
  }

  // wrecks: cleared off the track after a moment; the car retires
  // (a wreck brings out the safety car; a big crash a car survives, the virtual one)
  let wreck = false;
  let bigCrash = false;
  entrants.forEach((e, i) => {
    if (!running(e)) return;
    const wreckedNow = events[i].wreckedNow || (e.car.wrecked && e.wreckedAt === undefined);
    if (isBigCrash(e.car, before[i], wreckedNow)) {
      bigCrash = true;
      if (e.car.wrecked) wreck = true;
      out.push({ kind: 'crash', who: i, ...moving[i], hit: (before[i] - e.car.health) / e.car.cls.health, wrecked: e.car.wrecked });
    }
    if (e.car.wrecked && e.wreckedAt === undefined) {
      e.wreckedAt = race.clock;
      out.push({ kind: 'wreck', who: i });
    }
    if (e.wreckedAt !== undefined && race.clock - e.wreckedAt >= CLEAR_AFTER) {
      e.progress = { ...e.progress, retired: true };
      out.push({ kind: 'retired', who: i });
    }
  });

  const ranked = order(race);
  const leader = ranked.map((i) => entrants[i]).find((e) => running(e) && !e.car.wrecked && e.progress.finished === undefined);
  /** no passing anyone ahead now (indexes of the entrants each must stay behind) */
  const holdOrder = () => entrants.map((_, i) => new Set(ranked.slice(0, ranked.indexOf(i))));
  if (!race.sc && racing && wreck && leader) {
    // safety car: it joins ahead of the leader, and nobody may pass anyone who is ahead of them now
    // (it takes over from the virtual one, if that's out)
    race.vsc = undefined;
    race.sc = safetyCarAhead(track, leader.car, leader.progress.idx);
    race.holdBehind = holdOrder();
    out.push({ kind: 'safety-car' });
  } else if (!race.sc && !race.vsc && racing && bigCrash && leader) {
    out.push(callVsc(race));
  } else if (sc || vsc) {
    if (sc) {
      if (leader && toSafetyCar(leader) <= SAFETY_CAR.queueGap) sc.led += dt;
      sc.out += dt;
    }
    // no overtaking: passing a car that was ahead when it came out costs a penalty (a wreck, or a car in the pits, may be passed)
    entrants.forEach((e, i) => {
      if (e.pit) return;
      for (const j of race.holdBehind[i]) {
        const other = entrants[j];
        if (!running(other) || other.car.wrecked || other.pit || other.progress.finished !== undefined || !running(e)) race.holdBehind[i].delete(j);
        else if (ranked.indexOf(i) < ranked.indexOf(j)) {
          e.progress = { ...e.progress, penalty: e.progress.penalty + SAFETY_CAR.penalty };
          race.holdBehind[i].delete(j);
          out.push({ kind: 'penalty', who: i, seconds: SAFETY_CAR.penalty });
        }
      }
    });
    if (vsc) {
      // its end called a few seconds before the green
      const was = vsc.out;
      vsc.out += dt;
      if (was < VSC.length - VSC.warn && vsc.out >= VSC.length - VSC.warn) out.push({ kind: 'vsc-ending' });
    }
    // in once the field has run behind it for a while, or when there's no one left to lead (the virtual one: once its time is up)
    if (sc ? sc.led >= SAFETY_CAR.leadFor || sc.out >= SAFETY_CAR.maxOut || !leader : vsc!.out >= VSC.length || !leader) {
      race.sc = undefined;
      race.vsc = undefined;
      race.holdBehind = entrants.map(() => new Set());
      out.push({ kind: 'green' });
    }
  }
  return { cars: events, race: out };
}
