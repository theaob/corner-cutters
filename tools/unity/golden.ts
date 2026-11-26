// Golden traces for the Unity port's C# core: this repo's own driving rules, run on a baked circuit with scripted
// inputs, so the C# side can replay the same inputs and check it ends up in the same place (Tests~/Core.Tests).
// Inputs are recorded open-loop (an autopilot's choices written down), so both sides see identical inputs.

import { readFileSync, writeFileSync } from 'node:fs';
import { carClass, newCar, stepCar, angleDiff, type Car } from '../../src/engine/driving';
import { readGamepad } from '../../src/engine/controls';
import type { Grid } from '../../src/engine/sim';
import { handlingFor, DIFFICULTIES } from '../../src/f1/difficulty';
import { GOPHER, GopherRun } from '../../src/f1/gopher';
import { YETI, YetiRun } from '../../src/f1/yeti';
import { HALF_WIDTH } from '../../src/f1/circuit';
import { keysWheel, newProgress, nearestSample, stepProgress, wheelInput, stickWheel, type Track, type WheelPad } from '../../src/f1/racing';

const TILE_OF = (id: string) => JSON.parse(readFileSync(`unity/Assets/Resources/Circuits/${id}.json`, 'utf8'));

function load(id: string) {
  const b = TILE_OF(id);
  const cells: string[] = b.cells.split('');
  const grid: Grid = {
    width: b.width, height: b.height, tile: b.tile,
    solid: cells.map((c) => c === 'W' || c === 'Q'),
    rough: cells.map((c) => c === 'G' || c === 'V'),
    heights: b.heights,
  };
  const n = b.samples.x.length;
  const track: Track = {
    spacing: b.spacing, length: b.length,
    samples: Array.from({ length: n }, (_, i) => ({ x: b.samples.x[i], y: b.samples.y[i], s: b.samples.s[i], dir: b.samples.dir[i], curve: b.samples.curve[i], speed: b.samples.speed[i] })),
  };
  return { b, grid, track };
}

const f1 = carClass('f1');
const handling = handlingFor(DIFFICULTIES.find((d) => d.id === 'normal')!);
const DT = 1 / 60;

interface Frame { turn: number; gas: number; brake: number; drift: boolean }

function run(id: string, frames: Frame[], start: { x: number; y: number; heading: number }, every = 10) {
  const { grid, track } = load(id);
  const car: Car = newCar(f1, start.x, start.y, start.heading);
  let prog = newProgress(nearestSample(track, car.x, car.y));
  const checks: Record<string, number>[] = [];
  frames.forEach((fr, i) => {
    const input = wheelInput(fr, car);
    stepCar(car, input, handling, DT, grid);
    prog = stepProgress(prog, track, car, (i + 1) * DT, 99, DT);
    if ((i + 1) % every === 0) {
      checks.push({ step: i + 1, x: car.x, y: car.y, heading: car.heading, vx: car.vx, vy: car.vy, health: car.health, z: car.z, vz: car.vz, airborne: car.airborne ? 1 : 0, wrecked: car.wrecked ? 1 : 0, lap: prog.lap, idx: prog.idx, sector: prog.sector, lapStart: prog.lapStart ?? -1, wrongWay: prog.wrongWay });
    }
  });
  return { frames, checks, lapTimes: prog.lapTimes };
}

export function goldenAll() {
  const id = 'crescent-park';
  const { b, grid, track } = load(id);
  const slot = b.slots[0];

  // 1) an autopilot that follows the racing line for two and a bit laps (the recorded inputs are what's replayed)
  const car = newCar(f1, slot.x, slot.y, slot.heading);
  let idx = nearestSample(track, car.x, car.y);
  const auto: Frame[] = [];
  for (let i = 0; i < 4200; i++) {
    idx = nearestSample(track, car.x, car.y, idx, true);
    const sp = Math.hypot(car.vx, car.vy);
    const ahead = track.samples[(idx + 6 + Math.round(sp / 40)) % track.samples.length];
    const want = Math.atan2(ahead.x - car.x, -(ahead.y - car.y));
    const turn = Math.max(-1, Math.min(1, angleDiff(want, car.heading) * 2.2));
    const target = track.samples[idx].speed * 0.97;
    const fr: Frame = { turn, gas: sp < target ? 1 : 0, brake: sp > target * 1.08 ? 1 : 0, drift: false };
    auto.push(fr);
    stepCar(car, wheelInput(fr, car), handling, DT, grid);
  }
  const lap = run(id, auto, slot);

  // 2) rough driving, open loop: gas, full lock both ways, drift, brake, reverse, into walls and onto the grass
  const rough: Frame[] = [];
  const seg = (n: number, f: Frame) => { for (let i = 0; i < n; i++) rough.push(f); };
  seg(120, { turn: 0, gas: 1, brake: 0, drift: false });
  seg(60, { turn: 1, gas: 1, brake: 0, drift: false });
  seg(60, { turn: -0.5, gas: 0.6, brake: 0, drift: true });
  seg(90, { turn: 0.3, gas: 1, brake: 0, drift: false });
  seg(60, { turn: 0, gas: 0, brake: 1, drift: false });
  seg(120, { turn: 0, gas: 0, brake: 1, drift: false });
  seg(240, { turn: 1, gas: 1, brake: 0, drift: false });
  seg(120, { turn: -1, gas: 1, brake: 0, drift: true });
  seg(300, { turn: 0, gas: 1, brake: 0, drift: false });
  seg(120, { turn: 0.2, gas: 0, brake: 1, drift: false });
  seg(300, { turn: -0.7, gas: 1, brake: 0, drift: false });
  const crash = run(id, rough, slot);

  // 3) the input mapping: keys, touch stick, and the wheel's shaping at a few car speeds
  const cars = [newCar(f1, 0, 0, 0), Object.assign(newCar(f1, 0, 0, 0.5), { vx: 100, vy: -150 }), Object.assign(newCar(f1, 0, 0, 0), { vy: -4 })];
  const pads: WheelPad[] = [
    keysWheel({ up: true, down: false, left: false, right: true }, false), keysWheel({ up: false, down: true, left: true, right: false }, true),
    stickWheel({ x: 0.4, y: -0.9 }, false), stickWheel({ x: -1, y: 0.7 }, false), { turn: 0.25, gas: 0.5, brake: 0, drift: false }, { turn: -0.6, gas: 0, brake: 0.9, drift: true },
  ];
  const wheel = cars.flatMap((c) => pads.map((p) => ({ car: { vx: c.vx, vy: c.vy, heading: c.heading }, pad: p, out: wheelInput(p, c) })));
  // gamepad reading (standard layout): axes + trigger values -> turn/gas/brake/stick and buttons
  const mk = (axes: number[], t6: number, t7: number, pressed: number[]) => ({
    axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: i === 6 ? t6 : i === 7 ? t7 : pressed.includes(i) ? 1 : 0 })),
  });
  const padCases = [mk([0, 0], 0, 0, []), mk([0.1, 0.1], 0, 0, []), mk([0.5, -0.3], 0, 1, [0]), mk([-1, 1], 0.7, 0.2, [3, 9]), mk([0.16, 0], 0, 0.5, [8, 12, 15]), mk([-0.2, -0.99], 1, 0, [13, 14])];
  const gamepad = padCases.map((p) => ({ pad: p, out: readGamepad(p) }));

  writeFileSync('unity/Tests~/Core.Tests/golden.json', JSON.stringify({ circuit: id, dt: DT, start: slot, lap, crash, wheel, gamepad }));
  console.log(`golden: lap checks ${lap.checks.length}, laps ${lap.lapTimes.length} (${lap.lapTimes.map((t) => t.toFixed(2)).join(', ')}), crash checks ${crash.checks.length}, final health ${crash.checks.at(-1)!.health}`);
}

/**
 * The gopher's crossings (Maple Island) and the yeti's chases (Glacier Pass), with a scripted car going round weaving
 * across the track (so it catches and hits the gopher): the car each frame, and the critter's pose every 6th
 * (critters.json, checked by Core.Tests against Core/Critters.cs).
 */
function goldenCritters() {
  const dt = 1 / 30;
  const frames = 3600;
  const drive = (track: Track) => {
    const cars: number[][] = [];
    let along = 0;
    for (let f = 0; f < frames; f++) {
      const t = f * dt;
      const v = 220 + 80 * Math.sin(t * 0.13);
      along = (along + (v * dt) / track.spacing) % track.samples.length;
      const p = track.samples[Math.floor(along)];
      const off = 32 * Math.sin(t * 0.9);
      cars.push([p.x + Math.cos(p.dir) * off, p.y + Math.sin(p.dir) * off, Math.sin(p.dir) * v, -Math.cos(p.dir) * v]);
    }
    return cars;
  };
  const r = (x: number) => Math.round(x * 1e9) / 1e9;
  const g = load('maple-island').track;
  const gCars = drive(g);
  const gopher = new GopherRun(g);
  const gPoses: (number[] | null)[] = [];
  gCars.forEach(([x, y, vx, vy], f) => {
    gopher.step(dt, [{ x, y, vx, vy }], { x, y });
    const p = gopher.pose();
    if (f % 6 === 5) gPoses.push(p ? [p.x, p.y, p.z, p.heading, p.up, p.step, p.tumble, p.running ? 1 : 0, p.dazed ? 1 : 0].map(r) : null);
  });
  const y = load('glacier-pass').track;
  const yCars = drive(y);
  const yeti = new YetiRun(y, []);
  const phases = ['wait', 'roar', 'chase', 'leave'];
  const yPoses: (number[] | null)[] = [];
  yCars.forEach(([x, yy], f) => {
    yeti.step(dt, { x, y: yy });
    const p = yeti.pose;
    if (f % 6 === 5) yPoses.push(p ? [p.x, p.y, p.heading, phases.indexOf(p.phase), p.t, p.step].map(r) : null);
  });
  writeFileSync('unity/Tests~/Core.Tests/critters.json', JSON.stringify({
    dt, halfWidth: HALF_WIDTH, gopher: { tuning: GOPHER, cars: gCars, poses: gPoses, crossings: gopher.crossings, bolts: gopher.bolts, hits: gopher.hits },
    yeti: { tuning: YETI, cars: yCars, poses: yPoses, chases: yeti.chases },
  }));
  console.log(`critters: gopher ${gopher.crossings} crossings, ${gopher.bolts} bolts, ${gopher.hits} hits; yeti ${yeti.chases} chases`);
}

if (process.argv[1]?.endsWith('golden.mjs')) {
  goldenAll();
  goldenCritters();
}
