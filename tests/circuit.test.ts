import { describe, expect, it } from 'vitest';
import { buildCircuit } from '../src/f1/circuit';
import { CRESCENT_PARK, LAYOUTS, SILVER_HEATH, layoutById, type CircuitLayout } from '../src/f1/layouts';
import { angleDiff, carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { RACE_HANDLING, aiInput, coolDownInput, keysWheel, wheelInput, lineCornerSpeed, lineDecel, newProgress, standings, stepProgress } from '../src/f1/racing';
import { collideCars } from '../src/engine/driving';

const f1 = carClass('f1');

/** What each circuit should measure up to: its lap length (px), the AI's lap time (s), and how close to flat out the line is. */
const EXPECT: { layout: CircuitLayout; length: [number, number]; lap: [number, number]; flatGap: number }[] = [
  // flat out almost everywhere, like a player can
  { layout: CRESCENT_PARK, length: [7000, 8200], lap: [20, 26], flatGap: 0.5 },
  // the hook's hairpin and the last complex want a lift
  { layout: SILVER_HEATH, length: [8300, 9300], lap: [24, 30], flatGap: 0.75 },
];

describe('circuit list', () => {
  it('covers every layout, each with its own id', () => {
    expect(EXPECT.map((e) => e.layout)).toEqual(LAYOUTS);
    expect(new Set(LAYOUTS.map((l) => l.id)).size).toBe(LAYOUTS.length);
    expect(layoutById('silver-heath')).toBe(SILVER_HEATH);
    expect(layoutById('nowhere')).toBeUndefined();
  });

  it('starts and ends each elevation profile at the same height, in lap order', () => {
    for (const { elevation } of LAYOUTS) {
      expect(elevation[0][0]).toBe(0);
      expect(elevation[elevation.length - 1]).toEqual([1, elevation[0][1]]);
      for (let i = 1; i < elevation.length; i++) expect(elevation[i][0]).toBeGreaterThan(elevation[i - 1][0]);
    }
  });
});

describe.each(EXPECT)('$layout.name circuit', ({ layout, length, lap, flatGap }) => {
  const circuit = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const { grid, track } = circuit;
  const cellAt = (x: number, y: number) => circuit.cells[Math.floor(y / 16) * circuit.width + Math.floor(x / 16)];

  it('is a lap of the right length with run-off, kerbs and gravel', () => {
    expect(track.length).toBeGreaterThan(length[0]);
    expect(track.length).toBeLessThan(length[1]);
    for (const c of ['track', 'kerb', 'grass', 'gravel', 'wall'] as const) expect(circuit.cells).toContain(c);
  });

  it('lines the starting grid up on the track, behind the line', () => {
    for (const s of circuit.slots) expect(cellAt(s.x, s.y)).toBe('track');
  });

  it('keeps the centreline on the track all the way round', () => {
    for (const p of track.samples) expect(['track']).toContain(cellAt(p.x, p.y));
  });

  it('has gentle gradients on the racing line', () => {
    let worst = 0;
    for (let i = 0; i < track.samples.length; i++) {
      const p = track.samples[i];
      const g = groundAt(grid, p.x, p.y);
      worst = Math.max(worst, Math.abs(g.gx * Math.sin(p.dir) - g.gy * Math.cos(p.dir)));
    }
    expect(worst).toBeGreaterThan(0.02);
    expect(worst).toBeLessThan(0.2);
  });

  it('can be lapped by an AI F1 car on the real physics, unhurt', () => {
    const start = circuit.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(track.samples.length - 3);
    let t = 0;
    for (; t < 80 && p.lap < 1; t += 1 / 60) {
      stepCar(car, aiInput(car, track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 3, 1 / 60);
    }
    expect(p.lap).toBe(1);
    expect(p.lapTimes[0]).toBeGreaterThan(lap[0]);
    expect(p.lapTimes[0]).toBeLessThan(lap[1]);
    expect(car.health).toBe(f1.health);
    expect(speedOf(car)).toBeGreaterThan(100);
  });

  it('can be lapped on the keyboard (car-relative: up gas, down brake, left and right steer at full lock), unhurt', () => {
    const start = circuit.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(track.samples.length - 3);
    const n = track.samples.length;
    for (let t = 0; t < 80 && p.lap < 1; t += 1 / 60) {
      // a simple player: steer toward a point on the line a little ahead, a key at a time; lift, then brake, when well off it
      const ahead = track.samples[(p.idx + 10) % n];
      const off = angleDiff(Math.atan2(ahead.x - car.x, -(ahead.y - car.y)), car.heading);
      const keys = { left: off < -0.04, right: off > 0.04, up: Math.abs(off) < 0.35, down: Math.abs(off) > 0.6 && speedOf(car) > 150 };
      stepCar(car, wheelInput(keysWheel(keys, false), car), RACE_HANDLING, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 3, 1 / 60);
    }
    expect(p.lap).toBe(1);
    expect(p.lapTimes[0]).toBeLessThan(lap[1] + 3);
    expect(car.health).toBe(f1.health);
  });

  it('has an AI that goes flat out almost everywhere, like a player can', () => {
    const lapWith = (pace: number) => {
      const start = circuit.slots[0];
      const car = newCar(f1, start.x, start.y, start.heading);
      let p = newProgress(track.samples.length - 3);
      let braking = 0;
      for (let t = 0; t < 120 && p.lap < 1; t += 1 / 60) {
        const input = aiInput(car, track, p.idx, { lane: 0, pace });
        if (input.brake) braking += 1 / 60;
        stepCar(car, input, RACE_HANDLING, 1 / 60, grid);
        p = stepProgress(p, track, car, t, 3, 1 / 60);
      }
      return { time: p.lapTimes[0], braking };
    };
    const line = lapWith(1);
    const flat = lapWith(10); // never brakes at all
    expect(line.braking).toBeLessThan(0.5);
    expect(Math.abs(line.time - flat.time)).toBeLessThan(flatGap);
    expect(line.time).toBeLessThan(lap[1]);
  });

  it('runs a whole AI race from a full grid of 10 at the tuned pace: everyone finishes, in order, without wrecking', () => {
    const handling = RACE_HANDLING;
    const field = circuit.slots.slice(0, 10).map((s, i) => ({
      car: newCar(f1, s.x, s.y, s.heading),
      ai: { lane: ((i * 7) % 11) - 5, pace: 0.94 * (1 - (i / 10) * 0.05) },
      p: newProgress(track.samples.length - 4),
    }));
    let t = 0;
    for (; t < 120 && field.some((r) => r.p.finished === undefined); t += 1 / 60) {
      for (const r of field) {
        const others = field.filter((o) => o !== r).map((o) => o.car);
        const input = r.p.finished !== undefined ? coolDownInput(r.car, track, r.p.idx, others) : aiInput(r.car, track, r.p.idx, r.ai, others);
        stepCar(r.car, input, handling, 1 / 60, grid);
        r.p = stepProgress(r.p, track, r.car, t, 2, 1 / 60);
      }
      for (let i = 0; i < field.length; i++) for (let j = i + 1; j < field.length; j++) collideCars(field[i].car, field[j].car, handling);
    }
    expect(field.every((r) => r.p.finished !== undefined)).toBe(true);
    expect(field.every((r) => !r.car.wrecked)).toBe(true);
    const order = standings(field.map((r) => r.p), track);
    expect(order).toHaveLength(10);
    const times = order.map((i) => field[i].p.finished!);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
  });
});
