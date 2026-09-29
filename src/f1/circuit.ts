// "Amimo Park": the F1 demo's circuit, inspired by Istanbul Park. Anticlockwise,
// like the real one: a downhill Turn 1 left and Turn 2 right, a fast sweeping
// Turn 3, a twisty middle section, the long four-apex Turn 8 left, the Turn 9–10
// esses, a long back straight with a kink, a heavy-braking Turn 12, and the
// Turn 13–14 chicane onto the main straight. Pure layout (no rendering): the
// track's tiles, run-off, heights and starting grid.

import type { Grid } from '../engine/sim';
import { buildTrack, type Pt, type Track } from './racing';

export const TILE = 16;
/** px from the centreline to the track edge */
export const HALF_WIDTH = 44;
/** px of run-off (grass or gravel) beyond the track edge before the barriers */
export const RUNOFF = 72;

/** Centreline control points (px, before scaling), in racing order. The first is the start/finish line. */
const RAW: Pt[] = [
  // main straight, running north up the east side
  { x: 2300, y: 1000 },
  { x: 2300, y: 700 },
  // T1: downhill left
  { x: 2270, y: 470 },
  { x: 2170, y: 390 },
  // T2: right
  { x: 2040, y: 380 },
  { x: 1960, y: 300 },
  // T3: long fast left
  { x: 1850, y: 210 },
  { x: 1680, y: 210 },
  { x: 1560, y: 290 },
  // T4–T7: the twisty middle
  { x: 1440, y: 420 },
  { x: 1330, y: 560 },
  { x: 1180, y: 600 },
  { x: 1030, y: 540 },
  { x: 890, y: 590 },
  { x: 720, y: 700 },
  // T8: the long four-apex left, round the west end
  { x: 540, y: 720 },
  { x: 380, y: 800 },
  { x: 290, y: 980 },
  { x: 330, y: 1160 },
  { x: 460, y: 1280 },
  { x: 640, y: 1300 },
  // T9–T10: right, left
  { x: 790, y: 1360 },
  { x: 900, y: 1450 },
  // back straight with the T11 kink
  { x: 1100, y: 1480 },
  { x: 1500, y: 1460 },
  { x: 1900, y: 1490 },
  // T12: heavy braking, left
  { x: 2140, y: 1500 },
  { x: 2210, y: 1420 },
  // T13–T14 chicane
  { x: 2220, y: 1320 },
  { x: 2290, y: 1260 },
  { x: 2300, y: 1150 },
];

/** Scale of the layout: a lap is about 7600 px, about 24 s in an F1 car. */
const SCALE = 1.35;
export const CONTROL: Pt[] = RAW.map((p) => ({ x: p.x * SCALE, y: p.y * SCALE }));

/** Elevation (px) along the lap, as [share of the lap, height]: the dip through T1, climbs round T3 and T8. */
const ELEVATION: [number, number][] = [
  [0, 22],
  [0.06, 24],
  [0.1, 4],
  [0.16, 2],
  [0.24, 18],
  [0.36, 14],
  [0.46, 6],
  [0.58, 20],
  [0.7, 12],
  [0.84, 10],
  [0.94, 18],
  [1, 22],
];

function elevation(share: number): number {
  for (let i = 1; i < ELEVATION.length; i++) {
    const [s0, h0] = ELEVATION[i - 1];
    const [s1, h1] = ELEVATION[i];
    if (share <= s1) {
      const t = (share - s0) / (s1 - s0);
      return h0 + (h1 - h0) * (1 - Math.cos(t * Math.PI)) * 0.5;
    }
  }
  return ELEVATION[0][1];
}

export type CircuitCell = 'track' | 'kerb' | 'grass' | 'gravel' | 'wall';

export interface Circuit {
  width: number;
  height: number;
  cells: CircuitCell[];
  grid: Grid;
  track: Track;
  /** starting grid slots (px), pole first, all behind the line facing the way of the race */
  slots: { x: number; y: number; heading: number }[];
}

export interface CircuitOptions {
  /** how fast a bend can be taken (px/s) at a given |curvature| */
  cornerSpeed: (absCurve: number) => number;
  /** px/s² the racing line brakes at */
  decel: number;
}

export function buildCircuit(opts: CircuitOptions): Circuit {
  const track = buildTrack(CONTROL, 8, opts.cornerSpeed, opts.decel);
  const margin = HALF_WIDTH + RUNOFF + 64;
  const minX = Math.min(...track.samples.map((p) => p.x)) - margin;
  const minY = Math.min(...track.samples.map((p) => p.y)) - margin;
  // shift everything so the map starts at (0, 0), on whole tiles
  const ox = Math.floor(minX / TILE) * TILE;
  const oy = Math.floor(minY / TILE) * TILE;
  for (const p of track.samples) {
    p.x -= ox;
    p.y -= oy;
  }
  const W = Math.ceil((Math.max(...track.samples.map((p) => p.x)) + margin) / TILE);
  const H = Math.ceil((Math.max(...track.samples.map((p) => p.y)) + margin) / TILE);

  // spatial hash of samples, 64 px buckets, for nearest-centreline lookups
  const B = 64;
  const buckets = new Map<string, number[]>();
  track.samples.forEach((p, i) => {
    const key = `${Math.floor(p.x / B)},${Math.floor(p.y / B)}`;
    (buckets.get(key) ?? buckets.set(key, []).get(key)!).push(i);
  });
  const near = (x: number, y: number, r: number) => {
    const out: number[] = [];
    const bx = Math.floor(x / B);
    const by = Math.floor(y / B);
    const rb = Math.ceil(r / B);
    for (let j = by - rb; j <= by + rb; j++) for (let i = bx - rb; i <= bx + rb; i++) out.push(...(buckets.get(`${i},${j}`) ?? []));
    return out;
  };
  const nearest = (x: number, y: number) => {
    let best = -1;
    let bestD = Infinity;
    for (const i of near(x, y, HALF_WIDTH + RUNOFF + 16)) {
      const p = track.samples[i];
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    }
    return { i: best, d: Math.sqrt(bestD) };
  };

  const n = track.samples.length;
  const cells: CircuitCell[] = [];
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const x = (tx + 0.5) * TILE;
      const y = (ty + 0.5) * TILE;
      const { i, d } = nearest(x, y);
      if (i < 0 || d > HALF_WIDTH + RUNOFF) {
        cells.push('wall');
        continue;
      }
      const p = track.samples[i];
      const tight = Math.abs(p.curve) > 1 / 260;
      if (d <= HALF_WIDTH - 6) cells.push('track');
      else if (d <= HALF_WIDTH + 4) cells.push(tight ? 'kerb' : 'track');
      else {
        // gravel on the outside of tight bends, where a car that runs wide ends up
        const side = (x - p.x) * Math.cos(p.dir) + (y - p.y) * Math.sin(p.dir);
        const outside = p.curve > 0 ? side < 0 : side > 0;
        cells.push(tight && outside ? 'gravel' : 'grass');
      }
    }
  }

  // heights at tile corners: blended from the centreline's elevation nearby
  const heights: number[] = [];
  for (let cy = 0; cy <= H; cy++) {
    for (let cx = 0; cx <= W; cx++) {
      const x = cx * TILE;
      const y = cy * TILE;
      let sum = 0;
      let wsum = 0;
      for (const i of near(x, y, 200)) {
        const p = track.samples[i];
        const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (d2 > 200 * 200) continue;
        const w = 1 / (d2 + 400);
        sum += w * elevation(i / n);
        wsum += w;
      }
      heights.push(wsum ? sum / wsum : 0);
    }
  }

  const grid: Grid = {
    width: W,
    height: H,
    tile: TILE,
    solid: cells.map((c) => c === 'wall'),
    rough: cells.map((c) => c === 'grass' || c === 'gravel'),
    heights,
  };

  // starting grid: two staggered columns behind the line
  const slots = Array.from({ length: 10 }, (_, k) => {
    const back = 24 + k * 30;
    const p = track.samples[(n - Math.round(back / track.spacing)) % n];
    const lane = k % 2 === 0 ? -16 : 16;
    return { x: p.x + Math.cos(p.dir) * lane, y: p.y + Math.sin(p.dir) * lane, heading: p.dir };
  });

  return { width: W, height: H, cells, grid, track, slots };
}
