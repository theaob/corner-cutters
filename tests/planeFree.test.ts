import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { disposeDeep } from '../src/engine/render/dispose';
import { mergedByMaterial } from '../src/engine/render/merge';
import { buildPlanes, planeModel } from '../src/f1/planes';

// A plane's freeing threw every frame on phones ("Cannot convert undefined or null to object", in the scenery's
// step): its tail cone's groups are 0 and 2, so its merged body had a hole in its materials, and the plane that
// failed to free was tried again the next frame, and the next: the race's picture frozen on the grid.
describe('freeing a plane', () => {
  it('a merged cone has a material for every face', () => {
    const g = new THREE.ConeGeometry(6, 22, 12);
    const red = new THREE.MeshBasicMaterial();
    const mesh = mergedByMaterial([{ geometry: g, faces: g.groups.map(() => red) }]);
    for (const m of [mesh.material].flat()) expect(m).toBeDefined();
  });

  it('a plane has no holes in its materials, and frees', () => {
    const { group } = planeModel(0xff0000);
    group.traverse((c) => {
      const m = (c as THREE.Mesh).material;
      if (m) for (const x of [m].flat()) expect(x).toBeDefined();
    });
    expect(() => disposeDeep(group)).not.toThrow();
  });

  it('a mesh with a hole in its materials still frees', () => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), [new THREE.MeshBasicMaterial(), undefined as unknown as THREE.Material]);
    expect(() => disposeDeep(mesh)).not.toThrow();
  });

  it('the planes fly for minutes, freed as they go, without a failing step', () => {
    const scene = new THREE.Scene();
    const { step } = buildPlanes(scene, 0);
    for (let i = 0; i < 20 * 300; i++) step(0.05, { x: 0, y: 0 });
    // (only those in the sky are in the scene)
    expect(scene.children.length).toBeLessThan(5);
  });
});
