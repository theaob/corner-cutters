// Where a circuit's grandstands stand: three along the main straight behind
// the start line (across the straight from the pits), and on a circuit in the
// country one on the outside of each kerbed bend, behind the run-off, facing
// the track at the apex, where the crowd sees the braking and the overtakes.
// Each is clear of the track, the pits and the other stands, and never so tall
// that it hides the track from the camera (looking down from the south).

import { HALF_WIDTH, RUNOFF, TILE, type Circuit } from './circuit';
import { markCorners } from './trackLimits';
import { seeOver } from './town3d';
import { GARAGE_ACROSS, PIT } from './pits';
import { inLake, lakesOf } from './lakes';
import { nearLava, volcanoOf } from './volcano';

export interface Stand {
  /** its middle on the map */
  x: number;
  y: number;
  /** the track's direction beside it (the stand runs along it), and which side of the track it's on (+1: the right) */
  dir: number;
  side: -1 | 1;
  /** px along the track */
  len: number;
  /** at the start line, or by a bend */
  at: 'start' | 'bend';
}

export const STAND = {
  // (to the cars' scale: a car is 14 px across and 30 long, a spectator about 10 high, and the rows of seats rise
  // in steps about the height of a stair, as they do beside a real track)
  /** px deep (back from the track: its terraces and its back wall) and high (with its roof), and long by a bend */
  depth: 56,
  height: 46,
  len: 220,
  /** px deep its back wall (at the back of the footprint, the terraces in front of it) */
  wall: 14,
  /** and with its flags on top, px high */
  flags: 62,
  /** px between the run-off's edge and its front */
  gap: 40,
  /** px between stands, at the least, and from the pit lane */
  apart: 170,
  clearOfPits: 110,
};

/** The four corners of a stand's footprint (for the checks). */
function corners(s: Stand): { x: number; y: number }[] {
  const ax = { x: Math.sin(s.dir), y: -Math.cos(s.dir) };
  const ac = { x: Math.cos(s.dir), y: Math.sin(s.dir) };
  return [-1, 1].flatMap((u) => [-1, 1].map((v) => ({ x: s.x + ax.x * (u * s.len) / 2 + ac.x * (v * STAND.depth) / 2, y: s.y + ax.y * (u * s.len) / 2 + ac.y * (v * STAND.depth) / 2 })));
}

/**
 * Whether a stand's footprint is on open ground: every point of it (and a tile round it) on plain ground beyond the
 * barriers, none on or beside the run-off, the barriers (the first ring of wall tiles), the pit lane or its wall.
 */
function onOpenGround(circuit: Circuit, s: Stand): boolean {
  const { width: W, height: H, cells } = circuit;
  const ax = { x: Math.sin(s.dir), y: -Math.cos(s.dir) };
  const ac = { x: Math.cos(s.dir), y: Math.sin(s.dir) };
  const step = TILE / 2;
  for (let u = -s.len / 2; u <= s.len / 2 + 0.01; u += step) {
    for (let v = -STAND.depth / 2; v <= STAND.depth / 2 + 0.01; v += step) {
      const tx = Math.floor((s.x + ax.x * u + ac.x * v) / TILE);
      const ty = Math.floor((s.y + ax.y * u + ac.y * v) / TILE);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const i = tx + dx;
          const j = ty + dy;
          if (i >= 0 && j >= 0 && i < W && j < H && cells[j * W + i] !== 'wall') return false;
        }
      }
    }
  }
  return true;
}

/** A circuit's grandstands. */
export function standsOf(circuit: Circuit): Stand[] {
  const { track, pit, layout } = circuit;
  const samples = track.samples;
  const n = samples.length;
  const runoff = layout.street?.runoff ?? RUNOFF;
  const out = HALF_WIDTH + runoff + STAND.gap + STAND.depth / 2;
  const fromTrack = (x: number, y: number) => Math.min(...samples.map((p) => Math.hypot(p.x - x, p.y - y)));
  /** clear of every stretch of the track and its run-off (another can pass close behind a stand, round a bend), and out of any lake */
  const lakes = lakesOf(circuit);
  const volcano = volcanoOf(circuit);
  const clear = (s: Stand) => [...corners(s), s].every((c) => fromTrack(c.x, c.y) >= HALF_WIDTH + runoff + 8 && !inLake(lakes, c.x, c.y, 20) && !nearLava(volcano, c.x, c.y, 20)) && onOpenGround(circuit, s);
  // the main straight's: three side by side behind the start line, across from the pits; one with another stretch
  // of track close behind it moves on back along the straight (and, as a last resort, over to the pit side, past
  // the garages)
  const side = -pit.side as -1 | 1;
  const stands: Stand[] = [];
  const startStand = (k: number, sd: -1 | 1): Stand => {
    const p = samples[(n - 20 - k * 8 + 4 * n) % n];
    const lat = (sd === side ? HALF_WIDTH + runoff + STAND.gap + STAND.depth / 2 : PIT.offset + GARAGE_ACROSS + 40 + STAND.depth / 2) * sd;
    return { x: p.x + Math.cos(p.dir) * lat, y: p.y + Math.sin(p.dir) * lat, dir: p.dir, side: sd, len: STAND.len, at: 'start' };
  };
  for (const sd of [side, -side as -1 | 1]) {
    for (let k = 0; k < 36 && stands.length < 3; k++) {
      // (on the straight: not round the bend before it)
      if (Math.abs(samples[(n - 20 - k * 8 + 4 * n) % n].curve) >= 1 / 700) break;
      const s = startStand(k, sd);
      if (clear(s) && stands.every((o) => Math.hypot(o.x - s.x, o.y - s.y) >= s.len)) stands.push(s);
    }
  }
  // (a street circuit's bends have its town round them instead)
  if (layout.street) return stands;
  const fits = (s: Stand) => {
    const box = corners(s);
    // clear of the track and its run-off (another part of the track can pass close by, round a bend)
    if (!clear(s)) return false;
    if (pit.points.some((q) => Math.hypot(q.x - s.x, q.y - s.y) < STAND.clearOfPits)) return false;
    if (stands.some((o) => Math.hypot(o.x - s.x, o.y - s.y) < STAND.apart)) return false;
    // and the camera sees over it, flags and all
    const xs = box.map((c) => c.x);
    const ys = box.map((c) => c.y);
    const w = Math.max(...xs) - Math.min(...xs);
    const d = Math.max(...ys) - Math.min(...ys);
    return seeOver(circuit, (Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2, w, d) >= STAND.flags;
  };
  for (const k of markCorners(track)) {
    const outside = -k.side as -1 | 1;
    // at the apex, or failing that where the bend begins or ends
    const span = (((k.to - k.from) % n) + n) % n;
    for (const at of [k.apex, (k.from + Math.round(span * 0.25)) % n, (k.from + Math.round(span * 0.75)) % n]) {
      const p = samples[at];
      const s: Stand = { x: p.x + Math.cos(p.dir) * out * outside, y: p.y + Math.sin(p.dir) * out * outside, dir: p.dir, side: outside, len: STAND.len, at: 'bend' };
      if (!fits(s)) continue;
      stands.push(s);
      break;
    }
  }
  return stands;
}
