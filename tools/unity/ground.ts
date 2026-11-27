// Browser half of `npm run unity:grounds` (grounds.mjs): builds a circuit and its three.js scene exactly as the web game
// does, and hands back the ground's own painted picture (1 texel per map px: asphalt, edge lines, kerbs, grass stripes,
// gravel, pit lane, grid and start line), so the Unity port drapes the very same picture over its ground.
import * as THREE from 'three';
import { buildCircuit } from '../../src/f1/circuit';
import { LAYOUTS } from '../../src/f1/layouts';
import { lineCornerSpeed, lineDecel } from '../../src/f1/racing';
import { carClass } from '../../src/engine/driving';
import { DIFFICULTIES, handlingFor } from '../../src/f1/difficulty';
import { createCircuitScene, roofLetters } from '../../src/f1/circuitScene';

import { bakeScenery } from './scenery';

declare global { interface Window { groundIds: string[]; paintGround: (id: string) => string; paintRoof: (id: string) => string; scenery: (id: string) => { file: string; planes?: string; gopher?: string; yeti?: string; blossoms?: string; textures: string[]; moving: string[]; stats: string }; groundReady: boolean } }

window.groundIds = LAYOUTS.map((l) => l.id);
function circuitOf(id: string) {
  const layout = LAYOUTS.find((l) => l.id === id)!;
  const f1 = carClass('f1');
  const handling = handlingFor(DIFFICULTIES.find((d) => d.id === 'normal')!);
  return buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, handling), decel: lineDecel(f1) });
}

/** The word across the garages' roofs (layout.pitRoof), the whole row's picture, or '' for none. */
window.paintRoof = (id: string) => {
  const c = circuitOf(id);
  if (!c.layout.pitRoof) return '';
  const roof = roofLetters(c, c.layout.pitRoof)[0];
  const img = (roof?.material as THREE.MeshLambertMaterial | undefined)?.map?.image as HTMLCanvasElement | undefined;
  return img ? img.toDataURL('image/png') : '';
};

window.paintGround = (id: string) => {
  const c = circuitOf(id);
  const scene = createCircuitScene(c);
  const W = c.width * c.grid.tile, H = c.height * c.grid.tile;
  let found: HTMLCanvasElement | undefined;
  scene.scene.traverse((o) => {
    const map = ((o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined)?.map;
    const img = map?.image as HTMLCanvasElement | undefined;
    if (!found && img instanceof HTMLCanvasElement && img.width === W && img.height === H) found = img;
  });
  if (!found) throw new Error(`no ${W}x${H} ground picture in ${id}'s scene`);
  return gravelToTheKerb(c, found).toDataURL('image/png');
};
/** The scene's still parts for Unity (scenery.ts), the file as base64. */
window.scenery = (id: string) => {
  const c = circuitOf(id);
  const r = bakeScenery(c, { w: c.width * c.grid.tile, h: c.height * c.grid.tile });
  const b64 = (buf: ArrayBuffer) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  return { file: b64(r.file), planes: r.planes && b64(r.planes), gopher: r.gopher && b64(r.gopher), yeti: r.yeti && b64(r.yeti), blossoms: r.blossoms, textures: r.textures, moving: r.moving, stats: r.stats };
};

window.groundReady = true;

/** What the web painter lays under the track's and kerbs' tiles (circuitScene.ts): grass (mown stripes, and its dots), or in
 * the desert the run-off's smoothed sand (its stripes, and its specks). */
const GRASS = [0x5aa84f, 0x62b156, 0x3f8a3c];
const RUNOFF_SAND = [0xe4c896, 0xdcbf8a, 0xc49e66];

/**
 * The picture with the gravel traps run right up to the kerbs. The web painter paints tile by tile, the track's and kerbs'
 * tiles grass (the smooth track is painted over them), so where a tile pokes out past the track's edge beside a trap, a
 * step of grass shows between the kerb and the gravel; here that grass is the trap's gravel instead (its colour and specks,
 * as the painter's).
 */
function gravelToTheKerb(c: ReturnType<typeof circuitOf>, picture: HTMLCanvasElement): HTMLCanvasElement {
  const T = c.grid.tile;
  const out = document.createElement('canvas');
  out.width = picture.width;
  out.height = picture.height;
  const x = out.getContext('2d')!;
  x.drawImage(picture, 0, 0);
  const desert = !!c.layout.desert;
  const base = desert ? 0xc08a5e : 0xd8c49a;
  const dots = desert ? [0xad7a50, 0xd29e72] : [0xc4ae82, 0xe6d6b0];
  const cell = (i: number, j: number) => (i >= 0 && j >= 0 && i < c.width && j < c.height ? c.cells[j * c.width + i] : 'wall');
  /** near enough one of the painter's colours under the track (the picture may come back a shade off) */
  const under = desert ? RUNOFF_SAND : GRASS;
  const grassy = (r: number, g: number, b: number) => under.some((k) => Math.abs(r - (k >> 16)) + Math.abs(g - ((k >> 8) & 255)) + Math.abs(b - (k & 255)) <= 6);
  let seed = 41;
  const r = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  let tiles = 0;
  for (let j = 0; j < c.height; j++) {
    for (let i = 0; i < c.width; i++) {
      const k = cell(i, j);
      if (k !== 'track' && k !== 'kerb') continue;
      if (![[1, 0], [-1, 0], [0, 1], [0, -1]].some(([di, dj]) => cell(i + di, j + dj) === 'gravel')) continue;
      const img = x.getImageData(i * T, j * T, T, T);
      const d = img.data;
      let changed = false;
      for (let q = 0; q < T * T; q++) {
        if (!grassy(d[q * 4], d[q * 4 + 1], d[q * 4 + 2])) continue;
        const col = r() < 0.04 ? dots[r() < 0.5 ? 0 : 1] : base;
        d[q * 4] = col >> 16;
        d[q * 4 + 1] = (col >> 8) & 255;
        d[q * 4 + 2] = col & 255;
        changed = true;
      }
      if (changed) { x.putImageData(img, i * T, j * T); tiles++; }
    }
  }
  console.log(`${c.layout.id}: gravel run up to the kerb on ${tiles} tiles`);
  return out;
}
