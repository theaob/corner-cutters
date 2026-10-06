import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { STATUE, statueOf } from '../src/f1/cowStatue';
import { treesOf } from '../src/f1/forest3d';
import { ALPINE_RING, LAYOUTS } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { standsOf } from '../src/f1/stands';
import { HIDES } from '../src/f1/town3d';

const f1 = carClass('f1');
const c = buildCircuit(ALPINE_RING, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const statue = statueOf(ALPINE_RING)!;

describe('the bronze cow', () => {
  it('stands at the Alpine Ring, and only there', () => {
    expect(statue).toBeDefined();
    for (const l of LAYOUTS) if (l !== ALPINE_RING) expect(statueOf(l)).toBeUndefined();
  });

  it('stands by the track, its rise clear of the run-off, the pits and the grandstands', () => {
    const reach = HALF_WIDTH + RUNOFF;
    const near = Math.min(...c.track.samples.map((p) => Math.hypot(p.x - statue.x, p.y - statue.y)));
    expect(near).toBeGreaterThan(reach + STATUE.mound);
    // (near enough to see from the cars going by)
    expect(near).toBeLessThan(reach + STATUE.mound + 60);
    for (const q of c.pit.points) expect(Math.hypot(q.x - statue.x, q.y - statue.y)).toBeGreaterThan(STATUE.clearing + 150);
    for (const s of standsOf(c)) expect(Math.hypot(s.x - statue.x, s.y - statue.y)).toBeGreaterThan(s.len / 2 + STATUE.clearing);
  });

  it('hides none of the track behind it from the camera', () => {
    const reach = HALF_WIDTH + RUNOFF;
    for (const p of c.track.samples) {
      if (Math.abs(p.x - statue.x) > STATUE.mound + reach || p.y > statue.y) continue;
      // (the track north of it: further away than its height hides)
      expect(statue.y - STATUE.mound - (p.y + reach)).toBeGreaterThan(STATUE.height * HIDES);
    }
  });

  it('stands in a clearing: no tree in the forest grows on its rise', () => {
    for (const t of treesOf(c)) expect(Math.hypot(t.x - statue.x, t.y - statue.y)).toBeGreaterThan(STATUE.clearing);
  });
});
