import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { mergedByMaterial } from '../src/engine/render/merge';
import { createCarMesh } from '../src/engine/render/vehicles3d';

/** draw calls a mesh takes: a group each, or one */
const callsOf = (m: THREE.Mesh) => (Array.isArray(m.material) ? m.geometry.groups.length : 1);
const trianglesOf = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

describe('boxes merged by material', () => {
  const a = new THREE.MeshLambertMaterial();
  const b = new THREE.MeshLambertMaterial();
  const boxes = () => [
    { geometry: new THREE.BoxGeometry(1, 1, 1), faces: [a, a, b, a, a, a] },
    { geometry: new THREE.BoxGeometry(2, 1, 1).translate(5, 0, 0), faces: [b, b, b, a, b, b] },
  ];

  it('are a draw call a material, every face kept, each with the material it had', () => {
    const m = mergedByMaterial(boxes());
    expect(m.material).toEqual([a, b]);
    expect(callsOf(m)).toBe(2);
    expect(trianglesOf(m.geometry)).toBe(2 * 12);
    // (the first box's faces in a: five of them; the second's in a: one)
    const [ga, gb] = m.geometry.groups;
    expect(ga.count / 6).toBe(6);
    expect(gb.count / 6).toBe(6);
    // (and where they were: the second box still 5 along)
    m.geometry.computeBoundingBox();
    expect(m.geometry.boundingBox!.max.x).toBeCloseTo(6);
  });

  it('make a car a few draw calls, not one a face', () => {
    const car = createCarMesh('f1', { body: '#d8323c', stripe: '#f4f4f8' });
    let calls = 0;
    car.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.visible) calls += callsOf(o as THREE.Mesh);
    });
    // (the body and nose a call a material, the helmet, and each wheel's tyre and band)
    expect(calls).toBeLessThan(25);
  });
});
