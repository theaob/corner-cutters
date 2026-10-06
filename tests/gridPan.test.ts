import { describe, expect, it } from 'vitest';
import { GRID_PAN, panAt, panLength } from '../src/f1/gridPan';

const slots = Array.from({ length: 10 }, (_, k) => ({ x: (k % 2) * 32 - 16, y: k * 30 }));

describe('the grid pan', () => {
  it('starts on pole, and goes car by car to the back', () => {
    expect(panAt(slots, 0)).toEqual({ ...slots[0], car: 0 });
    let car = 0;
    for (let t = 0; t <= panLength(10); t += 0.05) {
      const at = panAt(slots, t);
      expect(at.car).toBeGreaterThanOrEqual(car);
      car = at.car;
    }
    expect(panAt(slots, panLength(10))).toEqual({ ...slots[9], car: 9 });
  });
  it('settles on each car: halfway between slots it moves fastest, at a slot it stops', () => {
    const t3 = GRID_PAN.hold + 3 * GRID_PAN.perCar;
    expect(panAt(slots, t3)).toMatchObject({ x: slots[3].x, y: slots[3].y, car: 3 });
    const mid = panAt(slots, t3 + GRID_PAN.perCar / 2);
    expect(mid.y).toBeCloseTo((slots[3].y + slots[4].y) / 2);
  });
  it('stops at the last car of a smaller grid, over the whole of its length', () => {
    for (const cars of [1, 4, 6, 9]) {
      const some = slots.slice(0, cars);
      for (let t = 0; t <= panLength(cars) + 0.5; t += 0.02) expect(panAt(some, t).car).toBeLessThan(cars);
      expect(panAt(some, panLength(cars)).car).toBe(cars - 1);
    }
  });
  it('takes a few seconds for a full grid', () => {
    expect(panLength(10)).toBeGreaterThan(5);
    expect(panLength(10)).toBeLessThan(8);
    expect(panLength(1)).toBe(GRID_PAN.hold + GRID_PAN.end);
  });
});
