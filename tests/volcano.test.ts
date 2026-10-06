import { describe, expect, it } from 'vitest';
import { carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { treesOf } from '../src/f1/forest3d';
import { inLake, lakesOf } from '../src/f1/lakes';
import { LAYOUTS, VOLCANO_ISLE } from '../src/f1/layouts';
import { RACE_HANDLING, aiInput, lineCornerSpeed, lineDecel, newProgress, stepProgress } from '../src/f1/racing';
import { STAND, standsOf } from '../src/f1/stands';
import { VOLCANO, nearLava, toLine, volcanoOf } from '../src/f1/volcano';

const f1 = carClass('f1');
const c = buildCircuit(VOLCANO_ISLE, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const v = volcanoOf(c)!;
const reach = HALF_WIDTH + RUNOFF;
const lip = VOLCANO_ISLE.jumps![0].at;

describe('the volcano at Volcano Isle', () => {
  it('is only there', () => {
    expect(v).toBeDefined();
    for (const l of LAYOUTS) if (l !== VOLCANO_ISLE) expect(l.volcano).toBeUndefined();
  });

  it('stands north of the circuit, behind it from the camera, its foot clear of the track', () => {
    for (const p of c.track.samples) {
      expect(Math.hypot(p.x - v.cone.x, p.y - v.cone.y)).toBeGreaterThan(VOLCANO.foot + reach);
      expect(p.y).toBeGreaterThan(v.cone.y);
    }
  });

  it('has a lava river that crosses the track once, just past the jump\'s lip, where the cars are in the air; the rest of it clear', () => {
    const on = c.track.samples.filter((p) => toLine(v.river, p.x, p.y) < VOLCANO.river / 2 + VOLCANO.bank);
    expect(on.length).toBeGreaterThan(0);
    for (const p of on) {
      // (past the lip, before the cars come down: within the first half of the landing slope)
      expect(p.s).toBeGreaterThan(lip + 20);
      expect(p.s).toBeLessThan(lip + 150);
    }
    // (away from the crossing, the river keeps outside the run-off)
    for (const p of c.track.samples) {
      if (p.s > lip - 200 && p.s < lip + 300) continue;
      expect(toLine(v.river, p.x, p.y)).toBeGreaterThan(reach + VOLCANO.river / 2);
    }
  });

  it('flies the cars over the lava: up off the lip at speed, in the air over the river, down unhurt', () => {
    const start = c.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(c.track.samples.length - 3);
    let overLava = 0;
    let onLava = 0;
    for (let t = 0; t < 80 && p.lap < 1; t += 1 / 60) {
      stepCar(car, aiInput(car, c.track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, c.grid);
      p = stepProgress(p, c.track, car, t, 3, 1 / 60);
      if (toLine(v.river, car.x, car.y) < VOLCANO.river / 2) {
        if (car.airborne) overLava++;
        else onLava++;
      }
    }
    expect(p.lap).toBe(1);
    expect(overLava).toBeGreaterThan(0);
    expect(onLava).toBe(0);
    expect(car.health).toBe(f1.health);
    expect(speedOf(car)).toBeGreaterThan(100);
  });

  it('keeps the grandstands and the palms off the lava and out of the sea', () => {
    const sea = lakesOf(c);
    expect(sea).toHaveLength(1);
    for (const s of standsOf(c)) {
      expect(nearLava(v, s.x, s.y, s.len / 2)).toBe(false);
      expect(inLake(sea, s.x, s.y, STAND.depth)).toBe(false);
    }
    const palms = treesOf(c);
    expect(palms.length).toBeGreaterThan(100);
    for (const t of palms) {
      expect(t.kind).toBe('palm');
      expect(nearLava(v, t.x, t.y)).toBe(false);
      expect(inLake(sea, t.x, t.y)).toBe(false);
    }
    // the sea clear of the track and its run-off
    for (const p of c.track.samples) expect(inLake(sea, p.x, p.y, reach + 30)).toBe(false);
  });
});
