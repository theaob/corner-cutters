// Qualifying: one flying lap, on your own, sets your place on the grid. You
// start rolling a little before the line; the lap is timed from the line back
// round to it. A cut across a marked corner (track limits) deletes the lap: the
// next one is timed afresh. The AI's times come from a reference lap (one AI
// car on the racing line, alone, on this track in this weather) scaled by each
// driver's pace, with a little spread either way, as its good and its scrappy
// laps. The grid is everyone in order of their times; no time starts at the
// back. Engine-free, like the race rules.

import { carClass, newCar, type HandlingParams } from '../engine/driving';
import { SIM_DT } from '../engine/fixedStep';
import type { Grid } from '../engine/sim';
import { newRace, stepRace, type Race } from './raceControl';
import { newProgress, type RaceProgress, type Track } from './racing';
import type { WeatherId } from './weather';

export const QUALI = {
  /** px before the line a flying lap starts, rolling */
  runUp: 360,
  /** share of the line's speed there it starts at */
  rolling: 0.9,
  /** an AI time's spread either way, as a share of it */
  spread: 0.008,
  /** laps of the session at most (it's over with your first good one) */
  laps: 99,
};

/** Put entrant `i` on a flying start: `QUALI.runUp` px before the line, rolling at the line's speed there; the session under way. */
export function flyingStart(race: Race, i: number): void {
  const { track } = race;
  const n = track.samples.length;
  const idx = n - Math.round(QUALI.runUp / track.spacing);
  const s = track.samples[idx];
  const e = race.entrants[i];
  const v = Math.min(s.speed, e.car.cls.topSpeed) * QUALI.rolling;
  Object.assign(e.car, { x: s.x, y: s.y, heading: s.dir, vx: Math.sin(s.dir) * v, vy: -Math.cos(s.dir) * v });
  e.progress = newProgress(idx);
  race.phase = 'racing';
  race.clock = 0;
}

/** A session on your own: just you (no pit stops), on a flying start. */
export function newQualifying(track: Track, grid: Grid, handling: HandlingParams, weather: WeatherId, car = newCar(carClass('f1'), 0, 0, 0)): Race {
  const race = newRace(track, grid, handling, QUALI.laps, [{ car }], 0, undefined, weather);
  flyingStart(race, 0);
  return race;
}

/** The reference lap (s): one AI car, flat out on the racing line on its own, from a flying start. */
export function referenceLap(track: Track, grid: Grid, handling: HandlingParams, weather: WeatherId): number {
  const race = newRace(track, grid, handling, QUALI.laps, [{ car: newCar(carClass('f1'), 0, 0, 0), ai: { lane: 0, pace: 1 } }], 0, undefined, weather);
  flyingStart(race, 0);
  const p = () => race.entrants[0].progress;
  for (let t = 0; t < 300 && !p().lapTimes.length; t += SIM_DT) stepRace(race, SIM_DT);
  return p().lapTimes[0] ?? track.length / 250;
}

/** Each AI driver's time from its pace (undefined for you: yours is driven), off the reference lap, spread by `rng`. */
export const aiTimes = (paces: (number | undefined)[], reference: number, rng: () => number): (number | undefined)[] =>
  paces.map((pace) => (pace === undefined ? undefined : (reference / pace) * (1 + (rng() * 2 - 1) * QUALI.spread)));

/** The grid: drivers (indexes into `times`) in order of their times, quickest first; no time at the back, in the order they came. */
export function gridOrder(times: (number | undefined)[]): number[] {
  return times
    .map((time, i) => ({ time: time ?? Infinity, i }))
    .sort((a, b) => a.time - b.time || a.i - b.i)
    .map((d) => d.i);
}

/** Your session so far: laps completed, and whether the lap you're on has been deleted. */
export interface QualiLap {
  laps: number;
  deleted: boolean;
}

export const newQualiLap = (): QualiLap => ({ laps: 0, deleted: false });

/**
 * Judge your session this step (`cut`: you cut a corner): 'deleted' the moment
 * a timed lap is cut, 'void' as a deleted lap ends (the next one is timed
 * afresh), your time as a good one ends.
 */
export function judgeLap(q: QualiLap, p: RaceProgress, cut: boolean): 'deleted' | 'void' | { time: number } | undefined {
  if (p.lapTimes.length > q.laps) {
    q.laps = p.lapTimes.length;
    const time = p.lapTimes[p.lapTimes.length - 1];
    if (q.deleted) {
      q.deleted = false;
      // (a cut in the same step as the line starts the new lap deleted: rare, and fair)
      if (cut) q.deleted = true;
      return 'void';
    }
    return { time };
  }
  // (a cut on the run-up, before the timed lap, doesn't count)
  if (cut && p.lapStart !== undefined && !q.deleted) {
    q.deleted = true;
    return 'deleted';
  }
  return undefined;
}
