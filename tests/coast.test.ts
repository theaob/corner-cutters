import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, RUNOFF, buildCircuit } from '../src/f1/circuit';
import { COAST, coastOf, hutsOf, kitesOf } from '../src/f1/coast';
import { inLake, lakesOf } from '../src/f1/lakes';
import { DUNE_COAST, LAYOUTS } from '../src/f1/layouts';
import { GARAGE_ACROSS } from '../src/f1/pits';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { STAND, standsOf } from '../src/f1/stands';
import { HIDES } from '../src/f1/town3d';

const f1 = carClass('f1');
const c = buildCircuit(DUNE_COAST, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const coast = coastOf(c)!;
const reach = HALF_WIDTH + RUNOFF;
const fromTrack = (p: { x: number; y: number }) => Math.min(...c.track.samples.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));

describe('the coast at Dune Coast', () => {
  it('is only there', () => {
    expect(coast).toBeDefined();
    for (const l of LAYOUTS) if (l !== DUNE_COAST) expect(l.coast).toBeUndefined();
  });

  it('has the sea beyond the dunes: its shore clear of the track and its run-off, in as near as the pits let it', () => {
    const sea = lakesOf(c);
    expect(sea).toHaveLength(1);
    for (const p of c.track.samples) expect(inLake(sea, p.x, p.y, reach + 30)).toBe(false);
    for (const q of c.pit.points) expect(inLake(sea, q.x, q.y, GARAGE_ACROSS + 20)).toBe(false);
    // (somewhere it comes in near: past the barriers, in sight)
    expect(Math.min(...coast.shore.map(fromTrack))).toBeLessThan(reach + 80);
    // (out to sea is away from the track)
    const mid = Math.floor(coast.shore.length / 2);
    const out = { x: coast.shore[mid].x + coast.seaward[mid].x * 50, y: coast.shore[mid].y + coast.seaward[mid].y * 50 };
    expect(inLake(sea, out.x, out.y)).toBe(true);
  });

  it('has a row of beach huts along the top of the beach, in sight of the track, clear of it, the garages, the grandstands and the sea', () => {
    const huts = hutsOf(c);
    expect(huts.length).toBeGreaterThan(20);
    const sea = lakesOf(c);
    for (const h of huts) {
      const d = fromTrack(h);
      expect(d).toBeGreaterThan(reach + COAST.hutClear - 1);
      expect(d).toBeLessThan(COAST.hutReach);
      for (const q of c.pit.points) expect(Math.hypot(q.x - h.x, q.y - h.y)).toBeGreaterThan(GARAGE_ACROSS + 20);
      for (const s of standsOf(c)) expect(Math.hypot(s.x - h.x, s.y - h.y)).toBeGreaterThan(s.len / 2 + STAND.depth);
      expect(inLake(sea, h.x, h.y)).toBe(false);
    }
  });

  it('has kites flown from the beach, clear of the track', () => {
    const kites = kitesOf(c);
    expect(kites).toHaveLength(COAST.kites);
    for (const k of kites) expect(fromTrack(k)).toBeGreaterThan(reach);
  });

  it('has a windmill on a dune by the track: past its run-off, in sight, hiding none of the track behind it', () => {
    const m = coast.windmill;
    const d = fromTrack(m);
    expect(d).toBeGreaterThan(reach + 30);
    expect(d).toBeLessThan(reach + 120);
    // (it's about 64 px tall: what's north of it, that near, would be hidden)
    for (const p of c.track.samples) {
      if (Math.abs(p.x - m.x) > reach + 16 || p.y > m.y) continue;
      expect(m.y - 16 - (p.y + reach)).toBeGreaterThan(64 * HIDES);
    }
  });
});
