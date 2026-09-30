// A circuit from its layout (layouts.ts). Pure layout (no rendering): the
// track's tiles, run-off, heights and starting grid.

import type { Grid } from '../engine/sim';
import type { CircuitLayout } from './layouts';
import { PIT, between, buildPitLane, type PitLane } from './pits';
import { buildTrack, type Track } from './racing';

export const TILE = 16;
/** px from the centreline to the track edge */
export const HALF_WIDTH = 44;
/** px of run-off (grass or gravel) beyond the track edge before the barriers */
export const RUNOFF = 72;
/** |curvature| (1/px) from which a bend is tight: kerbed, with gravel on the outside, and a marked corner for track limits */
export const TIGHT = 1 / 260;

/** Height (px) at a share of the lap, eased between the profile's points. */
function elevationAt(profile: [number, number][], share: number): number {
  for (let i = 1; i < profile.length; i++) {
    const [s0, h0] = profile[i - 1];
    const [s1, h1] = profile[i];
    if (share <= s1) {
      const t = (share - s0) / (s1 - s0);
      return h0 + (h1 - h0) * (1 - Math.cos(t * Math.PI)) * 0.5;
    }
  }
  return profile[0][1];
}

export type CircuitCell = 'track' | 'kerb' | 'grass' | 'gravel' | 'wall' | 'pit' | 'pitwall';

/** px from the lane's centre that its tiles reach: on the track's side (up to the pit wall), and away from it */
export const LANE_IN = 30;
export const LANE_OUT = 34;
/** px from the centreline where the pit wall starts, beyond the track edge */
const PIT_WALL = 50;

export interface Circuit {
  layout: CircuitLayout;
  width: number;
  height: number;
  cells: CircuitCell[];
  grid: Grid;
  track: Track;
  pit: PitLane;
  /** starting grid slots (px), pole first, all behind the line facing the way of the race */
  slots: { x: number; y: number; heading: number }[];
}

export interface CircuitOptions {
  /** how fast a bend can be taken (px/s) at a given |curvature| */
  cornerSpeed: (absCurve: number) => number;
  /** px/s² the racing line brakes at */
  decel: number;
}

export function buildCircuit(layout: CircuitLayout, opts: CircuitOptions): Circuit {
  const control = layout.points.map((p) => ({ x: p.x * layout.scale, y: p.y * layout.scale }));
  const track = buildTrack(control, 8, opts.cornerSpeed, opts.decel);
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
  // (from the samples, already shifted onto the map)
  const pit = buildPitLane(track, layout.pit);
  /** px across the pit lane (+ = away from the track) of (x, y), if it's beside the lane */
  const acrossLane = (x: number, y: number): number | undefined => {
    let best: (typeof pit.points)[0] | undefined;
    let bestD = (LANE_OUT + 24) ** 2;
    for (const q of pit.points) {
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bestD) [best, bestD] = [q, d];
    }
    return best && ((x - best.x) * Math.cos(best.dir) + (y - best.y) * Math.sin(best.dir)) * pit.side;
  };
  const cells: CircuitCell[] = [];
  for (let ty = 0; ty < H; ty++) {
    for (let tx = 0; tx < W; tx++) {
      const x = (tx + 0.5) * TILE;
      const y = (ty + 0.5) * TILE;
      const { i, d } = nearest(x, y);
      const p = track.samples[i];
      // the pit lane and its wall, beside the main straight on the pit side
      if (i >= 0 && d > HALF_WIDTH + 4) {
        const side = ((x - p.x) * Math.cos(p.dir) + (y - p.y) * Math.sin(p.dir)) * pit.side > 0;
        const across = side ? acrossLane(x, y) : undefined;
        if (side && between(i, pit.wallFrom, pit.wallTo, n) && d > PIT_WALL && d <= PIT.offset - LANE_IN) {
          cells.push('pitwall');
          continue;
        }
        if (across !== undefined && across >= -LANE_IN && across <= LANE_OUT) {
          cells.push('pit');
          continue;
        }
      }
      if (i < 0 || d > HALF_WIDTH + RUNOFF) {
        cells.push('wall');
        continue;
      }
      const tight = Math.abs(p.curve) > TIGHT;
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
        sum += w * elevationAt(layout.elevation, i / n);
        wsum += w;
      }
      heights.push(wsum ? sum / wsum : 0);
    }
  }

  const grid: Grid = {
    width: W,
    height: H,
    tile: TILE,
    solid: cells.map((c) => c === 'wall' || c === 'pitwall'),
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

  return { layout, width: W, height: H, cells, grid, track, pit, slots };
}
