import { describe, expect, it } from 'vitest';
import { buildCircuit } from '../src/f1/circuit';
import { carClass, newCar, speedOf, stepCar } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { RACE_HANDLING, aiInput, coolDownInput, lineCornerSpeed, lineDecel, newProgress, standings, stepProgress } from '../src/f1/racing';
import { collideCars } from '../src/engine/driving';

const f1 = carClass('f1');
const circuit = buildCircuit({ cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const { grid, track } = circuit;
const cellAt = (x: number, y: number) => circuit.cells[Math.floor(y / 16) * circuit.width + Math.floor(x / 16)];

describe('Amimo Park circuit', () => {
  it('is a lap of about 7600 px with run-off, kerbs and gravel', () => {
    expect(track.length).toBeGreaterThan(7000);
    for (const c of ['track', 'kerb', 'grass', 'gravel', 'wall'] as const) expect(circuit.cells).toContain(c);
  });

  it('lines the starting grid up on the track, behind the line', () => {
    for (const s of circuit.slots) expect(cellAt(s.x, s.y)).toBe('track');
  });

  it('keeps the centreline on the track all the way round', () => {
    for (const p of track.samples) expect(['track']).toContain(cellAt(p.x, p.y));
  });

  it('has gentle gradients on the racing line (the T1 dip, the climbs round T3 and T8)', () => {
    let worst = 0;
    for (let i = 0; i < track.samples.length; i++) {
      const p = track.samples[i];
      const g = groundAt(grid, p.x, p.y);
      worst = Math.max(worst, Math.abs(g.gx * Math.sin(p.dir) - g.gy * Math.cos(p.dir)));
    }
    expect(worst).toBeGreaterThan(0.02);
    expect(worst).toBeLessThan(0.2);
  });

  it('can be lapped by an AI F1 car on the real physics in about 24 seconds', () => {
    const start = circuit.slots[0];
    const car = newCar(f1, start.x, start.y, start.heading);
    let p = newProgress(track.samples.length - 3);
    let t = 0;
    for (; t < 80 && p.lap < 1; t += 1 / 60) {
      stepCar(car, aiInput(car, track, p.idx, { lane: 0, pace: 1 }), RACE_HANDLING, 1 / 60, grid);
      p = stepProgress(p, track, car, t, 3, 1 / 60);
    }
    expect(p.lap).toBe(1);
    expect(p.lapTimes[0]).toBeGreaterThan(20);
    expect(p.lapTimes[0]).toBeLessThan(30);
    expect(car.health).toBe(f1.health);
    expect(speedOf(car)).toBeGreaterThan(100);
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
    expect(Math.abs(line.time - flat.time)).toBeLessThan(0.5);
    expect(line.time).toBeLessThan(26);
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
