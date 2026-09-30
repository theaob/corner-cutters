import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createCeremony } from '../src/f1/podium3d';

/** The ceremony's points (the champagne first, then the confetti), as their positions. */
const points = (group: THREE.Group) => group.children.filter((c): c is THREE.Points => c instanceof THREE.Points).map((p) => p.geometry.attributes.position as THREE.BufferAttribute);

describe('the champagne ceremony', () => {
  it('stands the top three on their steps, the winner highest, in their colours', () => {
    const c = createCeremony();
    c.setDrivers([
      { body: '#1e2b5c', trim: '#f2c14e', helmet: '#f2c14e' },
      { body: '#dc0000', trim: '#fff200', helmet: '#f4f4f8' },
      { body: '#ff8000', trim: '#1b1b26', helmet: '#f4f4f8' },
    ]);
    c.update(0, 0);
    const figures = c.group.children.filter((o) => o instanceof THREE.Group) as THREE.Group[];
    expect(figures).toHaveLength(3);
    const [p1, p2, p3] = figures;
    expect(p1.position.y).toBeGreaterThan(p2.position.y);
    expect(p2.position.y).toBeGreaterThan(p3.position.y);
    // second on the winner's left, third on the right
    expect(p2.position.x).toBeLessThan(p1.position.x);
    expect(p3.position.x).toBeGreaterThan(p1.position.x);
  });

  it('with fewer than three finishers, shows only those', () => {
    const c = createCeremony();
    c.setDrivers([{ body: '#fff', trim: '#000', helmet: '#f2c14e' }]);
    const figures = c.group.children.filter((o) => o instanceof THREE.Group);
    expect(figures.filter((f) => f.visible)).toHaveLength(1);
  });

  it('sprays champagne up from the bottles after a moment, while confetti falls', () => {
    const c = createCeremony();
    c.setDrivers([0, 1, 2].map(() => ({ body: '#fff', trim: '#000', helmet: '#fff' })));
    const [spray, confetti] = points(c.group);
    const inTheAir = () => Array.from({ length: spray.count }, (_, i) => spray.getY(i)).filter((y) => y > 16).length;
    let t = 0;
    for (; t < 1; t += 1 / 60) c.update(t, 1 / 60);
    expect(inTheAir()).toBe(0);
    const before = confetti.getY(0);
    for (; t < 2.5; t += 1 / 60) c.update(t, 1 / 60);
    expect(inTheAir()).toBeGreaterThan(30);
    expect(confetti.getY(0)).not.toBe(before);
  });
});
