import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HD2D_VIEW } from '../src/engine/look';
import { seededRandom } from '../src/engine/rng';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { seaOf, inside, townBlocks } from '../src/f1/circuitScene';
import { HARBOUR } from '../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';

const f1 = carClass('f1');

describe('the harbour town', () => {
  const c = buildCircuit(HARBOUR, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const samples = c.track.samples;
  const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
  const reach = HALF_WIDTH + HARBOUR.street!.runoff;
  const sea = seaOf(c)!;
  const blocks = townBlocks(c, sea, fromTrack, reach + 40, seededRandom(29));
  it('is a city: a few hundred blocks of flats, several storeys tall, packed in right behind the barriers', () => {
    expect(blocks.length).toBeGreaterThan(200);
    expect(blocks.filter((b) => b.h >= 36).length).toBeGreaterThan(80);
    expect(blocks.filter((b) => fromTrack(b.x, b.y) < reach + 60).length).toBeGreaterThan(40);
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
});
