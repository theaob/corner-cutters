// A circuit in 3D: grass and gravel run-off, a smooth painted track with
// white edge lines and red-and-white kerbs, yellow track-limit strips inside
// the marked corners, the start line and grid boxes, all
// draped over the circuit's heights; tyre walls round the outside and
// grandstands along the main straight and round the bends; the pit lane beside it, with its
// wall, box markings and garages.

import * as THREE from 'three';
import { canvas } from '../engine/render/sprites';
import { pixelTexture } from '../engine/render/textures';
import { addDaylight, type Daylight } from '../engine/render/daylight';
import { groundAt } from '../engine/sim';
import type { Pt } from './racing';
import { GARAGE_ACROSS, PIT } from './pits';
import { HALF_WIDTH, LANE_IN, LANE_OUT, RUNOFF, TIGHT, TILE as T, type Circuit } from './circuit';
import { markCorners } from './trackLimits';
import { DRY, type Weather } from './weather';
import { buildTown, inside, seaOf } from './town3d';
import { standsOf } from './stands';
import { createPodiumDeck } from './podium3d';

/** The flags on the grandstands: the teams' colours and white. */
const FLAG_COLORS = [0xd8323c, 0xf2c14e, 0x3d7fc4, 0xf4f4f8, 0x5fe0d0, 0xff5fb8, 0x3d9a5a];

export interface CircuitScene extends Daylight {
  scene: THREE.Scene;
  /** the track outline scaled into a small canvas, for the minimap */
  minimap(width: number, height: number): { canvas: HTMLCanvasElement; toMap: (x: number, y: number) => Pt };
  /** Move the scenery's people (a street circuit's swimmers and tennis players), `t` seconds on. */
  animate(t: number): void;
}

function rng(seed: number): () => number {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

/** The banking's concrete, and the seams along it */
const CONCRETE = '#b4b2ac';
const SEAM = '#99978f';

/** The street circuits' colours: the pavement, the town's paving, the sea. */
const STREET = { pavement: '#9b9ba3', joint: '#8a8a93', town: '#c8b48f', townDot: '#b9a47e', sea: '#2a6ca6', wave: '#4b8ccc' };

function paint(circuit: Circuit): HTMLCanvasElement {
  const { width: W, height: H, cells, track } = circuit;
  const [c, x] = canvas(W * T, H * T);
  const r = rng(11);
  const street = !!circuit.layout.street;
  const sea = seaOf(circuit);
  // run-off and surroundings, tile by tile
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const cell = cells[j * W + i];
      const px = i * T;
      const py = j * T;
      if (street) {
        // a street circuit: pavement up to the barriers; beyond them the town's paving, or the sea
        const wet = cell === 'wall' && sea && inside(sea, px + T / 2, py + T / 2);
        x.fillStyle = cell === 'wall' ? (wet ? STREET.sea : STREET.town) : STREET.pavement;
        x.fillRect(px, py, T, T);
        if (cell !== 'wall') {
          x.fillStyle = STREET.joint;
          x.fillRect(px, py, T, 1);
          x.fillRect(px, py, 1, T);
        } else {
          for (let k = 0; k < (wet ? 2 : 4); k++) {
            x.fillStyle = wet ? STREET.wave : STREET.townDot;
            x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), wet ? 3 : 1, 1);
          }
        }
        continue;
      }
      // (the banking's concrete, also under the track's edge beside it)
      const byApron = cell === 'apron' || ((cell === 'track' || cell === 'kerb') && [-1, 0, 1].some((dj) => [-1, 0, 1].some((di) => cells[(j + dj) * W + i + di] === 'apron')));
      if (byApron) {
        x.fillStyle = CONCRETE;
        x.fillRect(px, py, T, T);
        for (let k = 0; k < 3; k++) {
          x.fillStyle = r() < 0.5 ? '#a8a6a0' : '#c0beb8';
          x.fillRect(px + Math.floor(r() * T), py + Math.floor(r() * T), 1, 1);
        }
      } else if (cell === 'gravel') {
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
  // the pit lane: asphalt under the track's, so the track's edge runs unbroken past the entry and exit
  const { pit } = circuit;
  const lane = (across: number) => pit.points.map((p) => ({ x: p.x + Math.cos(p.dir) * across * pit.side, y: p.y + Math.sin(p.dir) * across * pit.side }));
  x.strokeStyle = '#4a4d59';
  x.lineWidth = LANE_IN + LANE_OUT;
  path(lane((LANE_OUT - LANE_IN) / 2), false);
  x.stroke();
  x.strokeStyle = '#e8e8ee';
  x.lineWidth = 2;
  path(lane(LANE_OUT - 4), false);
  x.stroke();
  // the boxes: a yellow frame each, beside the fast lane
  x.strokeStyle = '#f2c14e';
  for (const b of pit.boxes) {
    const q = pit.points.find((p) => p.s >= b)!;
    const across = PIT.boxLane * pit.side;
    const cx = q.x + Math.cos(q.dir) * across;
    const cy = q.y + Math.sin(q.dir) * across;
    x.save();
    x.translate(cx, cy);
    x.rotate(q.dir);
    x.strokeRect(-9, -18, 18, 36);
    x.restore();
  }
  // the speed-limit lines across the lane, where the pit wall starts and ends
  x.strokeStyle = '#f4f4f8';
  for (const at of [pit.wallFrom, pit.wallTo]) {
    const q = pit.points.find((p) => p.idx === at)!;
    const a = PIT.offset - LANE_IN;
    const b = PIT.offset + LANE_OUT;
    x.beginPath();
    x.moveTo(q.x + Math.cos(q.dir) * (a - PIT.offset) * pit.side, q.y + Math.sin(q.dir) * (a - PIT.offset) * pit.side);
    x.lineTo(q.x + Math.cos(q.dir) * (b - PIT.offset) * pit.side, q.y + Math.sin(q.dir) * (b - PIT.offset) * pit.side);
    x.stroke();
  }
  // asphalt
  x.strokeStyle = '#4a4d59';
  x.lineWidth = HALF_WIDTH * 2;
  path(pts);
  x.stroke();
  // the banking: seams in its concrete running along the track, so it reads as a slope, out to the walls
  const banked = pts.map((_, i) => Math.abs(circuit.bank[i]) > 0.02);
  if (banked.some(Boolean)) {
    x.strokeStyle = SEAM;
    x.lineWidth = 1;
    // (a sample's banking rises toward its sign's side)
    const outside = Math.sign(circuit.bank.find((b) => b !== 0)!);
    for (const side of [-1, 1]) {
      for (let off = HALF_WIDTH + 12; off < HALF_WIDTH + RUNOFF; off += side === outside ? 12 : 24) {
        const line = offset(side * off);
        x.beginPath();
        pts.forEach((_, i) => {
          if (!banked[i]) return;
          if (banked[(i - 1 + pts.length) % pts.length]) x.lineTo(line[i].x, line[i].y);
          else x.moveTo(line[i].x, line[i].y);
        });
        x.stroke();
      }
    }
  }
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
      if (Math.abs(pts[i].curve) < TIGHT) continue;
      const a = edge[i];
      const b = edge[(i + 1) % pts.length];
      x.strokeStyle = Math.floor(i / 1) % 2 === 0 ? '#d8323c' : '#f4f4f8';
      x.beginPath();
      x.moveTo(a.x, a.y);
      x.lineTo(b.x, b.y);
      x.stroke();
    }
  }
  // track limits: a yellow-and-black strip round each marked corner's apex, just off the inside edge (past it is a cut)
  x.lineWidth = 4;
  for (const k of markCorners(track)) {
    const edge = offset(k.side * (HALF_WIDTH + 6));
    for (let j = -5; j < 5; j++) {
      const a = edge[(k.apex + j + pts.length) % pts.length];
      const b = edge[(k.apex + j + 1 + pts.length) % pts.length];
      x.strokeStyle = (j + 5) % 2 === 0 ? '#f2c14e' : '#1b1b26';
      x.beginPath();
      x.moveTo(a.x, a.y);
      x.lineTo(b.x, b.y);
      x.stroke();
    }
  }
  // a street circuit's tunnel: darker under the roof, with a row of lamps along each side
  const tunnel = circuit.layout.street?.tunnel;
  if (tunnel) {
    const [from, to] = tunnel.map((d) => Math.round(d / track.spacing));
    const run = pts.slice(from, to + 1);
    x.strokeStyle = '#2f3139';
    x.lineWidth = HALF_WIDTH * 2 - 6;
    path(run, false);
    x.stroke();
    x.fillStyle = '#f2d36b';
    for (const side of [-1, 1]) {
      const edge = offset(side * (HALF_WIDTH - 8));
      for (let k = from; k <= to; k += 3) x.fillRect(Math.round(edge[k].x) - 1, Math.round(edge[k].y) - 1, 3, 3);
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
  // the top three's parking spots past the line: a gold frame each, numbered 1, 2, 3 (read from behind)
  circuit.pit.podium.forEach((spot, k) => {
    const s = track.samples[spot.idx];
    x.save();
    x.translate(s.x + Math.cos(s.dir) * spot.lane, s.y + Math.sin(s.dir) * spot.lane);
    x.rotate(s.dir);
    x.strokeStyle = '#f2c14e';
    x.lineWidth = 2;
    x.strokeRect(-10, -19, 20, 38);
    x.fillStyle = '#f2c14e';
    x.font = 'bold 14px monospace';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(String(k + 1), 0, 28);
    x.restore();
  });
  return c;
}

function grandstand(len: number, roofColor = 0x3d7fc4): THREE.Mesh {
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
  const roof = new THREE.MeshLambertMaterial({ color: roofColor });
  // a stepped stand is suggested by a tall box with the crowd painted on the face toward the track (−x)
  const m = new THREE.Mesh(new THREE.BoxGeometry(18, 22, len), [grey, crowd, roof, grey, grey, grey]);
  m.castShadow = m.receiveShadow = true;
  return m;
}

/** The circuit in `weather`: its sky and light, and the ground darker when it's wet. */
export function createCircuitScene(circuit: Circuit, weather: Weather = DRY): CircuitScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fb8e8');
  const light = addDaylight(scene);
  light.setSky(weather.sky);
  const { width: W, height: H, cells, grid, track } = circuit;

  const geo = new THREE.PlaneGeometry(W * T, H * T, W, H).rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, grid.heights![i]);
  geo.computeVertexNormals();
  const ground = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: pixelTexture(paint(circuit)), color: weather.groundTint }));
  ground.position.set((W * T) / 2, 0, (H * T) / 2);
  ground.receiveShadow = true;
  const street = circuit.layout.street;
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: new THREE.Color(street ? STREET.town : 0x4b9444).multiply(new THREE.Color(weather.groundTint)) }));
  outer.position.set((W * T) / 2, -1, (H * T) / 2);
  outer.receiveShadow = true;
  scene.add(ground, outer);

  // tyre walls: on every wall tile that touches the run-off, stacked red and white (the garages
  // stand behind the pit lane instead); concrete blocks along the pit wall
  const cell = (i: number, j: number) => (i >= 0 && j >= 0 && i < W && j < H ? cells[j * W + i] : 'wall');
  const walls: [number, number][] = [];
  const pitWall: [number, number][] = [];
  /** the banking's: a concrete wall with a catch fence on top */
  const bankWall: [number, number][] = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (cells[j * W + i] === 'pitwall') pitWall.push([i, j]);
      if (cells[j * W + i] !== 'wall') continue;
      let near = false;
      let byPits = false;
      let byApron = false;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const c = cell(i + di, j + dj);
          near ||= c !== 'wall' && c !== 'pitwall';
          byPits ||= c === 'pit';
          byApron ||= c === 'apron';
        }
      }
      if (near && !byPits) (byApron ? bankWall : walls).push([i, j]);
    }
  }
  // (a street circuit: steel barriers, grey with red and white bands, in place of tyre stacks)
  const tyres = new THREE.InstancedMesh(street ? new THREE.BoxGeometry(T, 9, T) : new THREE.CylinderGeometry(7, 7, 7, 8), new THREE.MeshLambertMaterial({ color: 0xffffff }), walls.length);
  const m = new THREE.Matrix4();
  const red = new THREE.Color('#d8323c');
  const white = new THREE.Color('#f4f4f8');
  const steel = new THREE.Color('#b8bcc6');
  walls.forEach(([i, j], k) => {
    const h = groundAt(grid, (i + 0.5) * T, (j + 0.5) * T).h;
    m.makeTranslation((i + 0.5) * T, h + (street ? 4.5 : 3.5), (j + 0.5) * T);
    tyres.setMatrixAt(k, m);
    tyres.setColorAt(k, street ? ((i + j) % 6 === 0 ? red : (i + j) % 6 === 3 ? white : steel) : (i + j) % 2 === 0 ? red : white);
  });
  tyres.castShadow = tyres.receiveShadow = true;
  scene.add(tyres);
  if (bankWall.length) {
    const concrete = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 12, T), new THREE.MeshLambertMaterial({ color: 0xd4d2cc }), bankWall.length);
    const fence = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 10, T), new THREE.MeshLambertMaterial({ color: 0x5d6270, transparent: true, opacity: 0.45, depthWrite: false }), bankWall.length);
    bankWall.forEach(([i, j], k) => {
      const h = groundAt(grid, (i + 0.5) * T, (j + 0.5) * T).h;
      m.makeTranslation((i + 0.5) * T, h + 6, (j + 0.5) * T);
      concrete.setMatrixAt(k, m);
      m.makeTranslation((i + 0.5) * T, h + 17, (j + 0.5) * T);
      fence.setMatrixAt(k, m);
    });
    concrete.castShadow = concrete.receiveShadow = true;
    scene.add(concrete, fence);
  }
  const blocks = new THREE.InstancedMesh(new THREE.BoxGeometry(T, 8, T), new THREE.MeshLambertMaterial({ color: 0xc9ccd4 }), pitWall.length);
  pitWall.forEach(([i, j], k) => {
    m.makeTranslation((i + 0.5) * T, groundAt(grid, (i + 0.5) * T, (j + 0.5) * T).h + 4, (j + 0.5) * T);
    blocks.setMatrixAt(k, m);
  });
  blocks.castShadow = blocks.receiveShadow = true;
  scene.add(blocks);

  // the garages: a row behind the pit lane, one open front facing each box, under one long roof
  const { pit } = circuit;
  const grey = new THREE.MeshLambertMaterial({ color: 0x8e929c });
  const door = new THREE.MeshLambertMaterial({ color: 0x23222e });
  const roof = new THREE.MeshLambertMaterial({ color: 0xf4f4f8 });
  // (turned to the track's direction, a box's +x face looks to the right of the way of the race)
  const faces = pit.side < 0 ? [door, grey, roof, grey, grey, grey] : [grey, door, roof, grey, grey, grey];
  const back = GARAGE_ACROSS * pit.side;
  for (const b of pit.boxes) {
    const q = pit.points.find((p) => p.s >= b)!;
    const gx = q.x + Math.cos(q.dir) * back;
    const gy = q.y + Math.sin(q.dir) * back;
    const garage = new THREE.Mesh(new THREE.BoxGeometry(24, 20, PIT.boxSpacing - 2), faces);
    garage.position.set(gx, groundAt(grid, gx, gy).h + 10, gy);
    garage.rotation.y = -q.dir;
    garage.castShadow = garage.receiveShadow = true;
    scene.add(garage);
  }

  // grandstands: along the main straight (behind the start line, across it from the pits), and on a circuit in
  // the country round the outside of the bends; each with its own roof colour and flags on top, waving
  const roofs = [0x3d7fc4, 0xd8323c, 0xf2c14e, 0x3d9a5a, 0x8a3cc8, 0xf4f4f8];
  const flags: { flag: THREE.Mesh; phase: number }[] = [];
  standsOf(circuit).forEach((s, k) => {
    const stand = grandstand(s.len, s.at === 'start' ? 0x3d7fc4 : roofs[k % roofs.length]);
    stand.position.set(s.x, groundAt(grid, s.x, s.y).h + 11, s.y);
    // (the crowd's face toward the track)
    stand.rotation.y = -s.dir + (s.side < 0 ? Math.PI : 0);
    scene.add(stand);
    // flags on poles along its back, in the teams' colours
    for (const along of [-0.35, 0, 0.35]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 10, 4), new THREE.MeshLambertMaterial({ color: 0xc9ccd4 }));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(8, 5).translate(4, 0, 0), new THREE.MeshLambertMaterial({ color: FLAG_COLORS[(k * 3 + Math.round(along * 3) + 1) % FLAG_COLORS.length], side: THREE.DoubleSide }));
      // (in the stand's own space: its back is +x, away from the track; its length runs along z)
      pole.position.set(7, 16, along * s.len);
      flag.position.set(7, 18.5, along * s.len);
      stand.add(pole, flag);
      flags.push({ flag, phase: k * 1.7 + along * 5 });
    }
  });
  const town = street ? buildTown(scene, circuit) : undefined;
  // (at a circuit whose podium hangs over the main straight: its deck)
  const deck = createPodiumDeck(circuit);
  if (deck) scene.add(deck);

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
    // the pit lane, thin and grey
    mx.strokeStyle = '#9d9ab8';
    mx.lineWidth = 1;
    mx.beginPath();
    circuit.pit.points.forEach((p, i) => {
      const q = toMap(p.x, p.y);
      if (i) mx.lineTo(q.x, q.y);
      else mx.moveTo(q.x, q.y);
    });
    mx.stroke();
    const s = toMap(track.samples[0].x, track.samples[0].y);
    mx.fillStyle = '#f2c14e';
    mx.fillRect(s.x - 3, s.y - 1, 6, 2);
    return { canvas: mc, toMap };
  };

  return {
    scene,
    ...light,
    minimap,
    animate: (t) => {
      town?.animate(t);
      // the flags flap in the wind
      for (const f of flags) f.flag.rotation.y = Math.sin(t * 3 + f.phase) * 0.5 + Math.sin(t * 7.3 + f.phase) * 0.15;
    },
  };
}
