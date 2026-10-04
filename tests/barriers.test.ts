import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { TILE as T, buildCircuit } from '../src/f1/circuit';
import { barrierTiles, garageSpots } from '../src/f1/circuitScene';
import { LAYOUTS } from '../src/f1/layouts';
import { PIT } from '../src/f1/pits';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';

const f1 = carClass('f1');

describe('the barriers', () => {
  // (Caspian Shores' pit exit road had none along it, past the garages: the walls stopped at the whole pit lane)
  it.each(LAYOUTS.map((l) => [l.id, l] as const))('line the pit lane everywhere but behind the garages at %s', (_, layout) => {
    const c = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const { walls, bankWall } = barrierTiles(c);
    const has = new Set([...walls, ...bankWall].map(([i, j]) => j * c.width + i));
    const garages = garageSpots(c);
    expect(garages).toHaveLength(c.pit.boxes.length);
    let lining = 0;
    for (let j = 1; j < c.height - 1; j++) {
      for (let i = 1; i < c.width - 1; i++) {
        if (c.cells[j * c.width + i] !== 'wall') continue;
        const byPits = [-1, 0, 1].some((dj) => [-1, 0, 1].some((di) => c.cells[(j + dj) * c.width + i + di] === 'pit'));
        if (!byPits) continue;
        const behindGarage = garages.some((g) => Math.hypot(g.x - (i + 0.5) * T, g.y - (j + 0.5) * T) < PIT.boxSpacing);
        if (behindGarage) expect(has.has(j * c.width + i)).toBe(false);
        else {
          expect(has.has(j * c.width + i)).toBe(true);
          lining++;
        }
      }
    }
    // (the entry and exit roads, past the garages: walled)
    expect(lining).toBeGreaterThan(0);
  });
});
