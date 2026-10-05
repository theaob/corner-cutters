import { describe, expect, it } from 'vitest';
import { DRIFT, DRIFT_STEPS, driftPrompt, newDriftLesson, stepDriftLesson, type DriftFacts, type DriftLesson } from '../src/f1/driftSchool';
import { MODES, rowsOf } from '../src/f1/circuitSelect';
import { carClass, newCar, stepCar } from '../src/engine/driving';
import { fitAt } from '../src/f1/tyres';
import { RACE_HANDLING, playerInput } from '../src/f1/racing';

const top = 320;
/** `s` s of driving as `f` says, a frame at a time */
const drive = (l: DriftLesson, f: Partial<DriftFacts>, s: number) => {
  const out: number[] = [];
  for (let t = 0; t < s - 1e-9; t += 1 / 60) {
    const r = stepDriftLesson(l, { speed: 250, top, sliding: false, laps: 0, ...f }, 1 / 60);
    if (r.drift !== undefined) out.push(r.drift);
  }
  return out;
};
/** a drift of `s` s, then straight */
const driftFor = (l: DriftLesson, s: number, f: Partial<DriftFacts> = {}) => [...drive(l, { ...f, sliding: true }, s), ...drive(l, f, 0.1)];

describe('the Drift School', () => {
  it('is a mode of its own on the menu, straight onto the dirt (no rows to set)', () => {
    expect(MODES.map((m) => m.id)).toContain('drift');
    expect(rowsOf('drift')).toEqual([]);
  });

  it('teaches a drift a step at a time: speed, the kick, holding it, powering out, linking them, and round to the line', () => {
    const l = newDriftLesson();
    drive(l, { speed: 200 }, 1);
    expect(l.step).toBe('go');
    drive(l, { speed: top * 0.8 }, 0.1);
    expect(l.step).toBe('kick');
    // (the tail steps out)
    drive(l, { sliding: true }, DRIFT.kick + 0.05);
    expect(l.step).toBe('hold');
    // (held round the bend, then out of it with the power on)
    drive(l, { sliding: true }, DRIFT.held);
    expect(l.step).toBe('exit');
    drive(l, { speed: top * 0.7 }, 0.1);
    expect(l.step).toBe('link');
    for (let k = 0; k < DRIFT.link; k++) driftFor(l, 0.8);
    expect(l.step).toBe('lap');
    drive(l, { laps: 1 }, 0.1);
    expect(l.step).toBe('done');
    expect(l.drifts).toBe(1 + DRIFT.link);
  });

  it('counts only a slide at speed held long enough as a drift, and calls each out with its length; the longest is your best', () => {
    const l = newDriftLesson();
    expect(driftFor(l, DRIFT.counts / 2)).toEqual([]);
    // (a slow slide's no drift)
    expect(driftFor(l, 1, { speed: DRIFT.speed - 10 })).toEqual([]);
    const [a] = driftFor(l, 1.2);
    expect(a).toBeCloseTo(1.2, 1);
    driftFor(l, 0.8);
    expect(l.drifts).toBe(2);
    expect(l.best).toBeCloseTo(1.2, 1);
  });

  it("won't move on from powering out of a drift for a drift that ends crawling", () => {
    const l = newDriftLesson();
    Object.assign(l, { step: 'exit' });
    driftFor(l, 1, { speed: top * 0.3 });
    expect(l.step).toBe('exit');
    driftFor(l, 1, { speed: top * 0.7 });
    expect(l.step).toBe('link');
  });

  it('names the drift button on each device, and says how to steer it', () => {
    expect(driftPrompt('kick', 'keys')).toContain('TAP X');
    expect(driftPrompt('kick', 'pad')).toContain('TAP A');
    expect(driftPrompt('kick', 'touch')).toContain('TAP DRIFT');
    expect(driftPrompt('hold', 'touch')).toContain('POINT THE STICK');
    expect(driftPrompt('hold', 'keys', false)).toContain('STEER');
    expect(driftPrompt('done', 'keys')).toContain('Z FOR THE MENU');
    for (const step of DRIFT_STEPS) expect(driftPrompt(step, 'touch').length).toBeGreaterThan(0);
  });

  it('can be done on the dirt: a tap of DRIFT turning in at speed kicks the tail out, and the loose earth keeps it sliding long enough to count; driving straight, it never slides', () => {
    const grid = { width: 400, height: 400, tile: 16, solid: new Array(400 * 400).fill(false) };
    const slide = (tap: number, turn: number) => {
      const car = newCar(carClass('f1'), 3200, 3200, 0);
      car.tyreGrip = fitAt('dirt', 'dry').grip;
      car.vy = -260;
      let longest = 0;
      let now = 0;
      for (let t = 0; t < 2; t += 1 / 60) {
        // (the stick pointing `turn` radians right of the way it's going; DRIFT for the first `tap` s)
        const h = car.heading + turn;
        const ev = stepCar(car, playerInput({ stick: { x: Math.sin(h), y: -Math.cos(h) }, a: false, b: t < tap }), RACE_HANDLING, 1 / 60, grid);
        now = ev.skidding && Math.hypot(car.vx, car.vy) > DRIFT.speed ? now + 1 / 60 : 0;
        longest = Math.max(longest, now);
      }
      return longest;
    };
    expect(slide(0.2, 0.7)).toBeGreaterThan(DRIFT.held);
    expect(slide(0, 0)).toBe(0);
    // (held all the way, it brakes: the drift's over sooner than a tap's)
    expect(slide(2, 0.7)).toBeLessThan(slide(0.2, 0.7));
  });
});
