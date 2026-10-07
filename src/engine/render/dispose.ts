import * as THREE from 'three';

/**
 * Free what `o` and everything under it hold on the GPU: geometries, materials and their textures. For something
 * taken out of the scene for good (a car mesh replaced for the next session); the renderer's own dispose() frees
 * only what's still in the scene.
 */
export function disposeDeep(o: THREE.Object3D): void {
  o.traverse((c) => {
    const mesh = c as THREE.Mesh;
    mesh.geometry?.dispose();
    // (a material array can have holes: a group with no material, drawn as nothing)
    for (const m of [mesh.material ?? []].flat() as (THREE.Material | undefined)[]) {
      if (!m) continue;
      for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
      m.dispose();
    }
  });
}
