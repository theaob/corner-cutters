import { describe, expect, it } from 'vitest';
import { carClass, newCar, stepCar } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { BRIDGE, atCrossing, gridFor, liftAt, sameLevel } from '../src/f1/bridge';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { LAYOUTS, SUZUKA } from '../src/f1/layouts';
import { RACE_HANDLING, lateralOffset, lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { newRace, stepRace } from '../src/f1/raceControl';

const f1 = carClass('f1');
const build = (l: (typeof LAYOUTS)[number]) => buildCircuit(l, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

describe('the bridge at Suzuka', () => {
  const c = build(SUZUKA);
  const { track, grid } = c;
  const l = track.levels!;
  const n = track.samples.length;
  const height = SUZUKA.bridge!.height;

  it('is the one circuit with a bridge', () => {
    expect(l).toBeDefined();
    for (const other of LAYOUTS) if (other !== SUZUKA) expect(other.bridge).toBeUndefined();
  });

  it('carries the back straight over the stretch after Degner, right where they cross', () => {
    const a = track.samples[l.over];
    const b = track.samples[l.under];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(16);
    // (and on the ground the two are at the same height there: the bridge does the lifting)
    expect(Math.abs(groundAt(grid, a.x, a.y).h - groundAt(grid, b.x, b.y).h)).toBeLessThan(2);
    expect(atCrossing(track, l.over, l.under)).toBe(true);
  });

  it('rises up a ramp to its height over the crossing and down again, never steeply', () => {
    expect(liftAt(track, l, l.over)).toBe(height);
    expect(liftAt(track, l, l.from)).toBeCloseTo(0, 3);
    expect(liftAt(track, l, l.to)).toBeCloseTo(0, 3);
    expect(liftAt(track, l, l.under)).toBe(0);
    let worst = 0;
    for (let k = l.from; k !== l.to; k = (k + 1) % n) {
      const p = track.samples[k];
      const q = track.samples[(k + 1) % n];
      worst = Math.max(worst, Math.abs(groundAt(l.upper, q.x, q.y).h - groundAt(l.upper, p.x, p.y).h) / track.spacing);
    }
    expect(worst).toBeLessThan(0.2);
  });

  it('is driven on from the back straight, the ground everywhere else', () => {
    expect(gridFor(track, grid, l.over)).toBe(l.upper);
    expect(gridFor(track, grid, l.under)).toBe(grid);
    expect(gridFor(track, grid, 0)).toBe(grid);
    const p = track.samples[l.over];
    expect(groundAt(l.upper, p.x, p.y).h - groundAt(grid, p.x, p.y).h).toBeCloseTo(height, 0);
  });

  it('keeps a car on the deck between its walls', () => {
    const p = track.samples[l.over];
    const car = newCar(f1, p.x, p.y, p.dir + Math.PI / 2);
    car.z = groundAt(l.upper, p.x, p.y).h;
    // (driven flat out square across the deck, for two seconds)
    for (let t = 0; t < 2; t += 1 / 60) stepCar(car, { steer: { x: Math.cos(p.dir), y: Math.sin(p.dir) }, handbrake: false }, RACE_HANDLING, 1 / 60, l.upper);
    expect(Math.abs(lateralOffset(track, l.over, car.x, car.y))).toBeLessThan(BRIDGE.deck + 16);
    expect(car.z).toBeGreaterThan(groundAt(grid, car.x, car.y).h + height - 4);
  });

  it('lets a car pass under a car on it: no contact, and neither races the other', () => {
    const a = track.samples[l.over];
    const b = track.samples[l.under];
    const race = newRace(track, grid, RACE_HANDLING, 3, [
      { car: newCar(f1, a.x, a.y, a.dir), ai: { lane: 0, pace: 1 } },
      { car: newCar(f1, b.x, b.y, b.dir), ai: { lane: 0, pace: 1 } },
    ], 0);
    while (race.phase !== 'racing') stepRace(race, 1 / 60);
    const [top, low] = race.entrants;
    for (const [e, k, g] of [[top, l.over, l.upper], [low, l.under, grid]] as const) {
      const s = track.samples[k];
      Object.assign(e.car, { x: s.x, y: s.y, heading: s.dir, vx: Math.sin(s.dir) * 200, vy: -Math.cos(s.dir) * 200, z: groundAt(g, s.x, s.y).h });
      e.progress = { ...e.progress, idx: k };
    }
    for (let t = 0; t < 0.5; t += 1 / 60) stepRace(race, 1 / 60);
    expect(sameLevel(top.car, low.car)).toBe(false);
    expect(top.car.health).toBe(f1.health);
    expect(low.car.health).toBe(f1.health);
    expect(top.car.z - low.car.z).toBeGreaterThan(height - 8);
  });

  it("stands only where it's needed: no lift off the back straight, and the road underneath the ground's", () => {
    const b = track.samples[l.under];
    expect(groundAt(gridFor(track, grid, l.under), b.x, b.y).h).toBe(groundAt(grid, b.x, b.y).h);
    expect(Math.abs(lateralOffset(track, l.under, b.x, b.y))).toBeLessThan(HALF_WIDTH);
  });
});
