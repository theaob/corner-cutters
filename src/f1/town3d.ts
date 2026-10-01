// A street circuit's town in 3D: an old, rich town of stone houses and towers
// packed right up to the barriers, its landmarks (the casino by the hairpin,
// an open-air swimming pool, a tennis court with a rally on), palms, yachts on
// the sea, and the tunnel's see-through roof. Nothing in it is ever so tall it
// hides the track from the camera, which looks down from the south: a building
// with track behind it is kept low enough to see over.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvas } from '../engine/render/sprites';
import { pixelTexture } from '../engine/render/textures';
import { groundAt } from '../engine/sim';
import { HD2D_VIEW } from '../engine/look';
import type { Pt } from './racing';
import { HALF_WIDTH, TILE as T, type Circuit } from './circuit';

/** Whether (x, y) is inside the polygon `poly`. */
export function inside(poly: Pt[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** A point of the layout (in its own units) on the map: scaled and moved as the track was. */
const onMap = (circuit: Circuit, p: Pt): Pt => ({ x: p.x * circuit.layout.scale - circuit.offset.x, y: p.y * circuit.layout.scale - circuit.offset.y });

/** A street circuit's sea, on the map; none for a circuit in the country. */
export function seaOf(circuit: Circuit): Pt[] | undefined {
  return circuit.layout.street?.sea.map((p) => onMap(circuit, p));
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** Ground hidden behind (north of) something, per px of its height, from the camera looking down from the south. */
export const HIDES = 1 / Math.tan((HD2D_VIEW.pitch * Math.PI) / 180);

/**
 * How tall something standing on footprint (x, y, w across, d deep) can be and
 * still let the camera see the track behind it: the nearest track (to its
 * barriers) wholly north of its front, in line with it. Infinity with no track
 * behind it.
 */
export function seeOver(circuit: Circuit, x: number, y: number, w: number, d: number): number {
  const reach = HALF_WIDTH + (circuit.layout.street?.runoff ?? 72);
  let gap = Infinity;
  for (const p of circuit.track.samples) {
    if (Math.abs(p.x - x) > w / 2 + reach || p.y + reach > y - d / 2) continue;
    gap = Math.min(gap, y - d / 2 - (p.y + reach));
  }
  return Math.max(0, gap - 6) / HIDES;
}

/** A landmark's footprint (centre, across, deep) on the map, and its height at the tallest. */
export interface Landmark {
  kind: 'casino' | 'pool' | 'tennis';
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
}

/** The landmarks' footprints: the casino (its garden in front), the pool (its deck round it), the tennis court (its fence round it). */
const LANDMARK = { casino: { w: 170, d: 150, h: 58 }, pool: { w: 110, d: 190, h: 0 }, tennis: { w: 84, d: 164, h: 12 } } as const;

/** A street circuit's landmarks, on the map. */
export function landmarksOf(circuit: Circuit): Landmark[] {
  const marks = circuit.layout.street?.landmarks;
  if (!marks) return [];
  return (Object.keys(LANDMARK) as Landmark['kind'][]).map((kind) => ({ kind, ...onMap(circuit, marks[kind]), ...LANDMARK[kind] }));
}

/** px a bay of windows is wide, and a storey high */
const BAY = 12;
const STOREY = 12;

/** The old town's walls: stone and warm washes, arched windows with shutters, here and there a balcony; one bay of one storey, to repeat. */
const FACADES = [
  { wall: '#dccfb4', shutter: '#4f6f4a', balcony: false },
  { wall: '#d9a85f', shutter: '#3d5f80', balcony: true },
  { wall: '#c98a5a', shutter: '#4f6f4a', balcony: false },
  { wall: '#ede0c4', shutter: '#7a4a2c', balcony: true },
  { wall: '#e2b5a0', shutter: '#3d5f80', balcony: false },
  { wall: '#bfb6a6', shutter: '#7a4a2c', balcony: false },
];

function facadeTexture(f: (typeof FACADES)[number]): THREE.Texture {
  const [c, x] = canvas(BAY, STOREY);
  x.fillStyle = f.wall;
  x.fillRect(0, 0, BAY, STOREY);
  // a course of stone under each storey
  x.fillStyle = 'rgba(0,0,0,0.1)';
  x.fillRect(0, 11, BAY, 1);
  // the shutters, and the window between: arched at the top
  x.fillStyle = f.shutter;
  x.fillRect(2, 4, 2, 6);
  x.fillRect(8, 4, 2, 6);
  x.fillStyle = '#2f3440';
  x.fillRect(4, 3, 4, 7);
  x.fillStyle = f.wall;
  x.fillRect(4, 3, 1, 1);
  x.fillRect(7, 3, 1, 1);
  if (f.balcony) {
    x.fillStyle = '#3a3a40';
    x.fillRect(3, 9, 6, 1);
  }
  const t = pixelTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** A building's top: terracotta tiles, a flat roof, battlements round a flat roof, or (a tower's) a tiled spire. */
type Top = 'tiles' | 'flat' | 'battlements' | 'spire';

export interface Block {
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
  style: number;
  top: Top;
}

/**
 * Where the old town's buildings stand: on its paving (not the sea, clear of
 * the pits, the grandstands and the landmarks), a house on most plots of a
 * grid, packed close with narrow lanes between, from just behind the
 * barriers; now and then a stone tower instead, taller and narrower. Each is
 * whole storeys tall, and never so tall it hides the track from the camera.
 */
export function townBlocks(circuit: Circuit, sea: Pt[], fromTrack: (x: number, y: number) => number, keep: number, r: () => number, avoid: Landmark[] = []): Block[] {
  const { width: W, height: H, cells, track, pit } = circuit;
  const samples = track.samples;
  const n = samples.length;
  const PLOT = 52;
  const out: Block[] = [];
  for (let y = PLOT / 2; y < H * T; y += PLOT) {
    for (let x = PLOT / 2; x < W * T; x += PLOT) {
      const cx = x + (r() - 0.5) * 8;
      const cy = y + (r() - 0.5) * 8;
      const i = Math.floor(cx / T);
      const j = Math.floor(cy / T);
      if (i < 0 || j < 0 || i >= W || j >= H || cells[j * W + i] !== 'wall' || inside(sea, cx, cy)) continue;
      if (r() < 0.12) continue; // (a little square, now and then)
      const tower = r() < 0.07;
      const w = tower ? 24 + r() * 6 : 36 + r() * 10;
      const d = tower ? 24 + r() * 6 : 36 + r() * 10;
      // clear of the track (just behind the barriers), the pit lane and its garages, the grandstands, the landmarks
      if (fromTrack(cx, cy) < keep + Math.max(w, d) / 2 - 20) continue;
      if (pit.points.some((p) => Math.hypot(p.x - cx, p.y - cy) < 100)) continue;
      if (samples.slice(n - 70).some((p) => Math.hypot(p.x - cx, p.y - cy) < 190)) continue;
      if (avoid.some((l) => Math.abs(l.x - cx) < (l.w + w) / 2 + 10 && Math.abs(l.y - cy) < (l.d + d) / 2 + 10)) continue;
      const tall = (24 + r() * 44) * (tower ? 1.5 : 1);
      const h = Math.min(tall, seeOver(circuit, cx, cy, w, d));
      if (h < 12) continue;
      const style = Math.floor(r() * FACADES.length);
      const top: Top = tower ? (r() < 0.5 ? 'spire' : 'battlements') : r() < 0.18 ? 'battlements' : style % 3 === 2 ? 'flat' : 'tiles';
      // (a spire stands above the walls: room for it under the camera's line too)
      const room = top === 'spire' ? h - w * 0.6 : h;
      if (room < 12) continue;
      out.push({ x: cx, y: cy, w, d, h: Math.max(1, Math.floor(room / STOREY)) * STOREY, style, top });
    }
  }
  return out;
}

/** A palm: a leaning trunk and a crown of fronds. */
function palm(r: () => number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.8, 26, 6), new THREE.MeshLambertMaterial({ color: 0x8a6a48 }));
  trunk.position.y = 13;
  trunk.rotation.z = (r() - 0.5) * 0.25;
  g.add(trunk);
  const leaf = new THREE.MeshLambertMaterial({ color: 0x3f8a3c });
  for (let k = 0; k < 6; k++) {
    const frond = new THREE.Mesh(new THREE.BoxGeometry(14, 0.8, 3.5), leaf);
    const a = (k / 6) * Math.PI * 2 + r();
    frond.position.set(Math.cos(a) * 6, 26, Math.sin(a) * 6);
    frond.rotation.set(0, -a, -0.45);
    g.add(frond);
  }
  for (const m of g.children) m.castShadow = true;
  return g;
}

/** A little figure (legs, a shirt, a head), `shirt` coloured; its arm out to the right (with a racket, if `racket`). */
function figure(shirt: number, racket = false): THREE.Group {
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xe0b48c });
  const top = new THREE.MeshLambertMaterial({ color: shirt });
  const legs = new THREE.Mesh(new THREE.BoxGeometry(3, 4, 2), new THREE.MeshLambertMaterial({ color: 0xf4f4f8 }));
  legs.position.y = 2;
  const body = new THREE.Mesh(new THREE.BoxGeometry(3.6, 4, 2.4), top);
  body.position.y = 6;
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.7, 8, 6), skin);
  head.position.y = 9.6;
  const arm = new THREE.Mesh(new THREE.BoxGeometry(4, 1.2, 1.2), skin);
  arm.position.set(3.4, 7, 0);
  g.add(legs, body, head, arm);
  if (racket) {
    const frame = new THREE.Mesh(new THREE.TorusGeometry(1.6, 0.35, 4, 10), new THREE.MeshLambertMaterial({ color: 0x23222e }));
    frame.position.set(6.4, 7.5, 0);
    frame.rotation.y = Math.PI / 2;
    g.add(frame);
  }
  for (const m of g.children) m.castShadow = true;
  return g;
}

/** A canvas texture `w`×`h` px, drawn by `draw`. */
function drawn(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void): THREE.Texture {
  const [c, x] = canvas(w, h);
  draw(x);
  return pixelTexture(c);
}

/**
 * The casino: a grand hall in cream stone, its tall arched windows picked out
 * in gold, copper-green domes on its corner towers and over the middle, a
 * pillared porch, and in front of it (toward the camera) a garden with a
 * fountain, flower beds and palms.
 */
function casino(l: Landmark, r: () => number): THREE.Group {
  const g = new THREE.Group();
  const stone = new THREE.MeshLambertMaterial({ color: 0xf0e4c8 });
  const copper = new THREE.MeshLambertMaterial({ color: 0x6fae99 });
  const front = new THREE.MeshLambertMaterial({
    map: (() => {
      const t = drawn(16, 20, (x) => {
        x.fillStyle = '#f0e4c8';
        x.fillRect(0, 0, 16, 20);
        x.fillStyle = '#c9a25a';
        x.fillRect(0, 0, 16, 2);
        x.fillStyle = '#2f3440';
        x.fillRect(5, 5, 6, 12);
        x.fillStyle = '#f0e4c8';
        x.fillRect(5, 5, 1, 1);
        x.fillRect(10, 5, 1, 1);
        x.fillStyle = '#c9a25a';
        x.fillRect(4, 17, 8, 1);
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(9, 2);
      return t;
    })(),
  });
  // (the hall at the back of its plot, the garden in front)
  const hallD = 70;
  const hallZ = -l.d / 2 + hallD / 2;
  const hall = new THREE.Mesh(new THREE.BoxGeometry(140, 36, hallD), [stone, stone, stone, stone, front, stone]);
  hall.position.set(0, 18, hallZ);
  g.add(hall);
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(24, 46, 24), [stone, stone, stone, stone, front, stone]);
    tower.position.set(side * 64, 23, hallZ + hallD / 2 - 12);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(12, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), copper);
    dome.position.set(side * 64, 46, hallZ + hallD / 2 - 12);
    const spike = new THREE.Mesh(new THREE.ConeGeometry(1.5, 8, 6), copper);
    spike.position.set(side * 64, 61, hallZ + hallD / 2 - 12);
    g.add(tower, dome, spike);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(20, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), copper);
  dome.position.set(0, 36, hallZ);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 6, 8), stone);
  lantern.position.set(0, 58, hallZ);
  g.add(dome, lantern);
  // the porch: a roof on pillars at the front door
  const porch = new THREE.Mesh(new THREE.BoxGeometry(44, 4, 14), stone);
  porch.position.set(0, 22, hallZ + hallD / 2 + 7);
  g.add(porch);
  for (let k = -2; k <= 2; k++) {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 20, 8), stone);
    pillar.position.set(k * 10, 10, hallZ + hallD / 2 + 12);
    g.add(pillar);
  }
  // the garden: a lawn, a round fountain in the middle, beds of flowers either side, palms at the corners
  const gardenD = l.d - hallD - 14;
  const gardenZ = l.d / 2 - gardenD / 2;
  const lawn = new THREE.Mesh(new THREE.BoxGeometry(l.w, 1, gardenD), new THREE.MeshLambertMaterial({ color: 0x5aa84f }));
  lawn.position.set(0, 0.5, gardenZ);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(14, 15, 3, 20), stone);
  basin.position.set(0, 1.5, gardenZ);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(12, 12, 0.6, 20), new THREE.MeshLambertMaterial({ color: 0x5fc6e6 }));
  water.position.set(0, 3.1, gardenZ);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 2.5, 10, 8), new THREE.MeshLambertMaterial({ color: 0xc6ecf6, transparent: true, opacity: 0.8 }));
  jet.position.set(0, 7, gardenZ);
  g.add(lawn, basin, water, jet);
  const flowers = [0xd8323c, 0xf2c14e, 0xff5fb8, 0xf4f4f8];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 6; k++) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 8), new THREE.MeshLambertMaterial({ color: flowers[(k + (side > 0 ? 2 : 0)) % flowers.length] }));
      bed.position.set(side * (34 + (k % 3) * 12), 1.5, gardenZ - 8 + Math.floor(k / 3) * 16);
      g.add(bed);
    }
    for (const dz of [-gardenD / 2 + 6, gardenD / 2 - 6]) {
      const p = palm(r);
      p.position.set(side * (l.w / 2 - 8), 0, gardenZ + dz);
      g.add(p);
    }
  }
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
  });
  return g;
}

/** The open-air pool: a stone deck, the water with its lanes, loungers and umbrellas, palms, and swimmers doing lengths. */
function pool(l: Landmark, r: () => number): { group: THREE.Group; animate(t: number): void } {
  const g = new THREE.Group();
  const deck = new THREE.Mesh(new THREE.BoxGeometry(l.w, 1, l.d), new THREE.MeshLambertMaterial({ color: 0xe8e0d0 }));
  deck.position.y = 0.5;
  const ww = l.w - 30;
  const wd = l.d - 30;
  const lanes = 4;
  const water = new THREE.Mesh(
    new THREE.BoxGeometry(ww, 1, wd),
    new THREE.MeshLambertMaterial({
      map: drawn(ww, wd, (x) => {
        x.fillStyle = '#3fb6d9';
        x.fillRect(0, 0, ww, wd);
        x.fillStyle = '#7fd4ea';
        for (let k = 0; k < 40; k++) x.fillRect(Math.floor((k * 37) % ww), Math.floor((k * 53) % wd), 3, 1);
        // the lane ropes, red and white
        for (let k = 1; k < lanes; k++) {
          for (let y = 0; y < wd; y += 4) {
            x.fillStyle = (y / 4) % 2 ? '#d8323c' : '#f4f4f8';
            x.fillRect(Math.round((k * ww) / lanes), y, 1, 4);
          }
        }
      }),
    }),
  );
  water.position.y = 1.2;
  g.add(deck, water);
  // loungers and umbrellas along the sides; palms at the corners
  const lounger = new THREE.MeshLambertMaterial({ color: 0xf4f4f8 });
  const shades = [0xd8323c, 0x3d7fc4, 0xf2c14e];
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const z = -wd / 2 + 20 + k * ((wd - 40) / 3);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(5, 1.5, 12), lounger);
      bed.position.set(side * (ww / 2 + 8), 1.75, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 12, 4), lounger);
      pole.position.set(side * (ww / 2 + 11), 7, z + 4);
      const shade = new THREE.Mesh(new THREE.ConeGeometry(7, 3, 8), new THREE.MeshLambertMaterial({ color: shades[(k + (side > 0 ? 1 : 0)) % 3] }));
      shade.position.set(side * (ww / 2 + 11), 13, z + 4);
      g.add(bed, pole, shade);
    }
    for (const dz of [-l.d / 2 + 6, l.d / 2 - 6]) {
      const p = palm(r);
      p.position.set(side * (l.w / 2 - 6), 1, dz);
      g.add(p);
    }
  }
  // swimmers, one to a lane, each at its own pace, turning at the ends
  const caps = [0xd8323c, 0xf2c14e, 0x3d7fc4, 0xf4f4f8];
  const swimmers = Array.from({ length: lanes }, (_, k) => {
    const s = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1, 7), new THREE.MeshLambertMaterial({ color: 0xe0b48c }));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 6), new THREE.MeshLambertMaterial({ color: caps[k] }));
    cap.position.z = -4.5;
    s.add(body, cap);
    s.position.set(-ww / 2 + ((k + 0.5) * ww) / lanes, 1.9, 0);
    g.add(s);
    return { s, speed: 10 + r() * 6, phase: r() * 10 };
  });
  const length = wd - 16;
  return {
    group: g,
    animate(t) {
      for (const w of swimmers) {
        // there and back: along the lane, turning at each end
        const along = ((t * w.speed) / length + w.phase) % 2;
        const there = along < 1;
        w.s.position.z = -length / 2 + (there ? along : 2 - along) * length;
        w.s.rotation.y = there ? Math.PI : 0;
        w.s.position.y = 1.9 + Math.sin(t * 8 + w.phase) * 0.25;
      }
    },
  };
}

/** The tennis court: red clay with white lines, a net, a fence, and two players in a rally, the ball arcing and bouncing between them. */
function tennis(l: Landmark): { group: THREE.Group; animate(t: number): void } {
  const g = new THREE.Group();
  const cw = l.w - 14;
  const cd = l.d - 14;
  const surround = new THREE.Mesh(new THREE.BoxGeometry(l.w, 1, l.d), new THREE.MeshLambertMaterial({ color: 0x3f7d4a }));
  surround.position.y = 0.5;
  const court = new THREE.Mesh(
    new THREE.BoxGeometry(cw, 1, cd),
    new THREE.MeshLambertMaterial({
      map: drawn(cw, cd, (x) => {
        x.fillStyle = '#c8643c';
        x.fillRect(0, 0, cw, cd);
        x.fillStyle = '#f4f4f8';
        // the doubles and singles sidelines, the baselines, the service lines and the centre line
        x.fillRect(2, 2, cw - 4, 1);
        x.fillRect(2, cd - 3, cw - 4, 1);
        for (const sx of [2, 8, cw - 9, cw - 3]) x.fillRect(sx, 2, 1, cd - 4);
        const service = Math.round(cd * 0.24);
        x.fillRect(8, service, cw - 16, 1);
        x.fillRect(8, cd - service - 1, cw - 16, 1);
        x.fillRect(Math.round(cw / 2), service, 1, cd - service * 2);
      }),
    }),
  );
  court.position.y = 1.1;
  const net = new THREE.Mesh(new THREE.BoxGeometry(cw + 4, 4, 0.8), new THREE.MeshLambertMaterial({ color: 0x23222e, transparent: true, opacity: 0.75 }));
  net.position.set(0, 3.5, 0);
  const tape = new THREE.Mesh(new THREE.BoxGeometry(cw + 4, 0.6, 1), new THREE.MeshLambertMaterial({ color: 0xf4f4f8 }));
  tape.position.set(0, 5.6, 0);
  g.add(surround, court, net, tape);
  // the fence: dark green mesh round it, low enough to see in
  const fence = new THREE.MeshLambertMaterial({ color: 0x2f5a3a, transparent: true, opacity: 0.45, depthWrite: false });
  for (const [w, d, x, z] of [[l.w, 1, 0, -l.d / 2], [l.w, 1, 0, l.d / 2], [1, l.d, -l.w / 2, 0], [1, l.d, l.w / 2, 0]]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(w, 12, d), fence);
    side.position.set(x, 6, z);
    g.add(side);
  }
  // the players: one at each end
  const near = figure(0xf4f4f8, true);
  const far = figure(0x3d7fc4, true);
  far.rotation.y = Math.PI;
  const ball = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), new THREE.MeshLambertMaterial({ color: 0xd8f05a }));
  g.add(near, far, ball);
  const baseline = cd / 2 - 4;
  /** each shot's landing across the court (seeded: the same rally every time) */
  const across = (k: number) => Math.sin(k * 12.9898) * (cw / 2 - 10);
  const SHOT = 1.3;
  return {
    group: g,
    animate(t) {
      const k = Math.floor(t / SHOT);
      const f = t / SHOT - k;
      // shot k goes from one end to the other, alternately: from x(k) to x(k + 1)
      const fromNear = k % 2 === 0;
      const z0 = fromNear ? baseline : -baseline;
      const x0 = across(k);
      const x1 = across(k + 1);
      ball.position.x = x0 + (x1 - x0) * f;
      ball.position.z = z0 - Math.sign(z0) * 2 * baseline * f;
      // a high arc to the bounce (70% of the way), then a low one up to the racket
      ball.position.y = 2 + (f < 0.7 ? Math.sin((f / 0.7) * Math.PI) * 14 : Math.sin(((f - 0.7) / 0.3) * Math.PI) * 5 + ((f - 0.7) / 0.3) * 4);
      // the players: the one hitting next runs to where the ball's going; the other gets back to the middle
      const hitter = fromNear ? far : near;
      const waiter = fromNear ? near : far;
      hitter.position.set(x1 * Math.min(1, f * 1.4), 1, fromNear ? -baseline - 4 : baseline + 4);
      waiter.position.set(x0 * (1 - Math.min(1, f * 2)), 1, fromNear ? baseline + 4 : -baseline - 4);
      // (a swing as the ball arrives)
      hitter.children[3].rotation.y = f > 0.85 ? (f - 0.85) * 8 : 0;
    },
  };
}

/** The town round a street circuit, in `scene`; animate(t) moves its people (t: seconds). */
export function buildTown(scene: THREE.Scene, circuit: Circuit): { animate(t: number): void } {
  const { width: W, height: H, grid, track, layout } = circuit;
  const street = layout.street!;
  const sea = seaOf(circuit) ?? [];
  const r = rng(29);
  const samples = track.samples;
  /** px from (x, y) to the centreline */
  const fromTrack = (x: number, y: number) => {
    let best = Infinity;
    for (let k = 0; k < samples.length; k += 2) best = Math.min(best, (samples[k].x - x) ** 2 + (samples[k].y - y) ** 2);
    return Math.sqrt(best);
  };
  const keep = HALF_WIDTH + street.runoff + 40;
  const marks = landmarksOf(circuit);

  // the old town: houses and towers, a mesh of walls per facade style and of each kind of top
  const blocks = townBlocks(circuit, sea, fromTrack, keep, r, marks);
  const tops: Record<'tiles' | 'flat' | 'stone', THREE.BufferGeometry[]> = { tiles: [], flat: [], stone: [] };
  FACADES.forEach((style, k) => {
    const list = blocks.filter((b) => b.style === k);
    if (!list.length) return;
    const walls = list.map((b) => {
      const g = new THREE.BoxGeometry(b.w, b.h, b.d);
      // (the texture tiles a bay and a storey at a time, by the building's size)
      const uv = g.attributes.uv;
      for (let f = 0; f < 6; f++) {
        const acrossFace = f < 2 ? b.d : b.w;
        const up = f === 2 || f === 3 ? b.d : b.h;
        for (let v = f * 4; v < f * 4 + 4; v++) uv.setXY(v, uv.getX(v) * (acrossFace / BAY), uv.getY(v) * (up / STOREY));
      }
      const ground = groundAt(grid, b.x, b.y).h;
      g.translate(b.x, ground + b.h / 2, b.y);
      const roofAt = ground + b.h;
      if (b.top === 'tiles') tops.tiles.push(new THREE.BoxGeometry(b.w + 3, 2, b.d + 3).translate(b.x, roofAt + 1, b.y));
      else if (b.top === 'spire') tops.tiles.push(new THREE.ConeGeometry(b.w * 0.75, b.w * 0.6, 4).rotateY(Math.PI / 4).translate(b.x, roofAt + b.w * 0.3, b.y));
      else {
        tops.flat.push(new THREE.BoxGeometry(b.w, 1, b.d).translate(b.x, roofAt + 0.5, b.y));
        if (b.top === 'battlements') {
          // merlons along the edges, a gap between each
          for (let a = -b.w / 2 + 2; a <= b.w / 2 - 2; a += 6) {
            for (const z of [-b.d / 2 + 1.5, b.d / 2 - 1.5]) tops.stone.push(new THREE.BoxGeometry(3, 4, 3).translate(b.x + a, roofAt + 2, b.y + z));
          }
          for (let a = -b.d / 2 + 8; a <= b.d / 2 - 8; a += 6) {
            for (const x of [-b.w / 2 + 1.5, b.w / 2 - 1.5]) tops.stone.push(new THREE.BoxGeometry(3, 4, 3).translate(b.x + x, roofAt + 2, b.y + a));
          }
        }
      }
      return g;
    });
    const mesh = new THREE.Mesh(mergeGeometries(walls), new THREE.MeshLambertMaterial({ map: facadeTexture(style) }));
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  });
  const topColor = { tiles: 0xb5583c, flat: 0x9a9aa2, stone: 0xcfc4ae };
  for (const [kind, parts] of Object.entries(tops) as [keyof typeof tops, THREE.BufferGeometry[]][]) {
    if (!parts.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: topColor[kind] }));
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // the landmarks
  const moving: { animate(t: number): void }[] = [];
  for (const l of marks) {
    // (on a level stone plinth: its top at the highest ground under it, its sides down to the lowest, so the hill
    // never shows through)
    let high = -Infinity;
    let low = Infinity;
    for (let u = -1; u <= 1; u += 0.25) {
      for (let v = -1; v <= 1; v += 0.25) {
        const h = groundAt(grid, l.x + (u * l.w) / 2, l.y + (v * l.d) / 2).h;
        high = Math.max(high, h);
        low = Math.min(low, h);
      }
    }
    const made = l.kind === 'casino' ? { group: casino(l, r) } : l.kind === 'pool' ? pool(l, r) : tennis(l);
    made.group.position.set(l.x, high, l.y);
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(l.w + 4, high - low + 2, l.d + 4), new THREE.MeshLambertMaterial({ color: 0xcfc4ae }));
    plinth.position.y = -(high - low + 2) / 2;
    plinth.receiveShadow = true;
    made.group.add(plinth);
    scene.add(made.group);
    if ('animate' in made) moving.push(made);
  }

  // yachts on the sea, clear of the quay
  const hull = new THREE.MeshLambertMaterial({ color: 0xf4f4f8 });
  const cabin = new THREE.MeshLambertMaterial({ color: 0xc9ccd4 });
  let boats = 0;
  for (let tries = 0; tries < 400 && boats < 16; tries++) {
    const x = r() * W * T;
    const y = r() * H * T;
    if (!inside(sea, x, y) || fromTrack(x, y) < keep + 30) continue;
    const yacht = new THREE.Group();
    const length = 34 + r() * 22;
    const body = new THREE.Mesh(new THREE.BoxGeometry(length, 6, length * 0.32), hull);
    body.position.y = 3;
    const top = new THREE.Mesh(new THREE.BoxGeometry(length * 0.45, 6, length * 0.22), cabin);
    top.position.set(-length * 0.08, 9, 0);
    for (const part of [body, top]) part.castShadow = true;
    yacht.add(body, top);
    yacht.position.set(x, groundAt(grid, x, y).h, y);
    yacht.rotation.y = Math.floor(r() * 4) * (Math.PI / 2) + 0.3;
    scene.add(yacht);
    boats++;
  }

  // the tunnel's roof: concrete slabs over the track, see-through so the cars show under it
  const [from, to] = street.tunnel.map((d) => Math.round(d / track.spacing));
  const slab = new THREE.MeshLambertMaterial({ color: 0x9a948a, transparent: true, opacity: 0.32, depthWrite: false });
  const span = (HALF_WIDTH + street.runoff) * 2 + 24;
  for (let k = from; k < to; k += 4) {
    const p = samples[k];
    const roof = new THREE.Mesh(new THREE.BoxGeometry(span, 4, track.spacing * 4), slab);
    roof.position.set(p.x, groundAt(grid, p.x, p.y).h + 34, p.y);
    roof.rotation.y = -p.dir;
    scene.add(roof);
  }

  return {
    animate(t) {
      for (const m of moving) m.animate(t);
    },
  };
}
