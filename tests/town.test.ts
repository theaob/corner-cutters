import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HD2D_VIEW } from '../src/engine/look';
import { seededRandom } from '../src/engine/rng';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { IN_VIEW, inside, landmarksOf, seaOf, seeOver, townBlocks } from '../src/f1/town3d';
import { HARBOUR } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';

const f1 = carClass('f1');

describe('the harbour town', () => {
  const c = buildCircuit(HARBOUR, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const samples = c.track.samples;
  const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
  const reach = HALF_WIDTH + HARBOUR.street!.runoff;
  const sea = seaOf(c)!;
  const marks = landmarksOf(c);
  const blocks = townBlocks(c, sea, fromTrack, reach + 40, seededRandom(29), marks);
  it('is an old town: a few hundred houses, several storeys tall, packed in right behind the barriers, with towers and battlements among them', () => {
    expect(blocks.length).toBeGreaterThan(200);
    expect(blocks.filter((b) => b.h >= 36).length).toBeGreaterThan(80);
    // (the landmarks have some of the frontage)
    expect(blocks.filter((b) => fromTrack(b.x, b.y) < reach + 60).length).toBeGreaterThan(30);
    expect(blocks.filter((b) => b.top === 'spire').length).toBeGreaterThan(3);
    expect(blocks.filter((b) => b.top === 'battlements').length).toBeGreaterThan(20);
  });
  it('stands on the land, off the track and its barriers', () => {
    for (const b of blocks) {
      expect(inside(sea, b.x, b.y)).toBe(false);
      expect(fromTrack(b.x, b.y) - Math.hypot(b.w, b.d) / 2).toBeGreaterThan(reach - 30);
    }
  });
  it('never hides the track from the camera (looking down from the south, over the blocks)', () => {
    const hides = 1 / Math.tan((HD2D_VIEW.pitch * Math.PI) / 180);
    for (const b of blocks) {
      for (const p of samples) {
        // track behind the block's front, in line with it: further than the ground the block hides
        if (Math.abs(p.x - b.x) > b.w / 2 + reach || p.y + reach > b.y - b.d / 2) continue;
        expect(b.y - b.d / 2 - (p.y + reach)).toBeGreaterThan(b.h * hides);
      }
    }
  });

  describe('its landmarks', () => {
    it('are the casino, an open-air pool and a tennis court', () => {
      expect(marks.map((l) => l.kind).sort()).toEqual(['casino', 'pool', 'tennis']);
    });
    it('stand on land, clear of the track and its barriers', () => {
      for (const l of marks) {
        for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) expect(inside(sea, l.x + (dx * l.w) / 2, l.y + (dy * l.d) / 2)).toBe(false);
        for (const p of samples) expect(Math.abs(p.x - l.x) > l.w / 2 + reach || Math.abs(p.y - l.y) > l.d / 2 + reach).toBe(true);
      }
    });
    it('are each in the picture as you drive by: the camera shows little either side of a phone, more up and down', () => {
      for (const l of marks) {
        const seen = Math.max(...samples.map((p) => Math.min(1 - Math.abs(p.x - l.x) / IN_VIEW.across, 1 - Math.abs(p.y - l.y) / IN_VIEW.along)));
        expect(seen).toBeGreaterThan(0.15);
      }
    });
    it('the casino stands by the hairpin, and never hides the track from the camera', () => {
      const casino = marks.find((l) => l.kind === 'casino')!;
      // (the hairpin: the tightest bend on the lap)
      const hairpin = [...samples].sort((a, b) => Math.abs(b.curve) - Math.abs(a.curve))[0];
      expect(Math.hypot(hairpin.x - casino.x, hairpin.y - casino.y)).toBeLessThan(400);
      expect(casino.h).toBeLessThan(seeOver(c, casino.x, casino.y, casino.w, casino.d));
    });
    it('have no houses built on them', () => {
      for (const l of marks) for (const b of blocks) expect(Math.abs(b.x - l.x) >= (b.w + l.w) / 2 || Math.abs(b.y - l.y) >= (b.d + l.d) / 2).toBe(true);
    });
  });
});
