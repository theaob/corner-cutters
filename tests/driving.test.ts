import { describe, expect, it } from 'vitest';
import {
  CAR_CLASS_IDS,
  DEFAULT_HANDLING,
  applyDamage,
  bodyOffsets,
  maxClimb,
  zeroToTop,
  carClass,
  collideCars,
  condition,
  newCar,
  speedOf,
  stepCar,
  type Car,
  type DriveInput,
} from '../src/engine/driving';
import type { Grid } from '../src/engine/sim';

const open: Grid = { width: 200, height: 200, tile: 16, solid: new Array(40000).fill(false) };
const dt = 1 / 60;
const drive = (car: Car, input: DriveInput, seconds: number, grid = open, p = DEFAULT_HANDLING) => {
  let events: ReturnType<typeof stepCar> = { damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0 };
  let skidded = false;
  for (let t = 0; t < seconds; t += dt) {
    events = stepCar(car, input, p, dt, grid);
    skidded ||= events.skidding;
  }
  return { car, events, skidded };
};
const north: DriveInput = { steer: { x: 0, y: -1 }, handbrake: false };

describe('car classes', () => {
  it('follow the spec table', () => {
    const sedan = carClass('sedan');
    const muscle = carClass('muscle');
    const cop = carClass('cop');
    expect(sedan.topSpeed).toBeCloseTo(180);
    expect(muscle.topSpeed).toBeCloseTo(210);
    expect(cop.topSpeed).toBeCloseTo(200);
    expect(muscle.grip).toBeCloseTo(4.5);
    expect(cop.health).toBe(140);
  });
});

describe('stepCar', () => {
  it('accelerates on its engine: full torque from a standstill, tailing off with power, to top speed', () => {
    const cls = carClass('sedan');
    const t = zeroToTop(cls);
    // the sedan's reference 0 → top is about 1.2 s
    expect(t).toBeGreaterThan(0.9);
    expect(t).toBeLessThan(1.6);
    const early = drive(newCar(cls, 1600, 1600), north, 0.2).car;
    expect(speedOf(early)).toBeCloseTo((cls.torque / cls.mass) * 0.2, -1);
    const done = drive(newCar(cls, 1600, 1600), north, t + 0.3).car;
    expect(speedOf(done)).toBeCloseTo(cls.topSpeed, 0);
  });

  it('analogue throttle caps speed by how far the stick is pushed', () => {
    const car = drive(newCar(carClass('sedan'), 1600, 1600), { steer: { x: 0, y: -0.5 }, handbrake: false }, 3).car;
    expect(speedOf(car)).toBeCloseTo(90, 0);
  });

  it('slides sideways when turning hard at speed, more with the handbrake and more in a muscle car', () => {
    const turnHard = (id: 'sedan' | 'muscle', handbrake: boolean) => {
      const car = drive(newCar(carClass(id), 1600, 1600), north, 2).car;
      return drive(car, { steer: { x: 1, y: 0 }, handbrake }, 0.5).skidded;
    };
    expect(turnHard('sedan', true)).toBe(true);
    expect(turnHard('muscle', false)).toBe(true);
    // a grippy car at a crawl doesn't slide
    const slow = newCar(carClass('cop'), 1600, 1600);
    expect(drive(slow, { steer: { x: 1, y: 0 }, handbrake: false }, 0.3).skidded).toBe(false);
  });

  it('turns around instead of reversing with 8-way input, and reverses from a crawl with analogue', () => {
    const back: DriveInput = { steer: { x: 0, y: 1 }, handbrake: false };
    const auto = drive(newCar(carClass('sedan'), 1600, 1600), back, 0.2).car;
    expect(auto.y).toBeCloseTo(1600, 0);
    const rev = drive(newCar(carClass('sedan'), 1600, 1600), back, 0.5, open, { ...DEFAULT_HANDLING, allowReverse: true }).car;
    expect(rev.y).toBeGreaterThan(1601);
    expect(rev.heading).toBeCloseTo(0, 1);
  });

  it('coasts to a stop with no input', () => {
    const car = drive(newCar(carClass('sedan'), 1600, 1600), north, 2).car;
    expect(speedOf(drive(car, { handbrake: false }, 3).car)).toBe(0);
  });
});

describe('damage', () => {
  // a wall column at x = 10 tiles
  const walled: Grid = { width: 40, height: 40, tile: 16, solid: Array.from({ length: 1600 }, (_, i) => i % 40 === 10) };

  it('hurts only above the crash threshold, and a full-speed head-on hit costs a sedan 60', () => {
    const slow = newCar(carClass('sedan'), 140, 300, Math.PI / 2);
    slow.vx = 50;
    expect(drive(slow, { handbrake: false }, 0.5, walled).car.health).toBe(100);
    const fast = newCar(carClass('sedan'), 140, 300, Math.PI / 2);
    fast.vx = 180;
    drive(fast, { steer: { x: 1, y: 0 }, handbrake: false }, 0.3, walled);
    expect(fast.health).toBeCloseTo(40, 0);
    expect(fast.x).toBeLessThan(160);
  });

  it('smokes, then burns, then is wrecked after burnTime', () => {
    const car = newCar(carClass('sedan'), 1600, 1600);
    applyDamage(car, 55, DEFAULT_HANDLING);
    expect(condition(car)).toBe('smoking');
    applyDamage(car, 30, DEFAULT_HANDLING);
    expect(condition(car)).toBe('burning');
    const { events } = drive(car, { handbrake: false }, DEFAULT_HANDLING.burnTime + 0.1);
    expect(condition(car)).toBe('wrecked');
    expect(events.wreckedNow || car.wrecked).toBe(true);
    // a wrecked car ignores input
    drive(car, north, 1);
    expect(speedOf(car)).toBe(0);
  });
});

describe('collideCars', () => {
  it('pushes the lighter car further and damages both by closing speed and mass', () => {
    const sedan = newCar(carClass('sedan'), 100, 100);
    const cop = newCar(carClass('cop'), 115, 100);
    sedan.vx = 200;
    const closing = collideCars(sedan, cop, DEFAULT_HANDLING);
    expect(closing).toBe(200);
    expect(cop.vx).toBeGreaterThan(0);
    expect(sedan.vx).toBeLessThan(200);
    expect(sedan.health).toBeLessThan(100);
    expect(cop.cls.health - cop.health).toBeLessThan(sedan.cls.health - sedan.health);
    // side by side: half-widths (7 + 7) plus 2 px
    expect(Math.hypot(cop.x - sedan.x, cop.y - sedan.y)).toBeCloseTo(16);
  });

  it('ignores cars that are apart or already separating', () => {
    const a = newCar(carClass('sedan'), 0, 0);
    const b = newCar(carClass('sedan'), 40, 0);
    expect(collideCars(a, b, DEFAULT_HANDLING)).toBe(0);
    b.x = 15;
    a.vx = -50;
    expect(collideCars(a, b, DEFAULT_HANDLING)).toBe(0);
  });
});

describe('vehicle classes', () => {
  it('has thirteen classes, each following the sedan reference', () => {
    expect(CAR_CLASS_IDS).toEqual([
      'sedan', 'taxi', 'muscle', 'sports', 'cop', 'van', 'trash', 'bus', 'pickup', 'offroad', 'tractor', 'combine', 'f1',
    ]);
    const fast = carClass('sports', { topSpeed: 200, zeroToTop: 1.2, brakeTime: 0.6, turnRate: 3, grip: 6 });
    expect(fast.topSpeed).toBeCloseTo((240 * 200) / 180);
  });

  it('makes big vehicles slow, heavy and tough, and the sports car the quickest', () => {
    const [bus, sports, sedan] = [carClass('bus'), carClass('sports'), carClass('sedan')];
    expect(bus.topSpeed).toBeLessThan(sedan.topSpeed);
    expect(bus.mass).toBeGreaterThan(2);
    expect(bus.health).toBeGreaterThan(sedan.health * 2);
    // of the road cars, the sports car is the fastest; only the F1 car beats it
    const roadCars = CAR_CLASS_IDS.filter((id) => id !== 'f1');
    expect(sports.topSpeed).toBe(Math.max(...roadCars.map((id) => carClass(id).topSpeed)));
  });

  it('makes the F1 car the fastest and quickest, light, grippy and fragile, and useless off road', () => {
    const all = CAR_CLASS_IDS.map((id) => carClass(id));
    const f1 = carClass('f1');
    expect(f1.topSpeed).toBe(Math.max(...all.map((c) => c.topSpeed)));
    expect(f1.grip).toBe(Math.max(...all.map((c) => c.grip)));
    expect(f1.health).toBe(Math.min(...all.map((c) => c.health)));
    expect(f1.offRoad).toBe(Math.min(...all.map((c) => c.offRoad)));
    expect(zeroToTop(f1)).toBeLessThan(1.6);
  });

  it('makes farm machines the slowest and the combine the heaviest and widest', () => {
    const all = CAR_CLASS_IDS.map((id) => carClass(id));
    const slowest = [...all].sort((a, b) => a.topSpeed - b.topSpeed).map((c) => c.id);
    expect(slowest.slice(0, 2)).toEqual(['combine', 'tractor']);
    const combine = carClass('combine');
    expect(combine.mass).toBe(Math.max(...all.map((c) => c.mass)));
    expect(combine.width).toBe(Math.max(...all.map((c) => c.width)));
    // still fits down a 2-tile alley
    expect(combine.width).toBeLessThan(32);
  });

  it('covers a long body with a row of circles from nose to tail', () => {
    expect(bodyOffsets(carClass('sedan'))).toEqual([-6, 0, 6]);
    const bus = bodyOffsets(carClass('bus'));
    expect(bus[0]).toBe(-16);
    expect(bus[bus.length - 1]).toBe(16);
    // gaps no bigger than a radius, so nothing slips between circles
    for (let i = 1; i < bus.length; i++) expect(bus[i] - bus[i - 1]).toBeLessThanOrEqual(9);
  });

  // a wall across the top of an open area, rows 0-1 solid
  const walled: Grid = {
    width: 20,
    height: 20,
    tile: 16,
    solid: Array.from({ length: 400 }, (_, i) => Math.floor(i / 20) < 2),
  };

  it("stops a bus when its nose reaches a wall, not its middle", () => {
    const bus = newCar(carClass('bus'), 160, 120);
    drive(bus, { steer: { x: 0, y: -1 }, handbrake: false }, 2, walled);
    // wall face at y = 32; the nose is 25 px ahead of the centre
    expect(bus.y).toBeGreaterThan(32 + 20);
  });

  it("won't swing a long body into a wall, and doesn't get stuck against one", () => {
    const bus = newCar(carClass('bus'), 160, 32 + 10, Math.PI / 2); // parked along the wall, facing east
    drive(bus, { steer: { x: 0, y: -1 }, handbrake: false }, 1, walled);
    // it can't turn to face the wall; at most it swings until the nose touches
    expect(bus.heading).toBeGreaterThan(1.4);
    drive(bus, { steer: { x: 1, y: 0 }, handbrake: false }, 1, walled);
    expect(bus.x).toBeGreaterThan(200);
  });

  it('shoves a sedan much further than a bus in a crash', () => {
    // both lying east-west, the sedan just north of the bus and driving into its side
    const sedan = newCar(carClass('sedan'), 100, 103, Math.PI / 2);
    const bus = newCar(carClass('bus'), 100, 120, Math.PI / 2);
    sedan.vy = 150;
    expect(collideCars(sedan, bus, DEFAULT_HANDLING)).toBe(150);
    // the change in speed goes by 1 / mass: the sedan's is 3× the bus's
    expect((150 - sedan.vy) / bus.vy).toBeCloseTo(3);
    expect(sedan.cls.health - sedan.health).toBeGreaterThan(bus.cls.health - bus.health);
  });
});

describe('rough ground', () => {
  // the whole map is rough
  const field: Grid = { ...open, rough: new Array(40000).fill(true) };
  const floor = (id: Parameters<typeof carClass>[0]) => {
    const car = newCar(carClass(id), 1600, 3000);
    const { events } = drive(car, { steer: { x: 0, y: -1 }, handbrake: false }, 4, field);
    return { speed: speedOf(car), events };
  };

  it('holds road cars to part of their top speed, off-road vehicles keep all of it', () => {
    expect(floor('sedan').speed).toBeCloseTo(180 * 0.55, 0);
    expect(floor('sports').speed).toBeCloseTo(240 * 0.4, 0);
    expect(floor('offroad').speed).toBeCloseTo(135, 0);
    expect(floor('pickup').speed).toBeCloseTo(140 * 0.85, 0);
    expect(floor('sedan').events.onRough).toBe(true);
  });

  it('slows a car that drives onto rough ground over a moment, not in one frame', () => {
    // smooth for the south half of the map (y > 1600), rough north of it
    const half: Grid = { ...open, rough: Array.from({ length: 40000 }, (_, i) => Math.floor(i / 200) < 100) };
    const car = newCar(carClass('sedan'), 1600, 1900);
    drive(car, { steer: { x: 0, y: -1 }, handbrake: false }, 4, half);
    expect(car.y).toBeLessThan(1600);
    const onto = newCar(carClass('sedan'), 1600, 1600 + 5);
    onto.vy = -180;
    drive(onto, { steer: { x: 0, y: -1 }, handbrake: false }, 0.1, half);
    expect(speedOf(onto)).toBeGreaterThan(120);
    drive(onto, { steer: { x: 0, y: -1 }, handbrake: false }, 1.5, half);
    expect(speedOf(onto)).toBeCloseTo(99, 0);
  });

  it('makes road cars slide more on rough ground', () => {
    const slide = (grid: Grid) => {
      const car = newCar(carClass('sedan'), 1600, 1600);
      car.vx = 80; // moving sideways
      stepCar(car, { handbrake: false }, DEFAULT_HANDLING, 0.1, grid);
      return Math.abs(car.vx);
    };
    expect(slide(field)).toBeGreaterThan(slide(open));
  });
});

describe('slopes, ramps and banks', () => {
  const W = 200;
  const H = 200;
  /** An open map whose corner heights come from f(corner x, corner y) in tiles. */
  const terrain = (f: (cx: number, cy: number) => number): Grid => {
    const heights: number[] = [];
    for (let cy = 0; cy <= H; cy++) for (let cx = 0; cx <= W; cx++) heights.push(f(cx, cy));
    return { ...open, heights };
  };

  it('slows a car climbing a hill and speeds it up coming down', () => {
    // a long slope rising northward from row 150 to row 100 (y decreasing), 0.25 px per px
    const hill = terrain((_, cy) => Math.max(0, Math.min(50, 150 - cy)) * 4);
    // gravity eats into the engine's pull, so the climb gains speed more slowly
    const up = newCar(carClass('sedan'), 1600, 150 * 16);
    drive(up, north, 1.5, hill);
    const flat = newCar(carClass('sedan'), 1600, 150 * 16);
    drive(flat, north, 1.5);
    expect(speedOf(up)).toBeLessThan(speedOf(flat) - 20);
    expect(up.z).toBeGreaterThan(15);
    // coasting downhill (no throttle) keeps more speed than on the flat
    const coast = (grid: Grid) => {
      const car = newCar(carClass('sedan'), 1600, 102 * 16, Math.PI);
      car.vy = 100;
      drive(car, { handbrake: false }, 0.5, grid);
      return speedOf(car);
    };
    expect(coast(hill)).toBeGreaterThan(coast(open) + 10);
  });

  it('works out how steep a climb each engine manages from torque and mass', () => {
    const climb = (id: Parameters<typeof carClass>[0]) => maxClimb(carClass(id), DEFAULT_HANDLING);
    // geared for pulling: the tractor and combine out-climb the bus and trash truck
    expect(climb('combine')).toBeGreaterThan(climb('bus') * 2);
    expect(climb('tractor')).toBeGreaterThan(climb('trash') * 2);
    // nothing drives up the kicker ramp (0.75) on engine alone
    for (const id of CAR_CLASS_IDS) expect(climb(id)).toBeLessThan(0.75);
  });

  it('lets a heavy bus stall on a hill the combine crawls up', () => {
    const hill = terrain((_, cy) => Math.max(0, Math.min(40, 150 - cy)) * 4.8); // 0.3 per px
    const bus = newCar(carClass('bus'), 1600, 150 * 16 - 4);
    drive(bus, north, 4, hill);
    expect(bus.y).toBeGreaterThan(150 * 16 - 30);
  });

  it('lets the combine (heavy, but geared for torque) drive up a hill instead of rolling back', () => {
    // 0.3 per px: the steepest part of the test course's crest
    const hill = terrain((_, cy) => Math.max(0, Math.min(40, 150 - cy)) * 4.8);
    const combine = newCar(carClass('combine'), 1600, 150 * 16);
    drive(combine, north, 6, hill);
    expect(combine.y).toBeLessThan(150 * 16 - 60);
    expect(combine.vy).toBeLessThan(0); // still going up
  });

  it('launches a car off a ramp lip, and it lands again', () => {
    // kicker: rises 30 px over 3 tiles to a lip at x = 103, then drops away
    const ramp = terrain((cx) => (cx >= 100 && cx <= 103 ? (cx - 100) * 10 : 0));
    const car = newCar(carClass('sedan'), 90 * 16, 1600, Math.PI / 2);
    car.vx = 180;
    let flew = false;
    let landed = 0;
    for (let t = 0; t < 3; t += dt) {
      const ev = stepCar(car, { steer: { x: 1, y: 0 }, handbrake: false }, DEFAULT_HANDLING, dt, ramp);
      flew ||= ev.airborne;
      landed = Math.max(landed, ev.landed);
    }
    expect(flew).toBe(true);
    expect(landed).toBeGreaterThan(0);
    expect(car.airborne).toBe(false);
    expect(car.z).toBeCloseTo(0);
  });

  // kicker like the test course's: rises 36 px over x = 100..103 (0.75 per px), then a face straight down at 103..104
  const kicker = terrain((cx) => (cx >= 100 && cx <= 103 ? (cx - 100) * 12 : 0));
  const eastward = { steer: { x: 1, y: 0 }, handbrake: false };

  it('stalls a slow car on a steep ramp and rolls it back down, even at full throttle', () => {
    // at the foot of the ramp, crawling
    const car = newCar(carClass('sedan'), 100 * 16 - 1, 1600, Math.PI / 2);
    car.vx = 70;
    let flew = false;
    let highest = 0;
    for (let t = 0; t < 3; t += dt) {
      flew ||= stepCar(car, eastward, DEFAULT_HANDLING, dt, kicker).airborne;
      highest = Math.max(highest, car.z);
    }
    expect(flew).toBe(false);
    expect(highest).toBeLessThan(30);
    // it never got over: it's still on the ramp or at its foot, stalling and rolling back
    expect(car.x).toBeLessThan(103 * 16);
  });

  it('lets a fast car carry its momentum up the ramp and jump', () => {
    const car = newCar(carClass('sedan'), 90 * 16, 1600, Math.PI / 2);
    car.vx = 180;
    let flew = false;
    for (let t = 0; t < 1.5; t += dt) flew ||= stepCar(car, eastward, DEFAULT_HANDLING, dt, kicker).airborne;
    expect(flew).toBe(true);
  });

  // a raised block, 30 px up, with steep sides (like the side of a ramp)
  const block = terrain((cx, cy) => (cx >= 100 && cx <= 110 && cy >= 100 && cy <= 110 ? 30 : 0));

  it('lets a car at speed take the steep side of a ramp at an angle, with a hop, not a launch', () => {
    const car = newCar(carClass('sedan'), 98 * 16, 113 * 16, Math.PI / 4);
    car.vx = 180 * Math.SQRT1_2;
    car.vy = -180 * Math.SQRT1_2;
    let highest = 0;
    let got = false;
    for (let t = 0; t < 1.2; t += dt) {
      stepCar(car, { steer: { x: Math.SQRT1_2, y: -Math.SQRT1_2 }, handbrake: false }, DEFAULT_HANDLING, dt, block);
      highest = Math.max(highest, car.z);
      got ||= !car.airborne && car.z > 28;
    }
    // it got up onto the block and never flew far above it
    expect(got).toBe(true);
    expect(highest).toBeLessThan(30 + 40);
    expect(car.health).toBe(100);
  });

  it("stops a slow car at the steep side, and it slides back off", () => {
    const car = newCar(carClass('sedan'), 105 * 16, 110 * 16 + 18, 0);
    car.vy = -40;
    drive(car, north, 2, block);
    expect(car.z).toBeLessThan(25);
    expect(car.y).toBeGreaterThan(109 * 16);
  });

  it("can't steer in the air", () => {
    const car = newCar(carClass('sedan'), 1600, 1600, Math.PI / 2);
    Object.assign(car, { vx: 150, airborne: true, z: 40, vz: 50 });
    stepCar(car, { steer: { x: 0, y: -1 }, handbrake: false }, DEFAULT_HANDLING, dt, open);
    expect(car.heading).toBeCloseTo(Math.PI / 2);
  });

  it('damages a car that lands hard', () => {
    const car = newCar(carClass('sedan'), 1600, 1600);
    Object.assign(car, { airborne: true, z: 5, vz: -300 });
    const ev = stepCar(car, { handbrake: false }, DEFAULT_HANDLING, dt, open);
    expect(ev.landed).toBeGreaterThan(290);
    expect(car.health).toBeLessThan(100);
    // a gentle landing is free
    const soft = newCar(carClass('sedan'), 1600, 1600);
    Object.assign(soft, { airborne: true, z: 1, vz: -100 });
    stepCar(soft, { handbrake: false }, DEFAULT_HANDLING, dt, open);
    expect(soft.health).toBe(100);
  });

  it('pushes a car toward the low side of a banked road', () => {
    // road rising to the east (the outside of a left-hand bend)
    const bank = terrain((cx) => cx * 5);
    const car = newCar(carClass('sedan'), 1600, 1600, 0);
    car.vy = -150;
    drive(car, north, 0.5, bank);
    expect(car.x).toBeLessThan(1600);
  });
});

describe('robustness', () => {
  it('ignores a zero or negative time step instead of turning the car to NaN', () => {
    const car = newCar(carClass('f1'), 1600, 1600);
    car.vx = 50;
    for (const dt of [0, -0.004]) {
      for (const p of [DEFAULT_HANDLING, { ...DEFAULT_HANDLING, lateralGrip: 20, slideScrub: 2 }]) {
        stepCar(car, { steer: { x: 1, y: 0 }, handbrake: true, brake: true }, p, dt, open);
      }
    }
    expect([car.x, car.y, car.vx, car.vy, car.heading, car.z]).toEqual([1600, 1600, 50, 0, 0, 0]);
    stepCar(car, { handbrake: true }, DEFAULT_HANDLING, 1 / 60, open);
    expect(Number.isFinite(car.x) && Number.isFinite(car.vx)).toBe(true);
  });
});

