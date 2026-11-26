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

declare global { interface Window { groundIds: string[]; paintGround: (id: string) => string; paintRoof: (id: string) => string; groundReady: boolean } }

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
  return found.toDataURL('image/png');
};
window.groundReady = true;
