// The Harbour's marina: wooden pontoons out from the quay into the sea, yachts
// moored along both sides of each, and a few boats out on the water going round.
// It stands where the sea's edge is best seen from the track (on a phone the
// camera shows little either side of a stretch running up the screen: see
// IN_VIEW), its pontoons clear of the track and wholly in the sea. Where
// everything goes is worked out here, engine-free; town3d.ts builds it.

import type { Circuit } from './circuit';
import { HALF_WIDTH } from './circuit';
import type { Pt } from './racing';
import { inView, inside, seaOf } from './town3d';

export const MARINA = {
  /** pontoons, px long out from the quay, and px between them along it */
  piers: 4,
  length: 120,
  apart: 70,
  /** px between moored boats along a pontoon, and out from its middle to theirs */
  berth: 26,
  out: 14,
  /** boats out on the water, going round */
  cruisers: 3,
};

export interface Pier {
  /** where it meets the quay, the way it runs out to sea (a unit vector), and how long it is */
  x: number;
  y: number;
  dx: number;
  dy: number;
  length: number;
}

export interface Berth {
  x: number;
  y: number;
  /** the way its bow points (radians, as the cars' headings: 0 up the screen) */
  heading: number;
  length: number;
  kind: 'motor' | 'sail';
}

export interface Cruise {
  /** the middle of its loop, and how far out (across and up the screen) */
  x: number;
  y: number;
  rx: number;
  ry: number;
  /** s to go round once, and where it starts */
  period: number;
  phase: number;
  length: number;
  kind: 'motor' | 'sail';
}

export interface Marina {
  piers: Pier[];
  berths: Berth[];
  cruises: Cruise[];
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** px a pontoon (and the boats along it) must keep from the middle of the track */
const keepOf = (circuit: Circuit) => HALF_WIDTH + (circuit.layout.street?.runoff ?? 72) + 20;

/** The Harbour's marina, on the map (none without a sea). */
export function marinaOf(circuit: Circuit): Marina {
  const sea = seaOf(circuit);
  if (!sea?.length) return { piers: [], berths: [], cruises: [] };
  const samples = circuit.track.samples;
  const keep = keepOf(circuit);
  const fromTrack = (x: number, y: number) => {
    let best = Infinity;
    for (let k = 0; k < samples.length; k += 2) best = Math.min(best, (samples[k].x - x) ** 2 + (samples[k].y - y) ** 2);
    return Math.sqrt(best);
  };
  /** a pontoon from (x, y) out along (dx, dy): wholly in the sea with room for its boats either side, and clear of the track */
  const fits = (x: number, y: number, dx: number, dy: number) => {
    for (let a = 8; a <= MARINA.length + 12; a += 10) {
      for (const side of [-1, 0, 1]) {
        const px = x + dx * a - dy * side * (MARINA.out + 10);
        const py = y + dy * a + dx * side * (MARINA.out + 10);
        if (!inside(sea, px, py) || fromTrack(px, py) < keep) return false;
      }
    }
    return true;
  };
  /** how much of the marina round a pontoon from (x, y) the camera shows at once from the track */
  const seen = (x: number, y: number, dx: number, dy: number) => {
    const cx = x + (dx * MARINA.length) / 2;
    const cy = y + (dy * MARINA.length) / 2;
    const w = Math.abs(dx) * MARINA.length + Math.abs(dy) * MARINA.apart * MARINA.piers + 30;
    const d = Math.abs(dy) * MARINA.length + Math.abs(dx) * MARINA.apart * MARINA.piers + 30;
    return inView(samples, cx, cy, w, d);
  };
  // along every edge of the sea, the root of the best-seen run of pontoons
  let best: { edge: number; t: number; score: number } | undefined;
  const edges = sea.map((a, i) => [a, sea[(i + 1) % sea.length]] as const);
  const normalOf = ([a, b]: readonly [Pt, Pt]) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    // (pointing into the sea)
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (!inside(sea, mx + nx * 6, my + ny * 6)) [nx, ny] = [-nx, -ny];
    return { nx, ny, len };
  };
  edges.forEach((edge, i) => {
    const [a, b] = edge;
    const { nx, ny, len } = normalOf(edge);
    for (let t = 0; t <= len; t += 12) {
      const x = a.x + ((b.x - a.x) * t) / len + nx * 2;
      const y = a.y + ((b.y - a.y) * t) / len + ny * 2;
      if (!fits(x, y, nx, ny)) continue;
      const score = seen(x, y, nx, ny);
      if (!best || score > best.score) best = { edge: i, t, score };
    }
  });
  if (!best) return { piers: [], berths: [], cruises: [] };
  const [a, b] = edges[best.edge];
  const { nx, ny, len } = normalOf(edges[best.edge]);
  const at = (t: number) => ({ x: a.x + ((b.x - a.x) * t) / len + nx * 2, y: a.y + ((b.y - a.y) * t) / len + ny * 2 });
  // the pontoons: from the best root out either way along the quay, as many as fit
  const piers: Pier[] = [];
  const ts = [best.t];
  for (let k = 1; ts.length < MARINA.piers * 3 && k < 12; k++) ts.push(best.t + k * MARINA.apart, best.t - k * MARINA.apart);
  for (const t of ts) {
    if (piers.length >= MARINA.piers || t < 0 || t > len) continue;
    const p = at(t);
    if (fits(p.x, p.y, nx, ny)) piers.push({ x: p.x, y: p.y, dx: nx, dy: ny, length: MARINA.length });
  }
  // the boats moored along them: both sides, bows out to sea, now and then a berth empty
  const r = rng(53);
  const out = Math.atan2(nx, -ny);
  const berths: Berth[] = [];
  for (const p of piers) {
    for (let a2 = 24; a2 <= p.length - 6; a2 += MARINA.berth) {
      for (const side of [-1, 1]) {
        if (r() < 0.15) continue;
        berths.push({
          x: p.x + p.dx * a2 - p.dy * side * MARINA.out, y: p.y + p.dy * a2 + p.dx * side * MARINA.out,
          heading: out, length: 18 + r() * 8, kind: r() < 0.4 ? 'sail' : 'motor',
        });
      }
    }
  }
  // boats out on the water: each going round a loop past the marina, all of it in the sea and clear of the track
  const cruises: Cruise[] = [];
  const reach = MARINA.length + 120;
  const mid = at(best.t);
  for (let tries = 0; tries < 400 && cruises.length < MARINA.cruisers; tries++) {
    const along = (r() - 0.5) * MARINA.apart * MARINA.piers * 2.5;
    const x = mid.x + nx * (reach * (0.6 + r() * 0.8)) + ((b.x - a.x) / len) * along;
    const y = mid.y + ny * (reach * (0.6 + r() * 0.8)) + ((b.y - a.y) / len) * along;
    const rx = 50 + r() * 60;
    const ry = 30 + r() * 40;
    let ok = true;
    for (let k = 0; k < 16 && ok; k++) {
      const px = x + Math.cos((k / 16) * Math.PI * 2) * (rx + 20);
      const py = y + Math.sin((k / 16) * Math.PI * 2) * (ry + 20);
      ok = inside(sea, px, py) && fromTrack(px, py) >= keep + 20 && piers.every((p) => Math.hypot(px - (p.x + p.dx * p.length / 2), py - (p.y + p.dy * p.length / 2)) > p.length / 2 + 40);
    }
    if (ok) cruises.push({ x, y, rx, ry, period: 16 + r() * 10, phase: r() * Math.PI * 2, length: 22 + r() * 10, kind: r() < 0.5 ? 'sail' : 'motor' });
  }
  return { piers, berths, cruises };
}

/** Where a cruising boat is `t` s on, and the way its bow points. */
export function cruiseAt(c: Cruise, t: number): { x: number; y: number; heading: number } {
  const a = c.phase + (t / c.period) * Math.PI * 2;
  const x = c.x + Math.cos(a) * c.rx;
  const y = c.y + Math.sin(a) * c.ry;
  // (going round anticlockwise on the map: its velocity, as a heading)
  const vx = -Math.sin(a) * c.rx;
  const vy = Math.cos(a) * c.ry;
  return { x, y, heading: Math.atan2(vx, -vy) };
}
