import { describe, expect, it } from 'vitest';
import { LAUNCH, kickOf, newLaunch, stepLaunch } from '../src/f1/launch';

describe('the launch', () => {
  it('getting on the throttle once all five lights are lit is a jump start', () => {
    const l = newLaunch();
    expect(stepLaunch(l, false, undefined, 0)).toBeUndefined();
    expect(stepLaunch(l, true, undefined, 0)).toBeUndefined();
    expect(stepLaunch(l, true, undefined, 1)).toBe('jump');
    // (judged once)
    expect(stepLaunch(l, false, 0.1, 1)).toBeUndefined();
    expect(l.verdict).toBe('jump');
  });

  it('lets you hold the throttle from before the lights are all lit: an ordinary start, no jump, no kick', () => {
    const l = newLaunch();
    stepLaunch(l, false, undefined, 0);
    stepLaunch(l, false, undefined, 1);
    expect(stepLaunch(l, true, undefined, 1)).toBeUndefined();
    expect(stepLaunch(l, false, 0.02, 1)).toBe('slow');
    // (held since the first frame too)
    const m = newLaunch();
    expect(stepLaunch(m, true, undefined, 1)).toBeUndefined();
    expect(stepLaunch(m, false, 0.02, 1)).toBe('slow');
  });

  it('judges your reaction to lights out: great, good or slow', () => {
    const at = (reaction: number) => {
      const l = newLaunch();
      stepLaunch(l, true, undefined, 0);
      for (let t = 0; t <= reaction + 1e-9; t += 0.01) {
        const v = stepLaunch(l, false, t, t >= reaction - 1e-9 ? 1 : 0);
        if (v) return { v, r: l.reaction };
      }
      return undefined;
    };
    expect(at(0.2)?.v).toBe('great');
    expect(at(0.2)?.r).toBeCloseTo(0.2, 1);
    expect(at(0.4)?.v).toBe('good');
    expect(at(0.8)?.v).toBe('slow');
  });

  it('calls a start you never react to slow, after a moment and a half', () => {
    const l = newLaunch();
    let v;
    for (let t = 0; t < 3 && !v; t += 0.05) v = stepLaunch(l, false, t, 0);
    expect(v).toBe('slow');
    expect(l.reaction).toBeGreaterThanOrEqual(LAUNCH.late - 0.05);
  });

  it('gives a quick start a kick off the line, a quicker one more', () => {
    expect(kickOf('great')).toBeGreaterThan(kickOf('good'));
    expect(kickOf('good')).toBeGreaterThan(0);
    expect(kickOf('slow')).toBe(0);
    expect(kickOf('jump')).toBe(0);
  });
});
