// A circuit from its layout (layouts.ts). Pure layout (no rendering): the
// track's tiles, run-off, heights and starting grid.

import { buildLevels } from './bridge';
import type { Grid } from '../engine/sim';
import type { CircuitLayout } from './layouts';
import { GARAGE_ACROSS, PIT, between, buildPitLane, type PitLane } from './pits';
import { buildTrack, type Track } from './racing';

export const TILE = 16;
/** px from the centreline to the track edge */
export const HALF_WIDTH = 44;
/** px of run-off (grass or gravel) beyond the track edge before the barriers */
export const RUNOFF = 72;
/**
 * The barrier between two stretches side by side: tiles from px past the track's edge, within px of the line midway
 * between them (a band a tile or so wide, so no gap is left where it runs at a slant across the grid)
 */
export const SPLIT = { clear: 8, band: 20 };
/** |curvature| (1/px) from which a bend is tight: kerbed, with gravel on the outside, and a marked corner for track limits */
export const TIGHT = 1 / 260;
/**
 * The kerbs: which stretches of the track have them (both sides), from its tight bends, made whole: a gap
 * shorter than `gap` px between two kerbed stretches is filled, a kerb shorter than `shortest` px (a sharp
 * spot rather than a bend) is drawn out to that round its middle, and each runs on `lead` px past the bend at
 * either end. Their
 * red-and-white stripes are `stripe` px long, measured along the kerb itself, so they're the same size round
 * the inside of a bend and the outside.
 */
export const KERB = { gap: 64, shortest: 40, lead: 16, stripe: 12, inner: HALF_WIDTH - 8, outer: HALF_WIDTH - 1 };

/** Whether each of `track`'s samples is kerbed (see KERB). */
export function kerbed(track: Track): boolean[] {
  const n = track.samples.length;
  const sp = track.spacing;
  const on = track.samples.map((p) => Math.abs(p.curve) >= TIGHT);
  if (on.every(Boolean) || !on.some(Boolean)) return on;
  // the runs of kerbed samples, round the lap (starting just after an unkerbed sample, so none wraps)
  const runsOf = (flags: boolean[]) => {
    const start = flags.findIndex((f, i) => !f && flags[(i + 1) % n]);
    const runs: [number, number][] = [];
    for (let k = 1; k <= n; k++) {
      const i = (start + k) % n;
      if (!flags[i]) continue;
      if (!flags[(i - 1 + n) % n]) runs.push([i, i]);
      else runs[runs.length - 1][1] = i;
    }
    return runs;
  };
  const len = ([a, b]: [number, number]) => ((((b - a) % n) + n) % n) + 1;
  // fill the short gaps
  let runs = runsOf(on);
  const filled = [...on];
  for (let r = 0; r < runs.length; r++) {
    const [, end] = runs[r];
    const [next] = runs[(r + 1) % runs.length];
    const gap = ((((next - end) % n) + n) % n) - 1;
    if (gap > 0 && gap * sp < KERB.gap) for (let k = 1; k <= gap; k++) filled[(end + k) % n] = true;
  }
  // no scraps, and each kerb led in and out
  runs = runsOf(filled);
  const out = new Array<boolean>(n).fill(false);
  const lead = Math.round(KERB.lead / sp);
  for (const run of runs) {
    // (a short one, a sharp spot rather than a bend: as long as the shortest kerb, round its middle)
    const short = Math.max(0, Math.ceil((KERB.shortest / sp - len(run)) / 2));
    for (let k = -lead - short; k < len(run) + lead + short; k++) out[(((run[0] + k) % n) + n) % n] = true;
  }
  // (two kerbs led out and in to within a few px of each other: one kerb)
  const joined = runsOf(out);
  for (let r = 0; r < joined.length; r++) {
    const [, end] = joined[r];
    const [next] = joined[(r + 1) % joined.length];
    const gap = ((((next - end) % n) + n) % n) - 1;
    if (gap > 0 && gap * sp < KERB.gap - 2 * KERB.lead - sp) for (let k = 1; k <= gap; k++) out[(end + k) % n] = true;
  }
  return out;
}

/** px over which a banked bend's tilt eases in and out */
export const BANK_EASE = 240;

/**
 * A jump (layout.jumps): px of run-up to its lip (the ground rising steadily to it), and px beyond over which it falls
 * back (a gentler slope than the run-up, to land on); and px past the run-off's edge over which it eases out into the
 * ground round it. The lip is sharp (laid over the ground after it's smoothed): taken at speed, a car flies off it.
 */
export const JUMP = { up: 160, down: 230, edge: 64 };

/** A jump's lift (px) of the ground `d` px along the lap from its lip (− before it), for a jump `rise` px high. */
export function jumpLift(d: number, rise: number): number {
  if (d <= -JUMP.up || d >= JUMP.down) return 0;
  return d <= 0 ? rise * (1 + d / JUMP.up) : rise * (1 - d / JUMP.down);
}

/** Height (px) at a share of the lap, eased between the profile's points. */
export function elevationAt(profile: [number, number][], share: number): number {
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

/** ('apron': a banked bend's concrete run-off, smooth like the track) */
export type CircuitCell = 'track' | 'kerb' | 'grass' | 'gravel' | 'apron' | 'wall' | 'pit' | 'pitwall';

/** px from the lane's centre that its tiles reach: on the track's side (up to the pit wall), and away from it */
export const LANE_IN = 42;
export const LANE_OUT = 56;
/**
 * px from the lane's centre that its tiles reach away from the track, where its centre is `off` px out from the
 * track's centreline: at the join, only to the track's own edge (the road leaves the track flush with it, the edge
 * running on unbroken), widening to the lane's full reach as the road moves out to the pit wall.
 */
export function laneOut(off: number): number {
  const t = Math.max(0, Math.min(1, (off - PIT.joinAt) / (PIT.offset - PIT.joinAt)));
  return HALF_WIDTH - off + (PIT.offset + LANE_OUT - HALF_WIDTH) * t;
}
/** px from the centreline where the pit wall starts, beyond the track edge */
/** px past the garages' middle that the levelled pit area reaches, the px it takes to ease back to the surrounding ground, and the px from the track's edge it takes to ease in */
const PIT_PAD = { back: 24, fade: 60, edge: PIT.offset - LANE_IN - HALF_WIDTH };
export const PIT_WALL = PIT.offset - LANE_IN - 18;

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
  /** how steeply the ground tilts across the track at each sample (rise per px to the right, from the inside edge up; 0 off a banked bend) */
  bank: Float32Array;
  /** px the layout was moved by to put the map at (0, 0): a point of the layout (scaled) is here at its own minus this */
  offset: { x: number; y: number };
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
  track.tyreWear = layout.tyreWear;
  if (layout.dirt) track.dirt = true;
  // (room round the track for its run-off, or for the pit lane and its garages)
  const margin = Math.max(HALF_WIDTH + RUNOFF + 64, PIT.offset + LANE_OUT + 80);
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

  // spatial hash of samples, 64 px buckets (a flat array of them, by column and row), for nearest-centreline lookups
  const B = 64;
  const bw = Math.floor(Math.max(...track.samples.map((p) => p.x)) / B) + 1;
  const bh = Math.floor(Math.max(...track.samples.map((p) => p.y)) / B) + 1;
  const buckets: number[][] = Array.from({ length: bw * bh }, () => []);
  track.samples.forEach((p, i) => buckets[Math.floor(p.y / B) * bw + Math.floor(p.x / B)].push(i));
  // (the samples near a point, row by row: filled into one array that's kept, so a lookup makes none; used up before the next one's made)
  const found: number[] = [];
  const near = (x: number, y: number, r: number) => {
    found.length = 0;
    const bx = Math.floor(x / B);
    const by = Math.floor(y / B);
    const rb = Math.ceil(r / B);
    for (let j = Math.max(0, by - rb); j <= Math.min(bh - 1, by + rb); j++) {
      for (let i = Math.max(0, bx - rb); i <= Math.min(bw - 1, bx + rb); i++) for (const k of buckets[j * bw + i]) found.push(k);
    }
    return found;
  };
  /** px from the centreline the nearest-sample lookup reaches: past the run-off, and past the pit lane */
  const REACH = Math.max(HALF_WIDTH + RUNOFF, PIT.offset + LANE_OUT) + 16;
  const nearest = (x: number, y: number) => {
    let best = -1;
    let bestD = Infinity;
    for (const i of near(x, y, REACH)) {
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
  const acrossLane = (x: number, y: number): { across: number; out: number } | undefined => {
    let best: (typeof pit.points)[0] | undefined;
    let bestD = (LANE_OUT + 24) ** 2;
    for (const q of pit.points) {
      const d = (q.x - x) ** 2 + (q.y - y) ** 2;
      if (d < bestD) [best, bestD] = [q, d];
    }
    return best && { across: ((x - best.x) * Math.cos(best.dir) + (y - best.y) * Math.sin(best.dir)) * pit.side, out: laneOut(best.off) };
  };
  /** px from the track's edge to the walls: the run-off, or a street circuit's pavement */
  const runoff = layout.street?.runoff ?? RUNOFF;
  /** samples along the lap within which a sample is the same stretch (past them, another stretch, if it's near) */
  const sameStretch = Math.ceil((3 * (HALF_WIDTH + runoff)) / track.spacing);
  /** the nearest sample to (x, y) on another stretch of the lap than sample `i`'s, within the run-off, if any */
  const otherStretch = (x: number, y: number, i: number) => {
    let best = -1;
    let bestD = (HALF_WIDTH + runoff + SPLIT.band) ** 2;
    for (const j of near(x, y, HALF_WIDTH + runoff + SPLIT.band)) {
      const along = Math.abs(j - i);
      if (Math.min(along, n - along) <= sameStretch) continue;
      const p = track.samples[j];
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bestD) [best, bestD] = [j, d];
    }
    return best < 0 ? undefined : { i: best, d: Math.sqrt(bestD) };
  };
  // a banked bend: how steeply the ground tilts across the track at each sample (easing in and out over
  // BANK_EASE px at its ends), up toward the outside of the bend
  const bank = new Float32Array(n);
  // (one banked bend, or several: each tilted up toward its own outside)
  for (const { from, to, grade } of [layout.banking ?? []].flat()) {
    const span = (((to - from) % track.length) + track.length) % track.length;
    let turn = 0;
    const these: number[] = [];
    track.samples.forEach((p, i) => {
      const along = (((p.s - from) % track.length) + track.length) % track.length;
      if (along > span) return;
      const ease = Math.min(1, along / BANK_EASE, (span - along) / BANK_EASE);
      bank[i] = grade * ease * ease * (3 - 2 * ease);
      these.push(i);
      turn += p.curve;
    });
    // (a right-hander's outside is on the left)
    const outside = turn > 0 ? -1 : 1;
    for (const i of these) bank[i] *= outside;
  }
  const kerbs = kerbed(track);
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
        const lane = side ? acrossLane(x, y) : undefined;
        if (side && between(i, pit.wallFrom, pit.wallTo, n) && d > PIT_WALL && d <= PIT.offset - LANE_IN) {
          cells.push('pitwall');
          continue;
        }
        if (lane && lane.across >= -LANE_IN && lane.across <= lane.out) {
          cells.push('pit');
          continue;
        }
        // (on a street circuit, nothing walls the track off from its pit lane: pavement between, as on any circuit's run-off)
        if (layout.street && side && between(i, pit.entry, pit.exit, n) && d <= PIT.offset) {
          cells.push('grass');
          continue;
        }
      }
      if (i < 0 || d > HALF_WIDTH + runoff) {
        cells.push('wall');
        continue;
      }
      // two stretches of the lap side by side, their run-offs meeting (Suzuka's figure of eight round its crossing): a
      // barrier down the middle between them, so no one drives across from one to the other (never on either road: at
      // a bridge's crossing it stands in the angles between them)
      if (d > HALF_WIDTH + SPLIT.clear) {
        const o = otherStretch(x, y, i);
        if (o && o.d - d <= SPLIT.band) {
          cells.push('wall');
          continue;
        }
      }
      const tight = Math.abs(p.curve) > TIGHT;
      const kerb = kerbs[i];
      // (a banked bend: concrete from the track's edge to the walls)
      if (Math.abs(bank[i]) > 0.02 && d > HALF_WIDTH + 4) {
        cells.push('apron');
        continue;
      }
      // (a street circuit: pavement up to the walls, no gravel)
      if (layout.street && d > HALF_WIDTH + 4) {
        cells.push('grass');
        continue;
      }
      if (d <= HALF_WIDTH - 6) cells.push('track');
      else if (d <= HALF_WIDTH + 4) cells.push(kerb ? 'kerb' : 'track');
      else {
        // gravel on the outside of tight bends, where a car that runs wide ends up
        const side = (x - p.x) * Math.cos(p.dir) + (y - p.y) * Math.sin(p.dir);
        const outside = p.curve > 0 ? side < 0 : side > 0;
        cells.push(tight && outside ? 'gravel' : 'grass');
      }
    }
  }

  /** px the ground at (x, y) is raised by sample i's banking: flat up to the inside edge of the track, rising from there in proportion to how far across it is, out to the walls */
  const banked = (i: number, x: number, y: number) => {
    if (!bank[i]) return 0;
    const p = track.samples[i];
    const across = (x - p.x) * Math.cos(p.dir) + (y - p.y) * Math.sin(p.dir);
    const out = across * Math.sign(bank[i]);
    return Math.abs(bank[i]) * Math.max(0, Math.min(HALF_WIDTH + runoff, out) + HALF_WIDTH);
  };

  // (each sample's height on the profile, worked out once: not again for every tile corner it's near)
  const rise = track.samples.map((_, i) => elevationAt(layout.elevation, i / n));
  // heights at tile corners: blended from the centreline's elevation (and banking) nearby
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
        sum += w * (rise[i] + banked(i, x, y));
        wsum += w;
      }
      heights.push(wsum ? sum / wsum : 0);
    }
  }
  // the pit area levelled: across the lane and the garages behind it, the ground at the height of the road beside it
  // (not sloping away from it, which left the garages standing out of the ground or above it), easing back to the
  // surrounding ground beyond them
  const padReach = GARAGE_ACROSS + PIT_PAD.back;
  const padNear = padReach + PIT.offset + PIT_PAD.fade;
  // (which samples are the lane's own stretch, once; and the box they lie in, with the lookup's reach round it: a corner outside it has none of them in reach, and is left as it is)
  const inLane = track.samples.map((_, i) => between(i, pit.entry, pit.exit, n));
  const lane = track.samples.filter((_, i) => inLane[i]);
  const padBox = padNear + 2 * B;
  const box = {
    x0: Math.min(...lane.map((p) => p.x)) - padBox,
    x1: Math.max(...lane.map((p) => p.x)) + padBox,
    y0: Math.min(...lane.map((p) => p.y)) - padBox,
    y1: Math.max(...lane.map((p) => p.y)) + padBox,
  };
  for (let cy = 0; cy <= H; cy++) {
    for (let cx = 0; cx <= W; cx++) {
      const x = cx * TILE;
      const y = cy * TILE;
      if (lane.length && (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1)) continue;
      let best = -1;
      let bestD = Infinity;
      // (the lane's own stretch of the lap: another stretch passing nearby isn't what it's level with, and where it is
      // on or beside that other road, the ground is left to it)
      let other = Infinity;
      for (const i of near(x, y, padNear)) {
        const p = track.samples[i];
        const d = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (!inLane[i]) other = Math.min(other, d);
        else if (d < bestD) [best, bestD] = [i, d];
      }
      if (other < (HALF_WIDTH + 30) ** 2) continue;
      if (best < 0) continue;
      const p = track.samples[best];
      const across = ((x - p.x) * Math.cos(p.dir) + (y - p.y) * Math.sin(p.dir)) * pit.side;
      if (across <= HALF_WIDTH) continue;
      // (eased in from the track's edge, so the road's own slope across it is left as it was, and out beyond the garages)
      const fade = Math.min(1, (across - HALF_WIDTH) / PIT_PAD.edge, (PIT.offset + padReach + PIT_PAD.fade - across) / PIT_PAD.fade);
      if (fade <= 0) continue;
      const at = cy * (W + 1) + cx;
      heights[at] += (rise[best] - heights[at]) * fade;
    }
  }
  // the jumps: each crest laid over the smoothed ground, across the track and its run-off, easing out beyond
  if (layout.jumps?.length) {
    const reach = HALF_WIDTH + RUNOFF + JUMP.edge;
    for (let cy = 0; cy <= H; cy++) {
      for (let cx = 0; cx <= W; cx++) {
        const { i, d } = nearest(cx * TILE, cy * TILE);
        if (i < 0 || d > reach) continue;
        const fade = Math.min(1, (reach - d) / JUMP.edge);
        const s = track.samples[i].s;
        let lift = 0;
        for (const j of layout.jumps) {
          let along = s - j.at;
          if (along > track.length / 2) along -= track.length;
          if (along < -track.length / 2) along += track.length;
          lift += jumpLift(along, j.rise);
        }
        heights[cy * (W + 1) + cx] += lift * fade;
      }
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

  // a bridge, where the track crosses itself: the deck's own grid
  if (layout.bridge) track.levels = buildLevels(track, grid, layout.bridge);

  return { layout, width: W, height: H, cells, grid, track, pit, slots, bank, offset: { x: ox, y: oy } };
}
