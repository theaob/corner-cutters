import { describe, expect, it } from 'vitest';
import { applyDamage, carClass, newCar, speedOf } from '../src/engine/driving';
import { HALF_WIDTH, TILE, buildCircuit, type Circuit } from '../src/f1/circuit';
import { LAYOUTS, SILVER_HEATH, type CircuitLayout } from '../src/f1/layouts';
import { PIT, entersPit, stopTime, wantsPit } from '../src/f1/pits';
import { RACE_HANDLING, lineCornerSpeed, lineDecel, nearestSample } from '../src/f1/racing';
import { newRace, order, running, stepRace, type Race, type RaceEvent } from '../src/f1/raceControl';

const f1 = carClass('f1');
const dt = 1 / 60;
const build = (layout: CircuitLayout) => buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const cellAt = (c: Circuit, x: number, y: number) => c.cells[Math.floor(y / TILE) * c.width + Math.floor(x / TILE)];

/** A full grid of 10 AI cars, boxes by pairs; `player` makes one of them the player's. */
function raceOn(layout: CircuitLayout, laps = 3, player?: number): Race {
  const c = build(layout);
  const field = c.slots.slice(0, 10).map((s, i) => ({
    car: newCar(f1, s.x, s.y, s.heading),
    ai: i === player ? undefined : { lane: ((i * 7) % 11) - 5, pace: 0.94 * (1 - (i / 10) * 0.05) },
    box: i >> 1,
  }));
  return newRace(c.track, c.grid, RACE_HANDLING, laps, field, 0.5, c.pit);
}

const over = (race: Race) => race.entrants.every((e) => e.progress.finished !== undefined || e.progress.retired);

describe.each(LAYOUTS)('$name pit lane', (layout) => {
  const c = build(layout);
  const { pit, track } = c;

  it('leaves the track and rejoins it, out behind a pit wall in between', () => {
    expect(pit.points[0].off).toBeLessThan(HALF_WIDTH);
    expect(pit.points[pit.points.length - 1].off).toBeLessThan(HALF_WIDTH);
    expect(Math.max(...pit.points.map((p) => p.off))).toBeCloseTo(PIT.offset);
    expect(c.cells).toContain('pit');
    expect(c.cells).toContain('pitwall');
  });

  it('is clear of the rest of the circuit: each point of it is beside its own stretch of track', () => {
    const n = track.samples.length;
    for (const p of pit.points) {
      const i = nearestSample(track, p.x, p.y);
      expect(Math.min((i - p.idx + n) % n, (p.idx - i + n) % n)).toBeLessThan(20);
    }
  });

  it('has room to drive down the fast lane and stop in every box', () => {
    for (const p of pit.points) {
      if (p.off < PIT.offset - 1) continue;
      for (const across of [PIT.fastLane - 7, PIT.fastLane + 7, PIT.boxLane - 7, PIT.boxLane + 7]) {
        expect(cellAt(c, p.x + Math.cos(p.dir) * across * pit.side, p.y + Math.sin(p.dir) * across * pit.side)).toBe('pit');
      }
    }
    expect(pit.boxes).toHaveLength(PIT.boxes);
    for (const b of pit.boxes) expect(pit.points.find((p) => p.s >= b)!.off).toBeCloseTo(PIT.offset);
  });

  it('keeps the starting grid on the track', () => {
    for (const s of c.slots) expect(cellAt(c, s.x, s.y)).toBe('track');
  });
});

describe('the pit entry', () => {
  const c = build(SILVER_HEATH);
  const { pit, track } = c;
  const at = (k: number, lateral: number) => {
    const idx = (pit.entry + k) % track.samples.length;
    const s = track.samples[idx];
    return { car: newCar(f1, s.x + Math.cos(s.dir) * lateral, s.y + Math.sin(s.dir) * lateral, s.dir), idx };
  };

  it('commits a car that leaves the track on the pit side inside the pit zone', () => {
    const { car, idx } = at(8, 60 * pit.side);
    expect(entersPit(pit, track, car, idx)).toBe(true);
  });

  it('lets a car on the track, or off it on the other side, or away from the pits, carry on', () => {
    for (const [k, lateral] of [[8, 30 * pit.side], [8, -60 * pit.side], [-40, 60 * pit.side]]) {
      const { car, idx } = at(k, lateral);
      expect(entersPit(pit, track, car, idx)).toBe(false);
    }
  });
});

describe('when to stop', () => {
  const car = newCar(f1, 0, 0);
  it('never for a healthy car, or with no laps left', () => {
    expect(wantsPit(car, 5, 25, RACE_HANDLING.damageSlow)).toBe(false);
    car.health = car.cls.health * 0.4;
    expect(wantsPit(car, 0.6, 25, RACE_HANDLING.damageSlow)).toBe(false);
  });
  it('for a badly damaged car with laps to go, when the repair saves more than the stop costs', () => {
    car.health = car.cls.health * 0.4;
    expect(wantsPit(car, 2, 25, RACE_HANDLING.damageSlow)).toBe(true);
    car.health = car.cls.health * 0.85;
    expect(wantsPit(car, 2, 25, RACE_HANDLING.damageSlow)).toBe(false);
  });
  it('takes longer the more there is to repair', () => {
    car.health = car.cls.health;
    expect(stopTime(car)).toBeCloseTo(PIT.stop);
    car.health = car.cls.health / 2;
    expect(stopTime(car)).toBeCloseTo(PIT.stop + PIT.repair / 2);
  });
});

describe.each(LAYOUTS)('a pit stop at $name', (layout) => {
  it('repairs a damaged AI car: in on the limiter, stopped in its box, out again, and it still finishes', () => {
    const race = raceOn(layout, 3);
    const events: RaceEvent[] = [];
    let victim = -1;
    let fastestInLane = 0;
    for (let t = 0; t < 240 && !over(race); t += dt) {
      if (victim < 0 && race.phase === 'racing' && race.clock > 6) {
        victim = order(race)[3];
        race.entrants[victim].car.health = f1.health * 0.35;
      }
      events.push(...stepRace(race, dt).race);
      const stop = victim >= 0 ? race.entrants[victim].pit : undefined;
      if (stop && stop.phase !== 'in') fastestInLane = Math.max(fastestInLane, speedOf(race.entrants[victim].car));
    }
    const mine = events.filter((e) => 'who' in e && e.who === victim).map((e) => e.kind);
    expect(mine).toEqual(['pit-in', 'pit-stop', 'pit-out']);
    const e = race.entrants[victim];
    expect(e.stops).toBe(1);
    expect(e.car.health).toBe(f1.health);
    expect(fastestInLane).toBeLessThanOrEqual(PIT.limit + 5);
    expect(e.progress.finished).toBeDefined();
    expect(e.progress.lapTimes).toHaveLength(3);
    // nobody else stopped, and no one was hurt
    expect(events.filter((x) => x.kind === 'pit-in')).toHaveLength(1);
    expect(race.entrants.every((x) => running(x) && !x.car.wrecked)).toBe(true);
  }, 30_000);
});

describe('the player in the pits', () => {
  it('is taken through once committed: stopped, repaired, and handed back at the exit', () => {
    const c = build(SILVER_HEATH);
    const race = raceOn(SILVER_HEATH, 3, 0);
    const me = race.entrants[0];
    // race until lap 1 is under way, then put the player's damaged car in the pit entry at speed
    while (race.phase !== 'racing' || race.clock < 3) stepRace(race, dt, () => ({ handbrake: false }));
    const idx = (c.pit.entry + 6) % c.track.samples.length;
    const s = c.track.samples[idx];
    Object.assign(me.car, { x: s.x + Math.cos(s.dir) * 58 * c.pit.side, y: s.y + Math.sin(s.dir) * 58 * c.pit.side, heading: s.dir, vx: Math.sin(s.dir) * 200, vy: -Math.cos(s.dir) * 200 });
    me.progress = { ...me.progress, idx };
    applyDamage(me.car, f1.health * 0.5, RACE_HANDLING);
    const kinds: string[] = [];
    // the player holds full throttle straight on: the car drives itself all the same
    for (let t = 0; t < 20 && !kinds.includes('pit-out'); t += dt) {
      for (const e of stepRace(race, dt, () => ({ steer: { x: 1, y: 0 }, handbrake: false })).race) if ('who' in e && e.who === 0) kinds.push(e.kind);
    }
    expect(kinds).toEqual(['pit-in', 'pit-stop', 'pit-out']);
    expect(me.car.health).toBe(f1.health);
    // back on the track, beside the exit
    const at = nearestSample(c.track, me.car.x, me.car.y);
    expect(Math.abs(at - c.pit.exit)).toBeLessThan(4);
  });
});

describe('the pits under the safety car', () => {
  it('lets the field pass a car that stops, without a penalty', () => {
    const race = raceOn(SILVER_HEATH, 3);
    const events: RaceEvent[] = [];
    let crashed = false;
    for (let t = 0; t < 240 && !over(race); t += dt) {
      if (!crashed && race.phase === 'racing' && race.clock > 10) {
        crashed = true;
        const ranked = order(race);
        applyDamage(race.entrants[ranked[6]].car, 1000, RACE_HANDLING);
        race.entrants[ranked[2]].car.health = f1.health * 0.35;
      }
      events.push(...stepRace(race, dt).race);
    }
    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain('safety-car');
    expect(kinds).toContain('pit-stop');
    expect(kinds).not.toContain('penalty');
  }, 30_000);
});
