import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { LAYOUTS, VEGAS } from '../src/f1/layouts';
import { NEON, landmarkHides, neonOf, towersOf } from '../src/f1/neonCity';
import { NIGHT, lampsOf, nightSky } from '../src/f1/night';
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
      expect(n.background).toBe(0x0b0a24);
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
