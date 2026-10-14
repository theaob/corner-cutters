import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { BIRDS, birdsAt, flocksOf } from '../src/f1/birds';
import { loopLength, pointOnLoop } from '../src/f1/camels';
import { KANGAROOS, kangaroosAt, mobsOf } from '../src/f1/kangaroos';
import { inLake, lakesOf } from '../src/f1/lakes';
import { LAYOUTS, SOUTHERN_LAKE } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';

const f1 = carClass('f1');
const circuit = buildCircuit(SOUTHERN_LAKE, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

describe('the kangaroos at Southern Lake', () => {
  const mobs = mobsOf(circuit);

  it('are the only ones about', () => {
    expect(LAYOUTS.filter((l) => l.kangaroos)).toEqual([SOUTHERN_LAKE]);
  });

  it('are in mobs of three to five, spread round the lap', () => {
    expect(mobs.length).toBeGreaterThanOrEqual(KANGAROOS.caravans - 2);
    for (const m of mobs) {
      expect(m.camels).toBeGreaterThanOrEqual(KANGAROOS.least);
      expect(m.camels).toBeLessThanOrEqual(KANGAROOS.least + KANGAROOS.more);
      expect(kangaroosAt(m, 5)).toHaveLength(m.camels);
    }
  });

  it('keep clear of the track and its run-off, the pits and the lake', () => {
    const lakes = lakesOf(circuit);
    for (const m of mobs) {
      for (let s = 0; s < loopLength(m); s += 4) {
        const p = pointOnLoop(m, s);
        expect(Math.min(...circuit.track.samples.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))).toBeGreaterThan(HALF_WIDTH + RUNOFF + KANGAROOS.clearTrack - 6);
        expect(Math.min(...circuit.pit.points.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))).toBeGreaterThan(100);
        expect(inLake(lakes, p.x, p.y)).toBe(false);
      }
    }
  }, 60_000);
});

describe('the birds at Southern Lake', () => {
  const flocks = flocksOf(circuit);

  it('are the only ones about', () => {
    expect(LAYOUTS.filter((l) => l.birds)).toEqual([SOUTHERN_LAKE]);
  });

  it('are flocks of budgerigars and of cockatoos, high over the park', () => {
    expect(flocks.filter((f) => f.kind === 'budgie')).toHaveLength(BIRDS.budgieFlocks);
    expect(flocks.filter((f) => f.kind === 'cockatoo')).toHaveLength(BIRDS.cockatooFlocks);
    for (const f of flocks) {
      expect(f.birds).toBeGreaterThanOrEqual(f.kind === 'budgie' ? BIRDS.budgies : BIRDS.cockatoos);
      for (const b of birdsAt(f, 12)) expect(b.z).toBeGreaterThan(BIRDS.high - 10);
    }
  });

  it('fly on, heading where they go, a little each moment', () => {
    for (const f of flocks) {
      const [a] = birdsAt(f, 10);
      const [b] = birdsAt(f, 10.1);
      const moved = Math.hypot(b.x - a.x, b.y - a.y);
      expect(moved).toBeGreaterThan(1);
      expect(moved).toBeLessThan(80);
      expect(Math.sin(a.heading) * (b.x - a.x) - Math.cos(a.heading) * (b.y - a.y)).toBeGreaterThan(0);
    }
  });
});
