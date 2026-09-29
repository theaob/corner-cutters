// A circuit in 3D: grass and gravel run-off, a smooth painted track with
// white edge lines and red-and-white kerbs, the start line and grid boxes, all
// draped over the circuit's heights; tyre walls round the outside and
// grandstands along the main straight.

import * as THREE from 'three';
import { canvas } from '../engine/render/sprites';
import { pixelTexture } from '../engine/render/textures';
import { addDaylight, type Daylight } from '../engine/render/daylight';
import { groundAt } from '../engine/sim';
import type { Pt } from './racing';
import { HALF_WIDTH, TILE as T, type Circuit } from './circuit';

export interface CircuitScene extends Daylight {
  scene: THREE.Scene;
  /** the track outline scaled into a small canvas, for the minimap */
  minimap(width: number, height: number): { canvas: HTMLCanvasElement; toMap: (x: number, y: number) => Pt };
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function paint(circuit: Circuit): HTMLCanvasElement {
  const { width: W, height: H, cells, track } = circuit;
  const [c, x] = canvas(W * T, H * T);
  const r = rng(11);
  // run-off and surroundings, tile by tile
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const cell = cells[j * W + i];
      const px = i * T;
      const py = j * T;
      if (cell === 'gravel') {
        x.fillStyle = '#d8c49a';
        x.fillRect(px, py, T, T);
        for (let k = 0; k < 10; k++) {
          x.fillStyle = r() < 0.5 ? '#c4ae82' : '#e6d6b0';
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), 1, 1);
        }
      } else {
        // grass everywhere else (the track is painted over it); mown stripes on the run-off
        x.fillStyle = cell === 'wall' ? '#4b9444' : (i + j) % 4 < 2 ? '#5aa84f' : '#62b156';
        x.fillRect(px, py, T, T);
        for (let k = 0; k < 3; k++) {
          x.fillStyle = '#3f8a3c';
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), 1, 2);
        }
      }
    }
  }
  const pts = track.samples;
  const offset = (off: number) => pts.map((p) => ({ x: p.x + Math.cos(p.dir) * off, y: p.y + Math.sin(p.dir) * off }));
  const path = (list: Pt[], closed = true) => {
    x.beginPath();
    list.forEach((p, i) => (i ? x.lineTo(p.x, p.y) : x.moveTo(p.x, p.y)));
    if (closed) x.closePath();
  };
  x.lineJoin = 'round';
  x.lineCap = 'butt';
  // asphalt
  x.strokeStyle = '#4a4d59';
  x.lineWidth = HALF_WIDTH * 2;
  path(pts);
  x.stroke();
  // white edge lines
  x.strokeStyle = '#e8e8ee';
  x.lineWidth = 2;
  for (const side of [-1, 1]) {
    path(offset(side * (HALF_WIDTH - 2)));
    x.stroke();
  }
  // kerbs on the bends: red-and-white strips just inside the edges
  x.lineWidth = 7;
  for (const side of [-1, 1]) {
    const edge = offset(side * (HALF_WIDTH - 4));
    for (let i = 0; i < pts.length; i++) {
      if (Math.abs(pts[i].curve) < 1 / 260) continue;
      const a = edge[i];
      const b = edge[(i + 1) % pts.length];
      x.strokeStyle = Math.floor(i / 1) % 2 === 0 ? '#d8323c' : '#f4f4f8';
      x.beginPath();
      x.moveTo(a.x, a.y);
      x.lineTo(b.x, b.y);
      x.stroke();
    }
  }
  // chequered start/finish line across the track at sample 0
  const s0 = pts[0];
  const rx = Math.cos(s0.dir);
  const ry = Math.sin(s0.dir);
  const fx = Math.sin(s0.dir);
  const fy = -Math.cos(s0.dir);
  for (let k = -HALF_WIDTH; k < HALF_WIDTH; k += 4) {
    for (let row = 0; row < 2; row++) {
      x.fillStyle = (Math.floor((k + HALF_WIDTH) / 4) + row) % 2 === 0 ? '#f4f4f8' : '#1b1b26';
      const cx = s0.x + rx * k + fx * (row * 4 - 4);
      const cy = s0.y + ry * k + fy * (row * 4 - 4);
      x.fillRect(Math.round(cx), Math.round(cy), 4, 4);
    }
  }
  // grid boxes: a white bracket in front of each slot
  x.strokeStyle = '#f4f4f8';
  x.lineWidth = 2;
  for (const g of circuit.slots) {
    const gfx = Math.sin(g.heading);
    const gfy = -Math.cos(g.heading);
    const grx = Math.cos(g.heading);
    const gry = Math.sin(g.heading);
    const front = { x: g.x + gfx * 16, y: g.y + gfy * 16 };
    x.beginPath();
    x.moveTo(front.x - grx * 9 - gfx * 6, front.y - gry * 9 - gfy * 6);
    x.lineTo(front.x - grx * 9, front.y - gry * 9);
    x.lineTo(front.x + grx * 9, front.y + gry * 9);
    x.lineTo(front.x + grx * 9 - gfx * 6, front.y + gry * 9 - gfy * 6);
    x.stroke();
  }
  return c;
}

function grandstand(len: number): THREE.Mesh {
  const [c, x] = canvas(len, 20);
  x.fillStyle = '#6c707a';
  x.fillRect(0, 0, len, 20);
  const r = rng(len);
  const shirts = ['#d8323c', '#f2c14e', '#3d7fc4', '#f4f4f8', '#5fe0d0', '#ff5fb8', '#8a3cc8'];
  for (let row = 2; row < 18; row += 3) {
    for (let k = 1; k < len - 1; k += 2) {
      if (r() < 0.8) {
        x.fillStyle = shirts[Math.floor(r() * shirts.length)];
        x.fillRect(k, row, 1, 2);
      }
    }
  }
  const crowd = new THREE.MeshLambertMaterial({ map: pixelTexture(c) });
  const grey = new THREE.MeshLambertMaterial({ color: 0x8e929c });
  const roof = new THREE.MeshLambertMaterial({ color: 0x3d7fc4 });
  // a stepped stand is suggested by a tall box with the crowd painted on the face toward the track (−x)
  const m = new THREE.Mesh(new THREE.BoxGeometry(18, 22, len), [grey, crowd, roof, grey, grey, grey]);
  m.castShadow = m.receiveShadow = true;
  return m;
}

export function createCircuitScene(circuit: Circuit): CircuitScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fb8e8');
  const light = addDaylight(scene);
  const { width: W, height: H, cells, grid, track } = circuit;

  const geo = new THREE.PlaneGeometry(W * T, H * T, W, H).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, grid.heights![i]);
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: pixelTexture(paint(circuit)) }));
  ground.position.set((W * T) / 2, 0, (H * T) / 2);
  ground.receiveShadow = true;
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x4b9444 }));
  outer.position.set((W * T) / 2, -1, (H * T) / 2);
  outer.receiveShadow = true;
  scene.add(ground, outer);

  // tyre walls: on every wall tile that touches the run-off, stacked red and white
  const drivable = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H && cells[j * W + i] !== 'wall';
  const walls: [number, number][] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (cells[j * W + i] !== 'wall') continue;
      let near = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) near ||= drivable(i + di, j + dj);
      if (near) walls.push([i, j]);
    }
  }
  const tyres = new THREE.InstancedMesh(new THREE.CylinderGeometry(7, 7, 7, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), walls.length);
  const m = new THREE.Matrix4();
  const red = new THREE.Color('#d8323c');
  const white = new THREE.Color('#f4f4f8');
  walls.forEach(([i, j], k) => {
    const h = groundAt(grid, (i + 0.5) * T, (j + 0.5) * T).h;
    m.makeTranslation((i + 0.5) * T, h + 3.5, (j + 0.5) * T);
    tyres.setMatrixAt(k, m);
    tyres.setColorAt(k, (i + j) % 2 === 0 ? red : white);
  });
  tyres.castShadow = tyres.receiveShadow = true;
  scene.add(tyres);

  // grandstands along the outside of the main straight (behind the start line)
  const n = track.samples.length;
  for (let k = 0; k < 3; k++) {
    const p = track.samples[(n - 20 - k * 16) % n];
    const out = 44 + 72 + 40;
    const gx = p.x + Math.cos(p.dir) * out;
    const gy = p.y + Math.sin(p.dir) * out;
    const stand = grandstand(110);
    stand.position.set(gx, groundAt(grid, gx, gy).h + 11, gy);
    stand.rotation.y = -p.dir;
    scene.add(stand);
  }

  const minimap = (mw: number, mh: number) => {
    const [mc, mx] = canvas(mw, mh);
    const scale = Math.min((mw - 8) / (W * T), (mh - 8) / (H * T));
    const toMap = (x: number, y: number) => ({ x: 4 + x * scale, y: 4 + y * scale });
    mx.strokeStyle = '#f4f2fa';
    mx.lineWidth = 2;
    mx.beginPath();
    track.samples.forEach((p, i) => {
      const q = toMap(p.x, p.y);
      if (i) mx.lineTo(q.x, q.y);
      else mx.moveTo(q.x, q.y);
    });
    mx.closePath();
    mx.stroke();
    const s = toMap(track.samples[0].x, track.samples[0].y);
    mx.fillStyle = '#f2c14e';
    mx.fillRect(s.x - 3, s.y - 1, 6, 2);
    return { canvas: mc, toMap };
  };

  return { scene, ...light, minimap };
}
