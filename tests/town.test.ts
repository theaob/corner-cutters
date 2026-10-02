import { describe, expect, it } from 'vitest';
import { carClass } from '../src/engine/driving';
import { HD2D_VIEW } from '../src/engine/look';
import { seededRandom } from '../src/engine/rng';
import { HALF_WIDTH, buildCircuit } from '../src/f1/circuit';
import { CASTLE, SEEN, castleFootprints, castleOf, inView, inside, landmarksOf, seaOf, seeOver, townBlocks } from '../src/f1/town3d';
import { BAKU, HARBOUR } from '../src/f1/layouts';
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
    it('are each at least half in the picture at once as you drive by (not a corner at its edge): the camera shows little either side of a phone, more up and down', () => {
      for (const l of marks) {
        expect(inView(samples, l.x, l.y, l.w, l.d), l.kind).toBeGreaterThanOrEqual(SEEN[l.kind]);
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

describe('Caspian Shores (Baku)', () => {
  const c = buildCircuit(BAKU, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });
  const samples = c.track.samples;
  const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
  const reach = HALF_WIDTH + BAKU.street!.runoff;
  const sea = seaOf(c)!;
  const marks = landmarksOf(c);
  const castle = castleOf(c);
  const blocks = townBlocks(c, sea, fromTrack, reach + 40, seededRandom(29), [...marks, ...castleFootprints(castle)]);
  it('has Qız Qalası (the Maiden Tower) and the Flame Towers', () => {
    expect(marks.map((l) => l.kind).sort()).toEqual(['flames', 'maiden']);
  });
  it('stand on land, clear of the track, seen as you drive by, with no houses on them, never hiding the track', () => {
    for (const l of marks) {
      for (const [dx, dy] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) expect(inside(sea, l.x + (dx * l.w) / 2, l.y + (dy * l.d) / 2)).toBe(false);
      for (const p of samples) expect(Math.abs(p.x - l.x) > l.w / 2 + reach || Math.abs(p.y - l.y) > l.d / 2 + reach).toBe(true);
      expect(inView(samples, l.x, l.y, l.w, l.d), l.kind).toBeGreaterThanOrEqual(SEEN[l.kind]);
      expect(l.h, l.kind).toBeLessThanOrEqual(seeOver(c, l.x, l.y, l.w, l.d));
      for (const b of blocks) expect(Math.abs(b.x - l.x) >= (b.w + l.w) / 2 || Math.abs(b.y - l.y) >= (b.d + l.d) / 2).toBe(true);
    }
  });
  it('stand where the layout puts them: the Maiden Tower by the castle section, the Flame Towers on the hill north-west of it', () => {
    for (const l of marks) {
      const want = BAKU.street!.landmarks![l.kind]!;
      expect(Math.hypot(l.x - (want.x * BAKU.scale - c.offset.x), l.y - (want.y * BAKU.scale - c.offset.y)), l.kind).toBeLessThan(200);
    }
  });
  describe('its old city walls', () => {
    it('run a long way along the castle section, with round towers along them and a gate tower', () => {
      const length = castle.walls.reduce((a, w) => a + Math.hypot(w.x2 - w.x1, w.y2 - w.y1), 0);
      expect(length).toBeGreaterThan(1000);
      expect(castle.towers.length).toBeGreaterThanOrEqual(6);
      expect(castle.towers.filter((t) => t.gate)).toHaveLength(1);
    });
    it('stand behind the barriers, clear of every stretch of track, and never hide the track from the camera', () => {
      for (const w of castle.walls) {
        for (const [x, y] of [[w.x1, w.y1], [w.x2, w.y2]]) expect(fromTrack(x, y)).toBeGreaterThan(reach + CASTLE.thick / 2);
        expect(w.h).toBeLessThanOrEqual(seeOver(c, (w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, Math.abs(w.x2 - w.x1) + CASTLE.thick, Math.abs(w.y2 - w.y1) + CASTLE.thick));
      }
      for (const t of castle.towers) {
        expect(fromTrack(t.x, t.y)).toBeGreaterThan(reach);
        expect(t.h).toBeLessThanOrEqual(seeOver(c, t.x, t.y, 2 * t.r, 2 * t.r));
      }
    });
    it('have no houses built on them', () => {
      for (const f of castleFootprints(castle)) for (const b of blocks) expect(Math.abs(b.x - f.x) >= (b.w + f.w) / 2 || Math.abs(b.y - f.y) >= (b.d + f.d) / 2).toBe(true);
    });
  });
});
