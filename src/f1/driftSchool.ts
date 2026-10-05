// The Drift School: a lap or two of Dust Bowl on your own, on the dirt, with a
// prompt at a time for drifting on the device you're using (the touch deck's
// DRIFT button, the keys' X, a gamepad's A): get up to speed; tap DRIFT turning
// into a bend so the tail steps out (held, it brakes: a tap's enough to kick it
// out, and the loose earth keeps it sliding); keep it sideways round the bend,
// pointing (or steering) where you want to go; straighten up as the road does
// and power out; then link drifts, bend after bend; and round to the line. Each
// prompt moves on once you've done it. Every drift you hold long enough is
// called out with its length. Engine-free.

import type { Device } from './onboarding';

export type DriftStep = 'go' | 'kick' | 'hold' | 'exit' | 'link' | 'lap' | 'done';
export const DRIFT_STEPS: DriftStep[] = ['go', 'kick', 'hold', 'exit', 'link', 'lap', 'done'];

export const DRIFT = {
  /** px/s: slower than this, a slide's no drift */
  speed: 80,
  /** s sideways for the tail to have stepped out, for a drift to count, and for one held round a bend */
  kick: 0.25,
  counts: 0.6,
  held: 1,
  /** drifts to link, and the share of top speed to be powering out at as one ends */
  link: 3,
  exit: 0.5,
};

/** The button that drifts, as the prompt names it, on `device`. */
const button = (device: Device) => (device === 'keys' ? 'X' : device === 'pad' ? 'A' : 'DRIFT');

/** What the prompt says for `step` on `device`, driving where you point (`points`) or steering the car. */
export function driftPrompt(step: DriftStep, device: Device, points = device === 'touch'): string {
  switch (step) {
    case 'go':
      return 'GET UP TO SPEED: A DRIFT STARTS WITH SPEED';
    case 'kick':
      return `TURNING INTO A BEND, TAP ${button(device)}: THE TAIL STEPS OUT`;
    case 'hold':
      return points
        ? `KEEP IT SIDEWAYS: POINT ${device === 'keys' ? 'THE ARROWS' : 'THE STICK'} WHERE YOU WANT TO GO`
        : 'KEEP IT SIDEWAYS: STEER WHERE YOU WANT TO GO';
    case 'exit':
      return points ? 'AS THE ROAD STRAIGHTENS, POINT DOWN IT AND POWER OUT' : 'AS THE ROAD STRAIGHTENS, STRAIGHTEN UP AND POWER OUT';
    case 'link':
      return 'NOW LINK THEM: THREE DRIFTS, BEND AFTER BEND';
    case 'lap':
      return 'ON ROUND TO THE LINE';
    case 'done':
      return device === 'keys' ? 'YOU CAN DRIFT! Z FOR THE MENU' : 'YOU CAN DRIFT! A FOR THE MENU';
  }
}

export interface DriftLesson {
  step: DriftStep;
  /** s sideways in the drift going on (0: not drifting) */
  slide: number;
  /** drifts held long enough to count, and the longest of them (s) */
  drifts: number;
  best: number;
  /** drifts, and laps begun, when the step began (the steps that count them count from there) */
  fromDrifts: number;
  fromLaps: number;
}

export const newDriftLesson = (): DriftLesson => ({ step: 'go', slide: 0, drifts: 0, best: 0, fromDrifts: 0, fromLaps: 0 });

/** What's happening: your speed and top speed, whether you're sliding sideways, and how many times you've crossed the line. */
export interface DriftFacts {
  speed: number;
  top: number;
  sliding: boolean;
  laps: number;
}

/**
 * `dt` s on: the drift going on (a slide at speed) grows, or ends (and counts, if held long enough); the prompt moves
 * on if its step is done. What happened: a drift that ended and counted (its length, s), and whether the prompt moved.
 */
export function stepDriftLesson(l: DriftLesson, f: DriftFacts, dt: number): { drift?: number; moved: boolean } {
  let drift: number | undefined;
  let ended = false;
  if (f.sliding && f.speed > DRIFT.speed) l.slide += dt;
  else if (l.slide > 0) {
    if (l.slide >= DRIFT.counts) {
      drift = l.slide;
      l.drifts++;
      l.best = Math.max(l.best, l.slide);
      ended = true;
    }
    l.slide = 0;
  }
  const done =
    l.step === 'go' ? f.speed > f.top * 0.75
    : l.step === 'kick' ? l.slide >= DRIFT.kick
    : l.step === 'hold' ? l.slide >= DRIFT.held
    // (one held round a bend, and out of it with the power on)
    : l.step === 'exit' ? ended && l.drifts > l.fromDrifts && f.speed > f.top * DRIFT.exit
    : l.step === 'link' ? l.drifts - l.fromDrifts >= DRIFT.link
    : l.step === 'lap' ? f.laps > l.fromLaps
    : false;
  if (done) {
    l.step = DRIFT_STEPS[DRIFT_STEPS.indexOf(l.step) + 1];
    l.fromDrifts = l.drifts;
    l.fromLaps = f.laps;
  }
  return { drift, moved: done };
}
