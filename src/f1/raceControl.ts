// Race control: runs the whole field for one step (start lights, inputs,
// driving, contact, lap timing) and applies the race rules around it. A
// wrecked car is cleared off the track and retires; a big crash brings out the
// safety car, which joins ahead of the leader and leads the field at a limited
// pace, with no overtaking, until it goes in and racing resumes. Engine-free,
// so a whole race, crashes and all, runs in a test exactly as in the game.

import { carClass, collideCars, newCar, speedOf, stepCar, type Car, type DriveInput, type HandlingParams, type StepEvents } from '../engine/driving';
import type { Grid } from '../engine/sim';
import { aiInput, coolDownInput, nearestSample, newProgress, standings, stepProgress, type AiDriver, type Orders, type RaceProgress, type Track } from './racing';

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
  /** px: a player this close behind it is held to its speed, so it can't be passed */
  holdGap: 100,
  /** px: a player who has got this far alongside or ahead of it drops back behind it */
  dropBack: 300,
  /** seconds it stays out once the leader is lined up behind it */
  leadFor: 12,
  /** seconds it stays out at most, however the field lines up */
  maxOut: 40,
  /** seconds added for each car passed while it's out */
  penalty: 5,
};

/** Seconds a wreck stays on track before the marshals clear it and the car retires. */
export const CLEAR_AFTER = 2.5;
/** Seconds of the start lights before the earliest lights-out. */
export const LIGHTS = 3.6;

export interface Entrant {
  car: Car;
  /** the AI driving it; undefined for the player */
  ai?: AiDriver;
  progress: RaceProgress;
  /** race time it was wrecked */
  wreckedAt?: number;
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
  | { kind: 'wreck'; who: number }
  | { kind: 'retired'; who: number }
  | { kind: 'safety-car' }
  | { kind: 'green' }
  | { kind: 'penalty'; who: number; seconds: number };

export interface Race {
  track: Track;
  grid: Grid;
  handling: HandlingParams;
  laps: number;
  entrants: Entrant[];
  phase: 'lights' | 'racing';
  /** race time (s): counts up to `lightsOut` during the lights, from 0 once they go out */
  clock: number;
  /** the clock time the lights go out */
  lightsOut: number;
  sc?: SafetyCar;
  /** per entrant: the entrants it has to stay behind while the safety car is out */
  holdBehind: Set<number>[];
}

/** A race about to start: the lights come on, then go out `lightsOut` s after the fifth. */
export function newRace(track: Track, grid: Grid, handling: HandlingParams, laps: number, field: { car: Car; ai?: AiDriver }[], lightsOut = 0.5): Race {
  const entrants = field.map((f) => ({ ...f, progress: newProgress(track.samples.length - 4) }));
  return { track, grid, handling, laps, entrants, phase: 'lights', clock: -LIGHTS, lightsOut, holdBehind: entrants.map(() => new Set()) };
}

/** Still on the track: not retired (a wreck counts until it's cleared). */
export const running = (e: Entrant) => !e.progress.retired;

/** Whether a car's damage this step makes a big crash: it was wrecked, or lost a big share of its health at once. */
export function isBigCrash(car: Car, healthBefore: number, wreckedNow: boolean): boolean {
  return wreckedNow || healthBefore - car.health >= SAFETY_CAR.bigHit * car.cls.health;
}

/** Race order (indexes into `entrants`). */
export const order = (race: Race) => standings(race.entrants.map((e) => e.progress), race.track);

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
  const orders: Orders = sc ? { limit: SAFETY_CAR.limit, noOvertaking: true } : {};
  const onTrack = entrants.filter(running);
  const n = track.samples.length;
  /** px along the track from an entrant up to the safety car (Infinity when it's not out) */
  const toSafetyCar = (e: Entrant) => (sc ? ((((sc.idx - e.progress.idx) % n) + n) % n) * track.spacing : Infinity);
  const cars = [...onTrack.map((e) => e.car), ...(sc ? [sc.car] : [])];
  const playerLimit = (e: Entrant) => {
    if (!sc) return undefined;
    const behind = toSafetyCar(e);
    if (behind <= SAFETY_CAR.holdGap) return SAFETY_CAR.speed;
    if (n * track.spacing - behind <= SAFETY_CAR.dropBack) return SAFETY_CAR.speed * 0.6;
    return SAFETY_CAR.limit;
  };

  // drive
  const before = entrants.map((e) => e.car.health);
  const events = entrants.map((e): StepEvents => {
    const quiet: StepEvents = { damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0 };
    if (!running(e)) return quiet;
    const others = cars.filter((c) => c !== e.car);
    let input: DriveInput;
    if (!racing) input = { handbrake: true, brake: true };
    else if (e.progress.finished !== undefined) input = { ...coolDownInput(e.car, track, e.progress.idx, others), limit: orders.limit };
    else if (e.ai) input = aiInput(e.car, track, e.progress.idx, e.ai, others, orders);
    // the player's limiter: right behind the safety car, its speed; alongside or just past it, slower, to drop back
    else input = { ...player(e), limit: playerLimit(e) };
    return stepCar(e.car, input, p, dt, grid);
  });
  if (sc) {
    // it drives the line at its own pace, moving round a slower car in its way (a backmarker it joined
    // behind, or a player dropping back) rather than queueing behind it
    const inTheWay = cars.filter((c) => c !== sc.car);
    stepCar(sc.car, aiInput(sc.car, track, sc.idx, { lane: 0, pace: 1 }, inTheWay, { limit: SAFETY_CAR.speed }), p, dt, grid);
    sc.idx = nearestSample(track, sc.car.x, sc.car.y, sc.idx);
  }
  // contact (the safety car takes knocks but no damage)
  for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) collideCars(cars[i], cars[j], p);
  if (sc) sc.car.health = sc.car.cls.health;
  if (racing) for (const e of onTrack) e.progress = stepProgress(e.progress, track, e.car, race.clock, race.laps, dt);

  // wrecks: cleared off the track after a moment; the car retires
  let bigCrash = false;
  entrants.forEach((e, i) => {
    if (!running(e)) return;
    if (isBigCrash(e.car, before[i], events[i].wreckedNow || (e.car.wrecked && e.wreckedAt === undefined))) bigCrash = true;
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
  if (!race.sc && racing && bigCrash && leader) {
    // safety car: it joins ahead of the leader, and nobody may pass anyone who is ahead of them now
    race.sc = safetyCarAhead(track, leader.car, leader.progress.idx);
    race.holdBehind = entrants.map((_, i) => new Set(ranked.slice(0, ranked.indexOf(i))));
    out.push({ kind: 'safety-car' });
  } else if (sc) {
    if (leader && toSafetyCar(leader) <= SAFETY_CAR.queueGap) sc.led += dt;
    sc.out += dt;
    // no overtaking: passing a car that was ahead when it came out costs a penalty (a wreck may be passed)
    entrants.forEach((e, i) => {
      for (const j of race.holdBehind[i]) {
        const other = entrants[j];
        if (!running(other) || other.car.wrecked || other.progress.finished !== undefined || !running(e)) race.holdBehind[i].delete(j);
        else if (ranked.indexOf(i) < ranked.indexOf(j)) {
          e.progress = { ...e.progress, penalty: e.progress.penalty + SAFETY_CAR.penalty };
          race.holdBehind[i].delete(j);
          out.push({ kind: 'penalty', who: i, seconds: SAFETY_CAR.penalty });
        }
      }
    });
    // in once the field has run behind it for a while, or when there's no one left to lead
    if (sc.led >= SAFETY_CAR.leadFor || sc.out >= SAFETY_CAR.maxOut || !leader) {
      race.sc = undefined;
      race.holdBehind = entrants.map(() => new Set());
      out.push({ kind: 'green' });
    }
  }
  return { cars: events, race: out };
}
