import { describe, expect, it } from 'vitest';
import { groundAt } from '../src/engine/sim';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { LAYOUTS, VEGAS } from '../src/f1/layouts';
import { NEON, landmarkHides, neonOf, towersOf } from '../src/f1/neonCity';
import { NIGHT, lampsOf, nightSky, poolPatch } from '../src/f1/night';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { standsOf } from '../src/f1/stands';
import { DRY, WEATHERS } from '../src/f1/weather';

const f1 = carClass('f1');
const c = buildCircuit(VEGAS, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
const reach = HALF_WIDTH + VEGAS.street!.runoff;
const fromTrack = (p: { x: number; y: number }) => Math.min(...c.track.samples.map((q) => Math.hypot(q.x - p.x, q.y - p.y)));

describe('the night at Neon Strip', () => {
  it('falls only there', () => {
    for (const l of LAYOUTS) if (l !== VEGAS) expect(l.night).toBeFalsy();
    expect(VEGAS.night).toBe(true);
  });

  it('turns every weather\'s sky to night: dark, lit by the moon, the duller the weather the less of it', () => {
    for (const w of WEATHERS) {
      const n = nightSky(w.sky);
      expect(n.moon).toBe(true);
      expect(n.keyIntensity).toBeLessThan(w.sky.keyIntensity);
      expect(n.background).toBe(0x15133a);
    }
    const wet = WEATHERS.find((w) => w.id === 'wet')!;
    expect(nightSky(wet.sky).keyIntensity).toBeLessThan(nightSky(DRY.sky).keyIntensity);
  });

  it('has street lamps all the way round, just past the track\'s edge, never on it', () => {
    const lamps = lampsOf(c);
    expect(lamps.length).toBeGreaterThan(c.track.length / NIGHT.lampEvery - 10);
    for (const l of lamps) {
      const d = fromTrack(l);
      expect(d).toBeGreaterThan(HALF_WIDTH);
      expect(d).toBeLessThan(reach + NIGHT.lampOut + 2);
    }
  });

  it('drapes each pool of light over the ground, so no slope or step of it cuts the light off', () => {
    for (const l of lampsOf(c)) {
      const pos = poolPatch(c.grid, l.x, l.y).attributes.position;
      expect(pos.count).toBeGreaterThan(4);
      for (let i = 0; i < pos.count; i++) {
        const lift = pos.getY(i) - groundAt(c.grid, pos.getX(i), pos.getZ(i)).h;
        expect(lift).toBeGreaterThan(0.5);
        expect(lift).toBeLessThan(3);
      }
    }
  });

  it('keeps each lamp\'s post, arm and pool of light off every other stretch of road', () => {
    const { samples } = c.track;
    for (const l of lampsOf(c)) {
      const own = samples.reduce((b, q, j) => (Math.hypot(q.x - l.x, q.y - l.y) < Math.hypot(samples[b].x - l.x, samples[b].y - l.y) ? j : b), 0);
      for (const f of [0, 0.55, 1]) {
        const px = l.x + Math.cos(l.dir) * l.reach * f;
        const py = l.y + Math.sin(l.dir) * l.reach * f;
        samples.forEach((q, j) => {
          const gap = Math.abs(j - own);
          if (Math.min(gap, samples.length - gap) < Math.ceil(300 / c.track.spacing)) return;
          expect(Math.hypot(q.x - px, q.y - py)).toBeGreaterThan(HALF_WIDTH + 10);
        });
      }
    }
  });
});

describe('the city of lights round Neon Strip', () => {
  it('stands only there', () => {
    for (const l of LAYOUTS) if (l !== VEGAS) expect(l.neon).toBeUndefined();
  });

  it('has its towers behind the barriers, in sight of the track, clear of the pits and the grandstands', () => {
    const towers = towersOf(c);
    expect(towers.length).toBeGreaterThan(300);
    for (const b of towers) {
      const d = fromTrack(b);
      expect(d).toBeGreaterThan(reach);
      expect(d).toBeLessThan(reach + NEON.keep + NEON.reach + 1);
      for (const q of c.pit.points) expect(Math.hypot(q.x - b.x, q.y - b.y)).toBeGreaterThanOrEqual(100);
    }
    for (const s of standsOf(c)) for (const b of towers) expect(Math.abs(s.x - b.x) > (b.w + 20) / 2 || Math.abs(s.y - b.y) > (b.d + 20) / 2).toBe(true);
  });

  it('has its landmarks by the track, clear of it, hiding none of it from the camera', () => {
    const n = neonOf(c)!;
    for (const k of ['sphere', 'wheel', 'pyramid'] as const) {
      const size = k === 'sphere' ? NEON.sphere : k === 'wheel' ? NEON.wheel : NEON.pyramid * Math.SQRT2;
      const d = fromTrack(n[k]);
      expect(d).toBeGreaterThan(reach + size);
      expect(d).toBeLessThan(reach + size + 260);
      expect(landmarkHides(c, k)).toBe(false);
    }
  });
});
