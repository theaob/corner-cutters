import { describe, expect, it } from 'vitest';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { ARDENNES, LAYOUTS } from '../src/f1/layouts';
import { carClass } from '../src/engine/driving';
import { groundAt } from '../src/engine/sim';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { FOREST, treesOf } from '../src/f1/forest3d';
import { HIDES } from '../src/f1/town3d';
import { standsOf } from '../src/f1/stands';

const f1 = carClass('f1');
const build = (l: (typeof LAYOUTS)[number]) => buildCircuit(l, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

describe('the forest', () => {
  const circuit = build(ARDENNES);
  const trees = treesOf(circuit);
  const reach = HALF_WIDTH + RUNOFF;

  it('grows only round a circuit in a forest', () => {
    for (const l of LAYOUTS) if (!l.forest) expect(treesOf(build(l))).toHaveLength(0);
  });

  it('is thick: thousands of trees, mostly spruces, all round and out past the map', () => {
    expect(trees.length).toBeGreaterThan(8000);
    expect(trees.filter((t) => t.kind === 'spruce').length / trees.length).toBeGreaterThan(0.7);
    expect(trees.some((t) => t.kind === 'broadleaf')).toBe(true);
    const W = circuit.width * 16;
    const H = circuit.height * 16;
    expect(trees.some((t) => t.x < 0) && trees.some((t) => t.x > W) && trees.some((t) => t.y < 0) && trees.some((t) => t.y > H)).toBe(true);
    for (const t of trees) {
      expect(t.h).toBeGreaterThanOrEqual(FOREST.shortest);
      expect(t.h).toBeLessThanOrEqual(FOREST.tallest);
    }
  });

  it('stands clear of the track and its run-off, the pits and the grandstands', () => {
    const stands = standsOf(circuit);
    const closest = (t: { x: number; y: number }, pts: { x: number; y: number }[]) => Math.min(...pts.map((p) => Math.hypot(p.x - t.x, p.y - t.y)));
    let track = Infinity;
    let pits = Infinity;
    let grandstand = Infinity;
    for (const t of trees) {
      track = Math.min(track, closest(t, circuit.track.samples));
      pits = Math.min(pits, closest(t, circuit.pit.points));
      for (const s of stands) grandstand = Math.min(grandstand, Math.hypot(s.x - t.x, s.y - t.y) - s.len / 2);
    }
    expect(track).toBeGreaterThan(reach + FOREST.clear - 1);
    expect(pits).toBeGreaterThan(100);
    expect(grandstand).toBeGreaterThan(0);
  });

  it('never hides the track from the camera, on the hillsides too', () => {
    const ground = circuit.track.samples.map((p) => groundAt(circuit.grid, p.x, p.y).h);
    let worst = -Infinity;
    for (const t of trees) {
      const cr = t.h * FOREST.crown;
      const top = groundAt(circuit.grid, t.x, t.y).h + t.h;
      circuit.track.samples.forEach((p, i) => {
        if (Math.abs(p.x - t.x) > cr + reach) return;
        const gap = t.y - cr - (p.y + reach);
        if (gap < 0) return;
        // (how far north of its crown its top hides the ground, seen from the camera, against the track's height there, less the gap)
        worst = Math.max(worst, (top - ground[i]) * HIDES - gap);
      });
    }
    expect(worst).toBeLessThanOrEqual(0);
  });
});
