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
import { PETALS, PetalField } from '../../src/f1/petals';
import { newSeason, recordRound, roundSeed, standings, pointsOf, parseSeason } from '../../src/f1/championship';
import { markSplit } from '../../src/f1/timeTrial';
import { MISSION_CIRCUITS, MISSIONS, missionsOn, count as countMission, type PlayEvent } from '../../src/f1/missions';
import { stepLaunch, newLaunch } from '../../src/f1/launch';
import { CROWD, crowdGain, crowdNear, doppler, engineNote, LIMITER_BEEP } from '../../src/f1/sounds';
import { ENGINE_ORDERS } from '../../src/engine/audio';
import { menuSong } from '../../src/f1/music';
import { foldTail } from '../../src/engine/music';
import { RADIO, RADIO_LINES, finishLine, newRadio, radioLine, say, stepRadio, type RadioCue } from '../../src/f1/radio';
import { groundAt } from '../../src/engine/sim';
import { HALF_WIDTH } from '../../src/f1/circuit';
import { aiCraftFor, aiIncidentsFor, aiMistakesFor, aiPaceFor, paceRanks } from '../../src/f1/difficulty';
import { aiReaction } from '../../src/f1/launch';
import { driverSeats, teamGrid, TEAMS } from '../../src/f1/teams';
import { styleOf } from '../../src/f1/drivers';
import { seededRandom } from '../../src/engine/rng';
import { changeableForecast } from '../../src/f1/forecast';
import { newRace, stepRace, order as raceOrder, type RaceEvent } from '../../src/f1/raceControl';
import { aiTimes, gridOrder, newQualifying, referenceLap } from '../../src/f1/qualifying';
import { qualifyingRows, raceSummary, resultRows } from '../../src/f1/race/resultsView';
import { formatTime } from '../../src/f1/records';
import { lookAt } from '../../src/f1/weather';
import { fling, stepPiece } from '../../src/engine/debris';
import { panAt, panLength } from '../../src/f1/gridPan';
import { crashWindow, newReplay, recordReplay, replayPose, replayWindow } from '../../src/f1/replay';
import type { PitLane } from '../../src/f1/pits';
import { batchesOf, kmOf, type Event as StatEvent } from '../../src/f1/metrics';
import { pendingLaps, queueLap } from '../../src/f1/boards';
import { useSave, type SaveStore } from '../../src/engine/save';
import { LAYOUTS } from '../../src/f1/layouts';
import { challengeOn, logRun, streakOn, type DailyLog } from '../../src/f1/daily';
import { newAttack, stepAttack, distance, shortDistance } from '../../src/f1/timeAttack';
import { playedOn, streakNow, addDays, type Streak } from '../../src/f1/streak';
import { CAR_STYLES } from '../../src/f1/carStyle';
import { ghostPose, newRecorder, recordFrame, toGhost } from '../../src/f1/timeTrial';
import { packGhost } from '../../src/f1/boards';
import { CC_SAVE } from '../../src/f1/save';
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
    // the results as the web game words them (names: the drivers' codes, yours YOU)
    const named = drivers.map((d, k) => ({ name: k === youDriver ? 'YOU' : d.livery.drivers[d.seat], team: { code: d.livery.code } }));
    let fastest: { time: number; who: number } | undefined;
    race.entrants.forEach((e, i) => e.progress.lapTimes.forEach((t) => { if (!fastest || t < fastest.time) fastest = { time: t, who: i }; }));
    const order = raceOrder(race);
    const rows = resultRows(race, order, named, youDriver, fastest?.who);
    const results = { order, fastest: fastest?.who ?? -1, rows, summary: raceSummary(rows).map((b) => [b.icon, b.label, b.value, b.color ?? '']) };
    console.log(`race ${spec.id}: ${step} steps, ${JSON.stringify(kinds)}`);
    return { ...spec, difficulty: level.id, weather: spec.weather, seed, steps: step, draw, plans, practice: race.practice ?? null, states, events, finish, wetness: race.wetness, results };
  });
  writeFileSync('unity/Tests~/Core.Tests/races.json', JSON.stringify({ dt: DT, races: out }));
}

/**
 * Qualifying, as race.ts runs it: the reference lap (one AI car alone on a flying lap) in each weather, the AI's
 * times off it from the weekend's seed (seed + 1), the grid they make with your time in, and the rows it shows; and
 * a session's start (flyingStart) and its first few seconds driven flat out.
 */
function goldenQualifying() {
  const specs = [
    { id: 'crescent-park', seed: 12345, weather: 'dry', you: 80.5 },
    { id: 'suzuka', seed: 777, weather: 'damp', you: undefined },
    { id: 'dust-bowl', seed: 4242, weather: 'wet', you: 1 },
    { id: 'harbour', seed: 2, weather: 'dry', you: 1e9 },
  ] as const;
  const out = specs.map((spec) => {
    const { b, grid, track } = loadRace(spec.id);
    const reference = referenceLap(track, grid, handling, spec.weather);
    const rng = seededRandom(spec.seed);
    const total = Math.min(b.slots.length, 1 + 10);
    const youDriver = Math.floor(total / 2);
    const teams = teamGrid(TEAMS[0], total, youDriver, rng);
    const seats = driverSeats(teams, youDriver, 0);
    const ranks = paceRanks(total, rng);
    const level = DIFFICULTIES.find((d) => d.id === 'normal')!;
    const paces = teams.map((_, k) => (k === youDriver ? undefined : aiPaceFor(level, ranks[k], total, 1)));
    const times = aiTimes(paces, reference, seededRandom(spec.seed + 1));
    times[youDriver] = spec.you;
    const order = gridOrder(times);
    const named = teams.map((t, k) => ({ name: k === youDriver ? 'YOU' : t.drivers[seats[k]], team: { code: t.code } }));
    const rows = qualifyingRows(order, times, named, youDriver);
    const race = newQualifying(track, grid, handling, spec.weather);
    const start = { x: race.entrants[0].car.x, y: race.entrants[0].car.y, heading: race.entrants[0].car.heading, idx: race.entrants[0].progress.idx };
    return { ...spec, you: spec.you ?? null, reference, paces: paces.map((p) => p ?? null), times: times.map((t) => t ?? null), order, rows, start };
  });
  const formats = [0, 0.004, 59.996, 61.234, 83.125, 125.5, 3600.01].map((t) => [t, formatTime(t)]);
  const looks = [[0, 0], [0.3, 0], [0.5, 0.2], [1, 0], [1, 1], [1.37, 0.4], [2, 1], [2, 0], [0.04, 0.75]].map(([w, r]) => {
    const l = lookAt(w, r);
    return [w, r, l.sky.background, l.sky.sky, l.sky.ground, l.sky.key, l.sky.ambient, l.sky.keyIntensity, l.groundTint, l.spray ? 1 : 0];
  });
  writeFileSync('unity/Tests~/Core.Tests/qualifying.json', JSON.stringify({ sessions: out, formats, looks }));
  console.log(`qualifying: ${out.map((q) => `${q.id} ${q.reference.toFixed(3)}`).join(', ')}`);
}

/**
 * The picture's own rules: debris thrown and flown (seeded, over hills), the grid pan along a circuit's slots, and the
 * replay's recording (single floats) read back between frames.
 */
function goldenFx() {
  const ground = (x: number, y: number) => 6 * Math.sin(x / 40) + 4 * Math.cos(y / 55);
  const debris = [0.2, 0.7, 1].map((power, n) => {
    const rng = seededRandom(100 + n);
    const p = fling(400 + n * 30, 300, ground(400 + n * 30, 300) + 5, 220 - n * 90, -140 + n * 60, { x: 0.6, y: -0.8 }, power, rng);
    const trace: number[][] = [];
    for (let k = 1; k <= 700; k++) {
      stepPiece(p, 1 / 60, ground);
      if (k % 10 === 0) trace.push([p.x, p.y, p.h, p.vx, p.vy, p.vh, ...p.rot, p.rest ? 1 : 0, p.rested]);
    }
    return { seed: 100 + n, power, trace };
  });
  const { b } = load('crescent-park');
  const slots = b.slots.slice(0, 11);
  const pan = { length: panLength(slots.length), at: [0, 0.5, 1, 1.3, 2.71, 4.4, 6.9, 7.2, 20].map((t) => { const a = panAt(slots, t); return [t, a.x, a.y, a.car]; }) };
  const rec = newReplay(3);
  const rng = seededRandom(5);
  const poses: number[][] = [];
  for (let t = 0; t < 22; t += 1 / 60) {
    const cars = [0, 1, 2].map((i) => (i === 2 && t > 8 && t < 9 ? undefined : { x: 100 + t * 200 + i * 13.37, y: 50 - t * 31 * i, z: Math.sin(t) * 3, heading: (t * 2.3 + i) % (2 * Math.PI) - Math.PI, condition: (['ok', 'smoking', 'burning', 'wrecked'] as const)[Math.floor(t / 4 + i) % 4] }));
    recordReplay(rec, t, cars);
    if (Math.round(t * 60) % 37 === 0) {
      const q = t - rng() * 14;
      for (let i = 0; i < 3; i++) {
        const p = replayPose(rec, i, q);
        poses.push([t, i, q, ...(p ? [p.x, p.y, p.z, p.heading, ['ok', 'smoking', 'burning', 'wrecked'].indexOf(p.condition ?? 'ok')] : [])]);
      }
    }
  }
  const windows = [replayWindow(rec, 20), replayWindow(rec, 21.5), crashWindow(rec, 15), crashWindow(rec, 21)].map((w) => [w.from, w.to]);
  writeFileSync('unity/Tests~/Core.Tests/fx.json', JSON.stringify({ debris, pan, poses, windows, start: rec.start, frames: rec.frames.length }));
  console.log(`fx: ${debris.map((d) => d.trace.findIndex((r) => r[9] === 1)).join(', ')} rest steps/10, ${poses.length} replay poses`);
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

/**
 * The play stats' and boards' wire (metrics.ts, boards.ts): numbers as JSON writes them, the events' batches as they're
 * sent, and the laps waiting to go on a board as records come in.
 */
function goldenNet() {
  const rng = seededRandom(31);
  const numbers: number[] = [0, -0, 1, -1, 0.1, 0.2, 0.1 + 0.2, 1e21, 1e20, 123456789012345680000, 1e-6, 1e-7, 1.5e-7, 2 ** 53, 2 ** 53 + 2, 5e-324, 1.7976931348623157e308, 81.2, 80.5, 0.67];
  for (let i = 0; i < 3000; i++) {
    const r = rng();
    numbers.push(i % 5 === 0 ? Math.round((r - 0.5) * 1e6) : i % 5 === 1 ? (r - 0.5) * 10 ** Math.floor(rng() * 40 - 20) : i % 5 === 2 ? Math.round(r * 1e6) / 1000 : i % 5 === 3 ? kmOf(r * 50000) : Math.round(kmOf(r * 50000) * 1000) / 1000);
  }
  const base = { player: '0b7c3f8e-2c1a-4d5e-9f00-123456789abc', platform: 'web' as const, version: '0.3.1 (abc123)' };
  const events: StatEvent[] = [
    { ...base, kind: 'launch' },
    { ...base, kind: 'race_start', circuit: 'crescent-park', mode: 'qualifying', data: { team: 'falcon', driver: 'VEX' } },
    { ...base, kind: 'session', seconds: 61, data: { launch: 'k3j9x0a1bq' } },
    { ...base, kind: 'drive', circuit: 'crescent-park', mode: 'race', km: Math.round(kmOf(12345.678) * 1000) / 1000, data: { seconds: 95 } },
    { ...base, kind: 'race_finish', circuit: 'maple-island', mode: 'race', data: { place: null, field: 11, laps: 5 } },
    { ...base, kind: 'race_finish', circuit: 'maple-island', mode: 'race', data: { place: 3, field: 11, laps: 5, note: 'quote " back \\ tab \t é ☃ \u0001' } },
    { ...base, kind: 'share', circuit: 'baku', mode: 'race' },
  ];
  const batches = [events, events.slice(0, 2), events.filter((e) => e.kind === 'session')].map((list) => JSON.stringify(batchesOf(list)));
  const items = new Map<string, string>();
  const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
  useSave(CC_SAVE, store);
  const laps = [['baku', 'dry', 81.2], ['baku', 'dry', 82], ['baku', 'wet', 95], ['baku', 'changeable', 70], ['baku', 'dry', 80.5], ['suzuka', 'damp', 99.12345], ['suzuka', 'damp', 4], ['crescent-park', 'dry', 61.0004999], ['baku', 'wet', 94.9999]] as const;
  const pending = laps.map(([circuit, weather, time]) => {
    queueLap({ circuit, weather: weather as 'dry', time });
    return { lap: [circuit, weather, time], pending: pendingLaps() };
  });
  writeFileSync('unity/Tests~/Core.Tests/net.json', JSON.stringify({ numbers: numbers.map((x) => [x, JSON.stringify(x)]), events, batches, pending }));
  console.log(`net: ${numbers.length} numbers, ${batches.length} batches, ${pending.length} laps`);
}

/** The Daily Challenge (daily.ts), Time Attack's clock, the streak and its looks, and ghosts recorded, read back and packed. */
function goldenDaily() {
  const days: string[] = [];
  for (let d = '2026-09-20'; d < '2028-03-01'; d = addDays(d, 1)) days.push(d);
  const challenges = days.map((d) => { const c = challengeOn(d); return [d, c.layout.id, c.weather.id]; });
  const fixedPool = LAYOUTS.slice(2, 7);
  const pooled = days.slice(0, 60).map((d) => challengeOn(d, fixedPool).layout.id);
  // the daily log: runs on days in a row, a day missed, better and worse runs, a run of nothing, a fortnight kept
  const log: DailyLog = { streak: 0, best: {} };
  const logSteps: unknown[] = [];
  const rng = seededRandom(17);
  let day = '2026-11-01';
  for (let i = 0; i < 40; i++) {
    day = addDays(day, rng() < 0.15 ? 2 : rng() < 0.4 ? 0 : 1);
    const run = { score: Math.floor(rng() * 12), time: Math.round(rng() * 9000) / 100 };
    const best = logRun(log, day, run);
    logSteps.push({ day, run, best, streak: log.streak, streakOn: streakOn(log, addDays(day, i % 3)), days: Object.keys(log.best).sort(), pending: log.pending ? [log.pending.day, log.pending.score, log.pending.time] : null });
  }
  // the clock: a scripted run (checkpoints passed now and then, cuts), stepped at 60 Hz to time up
  const attacks = [['normal', 31.733], ['easy', 27.4], ['hard', 40.1]].map(([diff, ref]) => {
    const a = newAttack(ref as number, { id: diff } as never);
    const r = seededRandom(5);
    const trace: number[][] = [];
    let passed = 0;
    for (let k = 0; k < 60 * 400 && !a.over; k++) {
      const started = k > 90;
      if (started && r() < 0.0016) passed++;
      const cut = started && r() < 0.0008;
      const st = stepAttack(a, 1 / 60, started, passed, cut);
      if (k % 7 === 0 || st.started || st.added || st.lost || st.timeUp) trace.push([k, a.left ?? -1, a.passed, a.elapsed, a.lastAt, st.started ? 1 : 0, st.added ?? 0, st.lost ?? 0, st.timeUp ? 1 : 0]);
    }
    return { diff, ref, trace };
  });
  const distances = Array.from({ length: 13 }, (_, n) => [n, distance(n), shortDistance(n)]);
  // the streak: played on scripted days (a miss forgiven, a second ending it), and the rewards reached
  const st: Streak = { days: 0, best: 0 };
  const streakSteps: unknown[] = [];
  let sd = '2026-10-01';
  const gaps = [0, 1, 1, 2, 1, 1, 2, 1, 2, 1, 3, 1, 1, 0, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2, 2];
  for (let i = 0; i < 150; i++) {
    sd = addDays(sd, gaps[i % gaps.length]);
    const step = playedOn(st, sd);
    streakSteps.push([sd, step.days, step.grew ? 1 : 0, step.forgave ? 1 : 0, step.rewards.map((r) => r.id).join(','), st.best, st.forgiven ?? '', streakNow(st, addDays(sd, i % 4))]);
  }
  const styles = CAR_STYLES.map((c) => [c.id, c.name, c.days, JSON.stringify(c.look)]);
  // a ghost: a car driven round a loop, recorded at 20 Hz from 60 Hz steps, read back between frames, packed to send
  const rec = newRecorder();
  const car = { x: 0, y: 0, heading: 0 } as never as Car;
  for (let k = 0; k <= 60 * 35; k++) {
    const t = k / 60;
    (car as { x: number }).x = 400 * Math.cos(t * 0.4) + 3.217 * t;
    (car as { y: number }).y = 260 * Math.sin(t * 0.4);
    (car as { heading: number }).heading = ((t * 0.4 + Math.PI) % (2 * Math.PI)) - Math.PI;
    recordFrame(rec, t, car, k % 977);
  }
  const ghost = toGhost(rec, 35);
  const poses = [-1, 0, 0.01, 1.234, 7.77, 17.5, 34.99, 35, 35.01].map((t) => { const p = ghostPose(ghost, t); return [t, ...(p ? [p.x, p.y, p.heading] : [])]; });
  const packed = packGhost(ghost, 20)!;
  const packedPoses = [0, 3.33, 20.05].map((t) => { const p = ghostPose(packed, t); return [t, ...(p ? [p.x, p.y, p.heading] : [])]; });
  writeFileSync('unity/Tests~/Core.Tests/daily.json', JSON.stringify({ layouts: LAYOUTS.map((l) => l.id), challenges, fixedPool: fixedPool.map((l) => l.id), pooled, logSteps, attacks, distances, streakSteps, styles, ghost: JSON.stringify(ghost), poses, packed: JSON.stringify(packed), packedPoses }));
  console.log(`daily: ${challenges.length} days, ${logSteps.length} runs, ${attacks.map((a) => a.trace.length).join('/')} clock steps, ${streakSteps.length} streak days`);
}

/**
 * The cherry blossom's petals (Suzuka's, its trees as the scenery bake wrote them): two cars driving round through them for
 * a minute, the field's count and sums and its first petals every second.
 */
function goldenPetals() {
  const dt = 1 / 30;
  const { grid, track } = loadRace('suzuka');
  const trees = JSON.parse(readFileSync('unity/Assets/Resources/Scenery/suzuka-blossoms.json', 'utf8')).trees as { x: number; y: number; h: number }[];
  const field = new PetalField(grid, track, trees);
  const start = [field.petals.length, field.petals.reduce((a, p) => a + p.x + p.y + p.z + p.spin, 0)];
  const cars: number[][] = [];
  const marks: number[][] = [];
  let along = 0;
  for (let f = 0; f < 1800; f++) {
    const t = f * dt;
    const v = 220 + 80 * Math.sin(t * 0.13);
    along = (along + (v * dt) / track.spacing) % track.samples.length;
    const two = [0, 1].map((k) => {
      const p = track.samples[(Math.floor(along) + k * 7) % track.samples.length];
      const off = 30 * Math.sin(t * 0.9 + k * 2);
      const x = p.x + Math.cos(p.dir) * off;
      const y = p.y + Math.sin(p.dir) * off;
      return { x, y, vx: Math.sin(p.dir) * v, vy: -Math.cos(p.dir) * v, z: groundAt(grid, x, y).h, airborne: k === 1 && f % 90 < 10 };
    });
    for (const c of two) cars.push([c.x, c.y, c.vx, c.vy, c.z, c.airborne ? 1 : 0]);
    field.step(dt, two, two[0]);
    if (f % 30 === 29) {
      const c = field.counts();
      const sum = field.petals.reduce((a, p) => a + p.x + p.y + p.z + p.vx + p.vy + p.vz + p.spin, 0);
      const first = field.petals.slice(0, 4).flatMap((p) => [p.x, p.y, p.z, p.vx, p.vy, p.vz, p.spin, p.tumble, p.resting ? 1 : 0, Number.isFinite(p.life) ? p.life : -1, p.onTrack ? 1 : 0, p.shade, p.phase]);
      marks.push([f, field.petals.length, c.resting, c.flying, sum, ...first]);
    }
  }
  writeFileSync('unity/Tests~/Core.Tests/petals.json', JSON.stringify({ dt, max: PETALS.max, start, cars, marks }));
  console.log(`petals: ${start[0]} on the track at the start, ${marks[marks.length - 1][1]} after a minute (${marks.reduce((a, m) => Math.max(a, m[3]), 0)} in the air at most)`);
}

/** Championship seasons (newSeason's field from its seed, roundSeed, the standings as rounds are recorded) and Time Trial's split marks. */
function goldenSeason() {
  const rng = seededRandom(2027);
  const ids = LAYOUTS.filter((l) => !l.free).map((l) => l.id);
  const seasons = [1, 7, 4242, 99991, 2 ** 31 + 5, 4294967295].map((seed, n) => {
    const team = TEAMS[n % TEAMS.length];
    const s = newSeason({ seed, team, seat: (n % 2) as 0 | 1, difficulty: (['easy', 'normal', 'hard'] as const)[n % 3], qualifying: n % 2 === 0, rounds: ids, total: 11, laps: n % 2 ? 10 : 5 });
    const field = JSON.parse(JSON.stringify(s));
    const seeds = ids.map((_, k) => roundSeed(s, k));
    const tables: number[][][] = [];
    for (let k = 0; k < ids.length; k++) {
      const finish = [...s.drivers.keys()].sort(() => rng() - 0.5);
      const out = new Set(finish.filter(() => rng() < 0.1));
      recordRound(s, finish, out);
      tables.push(standings(s).map((r) => [r.driver, r.points, r.wins]));
    }
    return { seed, team: team.id, field, seeds, places: s.places, tables, points: pointsOf(s), saved: JSON.stringify(parseSeason(JSON.parse(JSON.stringify(s)))) };
  });
  const g = (time: number, splits: number[]) => ({ time, splits, frames: [0, 0, 0, 0, 1, 1, 0, 1] });
  const marks = [[30.1, 0], [29.9, 0], [31.5, 1], [45, 1], [60, 2], [10, 3]].flatMap(([t, k]) =>
    [[g(90, [30, 60]), g(89, [29.95, 61])], [g(90, [30, 60]), undefined], [undefined, undefined], [g(88, [31, 45.5]), g(90, [30, 60])]].map(([gh, rec]) => {
      const m = markSplit(t, k, gh, rec);
      return [t, k, gh ? gh.splits : null, rec ? rec.splits : null, m.delta ?? null, m.mark];
    }));
  writeFileSync('unity/Tests~/Core.Tests/season.json', JSON.stringify({ rounds: ids, seasons, marks }));
  console.log(`season: ${seasons.length} seasons of ${ids.length} rounds, ${marks.length} split marks`);
}

/** The daily missions (missionsOn by the day, each event's count, a day's progress counted up) and the launch off the lights. */
function goldenMissions() {
  const rng = seededRandom(31);
  const days: [string, string[]][] = [];
  for (let k = 0; k < 400; k++) {
    const d = new Date(Date.UTC(2026, 0, 1 + k * 3));
    const day = d.toISOString().slice(0, 10);
    days.push([day, missionsOn(day).map((m) => m.id)]);
  }
  const circuits = ['crescent-park', ...MISSION_CIRCUITS.map((c) => c.id), 'vegas'];
  const event = (): PlayEvent => {
    const r = rng();
    if (r < 0.4) return { kind: 'race', place: 1 + Math.floor(rng() * 11), grid: 1 + Math.floor(rng() * 11), field: 11, fastest: rng() < 0.3, clean: rng() < 0.4, weather: ['dry', 'damp', 'wet'][Math.floor(rng() * 3)], circuit: circuits[Math.floor(rng() * circuits.length)], difficulty: 'normal' };
    if (r < 0.6) return { kind: 'lap' };
    if (r < 0.7) return { kind: 'launch', great: rng() < 0.5 };
    if (r < 0.8) return { kind: 'pit' };
    if (r < 0.9) return { kind: 'trial-lap', record: rng() < 0.4 };
    return { kind: 'attack', passed: Math.floor(rng() * 12), daily: rng() < 0.5 };
  };
  const counts = Array.from({ length: 200 }, () => { const e = event(); return { e, n: MISSIONS.map((m) => m.count(e)) }; });
  const runs = days.slice(0, 40).map(([day]) => {
    const p = { day, progress: {} as Record<string, number> };
    const steps = Array.from({ length: 30 }, () => { const e = event(); const r = countMission(p, e); return { e, done: r.done.map((m) => m.id), all: r.all, progress: { ...p.progress } }; });
    return { day, steps };
  });
  const launches = Array.from({ length: 300 }, () => {
    const l = newLaunch();
    const frames: [boolean, number | null, number, string | null][] = [];
    const jumpy = rng() < 0.3, held = rng() < 0.2, react = rng() * 1.8;
    for (let f = -60; f < 120; f++) {
      const t = f / 60;
      const lit = t < 0 && t >= -0.5, out = t >= 0 ? t : undefined;
      const gas = held ? 1 : jumpy && t > -0.2 ? 1 : t >= react ? 1 : 0.1;
      const v = stepLaunch(l, lit, out, gas);
      frames.push([lit, out ?? null, gas, v ?? null]);
    }
    return { frames, reaction: l.reaction ?? null };
  });
  writeFileSync('unity/Tests~/Core.Tests/missions.json', JSON.stringify({ ids: MISSIONS.map((m) => [m.id, m.text, m.goal, !!m.max, m.circuit ?? null]), circuits: MISSION_CIRCUITS, days, counts, runs, launches }));
  console.log(`missions: ${MISSIONS.length} missions, ${days.length} days, ${runs.length} days counted, ${launches.length} launches`);
}

/** The team radio: its lines, the one picked by a roll, the finish line, and the queue as lines are said and time passes. */
function goldenRadio() {
  const rng = seededRandom(5);
  const rolls = [0, 0.2, 0.34, 0.5, 0.67, 0.99];
  const picks = (Object.keys(RADIO_LINES) as RadioCue[]).flatMap((cue) => rolls.map((r) => [cue, r, radioLine(cue, () => r)]));
  const finishes: [number, number, number, string][] = [];
  for (const of of [1, 3, 8, 11]) for (let place = 1; place <= of; place++) for (const r of [0, 0.6]) finishes.push([place, of, r, finishLine(place, of, () => r)]);
  const q = newRadio();
  const texts = Object.values(RADIO_LINES).flat();
  const queue: [string | null, number, string | null, string | null, number][] = [];
  for (let i = 0; i < 600; i++) {
    const said = rng() < 0.08 ? texts[Math.floor(rng() * texts.length)] : null;
    if (said) say(q, said);
    const dt = rng() * 0.2;
    const up = stepRadio(q, dt) ?? null;
    queue.push([said, dt, up, q.now?.text ?? null, q.waiting.length]);
  }
  writeFileSync('unity/Tests~/Core.Tests/radio.json', JSON.stringify({ lines: RADIO_LINES, radio: RADIO, picks, finishes, queue }));
  console.log(`radio: ${Object.keys(RADIO_LINES).length} cues, ${picks.length} picks, ${finishes.length} finish lines, ${queue.length} queue steps`);
}

/** The race's sounds' models: the engine note through the gears, the Doppler bend, the crowd's nearness and loudness; the
 * engine's waveform; the menu's placeholder tune as notes, and the loop's tail folded back. */
function goldenSounds() {
  const notes: number[][] = [];
  for (const top of [400, 520]) for (let speed = 0; speed <= 560; speed += 7) for (const throttle of [0, 0.2, 0.55, 1]) {
    const n = engineNote(speed, top, throttle);
    notes.push([speed, top, throttle, n.freq, n.gain, n.brightness, n.gear]);
  }
  const dopplers = [-2000, -900, -300, -50, 0, 50, 300, 900, 2000].map((c) => [c, doppler(c)]);
  const stands = [{ x: 100, y: 200 }, { x: 900, y: 400 }, { x: 500, y: 1200 }];
  const rng = seededRandom(11);
  const near: number[][] = [];
  for (let i = 0; i < 200; i++) {
    const x = rng() * 1400, y = rng() * 1600, cheer = rng();
    const n = crowdNear(stands, x, y);
    near.push([x, y, n, cheer, crowdGain(n, cheer)]);
  }
  const fold = Array.from(foldTail(new Float32Array(Array.from({ length: 23 }, (_, i) => i * 0.25 - 2)), 10));
  writeFileSync('unity/Tests~/Core.Tests/sounds.json', JSON.stringify({ notes, dopplers, stands, near, crowd: CROWD, limiterBeep: LIMITER_BEEP, orders: ENGINE_ORDERS, menu: menuSong(), fold }));
  console.log(`sounds: ${notes.length} engine notes, ${near.length} crowd points, ${menuSong().notes.length} menu notes`);
}

if (process.argv[1]?.endsWith('golden.mjs') && process.env.GOLDEN_ONLY === 'fx') goldenFx();
else if (process.argv[1]?.endsWith('golden.mjs') && process.env.GOLDEN_ONLY === 'sounds') goldenSounds();
else if (process.argv[1]?.endsWith('golden.mjs') && process.env.GOLDEN_ONLY === 'radio') goldenRadio();
else if (process.argv[1]?.endsWith('golden.mjs') && process.env.GOLDEN_ONLY === 'missions') goldenMissions();
else if (process.argv[1]?.endsWith('golden.mjs') && process.env.GOLDEN_ONLY === 'season') goldenSeason();
else if (process.argv[1]?.endsWith('golden.mjs') && process.env.GOLDEN_ONLY === 'petals') goldenPetals();
else if (process.argv[1]?.endsWith('golden.mjs') && process.env.GOLDEN_ONLY === 'net') (goldenNet(), goldenDaily());
else if (process.argv[1]?.endsWith('golden.mjs')) {
  goldenMath();
  goldenNet();
  goldenDaily();
  goldenAll();
  goldenCritters();
  goldenPetals();
  goldenSeason();
  goldenMissions();
  goldenRadio();
  goldenSounds();
  goldenRaces();
  goldenQualifying();
  goldenFx();
}
