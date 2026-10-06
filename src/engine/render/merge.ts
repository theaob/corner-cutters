// Fewer draw calls: boxes (or any geometry) with a material a face made one
// mesh, their faces gathered by material. A box of six materials is six draw
// calls, and six again for its shadow; many of them, too many for a phone.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** One mesh of `boxes` (each with a material a face, as BoxGeometry's groups have them): their faces gathered by material, a group each. */
export function mergedByMaterial(boxes: { geometry: THREE.BufferGeometry; faces: THREE.Material[] }[]): THREE.Mesh {
  const byMaterial = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const { geometry, faces } of boxes) {
    for (const g of geometry.groups) {
      const face = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) face.setAttribute(name, geometry.getAttribute(name));
      face.setIndex(Array.from(geometry.index!.array.slice(g.start, g.start + g.count)));
      const material = faces[g.materialIndex ?? 0];
      byMaterial.set(material, [...(byMaterial.get(material) ?? []), face.toNonIndexed()]);
    }
    geometry.dispose();
  }
  const materials = [...byMaterial.keys()];
  const merged = mergeGeometries(materials.map((m) => mergeGeometries(byMaterial.get(m)!)), true);
  return new THREE.Mesh(merged, materials);
}

