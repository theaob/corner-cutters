import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { LAYOUTS } from '../src/f1/layouts';
import { MARINA, cruiseAt, marinaOf } from '../src/f1/marina';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { inView, inside, seaOf } from '../src/f1/town3d';

const f1 = carClass('f1');
const harbour = LAYOUTS.find((l) => l.id === 'harbour')!;
const c = buildCircuit(harbour, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const sea = seaOf(c)!;
const m = marinaOf(c);
const samples = c.track.samples;
const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
const keep = HALF_WIDTH + harbour.street!.runoff;

describe("the Harbour's marina", () => {
  it('has its pontoons, wholly in the sea and clear of the track', () => {
    expect(m.piers.length).toBe(MARINA.piers);
    for (const p of m.piers) {
      for (let a = 10; a <= p.length; a += 10) {
        expect(inside(sea, p.x + p.dx * a, p.y + p.dy * a)).toBe(true);
        expect(fromTrack(p.x + p.dx * a, p.y + p.dy * a)).toBeGreaterThan(keep);
      }
    }
  });

  it('is in the picture as you drive by: each pontoon (with its boats) a good part of it at once', () => {
    for (const p of m.piers) {
      const w = Math.abs(p.dx) * p.length + Math.abs(p.dy) * 40;
      const d = Math.abs(p.dy) * p.length + Math.abs(p.dx) * 40;
      expect(inView(samples, p.x + (p.dx * p.length) / 2, p.y + (p.dy * p.length) / 2, w, d)).toBeGreaterThan(0.3);
    }
  });

  it('has boats moored along both sides of each pontoon, in the sea and apart', () => {
    expect(m.berths.length).toBeGreaterThan(MARINA.piers * 4);
    for (const b of m.berths) expect(inside(sea, b.x, b.y)).toBe(true);
    for (const a of m.berths) for (const b of m.berths) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(12);
  });

  it('has boats going round out on the water, all the way round in the sea and clear of the track', () => {
    expect(m.cruises.length).toBe(MARINA.cruisers);
    for (const cr of m.cruises) {
      for (let t = 0; t < cr.period; t += cr.period / 24) {
        const p = cruiseAt(cr, t);
        expect(inside(sea, p.x, p.y)).toBe(true);
        expect(fromTrack(p.x, p.y)).toBeGreaterThan(keep);
      }
    }
  });

  it('is only at the seaside', () => {
    const park = buildCircuit(LAYOUTS[0], { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
    expect(marinaOf(park)).toEqual({ piers: [], berths: [], cruises: [] });
  });
});
