import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, TILE, buildCircuit } from '../src/f1/circuit';
import { loopLength, pointOnLoop } from '../src/f1/camels';
import { GEESE, flightAt, geeseAt } from '../src/f1/geese';
import { inLake, lakesOf } from '../src/f1/lakes';
import { LAYOUTS, MAPLE_ISLAND } from '../src/f1/layouts';
import { MOOSE, herdsOfMoose, mooseAt } from '../src/f1/moose';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';

const f1 = carClass('f1');
const circuit = buildCircuit(MAPLE_ISLAND, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

describe('the moose at Maple Island', () => {
  const herds = herdsOfMoose(circuit);

  it('are the only ones about', () => {
    expect(LAYOUTS.filter((l) => l.moose)).toEqual([MAPLE_ISLAND]);
  });

  it('are in small groups, spread round the lap', () => {
    expect(herds.length).toBeGreaterThanOrEqual(2);
    for (const h of herds) {
      expect(h.camels).toBeGreaterThanOrEqual(MOOSE.least);
      expect(h.camels).toBeLessThanOrEqual(MOOSE.least + MOOSE.more);
      expect(mooseAt(h, 5)).toHaveLength(h.camels);
    }
  });

  it('keep clear of the track and its run-off, the pits and the basin', () => {
    const lakes = lakesOf(circuit);
    for (const h of herds) {
      for (let s = 0; s < loopLength(h); s += 4) {
        const p = pointOnLoop(h, s);
        expect(Math.min(...circuit.track.samples.map((q) => Math.hypot(q.x - p.x, q.y - p.y)))).toBeGreaterThan(HALF_WIDTH + RUNOFF + MOOSE.clearTrack - 6);
        expect(inLake(lakes, p.x, p.y)).toBe(false);
      }
    }
  }, 60_000);
});

describe('the geese at Maple Island', () => {
  it('are the only ones about', () => {
    expect(LAYOUTS.filter((l) => l.geese)).toEqual([MAPLE_ISLAND]);
  });

  it('cross the sky in a V, then are gone until the next flock', () => {
    const f = flightAt(circuit, 5)!;
    expect(f).toBeDefined();
    const geese = geeseAt(f, 5);
    expect(geese).toHaveLength(f.n);
    expect(f.n).toBeGreaterThanOrEqual(GEESE.least);
    expect(geese[0].z).toBeGreaterThan(40);
    expect(flightAt(circuit, GEESE.every - 1)).toBeUndefined();
    expect(flightAt(circuit, GEESE.every + 5)).toBeDefined();
  });

  it('really do cross the map', () => {
    const W = circuit.width * TILE;
    const H = circuit.height * TILE;
    for (const k of [0, 1, 2, 3]) {
      const inside = [...Array(GEESE.every)].some((_, t) => {
        const f = flightAt(circuit, k * GEESE.every + t);
        return f && f.x > 0 && f.x < W && f.y > 0 && f.y < H;
      });
      expect(inside).toBe(true);
    }
  });
});
