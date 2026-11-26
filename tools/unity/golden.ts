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
import { aiCraftFor, aiIncidentsFor, aiMistakesFor, aiPaceFor, paceRanks } from '../../src/f1/difficulty';
import { aiReaction } from '../../src/f1/launch';
import { driverSeats, teamGrid, TEAMS } from '../../src/f1/teams';
import { styleOf } from '../../src/f1/drivers';
import { seededRandom } from '../../src/engine/rng';
import { changeableForecast } from '../../src/f1/forecast';
import { newRace, stepRace, type RaceEvent } from '../../src/f1/raceControl';
import type { PitLane } from '../../src/f1/pits';
import type { AiDriver } from '../../src/f1/racing';
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

/** A circuit's track as race control sees it (its pit lane, its bridge, its dirt), from the baked JSON alone, as the C# side builds it. */
function loadRace(id: string) {
  const { b, grid, track } = load(id);
  track.dirt = b.dirt;
  track.tyreWear = b.tyreWear;
  if (b.levels) {
    const l = b.levels;
    track.levels = {
      upper: { ...grid, heights: l.heights, solid: l.solid.split('').map((c: string) => c === '1'), rough: l.rough ? l.rough.split('').map((c: string) => c === '1') : undefined },
      from: l.from, to: l.to, over: l.over, under: l.under, height: l.height,
    };
  }
  const q = b.pitLane;
  const pit: PitLane | undefined = q ? {
    ...q, points: q.points.x.map((x: number, k: number) => ({ x, y: q.points.y[k], s: q.points.s[k], dir: q.points.dir[k], idx: q.points.idx[k], off: q.points.off[k] })),
  } : undefined;
  return { b, grid, track, pit };
}

/**
 * Whole races, as the web game runs them: a weekend's field drawn from its seed (race.ts's drawWeekend), every car
 * driven by the AI (yours too, on a plain line), lights to flag. The C# side draws the same field from the same seed
 * and runs the same race; each car's state every second, and every race event, must match.
 */
function goldenRaces() {
  const races = [
    { id: 'crescent-park', seed: 12345, laps: 5, weather: 'dry' },
    { id: 'suzuka', seed: 777, laps: 3, weather: 'changeable' },
    { id: 'dust-bowl', seed: 4242, laps: 3, weather: 'wet' },
    { id: 'harbour', seed: 2, laps: 5, weather: 'damp' },
    { id: 'royal-park', seed: 3, laps: 5, weather: 'dry' },
    { id: 'twin-lakes', seed: 5, laps: 5, weather: 'dry' },
    { id: 'jade-spiral', seed: 6, laps: 5, weather: 'dry' },
    { id: 'oasis', seed: 13, laps: 5, weather: 'dry', difficulty: 'hard' },
  ] as const;
  const out = races.map((spec) => {
    const { b, grid, track, pit } = loadRace(spec.id);
    const seed = spec.seed;
    const level = DIFFICULTIES.find((d) => d.id === ('difficulty' in spec ? spec.difficulty : 'normal'))!;
    // (drawWeekend, as race.ts has it: 10 opponents, your team the first, the first seat)
    const rng = seededRandom(seed);
    const total = Math.min(b.slots.length, 1 + 10);
    const youDriver = Math.floor(total / 2);
    const teams = teamGrid(TEAMS[0], total, youDriver, rng);
    const seats = driverSeats(teams, youDriver, 0);
    const ranks = paceRanks(total, rng);
    const boxes = [...new Set(teams)];
    const drivers = teams.map((livery, k) => {
      const style = styleOf(livery.drivers[seats[k]]);
      const ai: AiDriver | undefined = k === youDriver ? undefined : {
        lane: ((k * 7) % 11) - 5, pace: aiPaceFor(level, ranks[k], total, 1), craft: aiCraftFor(level, rng, style.aggression),
        mistakes: aiMistakesFor(level, style.consistency), rng: seededRandom(Math.floor(rng() * 4294967296)),
        incidents: aiIncidentsFor(level, style.aggression),
      };
      if (ai) ai.reaction = aiReaction(seededRandom(((seed * 2654435761) ^ ((k + 1) * 40503)) >>> 0 || 1), ai.craft ?? 0.6, style.consistency);
      return { livery, seat: seats[k], ai, box: boxes.indexOf(livery) };
    });
    const lightsOut = 0.3 + rng() * 0.7;
    const draw = { teams: teams.map((t) => t.id), seats, ranks, lightsOut, drivers: drivers.map((d) => d.ai ? { lane: d.ai.lane, pace: d.ai.pace, craft: d.ai.craft ?? -1, mistakes: d.ai.mistakes ?? 0, incidents: d.ai.incidents ?? 0, reaction: d.ai.reaction ?? 0 } : null) };
    // (you on the AI too, on a plain line: the golden's own, not the game's)
    drivers[youDriver].ai = { lane: 0, pace: 0.94 };
    const field = drivers.map((d, i) => ({ car: newCar(f1, b.slots[i].x, b.slots[i].y, b.slots[i].heading), ai: d.ai, box: d.box }));
    const weather = spec.weather === 'changeable' ? changeableForecast(seed, (spec.laps * track.length) / 300) : spec.weather;
    const race = newRace(track, grid, handlingFor(level), spec.laps, field, lightsOut, pit, weather);
    const plans = race.entrants.map((e) => (e.plan ? { stints: e.plan.plan.stints.map((s) => [s.compound, s.laps]), stopAt: e.plan.stopAt ?? -1 } : null));
    const states: number[][][] = [];
    const events: (string | number)[][] = [];
    const kinds: Record<string, number> = {};
    let step = 0;
    const most = Math.round(((spec.laps + 2) * track.length) / 150 / DT);
    while (step < most) {
      const r = stepRace(race, DT);
      step++;
      for (const ev of r.race) {
        kinds[ev.kind] = (kinds[ev.kind] ?? 0) + 1;
        if (ev.kind === 'contact') continue;
        events.push([step, ev.kind, 'who' in ev ? ev.who : -1]);
      }
      if (step % 60 === 0) {
        states.push(race.entrants.map((e) => [
          e.car.x, e.car.y, e.car.heading, e.car.vx, e.car.vy, e.car.health, e.car.z,
          e.progress.lap, e.progress.idx, e.progress.penalty, e.progress.retired ? 1 : 0, e.progress.finished ?? -1,
          e.tyres.wear, ['slick', 'hard', 'inter', 'wet', 'dirt'].indexOf(e.tyres.compound), e.stops, e.pit ? ['in', 'stopped', 'out', 'garage'].indexOf(e.pit.phase) : -1,
        ]));
      }
      if (race.entrants.every((e) => e.progress.retired || e.inLap?.parked || (e.progress.finished !== undefined && !pit))) break;
    }
    const finish = race.entrants.map((e) => e.progress.finished ?? -1);
    console.log(`race ${spec.id}: ${step} steps, ${JSON.stringify(kinds)}`);
    return { ...spec, difficulty: level.id, weather: spec.weather, seed, steps: step, draw, plans, practice: race.practice ?? null, states, events, finish, wetness: race.wetness };
  });
  writeFileSync('unity/Tests~/Core.Tests/races.json', JSON.stringify({ dt: DT, races: out }));
}

/** V8's Math.sin, cos, atan, atan2 and exp on inputs like the game's (headings, angles, slopes, grip): JsMath.cs must give the same bits. */
function goldenMath() {
  const rng = seededRandom(99);
  const xs: number[] = [];
  for (let i = 0; i < 6000; i++) {
    const r = rng();
    xs.push(i % 4 === 0 ? (r - 0.5) * 100 : i % 4 === 1 ? (r - 0.5) * 8 : i % 4 === 2 ? (r - 0.5) * 1e-3 : Math.round((r - 0.5) * 64) * (Math.PI / 4) + (rng() - 0.5) * 1e-9);
  }
  const pairs: number[][] = [];
  for (let i = 0; i < 6000; i++) pairs.push([(rng() - 0.5) * (i % 3 ? 600 : 2), (rng() - 0.5) * (i % 5 ? 600 : 1e-4)]);
  pairs.push([0, 1], [0, -1], [1, 0], [-1, 0], [0, 0], [3, 1], [1e-300, 5], [5, 1e-300]);
  const es = Array.from({ length: 5000 }, (_, i) => (rng() - 0.75) * (i % 2 ? 8 : 0.2));
  es.push(1, 0, -1, 0.5, 700, -700);
  writeFileSync('unity/Tests~/Core.Tests/math.json', JSON.stringify({
    sin: xs.map((x) => [x, Math.sin(x)]), cos: xs.map((x) => [x, Math.cos(x)]), atan: xs.map((x) => [x, Math.atan(x)]),
    atan2: pairs.map(([y, x]) => [y, x, Math.atan2(y, x)]), exp: es.map((x) => [x, Math.exp(x)]),
  }));
}

if (process.argv[1]?.endsWith('golden.mjs')) {
  goldenMath();
  goldenAll();
  goldenCritters();
  goldenRaces();
}
