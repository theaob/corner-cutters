import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildCircuit } from '../src/f1/circuit';
import { CRESCENT_PARK, ROYAL_PARK } from '../src/f1/layouts';
import { carClass } from '../src/engine/driving';
import { lineCornerSpeed, lineDecel } from '../src/f1/racing';
import { createCeremony, createPodiumDeck, podiumSpot, type Ceremony } from '../src/f1/podium3d';

/** What stands on the podium (the steps, the drivers, the champagne and confetti): the ceremony's stage. */
const stage = (c: Ceremony) => c.group.children.find((o) => o instanceof THREE.Group) as THREE.Group;
/** The ceremony's points (the champagne first, then the confetti), as their positions. */
const points = (c: Ceremony) => stage(c).children.filter((o): o is THREE.Points => o instanceof THREE.Points).map((p) => p.geometry.attributes.position as THREE.BufferAttribute);
const figures = (c: Ceremony) => stage(c).children.filter((o) => o.name === 'driver') as THREE.Group[];

describe('the champagne ceremony', () => {
  it('stands the top three on their steps, the winner highest, in their colours', () => {
    const c = createCeremony();
    c.setDrivers([
      { body: '#1e2b5c', trim: '#f2c14e', helmet: '#f2c14e' },
      { body: '#dc0000', trim: '#fff200', helmet: '#f4f4f8' },
      { body: '#ff8000', trim: '#1b1b26', helmet: '#f4f4f8' },
    ]);
    c.update(0, 0);
    expect(figures(c)).toHaveLength(3);
    const [p1, p2, p3] = figures(c);
    expect(p1.position.y).toBeGreaterThan(p2.position.y);
    expect(p2.position.y).toBeGreaterThan(p3.position.y);
    // second on the winner's left, third on the right
    expect(p2.position.x).toBeLessThan(p1.position.x);
    expect(p3.position.x).toBeGreaterThan(p1.position.x);
  });

  it('with fewer than three finishers, shows only those', () => {
    const c = createCeremony();
    c.setDrivers([{ body: '#fff', trim: '#000', helmet: '#f2c14e' }]);
    expect(figures(c).filter((f) => f.visible)).toHaveLength(1);
  });

  it('sprays champagne up from the bottles after a moment, while confetti falls', () => {
    const c = createCeremony();
    c.setDrivers([0, 1, 2].map(() => ({ body: '#fff', trim: '#000', helmet: '#fff' })));
    const [spray, confetti] = points(c);
    const inTheAir = () => Array.from({ length: spray.count }, (_, i) => spray.getY(i)).filter((y) => y > 16).length;
    let t = 0;
    for (; t < 1; t += 1 / 60) c.update(t, 1 / 60);
    expect(inTheAir()).toBe(0);
    const before = confetti.getY(0);
    for (; t < 2.5; t += 1 / 60) c.update(t, 1 / 60);
    expect(inTheAir()).toBeGreaterThan(30);
    expect(confetti.getY(0)).not.toBe(before);
  });

  const f1 = carClass('f1');
  const build = (layout: typeof ROYAL_PARK) => buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1), decel: lineDecel(f1) });

  it('stands on the run-off across the straight from the parked cars, at an ordinary circuit', () => {
    const circuit = build(CRESCENT_PARK);
    const spot = podiumSpot(circuit);
    const at = circuit.track.samples[circuit.pit.podium[1].idx];
    expect(spot.raise).toBe(0);
    expect(Math.hypot(spot.x - at.x, spot.y - at.y)).toBeGreaterThan(60);
    expect(createPodiumDeck(circuit)).toBeUndefined();
    expect(createCeremony().group.children.some((o) => o instanceof THREE.InstancedMesh)).toBe(false);
  });

  it('hangs over the middle of the main straight at Royal Park, up on its deck, the tifosi on the track below', () => {
    const circuit = build(ROYAL_PARK);
    const spot = podiumSpot(circuit);
    const at = circuit.track.samples[circuit.pit.podium[1].idx];
    expect(spot.raise).toBe(ROYAL_PARK.podiumDeck);
    expect(Math.hypot(spot.x - at.x, spot.y - at.y)).toBeLessThan(1);
    // the deck: its top at the podium's height, reaching from the pit side out over the track
    const deck = createPodiumDeck(circuit)!;
    deck.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(deck);
    expect(box.max.y).toBeGreaterThan(spot.h + spot.raise);
    const c = createCeremony(spot.raise);
    expect(stage(c).position.y).toBe(spot.raise);
    c.setDrivers([0, 1, 2].map(() => ({ body: '#fff', trim: '#000', helmet: '#fff' })));
    c.update(0.5, 1 / 60);
    const [crowd, heads, flags] = c.group.children.filter((o): o is THREE.InstancedMesh => o instanceof THREE.InstancedMesh);
    expect(crowd.count).toBeGreaterThan(100);
    expect(heads.count).toBe(crowd.count);
    expect(flags.count).toBeGreaterThan(20);
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    for (let i = 0; i < crowd.count; i++) {
      crowd.getMatrixAt(i, m);
      p.setFromMatrixPosition(m);
      // on the ground (jumping a little), in front of the deck, toward the camera
      expect(p.y).toBeLessThan(8);
      expect(p.z).toBeGreaterThan(0);
    }
  });
});
