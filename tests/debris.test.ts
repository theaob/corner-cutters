import { describe, expect, it } from 'vitest';
import { DEBRIS, fling, gone, stepPiece, sunk } from '../src/engine/debris';
import { seededRandom } from '../src/engine/rng';

const dt = 1 / 60;
const flat = () => 0;

/** Step `p` until it rests (or `seconds` run out); the most it rose, the bounces, and the time it took. */
function land(p: ReturnType<typeof fling>, ground: (x: number, y: number) => number = flat, seconds = 10) {
  let top = p.h;
  let bounces = 0;
  let t = 0;
  for (; t < seconds && !p.rest; t += dt) {
    const falling = p.vh < 0;
    stepPiece(p, dt, ground);
    if (falling && p.vh > 0) bounces++;
    top = Math.max(top, p.h);
  }
  return { top, bounces, t };
}

describe('a part torn off in a crash', () => {
  it('flies up and outward, carrying on the way the car was going, then bounces and comes to rest on the ground', () => {
    // a car going north (−y) at 250 px/s loses a wheel off its right side (+x)
    const p = fling(0, 0, 4, 0, -250, { x: 1, y: 0 }, 1, seededRandom(1));
    const { top, bounces, t } = land(p);
    expect(p.rest).toBe(true);
    // (up a car length or so, and down again)
    expect(top).toBeGreaterThan(20);
    expect(top).toBeLessThan(60);
    expect(bounces).toBeGreaterThan(0);
    expect(t).toBeLessThan(6);
    expect(p.h).toBe(0);
    expect(p.x).toBeGreaterThan(20);
    expect(p.y).toBeLessThan(-40);
    // lying in its resting pose, turned only about the up axis
    expect(p.rot[0]).toBe(0);
    expect(p.rot[2]).toBe(0);
  });

  it('flies further and higher the harder the crash', () => {
    const soft = fling(0, 0, 4, 0, 0, { x: 1, y: 0 }, 0.2, () => 0.5);
    const hard = fling(0, 0, 4, 0, 0, { x: 1, y: 0 }, 1, () => 0.5);
    const a = land(soft);
    const b = land(hard);
    expect(b.top).toBeGreaterThan(a.top);
    expect(hard.x).toBeGreaterThan(soft.x);
  });

  it('lands on the ground where it is, up a hill as on the flat', () => {
    const hill = (x: number) => 20 + x * 0.1;
    const p = fling(0, 0, 25, 0, 0, { x: 1, y: 0 }, 0.6, seededRandom(4));
    land(p, hill);
    expect(p.rest).toBe(true);
    expect(p.h).toBeCloseTo(hill(p.x), 5);
  });

  it('lies a while, sinking away over its last second, then is gone', () => {
    const p = fling(0, 0, 4, 0, 0, { x: 1, y: 0 }, 0.5, seededRandom(2));
    land(p);
    expect(gone(p)).toBe(false);
    for (let t = 0; t < DEBRIS.lies - 1.5; t += dt) stepPiece(p, dt, flat);
    expect(sunk(p)).toBe(0);
    for (let t = 0; t < 1; t += dt) stepPiece(p, dt, flat);
    expect(sunk(p)).toBeGreaterThan(0);
    expect(gone(p)).toBe(false);
    for (let t = 0; t < 1; t += dt) stepPiece(p, dt, flat);
    expect(gone(p)).toBe(true);
  });
});

describe('the car, in parts', () => {
  it('has a nose (with the front wing) and four wheels a crash can tear off, thrown clear and put back on at a stop', async () => {
    const THREE = await import('three');
    const { createCarMesh } = await import('../src/engine/render/vehicles3d');
    const { DebrisLayer, refit } = await import('../src/engine/render/effects');
    const car = createCarMesh('f1');
    car.position.set(100, 0, 200);
    const { nose, wheels } = car.userData.parts;
    expect(wheels).toHaveLength(4);
    // the nose ahead of the wheels, at the front (the car faces −z)
    expect(nose.position.z).toBeLessThan(Math.min(...wheels.map((w) => w.position.z)));
    const layer = new DebrisLayer();
    layer.tear(nose, 0, -250, 1);
    layer.tear(wheels[1], 0, -250, 1, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
    layer.tear(nose, 0, -250, 1); // (already off: nothing more)
    expect(nose.visible).toBe(false);
    expect(wheels[1].visible).toBe(false);
    expect(layer.count).toBe(2);
    const [noseCopy, wheelCopy] = layer.group.children;
    // thrown from where they were on the car
    expect(noseCopy.position.z).toBeCloseTo(200 + nose.position.z, 5);
    for (let t = 0; t < 1; t += dt) layer.update(dt, flat);
    expect(noseCopy.position.z).toBeLessThan(200 + nose.position.z - 40);
    expect(wheelCopy.position.x).toBeGreaterThan(100 + wheels[1].position.x);
    // at rest on the ground, then gone
    for (let t = 0; t < 6; t += dt) layer.update(dt, flat);
    expect(new THREE.Box3().setFromObject(wheelCopy).min.y).toBeCloseTo(0, 3);
    for (let t = 0; t < DEBRIS.lies + 1; t += dt) layer.update(dt, flat);
    expect(layer.count).toBe(0);
    refit(car);
    expect([nose, ...wheels].every((p) => p.visible)).toBe(true);
  });
});
