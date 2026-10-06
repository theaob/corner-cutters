import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { buildCircuit } from '../src/f1/circuit';
import { PARK, treesOf } from '../src/f1/forest3d';
import { CRESCENT_PARK, LAYOUTS } from '../src/f1/layouts';
import { PLANES, PlaneRun, type Flight } from '../src/f1/planes';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { HIDES } from '../src/f1/town3d';

const runway = CRESCENT_PARK.airport!.runway;
/** the ground point a plane shows over, from the camera (up high, it shows that much further up the picture) */
const shownOver = (f: Flight) => ({ x: f.x, y: f.y - f.z * HIDES });

describe('the planes over Crescent Park', () => {
  it('fly over Crescent Park, from the airport next door, and nowhere else', () => {
    for (const l of LAYOUTS) if (l !== CRESCENT_PARK) expect(l.airport).toBeUndefined();
  });

  it('come over now and then, one at a time, the runway\'s way: some coming in to land, low and sinking, some climbing away', () => {
    const run = new PlaneRun(runway);
    const focus = { x: 1000, y: 1000, vx: 0, vy: 0 };
    const seen = new Set<Flight>();
    let most = 0;
    for (let t = 0; t < 600; t += 1 / 30) {
      run.step(1 / 30, focus);
      for (const f of run.flights) {
        seen.add(f);
        expect(Math.atan2(f.vy, f.vx)).toBeCloseTo(runway, 5);
        // (always well up: over the trees, the tallest thing about, by a long way)
        expect(f.z).toBeGreaterThan(PARK.tallest + 30);
        if (f.kind === 'arrive') expect(f.vz).toBeLessThan(0);
        else expect(f.vz).toBeGreaterThan(0);
      }
      most = Math.max(most, run.flights.length);
    }
    // (every 16 to 30 s: about 20 to 40 in 10 minutes)
    expect(seen.size).toBeGreaterThan(18);
    expect(seen.size).toBeLessThan(40);
    expect(most).toBeLessThanOrEqual(2);
    const kinds = [...seen].map((f) => f.kind);
    expect(kinds.filter((k) => k === 'arrive').length).toBeGreaterThan(kinds.length * 0.35);
    expect(kinds.filter((k) => k === 'depart').length).toBeGreaterThan(kinds.length * 0.15);
    expect(run.flown).toBeGreaterThanOrEqual(seen.size - 2);
  });

  it('pass over the picture: over the camera, from out of sight on one side to out of sight on the other', () => {
    // (the camera still, and on a car going by)
    for (const v of [{ vx: 0, vy: 0 }, { vx: 250, vy: -80 }]) {
      const run = new PlaneRun(runway, 11);
      const focus = { x: 1500, y: 900, ...v };
      let checked = 0;
      for (let t = 0; t < 120; t += 1 / 30) {
        focus.x += focus.vx / 30;
        focus.y += focus.vy / 30;
        const before = new Set(run.flights);
        run.step(1 / 30, focus);
        for (const f of run.flights) {
          if (before.has(f)) continue;
          // (on: out of the picture, behind it)
          const at = shownOver(f);
          expect(Math.hypot(at.x - focus.x, at.y - focus.y)).toBeGreaterThan(300);
          // its nearest to the camera as it goes over, near enough the middle of the picture
          let nearest = Infinity;
          const g = { ...f };
          const fx = { ...focus };
          for (let s = 0; s < (PLANES.lead + PLANES.beyond) / Math.hypot(f.vx, f.vy); s += 1 / 30) {
            g.x += g.vx / 30;
            g.y += g.vy / 30;
            g.z += g.vz / 30;
            fx.x += fx.vx / 30;
            fx.y += fx.vy / 30;
            const p = shownOver(g);
            nearest = Math.min(nearest, Math.hypot(p.x - fx.x, p.y - fx.y));
          }
          expect(nearest).toBeLessThan(PLANES.aside + 20);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(2);
    }
  });

  it('a circuit in a park: groves of trees over the hills round it', () => {
    const f1 = carClass('f1');
    const c = buildCircuit(CRESCENT_PARK, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    const trees = treesOf(c);
    expect(trees.length).toBeGreaterThan(80);
  });
});
