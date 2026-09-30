// Tyre wear. Every car's tyres wear as it drives: with speed, faster while
// sliding (a drift eats them) and on rough ground. Worn tyres grip and turn
// less and can't put the power down, a little at first, then sharply once
// they're nearly gone (the cliff). A pit stop fits a fresh set. Tuned so a
// set lasts about two laps before the cliff: a 3-lap race is best run without
// stopping, a 5-lap race with one stop, and a slide-happy driver stops sooner.
// Engine-free and unit-tested.

import { speedOf, type Car, type StepEvents } from '../engine/driving';

export const TYRES = {
  /** wear per second at top speed, driving cleanly */
  base: 0.009,
  /** extra wear per second while sliding flat out sideways (px/s of slide, up to `slideFull`) */
  slide: 0.03,
  slideFull: 150,
  /** extra wear per second on grass or gravel */
  rough: 0.01,
  /** wear past which the tyres fall off the cliff */
  cliff: 0.7,
  /** grip and turn lost: linearly with wear, and more over the cliff */
  gripLoss: 0.2,
  cliffGripLoss: 0.25,
  /** top speed lost: linearly with wear, and more over the cliff */
  speedLoss: 0.06,
  cliffSpeedLoss: 0.14,
  /** wear per lap assumed before a set has done half a lap (for planning a stop) */
  lapWear: 0.3,
  /** seconds the pit lane itself costs, over the stop (driving it on the limiter, in and out) */
  laneCost: 4,
};

/** A car's set of tyres. */
export interface TyreSet {
  /** 0 = new … 1 = gone */
  wear: number;
  /** px driven on this set */
  driven: number;
}

export const freshTyres = (): TyreSet => ({ wear: 0, driven: 0 });

/** How far over the cliff `wear` is: 0 before it, 1 with the tyres gone. */
const overCliff = (wear: number) => Math.max(0, (wear - TYRES.cliff) / (1 - TYRES.cliff));

/** The share of grip and turn left at `wear`. */
export const tyreGrip = (wear: number) => 1 - TYRES.gripLoss * wear - TYRES.cliffGripLoss * overCliff(wear);

/** The share of top speed left at `wear`. */
export const tyreSpeed = (wear: number) => 1 - TYRES.speedLoss * wear - TYRES.cliffSpeedLoss * overCliff(wear);

/** Wear the tyres for one driving step of `car` (with that step's events), and put their state on the car. */
export function wearTyres(set: TyreSet, car: Car, events: StepEvents, dt: number): void {
  if (!car.airborne && !car.wrecked) {
    const v = speedOf(car);
    const f = { x: Math.sin(car.heading), y: -Math.cos(car.heading) };
    const slide = Math.abs(car.vx * -f.y + car.vy * f.x);
    const rate = TYRES.base * Math.min(1, v / car.cls.topSpeed) + TYRES.slide * Math.min(1, slide / TYRES.slideFull) + (events.onRough && v > 20 ? TYRES.rough : 0);
    set.wear = Math.min(1, set.wear + rate * dt);
    set.driven += v * dt;
  }
  fitTyres(set, car);
}

/** Put the set's grip and speed on the car. */
export function fitTyres(set: TyreSet, car: Car): void {
  car.tyreGrip = tyreGrip(set.wear);
  car.speedScale = tyreSpeed(set.wear);
}

/** Seconds a lap costs over one on new tyres, at `wear` through it (from the lost speed). */
const lapLoss = (lapTime: number, wear: number) => lapTime * (1 / tyreSpeed(wear) - 1);

/** Seconds lost over `laps` laps (the last may be a part), starting at `wear` and wearing `perLap` a lap. */
function stintLoss(laps: number, wear: number, perLap: number, lapTime: number): number {
  let loss = 0;
  for (let i = 0; i < laps; i++) {
    const part = Math.min(1, laps - i);
    loss += lapLoss(lapTime, Math.min(1, wear + perLap * (i + part / 2))) * part;
  }
  return loss;
}

/** The wear a set does per lap: measured once it has done half a lap, assumed before. */
export function wearPerLap(set: TyreSet, trackLength: number): number {
  const laps = set.driven / trackLength;
  return laps >= 0.5 ? set.wear / laps : TYRES.lapWear;
}

export interface StopPlan {
  /** laps left to race, from the pit entry */
  lapsLeft: number;
  /** a lap's time on new tyres (s) */
  lapTime: number;
  /** tyre wear now, and per lap */
  wear: number;
  perLap: number;
  /** the car's damage now (0 = none … 1 = wrecked) and the share of top speed full damage costs */
  damage: number;
  damageSlow: number;
  /** seconds the stop itself takes (tyres and repairs) */
  stopTime: number;
}

/**
 * Whether to stop now: the time lost to worn tyres and damage over the laps
 * left, stopping now, a lap or more later, or not at all (a stop fits new
 * tyres and repairs the car, and costs the pit lane and the stop). Stop now
 * if now is the best of those.
 */
export function stopNow(p: StopPlan): boolean {
  if (p.lapsLeft < 1) return false;
  const damageLoss = (laps: number) => p.lapTime * p.damage * p.damageSlow * laps;
  const noStop = stintLoss(p.lapsLeft, p.wear, p.perLap, p.lapTime) + damageLoss(p.lapsLeft);
  const stopAfter = (k: number) =>
    stintLoss(k, p.wear, p.perLap, p.lapTime) + damageLoss(k) + p.stopTime + TYRES.laneCost + stintLoss(p.lapsLeft - k, 0, p.perLap, p.lapTime);
  const now = stopAfter(0);
  if (now >= noStop) return false;
  for (let k = 1; k <= Math.floor(p.lapsLeft) - 1; k++) if (stopAfter(k) < now) return false;
  return true;
}
