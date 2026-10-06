import { describe, expect, it } from 'vitest';
import { FIREWORKS, FireworkShow } from '../src/f1/fireworks3d';
import { HIDES } from '../src/f1/town3d';

describe('the fireworks at the end of the Championship', () => {
  it('wait to be set off, then burst every half second or so for a while, and stop', () => {
    const show = new FireworkShow();
    const focus = { x: 500, y: 800 };
    expect(show.step(1, focus)).toEqual([]);
    expect(show.on).toBe(false);
    show.start();
    let bursts = 0;
    let gap = 0;
    let longest = 0;
    for (let t = 0; t < FIREWORKS.lasts + 5; t += 1 / 60) {
      const b = show.step(1 / 60, focus);
      bursts += b.length;
      gap = b.length ? 0 : gap + 1 / 60;
      if (show.on) longest = Math.max(longest, gap);
    }
    expect(show.on).toBe(false);
    expect(bursts).toBeGreaterThan(FIREWORKS.lasts / (FIREWORKS.every + FIREWORKS.everyMore));
    expect(bursts).toBeLessThan(FIREWORKS.lasts / FIREWORKS.every + 2);
    expect(longest).toBeLessThan(FIREWORKS.every + FIREWORKS.everyMore + 0.05);
    // (once over, set off again: no more)
    show.start();
    expect(show.step(1, focus)).toEqual([]);
  });

  it('burst up high over the picture: over where the camera is, a little either side', () => {
    const show = new FireworkShow();
    show.start();
    const focus = { x: 500, y: 800 };
    for (let t = 0; t < 10; t += 1 / 60) {
      for (const b of show.step(1 / 60, focus)) {
        expect(b.z).toBeGreaterThanOrEqual(FIREWORKS.high);
        expect(b.z).toBeLessThanOrEqual(FIREWORKS.high + FIREWORKS.higher);
        expect(Math.abs(b.x - focus.x)).toBeLessThanOrEqual(FIREWORKS.aside);
        // (where it shows: the ground under it, up the picture by its height)
        expect(Math.abs(b.y - b.z * HIDES - focus.y)).toBeLessThanOrEqual(FIREWORKS.along);
      }
    }
  });
});
