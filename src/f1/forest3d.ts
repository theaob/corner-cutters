// A circuit in a forest (layout.forest): spruces and firs packed all round the
// track beyond its barriers, with here and there a broadleaf (a few turning
// gold and rust), on up the hillsides and out past the edge of the map. Each
// tree is only as tall as it can be without hiding the track from the camera
// (which looks down from the south), on hills too: a tree on the slope above a
// stretch of track has less room than one below it. None stands on the pits,
// the garages or a grandstand. Drawn as instanced meshes in square chunks, so
// the chunks off screen (and out of the sun's shadow box) aren't drawn.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { groundAt } from '../engine/sim';
import { HALF_WIDTH, RUNOFF, TILE as T, type Circuit } from './circuit';
import { HIDES } from './town3d';
import { standsOf, STAND } from './stands';
import { GARAGE_ACROSS } from './pits';

export interface Tree {
  x: number;
  y: number;
  /** px tall, from the ground at its foot */
  h: number;
  kind: 'spruce' | 'broadleaf';
  /** its crown's colour */
  color: number;
}

export const FOREST = {
  /** px between trees (before a random nudge) */
  spacing: 30,
  /** px past the run-off's edge (the barriers) before the trees start */
  clear: 26,
  /** px out past the edge of the map the forest goes on */
  beyond: 360,
  /** px tall: the most a tree grows, and the least worth planting */
  tallest: 52,
  shortest: 14,
  /** a crown's radius, as a share of the tree's height */
  crown: 0.38,
  /** px square of each drawn chunk */
  chunk: 640,
};

const SPRUCE = [0x24492a, 0x2d5a32, 0x1f4026, 0x335f38];
const BROADLEAF = [0x4f8a3c, 0x5f9a44, 0x6b9a40, 0xc98a3a, 0xa8542c];

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The forest's trees (none for a circuit that isn't in one). */
export function treesOf(circuit: Circuit): Tree[] {
  if (!circuit.layout.forest) return [];
  const { track, grid, pit } = circuit;
  const W = circuit.width * T;
  const H = circuit.height * T;
  const reach = HALF_WIDTH + RUNOFF;
  // the track's samples in columns 64 px wide, with the ground under each
  const COL = 64;
  const cols = new Map<number, { x: number; y: number; h: number }[]>();
  for (const p of track.samples) {
    const k = Math.floor(p.x / COL);
    (cols.get(k) ?? cols.set(k, []).get(k)!).push({ x: p.x, y: p.y, h: groundAt(grid, p.x, p.y).h });
  }
  const stands = standsOf(circuit);
  const r = rng(29);
  const out: Tree[] = [];
  const S = FOREST.spacing;
  for (let gy = -FOREST.beyond; gy < H + FOREST.beyond; gy += S) {
    for (let gx = -FOREST.beyond; gx < W + FOREST.beyond; gx += S) {
      const x = gx + (r() - 0.5) * S * 0.8;
      const y = gy + (r() - 0.5) * S * 0.8;
      const pick = r();
      const want = FOREST.tallest * (0.6 + 0.4 * r());
      // clear of the track and its run-off, the pit lane and its garages, and the grandstands
      let near = Infinity;
      for (let k = Math.floor((x - reach - FOREST.clear) / COL); k <= Math.floor((x + reach + FOREST.clear) / COL); k++) {
        for (const p of cols.get(k) ?? []) near = Math.min(near, Math.hypot(p.x - x, p.y - y));
      }
      if (near < reach + FOREST.clear) continue;
      if (pit.points.some((q) => Math.hypot(q.x - x, q.y - y) < GARAGE_ACROSS + 60)) continue;
      if (stands.some((s) => Math.hypot(s.x - x, s.y - y) < s.len / 2 + STAND.depth + 20)) continue;
      // as tall as it can be without its crown hiding any of the track north of it
      const foot = groundAt(grid, x, y).h;
      const room = (h: number) => {
        const cr = h * FOREST.crown;
        let most = Infinity;
        for (let k = Math.floor((x - cr - reach) / COL); k <= Math.floor((x + cr + reach) / COL); k++) {
          for (const p of cols.get(k) ?? []) {
            if (Math.abs(p.x - x) > cr + reach) continue;
            const gap = y - cr - (p.y + reach);
            if (gap < 0) continue;
            // (its top, seen over the track's edge: the gap it may hide, less how far its foot stands above the track)
            most = Math.min(most, Math.max(0, gap - 6) / HIDES - (foot - p.h));
          }
        }
        return most;
      };
      let h = Math.min(want, room(want));
      if (h < want) h = Math.min(h, room(h)) * 0.95;
      if (h < FOREST.shortest) continue;
      const kind = pick < 0.82 ? 'spruce' : 'broadleaf';
      const palette = kind === 'spruce' ? SPRUCE : BROADLEAF;
      out.push({ x, y, h, kind, color: palette[Math.floor(r() * palette.length)] });
    }
  }
  return out;
}

/** The trees' shapes, 1 px tall at their foot (scaled up per tree): a spruce's three tiers, a broadleaf's round crown, a trunk. */
function shapes() {
  const tiers = [
    new THREE.ConeGeometry(FOREST.crown, 0.5, 6).translate(0, 0.42, 0),
    new THREE.ConeGeometry(FOREST.crown * 0.78, 0.42, 6).translate(0, 0.64, 0),
    new THREE.ConeGeometry(FOREST.crown * 0.52, 0.34, 6).translate(0, 0.84, 0),
  ];
  const spruce = mergeGeometries(tiers)!;
  const broadleaf = new THREE.IcosahedronGeometry(FOREST.crown * 0.9, 0).scale(1, 0.85, 1).translate(0, 0.66, 0);
  const trunk = new THREE.CylinderGeometry(0.05, 0.07, 0.36, 5).translate(0, 0.18, 0);
  return { spruce, broadleaf, trunk };
}

/** Plant the forest in `scene`, in chunks. */
export function buildForest(scene: THREE.Scene, circuit: Circuit): void {
  const trees = treesOf(circuit);
  if (!trees.length) return;
  const geo = shapes();
  const crown = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const bark = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
  const chunks = new Map<string, Tree[]>();
  for (const t of trees) {
    const key = `${Math.floor(t.x / FOREST.chunk)},${Math.floor(t.y / FOREST.chunk)}`;
    (chunks.get(key) ?? chunks.set(key, []).get(key)!).push(t);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (const list of chunks.values()) {
    const meshes = {
      spruce: new THREE.InstancedMesh(geo.spruce, crown, list.filter((t) => t.kind === 'spruce').length),
      broadleaf: new THREE.InstancedMesh(geo.broadleaf, crown, list.filter((t) => t.kind === 'broadleaf').length),
      trunk: new THREE.InstancedMesh(geo.trunk, bark, list.length),
    };
    const n = { spruce: 0, broadleaf: 0 };
    list.forEach((t, k) => {
      const foot = groundAt(circuit.grid, t.x, t.y).h;
      // (each turned its own way, a little wider or narrower)
      q.setFromAxisAngle(up, (t.x * 7.3 + t.y * 3.1) % (Math.PI * 2));
      const wide = 0.9 + ((t.x * 13.7 + t.y * 5.3) % 1) * 0.25;
      m.compose(new THREE.Vector3(t.x, foot - 1, t.y), q, new THREE.Vector3(t.h * wide, t.h, t.h * wide));
      meshes[t.kind].setMatrixAt(n[t.kind], m);
      meshes[t.kind].setColorAt(n[t.kind]++, c.set(t.color));
      meshes.trunk.setMatrixAt(k, m);
    });
    for (const mesh of Object.values(meshes)) {
      if (!mesh.count) continue;
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
  }
}
