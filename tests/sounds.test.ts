import { describe, expect, it } from 'vitest';
import { GEARS, RaceSounds, engineNote } from '../src/f1/sounds';

describe('the engine note', () => {
  const top = 320;
  it('idles low at a standstill', () => {
    expect(engineNote(0, top, 0).freq).toBeLessThan(100);
  });

  it('climbs through each gear, and drops back at each upshift', () => {
    const at = (share: number) => engineNote(share * top, top, 1).freq;
    const gearWidth = 1 / GEARS;
    // within the third gear the pitch rises…
    expect(at(2.9 * gearWidth)).toBeGreaterThan(at(2.1 * gearWidth));
    // …and falls as it shifts into the fourth
    expect(at(3.05 * gearWidth)).toBeLessThan(at(2.95 * gearWidth));
    // top gear, flat out, is the highest note of all
    expect(at(1)).toBeGreaterThan(at(0.5));
  });

  it('is louder and brighter on the throttle', () => {
    const on = engineNote(200, top, 1);
    const off = engineNote(200, top, 0);
    expect(on.gain).toBeGreaterThan(off.gain);
    expect(on.brightness).toBeGreaterThan(off.brightness);
  });
});

describe('the race sounds without Web Audio (tests, old browsers)', () => {
  it('do nothing, quietly', () => {
    const s = new RaceSounds(1);
    expect(() => {
      s.update({ dt: 1 / 60, speed: 200, top: 320, slide: 100, onRough: true, onKerb: false, rival: { speed: 180, distance: 40 } });
      s.hit(1);
      s.light();
      s.go();
      s.flag();
      s.record();
      s.quiet();
    }).not.toThrow();
  });
});
