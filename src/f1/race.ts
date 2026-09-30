// The F1 race: you and the AI field in F1 cars on one of the circuits.
// Start lights, laps, positions, lap times, damage, pit stops to repair it,
// the safety car after a big crash, a minimap, and results at the flag. The rules live in raceControl.ts;
// this is the picture and the HUD. A pauses (so does leaving the app or tab); START restarts;
// SELECT goes back to choose a circuit.

import * as THREE from 'three';
import type { Button } from '../engine/controls';
import { applyDamage, bodyTilt, carClass, condition, newCar, speedOf, type Car } from '../engine/driving';
import { groundAt } from '../engine/sim';
import { keysWheel, lineCornerSpeed, lineDecel, playerInput, wheelInput, type AiDriver } from './racing';
import { NORMAL, aiPaceFor, handlingFor, type Difficulty } from './difficulty';
import { DRY, type Weather } from './weather';
import { COMPOUNDS } from './tyres';
import { LIGHTS, SAFETY_CAR, newRace, order as raceOrder, planLapTime, running, stepRace, type Race } from './raceControl';
import { createSafetyCarMesh } from './safetyCar3d';
import { PIT, between, wantsPit } from './pits';
import { TEAMS, driverSeats, teamGrid, type Team } from './teams';
import { logoSvg } from './logos';
import { formatTime as fmt, loadRecords, recordLap, recordRace, saveRecords } from './records';
import { createCarMesh, type CarMesh } from '../engine/render/vehicles3d';
import { CarFx, Particles, SkidLayer } from '../engine/render/effects';
import { Hd2dPipeline } from '../engine/render/hd2d';
import { HD2D_VIEW } from '../engine/look';
import { QUALITY_LEVELS, QualityGovernor } from '../engine/render/quality';
import type { ScreenFit } from '../engine/layout';
import { loadVehicleEdits } from '../engine/vehicleEdits';
import type { MountStandalone } from '../engine/view';
import { defaults } from '../engine/tuning';
import { TILE, buildCircuit } from './circuit';
import { setVibration, vibrate, vibrationOn } from '../engine/haptics';
import { newRumble, rumble } from './rumble';
import { gapBetween, newGapTimer, stepGaps, type GapTimer } from './gaps';
import type { CircuitLayout } from './layouts';
import { createCircuitScene } from './circuitScene';
import { F1_TUNING } from './tuning';

type F1Tuning = Record<keyof typeof F1_TUNING, number>;
const deg = THREE.MathUtils.degToRad;
const LOOK = HD2D_VIEW;
/** The T-camera colour marking a team's second car. */
const TCAM_GREEN = '#39ff14';

/** How each entrant looks: its name, team, colour, model and effects (index-matched with the race's entrants). */
interface Look {
  name: string;
  team: Team;
  mesh: CarMesh;
  fx: CarFx;
  color: string;
}


/** The race on `layout`, driven for `team` at `difficulty` in `weather`; `onQuit` runs when the player presses and releases SELECT. */
export const raceOn = (layout: CircuitLayout, onQuit: () => void, team: Team = TEAMS[0], difficulty: Difficulty = NORMAL, weather: Weather = DRY): MountStandalone => async ({ host, services, tuning, fit }) => {
  const t = (tuning ?? defaults(F1_TUNING)) as F1Tuning;
  const { controls, hud } = services;
  loadVehicleEdits(); // (any saved stat edits apply to the cars)
  const f1 = carClass('f1');
  // the difficulty sets how much a crash costs (every car alike) and how quick the AI is
  const HANDLING = handlingFor(difficulty);
  // the AI's line: flat out wherever the car can follow the bend, like a player can
  const circuit = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, HANDLING), decel: lineDecel(f1) });
  const { track, grid } = circuit;
  const world = createCircuitScene(circuit, weather);
  const skids = new SkidLayer((x, y) => groundAt(grid, x, y).h);
  // (a bigger pool in the wet: every car throws up spray)
  const particles = new Particles(weather.spray ? 220 : 90);
  world.scene.add(skids.group, particles.group);

  // ---------------------------------------------------------------- renderer
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  host.prepend(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(LOOK.fov, fit.width / fit.height, 1, 4000);
  camera.up.set(0, 0, -1);
  const post = new Hd2dPipeline(renderer, world.scene, camera);
  const governor = new QualityGovernor();
  let viewW = fit.width;
  let viewH = fit.height;
  let sizeKey = '';
  const applySize = () => {
    const q = QUALITY_LEVELS[governor.level];
    const key = `${viewW}:${viewH}:${q.res}`;
    if (key === sizeKey) return;
    sizeKey = key;
    renderer.setSize(viewW * q.res, viewH * q.res, false);
    post.setSize(viewW * q.res, viewH * q.res);
  };
  const resize = (f: ScreenFit) => {
    viewW = f.width;
    viewH = f.height;
    camera.aspect = viewW / f.height;
    // (without this the camera keeps its first shape, and a wider screen stretches the picture)
    camera.updateProjectionMatrix();
    applySize();
  };
  resize(fit);

  // ---------------------------------------------------------------- overlays
  const style = (e: HTMLElement, css: Partial<CSSStyleDeclaration>) => Object.assign(e.style, css);
  const readout = document.createElement('div');
  style(readout, {
    position: 'absolute', left: '6px', top: '6px', zIndex: '2', padding: '2px 6px', borderRadius: '6px',
    background: 'rgba(21,20,31,.75)', color: '#9d9ab8', font: '12px Silkscreen, monospace', whiteSpace: 'pre',
  });
  const tyreLine = document.createElement('span');
  // the speed, frame rate and picture quality, small and dim under the rest
  const statsLine = document.createElement('span');
  Object.assign(statsLine.style, { color: '#6c6a88', fontSize: '10px' });
  const banner = document.createElement('div');
  style(banner, {
    position: 'absolute', left: '0', right: '0', top: '30%', zIndex: '2', textAlign: 'center',
    font: '20px Silkscreen, monospace', color: '#f2c14e', textShadow: '0 2px 0 #1b1b26', pointerEvents: 'none',
  });
  const results = document.createElement('div');
  style(results, {
    position: 'absolute', left: '10px', right: '10px', top: '18%', zIndex: '3', padding: '10px', borderRadius: '10px',
    background: 'rgba(21,20,31,.92)', color: '#f4f2fa', font: '11px Silkscreen, monospace', display: 'none',
  });
  // the minimap fits the circuit in a 96 × 110 box, whatever its shape
  const miniScale = Math.min(96 / circuit.width, 110 / circuit.height);
  const MINI_W = Math.round(circuit.width * miniScale);
  // your team's card under the start lights: its logo and name, gone at lights out
  const teamCard = document.createElement('div');
  style(teamCard, {
    position: 'absolute', left: '50%', top: 'calc(30% + 34px)', zIndex: '3', transform: 'translateX(-50%)',
    display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 10px 4px 4px', borderRadius: '10px',
    background: 'rgba(21,20,31,.8)', color: '#f4f2fa', font: '12px Silkscreen, monospace', whiteSpace: 'nowrap',
    pointerEvents: 'none', transition: 'opacity .4s',
  });
  const cardLogo = logoSvg(team.id, 36);
  if (cardLogo) teamCard.append(cardLogo);
  teamCard.append(`${team.name.toUpperCase()} · ${difficulty.name} · ${weather.name}`);
  const MINI_H = Math.round(circuit.height * miniScale);
  const map = world.minimap(MINI_W * 2, MINI_H * 2);
  const mini = document.createElement('canvas');
  mini.width = MINI_W * 2;
  mini.height = MINI_H * 2;
  style(mini, {
    position: 'absolute', right: '6px', top: '40px', zIndex: '2', width: `${MINI_W}px`, height: `${MINI_H}px`,
    background: 'rgba(21,20,31,.6)', borderRadius: '6px',
  });
  const miniCtx = mini.getContext('2d')!;
  // the pause screen: resume, restart or back to the circuits, by tap or with the deck (A, START, SELECT)
  const pauseScreen = document.createElement('div');
  style(pauseScreen, {
    position: 'absolute', inset: '0', zIndex: '4', display: 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    gap: '10px', background: 'rgba(14,13,22,.72)', color: '#f4f2fa', font: '12px Silkscreen, monospace',
  });
  const pauseTitle = document.createElement('div');
  pauseTitle.textContent = 'PAUSED';
  style(pauseTitle, { font: '22px Silkscreen, monospace', color: '#f2c14e', textShadow: '0 2px 0 #1b1b26', marginBottom: '6px' });
  const pauseButton = (label: string, action: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    style(b, {
      width: '60%', padding: '10px 0', borderRadius: '10px', border: '1px solid #3a3858', background: '#25233a',
      color: '#f4f2fa', font: '14px Silkscreen, monospace', cursor: 'pointer', touchAction: 'none',
    });
    // on the press's release, not 'click' (in a cross-origin frame on a phone a tap's click can go astray)
    let armed = false;
    b.addEventListener('pointerdown', () => (armed = true));
    b.addEventListener('pointerleave', () => (armed = false));
    b.addEventListener('pointerup', () => {
      if (armed) action();
      armed = false;
    });
    return b;
  };
  const pauseHint = document.createElement('div');
  pauseHint.textContent = 'A RESUME · START RESTART · SELECT CIRCUITS';
  style(pauseHint, { color: '#9d9ab8', fontSize: '10px', marginTop: '6px', textAlign: 'center', padding: '0 12px' });
  // rain over the picture: streaks falling at a slant, under the readouts
  const rain = document.createElement('canvas');
  style(rain, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', pointerEvents: 'none', display: weather.rain > 0 ? 'block' : 'none' });
  const rainCtx = rain.getContext('2d')!;
  const drops = Array.from({ length: Math.round(90 * weather.rain) }, () => ({ x: Math.random(), y: Math.random(), v: 0.9 + Math.random() * 0.6 }));
  const drawRain = (dt: number) => {
    if (weather.rain <= 0) return;
    const w = (rain.width = rain.clientWidth);
    const h = (rain.height = rain.clientHeight);
    rainCtx.clearRect(0, 0, w, h);
    rainCtx.strokeStyle = 'rgba(210,220,236,.45)';
    rainCtx.lineWidth = 1;
    rainCtx.beginPath();
    for (const d of drops) {
      d.y += d.v * dt * 1.6;
      d.x -= d.v * dt * 0.25;
      if (d.y > 1) Object.assign(d, { y: d.y - 1, x: Math.random() + 0.1 });
      if (d.x < 0) d.x += 1.1;
      const px = d.x * w;
      const py = d.y * h;
      rainCtx.moveTo(px, py);
      rainCtx.lineTo(px + 4, py - 16);
    }
    rainCtx.stroke();
  };
  host.append(rain, readout, banner, results, mini, teamCard, pauseScreen);

  // ---------------------------------------------------------------- race state
  let race!: Race;
  /** the HUD's own state: gap timing, your last position and its flash, and the race's fastest lap so far (set up by startRace) */
  let hudState: { gaps: GapTimer; lastPos: number; flashUntil: number; lapsSeen: number[]; fastest?: { time: number; who: number } } = {
    gaps: newGapTimer(0), lastPos: 0, flashUntil: 0, lapsSeen: [],
  };
  let looks: Look[] = [];
  /** your race is over (finished, or out) and the results are coming */
  let done = false;
  let you = 0;
  const safetyCar = createSafetyCarMesh();
  /** a message over the race for a few seconds (safety car, penalty…), shown unless something more urgent is */
  let notice = { text: '', color: '', until: 0 };
  const announce = (text: string, color: string, seconds = 3) => (notice = { text, color, until: race.clock + seconds });
  // your records here, kept between races: each lap is saved as soon as it's done, the race at your flag
  const records = loadRecords();
  // (kept apart for each weather: a wet lap is slower)
  const recordId = weather.id === 'dry' ? layout.id : `${layout.id}:${weather.id}`;
  const rec = () => records.circuits[recordId];
  /** your laps saved so far this race, whether your finish is saved, and the records this race set */
  let saved = { laps: 0, race: false, newLap: false, newRace: false };

  /** the race is stopped: nothing moves and the clock doesn't run */
  let paused = false;
  /** frames to leave out of the quality governor after a pause (the first frame back measures the pause) */
  let settle = 0;
  let last = performance.now();
  const setPaused = (on: boolean) => {
    if (on === paused) return;
    paused = on;
    pauseScreen.style.display = on ? 'flex' : 'none';
    hud.setLabel('a', on ? 'RESUME' : 'PAUSE');
    if (!on) {
      last = performance.now();
      settle = 2;
    }
  };

  const startRace = () => {
    setPaused(false);
    for (const l of looks) world.scene.remove(l.mesh);
    world.scene.remove(safetyCar.group);
    const total = Math.min(circuit.slots.length, 1 + Math.round(t.opponents));
    you = Math.floor(total / 2);
    // your team and four drawn at random, two cars each, in their liveries
    const teams = teamGrid(team, total, you);
    // each car's seat in its team: you take your team's first, your teammate its second
    const seats = driverSeats(teams, you);
    looks = [];
    const field = Array.from({ length: total }, (_, i) => {
      const slot = circuit.slots[i];
      const livery = teams[i];
      // teammates: the team's second car has the bright green T-camera
      const mesh = createCarMesh('f1', { body: livery.body, stripe: livery.trim, accent: livery.accent, pattern: livery.pattern, tcam: seats[i] === 1 ? TCAM_GREEN : undefined });
      world.scene.add(mesh);
      // each AI car driven by its team's driver in that seat
      looks.push({ name: i === you ? 'YOU' : livery.drivers[seats[i]], team: livery, mesh, fx: new CarFx(mesh), color: livery.body });
      // AI drivers differ a little in pace and line; a quicker car starts further up the grid
      const ai: AiDriver | undefined = i === you ? undefined : { lane: ((i * 7) % 11) - 5, pace: aiPaceFor(difficulty, i, total, t.aiPaceAdjust) };
      // each team its own box in the pit lane
      return { car: newCar(carClass('f1'), slot.x, slot.y, slot.heading), ai, box: [...new Set(teams)].indexOf(livery) };
    });
    // five lights, one every 0.6 s, then out after a short random wait
    race = newRace(track, grid, HANDLING, Math.round(t.laps), field, 0.3 + Math.random() * 0.7, circuit.pit, weather.id);
    hudState = { gaps: newGapTimer(total), lastPos: 0, flashUntil: 0, lapsSeen: new Array(total).fill(0), fastest: undefined };
    hud.setPositionChange(undefined);
    done = false;
    saved = { laps: 0, race: false, newLap: false, newRace: false };
    notice = { text: '', color: '', until: 0 };
    skids.clear();
    particles.clear();
    results.style.display = 'none';
  };
  startRace();

  const seen = new Map<Button, number>();
  /** SELECT was pressed: back to the circuits when it's released */
  let quitting = false;
  const pressed = (b: Button) => {
    const n = controls.presses(b);
    const edge = n > (seen.get(b) ?? n);
    seen.set(b, n);
    return edge;
  };

  if (new URLSearchParams(window.location.search).has('debug')) {
    Object.assign(window, {
      __cc: {
        circuit: () => layout.id,
        phase: () => (done ? 'done' : race.phase),
        clock: () => race.clock,
        paused: () => paused,
        order: () => raceOrder(race).map((i) => looks[i].name),
        you: () => ({ ...race.entrants[you].progress, speed: speedOf(race.entrants[you].car), health: race.entrants[you].car.health, x: race.entrants[you].car.x, y: race.entrants[you].car.y }),
        racers: () => race.entrants.map((e, i) => ({ name: looks[i].name, team: looks[i].team.code, lap: e.progress.lap, idx: e.progress.idx, finished: e.progress.finished, retired: !!e.progress.retired, penalty: e.progress.penalty, health: e.car.health, stops: e.stops, pit: e.pit?.phase })),
        safetyCar: () => !!race.sc,
        skip: (seconds: number) => (race.clock += seconds),
        /** wreck the car in position `pos` (1 = the leader), for trying out the safety car */
        wreck: (pos: number) => applyDamage(race.entrants[raceOrder(race)[pos - 1]].car, 1000, HANDLING),
        /** show the results table as the race stands, for checking its layout */
        results: () => showResults(raceOrder(race)),
        records: () => records,
        /** damage your car by `share` of its health and put it in the pit entry, turning in, for trying out a stop */
        toPits: (share = 0.5) => {
          const me = race.entrants[you];
          const { pit } = circuit;
          const idx = (pit.entry + 6) % track.samples.length;
          const s = track.samples[idx];
          const out = 58 * pit.side;
          Object.assign(me.car, { x: s.x + Math.cos(s.dir) * out, y: s.y + Math.sin(s.dir) * out, heading: s.dir, vx: Math.sin(s.dir) * 200, vy: -Math.cos(s.dir) * 200 });
          me.progress = { ...me.progress, idx };
          applyDamage(me.car, me.car.cls.health * share, HANDLING);
        },
      },
    });
  }

  // the pit entry is on this side of the track, and the pit wall calls you in when a stop would pay off
  const pitSide = circuit.pit.side < 0 ? 'LEFT' : 'RIGHT';
  const boxBox = () => {
    const me = race.entrants[you];
    const p = me.progress;
    const n = track.samples.length;
    if (p.lapStart === undefined || p.finished !== undefined || !between(p.idx, circuit.pit.entry - 60, circuit.pit.entry + 4, n)) return false;
    return wantsPit(me.car, me.tyres, race.laps - p.lap - p.idx / n, planLapTime(race, me), HANDLING.damageSlow, track.length);
  };

  /**
   * The results as a table, so the columns line up (the pixel font isn't monospaced): position,
   * driver, team, time (the winner's, then the gap), best lap, and penalties and pit stops. Your row is in gold.
   */
  const showResults = (order: number[]) => {
    const first = race.entrants[order[0]].progress;
    const winner = (first.finished ?? 0) + first.penalty;
    const cell = (tag: 'td' | 'th', text: string, right = false) => {
      const c = document.createElement(tag);
      c.textContent = text;
      Object.assign(c.style, { padding: '1px 3px', textAlign: right ? 'right' : 'left', fontWeight: 'normal', whiteSpace: 'nowrap' });
      return c;
    };
    const table = document.createElement('table');
    Object.assign(table.style, { width: '100%', borderCollapse: 'collapse', font: 'inherit', color: 'inherit' });
    const head = document.createElement('tr');
    head.style.color = '#9d9ab8';
    head.append(cell('th', '', true), cell('th', 'NAME'), cell('th', 'TEAM'), cell('th', 'TIME', true), cell('th', 'BEST', true), cell('th', ''));
    table.append(head);
    order.forEach((i, pos) => {
      const e = race.entrants[i];
      const p = e.progress;
      const time = p.retired
        ? 'DNF'
        : p.finished !== undefined
          ? pos === 0
            ? fmt(p.finished + p.penalty)
            : `+${(p.finished + p.penalty - winner).toFixed(2)}`
          : `${p.lap}/${race.laps} LAPS`;
      const best = p.lapTimes.length ? fmt(Math.min(...p.lapTimes)) : '–';
      const fastest = hudState.fastest?.who === i;
      const notes = [p.penalty ? `+${p.penalty}S` : '', e.stops ? `${e.stops}P` : ''].filter(Boolean).join(' ');
      const row = document.createElement('tr');
      if (i === you) row.style.color = '#f2c14e';
      row.append(cell('td', `${pos + 1}`, true), cell('td', looks[i].name), cell('td', looks[i].team.code), cell('td', time, true), cell('td', best, true), cell('td', notes));
      // the race's fastest lap in purple
      if (fastest) (row.children[4] as HTMLElement).style.color = '#b36bff';
      table.append(row);
    });
    const line = (text: string, css: Partial<CSSStyleDeclaration> = {}) => {
      const d = document.createElement('div');
      d.textContent = text;
      Object.assign(d.style, css);
      return d;
    };
    results.replaceChildren(
      line(`CHEQUERED FLAG · ${difficulty.name} · ${weather.name}`, { fontSize: '13px', color: '#f2c14e', marginBottom: '8px' }),
      table,
      line('P = PIT STOPS · S = PENALTY SECONDS', { color: '#9d9ab8', marginTop: '8px' }),
      line(`LAP RECORD ${fmt(rec()?.bestLap)}${saved.newLap ? ' · NEW!' : ''}`, { color: saved.newLap ? '#f2c14e' : '#f4f2fa', marginTop: '8px' }),
      line(`BEST ${race.laps}-LAP RACE ${fmt(rec()?.bestRace[race.laps])}${saved.newRace ? ' · NEW!' : ''}`, { color: saved.newRace ? '#f2c14e' : '#f4f2fa' }),
      line('START to race again', { marginTop: '8px' }),
      line('SELECT for circuits'),
    );
    results.style.display = 'block';
  };

  // vibration on or off, from the pause screen (and remembered)
  const rumbleState = newRumble();
  const vibrationButton = pauseButton('', () => {
    setVibration(!vibrationOn());
    showVibration();
    vibrate(40);
  });
  const showVibration = () => (vibrationButton.textContent = `VIBRATION: ${vibrationOn() ? 'ON' : 'OFF'}`);
  showVibration();
  pauseScreen.append(
    pauseTitle,
    pauseButton('RESUME', () => setPaused(false)),
    pauseButton('RESTART', () => startRace()),
    pauseButton('CIRCUITS', () => onQuit()),
    vibrationButton,
    pauseHint,
  );
  // leaving the app or the tab pauses the race; so do Esc and P on a keyboard
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !done) setPaused(true);
  });
  window.addEventListener('keydown', (e) => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && !(e.target instanceof HTMLInputElement) && !done) setPaused(!paused);
  });

  // ---------------------------------------------------------------- loop
  const focus = new THREE.Vector3(race.entrants[you].car.x, 0, race.entrants[you].car.y);
  const target = new THREE.Vector3();
  let frames = 0;
  let statTime = 0;
  let fps = 0;
  let miniTime = 0;
  hud.setLabel('a', 'PAUSE');
  hud.setLabel('b', 'DRIFT');

  const tick = (now: number) => {
    // (the first frame's timestamp can be a touch before mount time)
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (pressed('start')) startRace();
    // A pauses and resumes (not once the race is over: the results are up)
    if (pressed('a') && !done) setPaused(!paused);
    // SELECT goes back to the circuits once it's let go: leaving the page with a finger still down
    // can leave the next page deaf to touch on a phone (in itch.io's frame the lifting finger's
    // events go to a page that's gone)
    if (pressed('select')) quitting = true;
    if (quitting && !controls.isDown('select')) {
      quitting = false;
      onQuit();
    }
    // paused: nothing moves, and the last frame stays on the screen
    if (paused) {
      requestAnimationFrame(tick);
      return;
    }
    // laps can be tuned live (TUNE), so the race picks up the current value
    race.laps = Math.round(t.laps);
    const laps = race.laps;

    // the race: everyone drives, the rules run
    const pad = { stick: controls.direction(), a: controls.isDown('a'), b: controls.isDown('b') };
    // the device you last used decides how you drive: the touch thumbstick points where to go; keys and a
    // gamepad drive the car itself (up or the right trigger is gas, down or the left trigger the brake)
    const source = controls.lastSource();
    const drive = source === 'gamepad' ? controls.drive('gamepad') : undefined;
    const driveInput = (car: Car) =>
      drive ? wheelInput({ ...drive, drift: pad.b }, car)
      : source === 'keyboard' ? wheelInput(keysWheel({ up: controls.isDown('up'), down: controls.isDown('down'), left: controls.isDown('left'), right: controls.isDown('right') }, pad.b), car)
      : playerInput(pad);
    const healthBefore = race.entrants[you].car.health;
    const step = stepRace(race, dt, (e) => driveInput(e.car));
    // your car's vibration: crashes, landings, grass and gravel, kerbs
    {
      const me = race.entrants[you];
      const ev = step.cars[you];
      const cell = circuit.cells[Math.floor(me.car.y / TILE) * circuit.width + Math.floor(me.car.x / TILE)];
      vibrate(rumble(rumbleState, {
        dt, speed: speedOf(me.car), topSpeed: me.car.cls.topSpeed, healthLost: healthBefore - me.car.health,
        wreckedNow: ev.wreckedNow, landed: ev.landed, onRough: ev.onRough, onKerb: cell === 'kerb',
      }));
    }
    for (const e of step.race) {
      if (e.kind === 'safety-car') announce('SAFETY CAR', '#f2c14e', 2.5);
      else if (e.kind === 'green') announce('GREEN FLAG', '#5fe0d0', 2);
      else if (e.kind === 'penalty' && e.who === you) announce(`NO PASSING UNDER SC · +${e.seconds} S`, '#d8323c', 3);
      else if (e.kind === 'retired') world.scene.remove(looks[e.who].mesh);
      else if (e.kind === 'pit-out' && e.who === you) announce('PIT EXIT', '#5fe0d0', 1.5);
      else if (e.kind === 'pit-stop' && e.who !== you && race.clock >= notice.until) announce(`${looks[e.who].name} PITS`, '#9d9ab8', 1.5);
    }
    // gaps at the timing points, and the race's fastest lap (announced; purple in the results)
    if (race.phase === 'racing') stepGaps(hudState.gaps, race.entrants.map((e) => e.progress), track, race.clock);
    race.entrants.forEach((e, i) => {
      const count = e.progress.lapTimes.length;
      if (count <= hudState.lapsSeen[i]) return;
      const lap = e.progress.lapTimes[count - 1];
      hudState.lapsSeen[i] = count;
      if (hudState.fastest && lap >= hudState.fastest.time) return;
      const first = !hudState.fastest;
      hudState.fastest = { time: lap, who: i };
      // (not for the first lap anyone completes: that's always the fastest so far)
      if (!first && race.clock >= notice.until) announce(`FASTEST LAP · ${looks[i].name} ${fmt(lap)}`, '#b36bff', 2.5);
    });
    // your records: a new lap as soon as it's done (a record announced if it beats one), the race at your flag
    const mine = race.entrants[you].progress;
    if (mine.lapTimes.length > saved.laps || (mine.finished !== undefined && !saved.race)) {
      for (const lap of mine.lapTimes.slice(saved.laps)) {
        const had = rec()?.bestLap !== undefined;
        if (recordLap(records, recordId, lap)) {
          saved.newLap = true;
          if (had) announce(`NEW LAP RECORD ${fmt(lap)}`, '#f2c14e', 3);
        }
      }
      saved.laps = mine.lapTimes.length;
      if (mine.finished !== undefined && !saved.race) {
        saved.race = true;
        saved.newRace = recordRace(records, recordId, race.laps, mine.finished + mine.penalty);
      }
      saveRecords(records);
    }
    race.entrants.forEach((e, i) => {
      if (!running(e)) return;
      const ev = step.cars[i];
      const l = looks[i];
      if (ev.skidding) skids.mark(i, e.car.x, e.car.y, e.car.heading, Math.min(1, speedOf(e.car) / e.car.cls.topSpeed), e.car.cls);
      else skids.lift(i);
      const tilt = bodyTilt(e.car, grid);
      l.mesh.position.set(e.car.x, e.car.z, e.car.y);
      l.mesh.rotation.set(tilt.pitch, -e.car.heading, tilt.roll, 'YXZ');
      const speed = speedOf(e.car);
      l.fx.update(dt, condition(e.car), particles, ev.onRough && speed > 25 ? Math.min(1, speed / 120) : 0);
      // the tyres' compound colour, and spray off a wet track from behind the car at speed
      l.mesh.userData.tyreMark.color.set(COMPOUNDS[e.tyres.compound].color);
      if (weather.spray && speed > 60 && Math.random() < dt * (weather.rain > 0 ? 14 : 6) * Math.min(1, speed / 250)) {
        particles.spray(e.car.x - Math.sin(e.car.heading) * 14, e.car.y + Math.cos(e.car.heading) * 14, e.car.z);
      }
    });
    // the safety car on the track while it's out
    const sc = race.sc;
    if (sc && !safetyCar.group.parent) world.scene.add(safetyCar.group);
    if (!sc && safetyCar.group.parent) world.scene.remove(safetyCar.group);
    if (sc) {
      const tilt = bodyTilt(sc.car, grid);
      safetyCar.group.position.set(sc.car.x, sc.car.z, sc.car.y);
      safetyCar.group.rotation.set(tilt.pitch, -sc.car.heading, tilt.roll, 'YXZ');
      safetyCar.update(dt);
    }

    // standings and HUD
    const order = raceOrder(race);
    const me = race.entrants[you];
    const pos = order.indexOf(you) + 1;
    const p = me.progress;
    const clock = race.clock;
    if (!done && race.phase === 'racing' && (p.finished !== undefined || p.retired)) done = true;
    // the results come up a moment after your flag, or once the rest have finished if you're out
    const others = race.entrants.filter((e) => e !== me && running(e));
    const showNow = p.finished !== undefined ? clock > p.finished + 1.5 : others.every((e) => e.progress.finished !== undefined);
    if (done && (results.style.display === 'block' || showNow)) showResults(order); // live as the others finish
    hud.setPosition(`P${pos}/${race.entrants.length}`);
    // a place gained or lost lights the position up in the strip below, green ▲ or red ▼, for a moment
    // (not while the lights are on, nor after your flag)
    if (race.phase === 'racing' && !done && hudState.lastPos && pos !== hudState.lastPos) {
      hud.setPositionChange(pos < hudState.lastPos ? 'gain' : 'lose');
      hudState.flashUntil = clock + 1.5;
    }
    if (clock > hudState.flashUntil) hud.setPositionChange(undefined);
    hudState.lastPos = pos;
    hud.setLap(p.retired ? 'OUT' : `LAP ${Math.min(laps, p.lap + 1)}/${laps}`);

    // the banner: start lights, GO!, then the most urgent message
    teamCard.style.opacity = race.phase === 'lights' ? '1' : '0';
    if (race.phase === 'lights') {
      const lit = Math.max(0, Math.min(5, Math.floor((clock + LIGHTS) / 0.6)));
      banner.textContent = clock < 0 ? '● '.repeat(lit).trim() + ' ○'.repeat(5 - lit) : '● ● ● ● ●';
      banner.style.color = '#d8323c';
    } else {
      const stop = me.pit;
      const [text, color] =
        me.car.wrecked || p.retired ? ['DNF · START to restart', '#d8323c']
        : done ? ['', '']
        : stop?.phase === 'stopped' ? [`PIT STOP ${Math.max(0, stop.left).toFixed(1)}`, '#f2c14e']
        : stop ? ['PIT LIMITER', '#f2c14e']
        : boxBox() ? [`BOX, BOX · PITS ${pitSide}`, '#f2c14e']
        : p.wrongWay > 1 ? ['WRONG WAY', '#d8323c']
        : clock < 1.2 ? ['GO!', '#5fe0d0']
        : clock < notice.until ? [notice.text, notice.color]
        : sc ? ['SAFETY CAR', '#f2c14e']
        : ['', ''];
      banner.textContent = text;
      banner.style.color = color;
    }
    const lapTime = p.lapStart !== undefined && p.finished === undefined ? clock - p.lapStart : undefined;
    const best = p.lapTimes.length ? Math.min(...p.lapTimes) : undefined;
    // your car's health as five blocks (each is 20%)
    const blocks = Math.ceil((me.car.health / me.car.cls.health) * 5);
    const car = me.car.wrecked ? 'WRECKED' : '■'.repeat(blocks) + '□'.repeat(5 - blocks);
    // your tyres as five blocks and a share left, amber once they're past their best
    const left = 1 - me.tyres.wear;
    const tyreBlocks = Math.ceil(left * 5);
    const tyres = `${COMPOUNDS[me.tyres.compound].short} ${'■'.repeat(tyreBlocks)}${'□'.repeat(5 - tyreBlocks)} ${Math.round(left * 100)}%${me.tyres.wear >= 0.7 ? ' WORN' : ''}`;
    const limiter = me.pit ? ` · PIT ${PIT.limit}` : sc && !done ? ` · SC ${SAFETY_CAR.limit}` : '';
    // the gaps to the cars either side of you (by the timing points), while you're racing
    const gapLine = (other: number | undefined, mark: string) => {
      if (other === undefined || done) return '';
      const gap = mark === '▲' ? gapBetween(hudState.gaps, other, you) : gapBetween(hudState.gaps, you, other);
      // (just after a pass the last shared timing point can put the gap the wrong way round: 0 then)
      return `\n${mark} ${looks[other].name.padEnd(6)}${gap === undefined ? '–' : `${mark === '▲' ? '+' : '−'}${Math.max(0, gap).toFixed(2)}`}`;
    };
    const ahead = pos > 1 ? order[pos - 2] : undefined;
    const behindCar = order[pos];
    const behind = behindCar !== undefined && running(race.entrants[behindCar]) && !race.entrants[behindCar].car.wrecked ? behindCar : undefined;
    readout.textContent = `LAP  ${fmt(lapTime)}\nLAST ${fmt(p.lapTimes[p.lapTimes.length - 1])}\nBEST ${fmt(best)}\nREC  ${fmt(rec()?.bestLap)}${gapLine(ahead, '▲')}${gapLine(behind, '▼')}\nCAR  ${car}${limiter}\n`;
    // the tyre line in its compound's colour
    tyreLine.textContent = `TYRE ${tyres}\n`;
    tyreLine.style.color = COMPOUNDS[me.tyres.compound].color;
    statsLine.textContent = `${Math.round(speedOf(me.car))} PX/S · ${fps} FPS ${QUALITY_LEVELS[governor.level].name.toUpperCase()}`;
    readout.append(tyreLine, statsLine);

    // minimap, ten times a second: wrecks in grey, the safety car in amber
    miniTime += dt;
    if (miniTime > 0.1) {
      miniTime = 0;
      miniCtx.clearRect(0, 0, mini.width, mini.height);
      miniCtx.drawImage(map.canvas, 0, 0);
      const dot = (x: number, y: number, color: string, size: number) => {
        const q = map.toMap(x, y);
        miniCtx.fillStyle = color;
        miniCtx.fillRect(q.x - size / 2, q.y - size / 2, size, size);
      };
      race.entrants.forEach((e, i) => {
        if (running(e) && i !== you) dot(e.car.x, e.car.y, e.car.wrecked ? '#6c707a' : looks[i].color, 5);
      });
      if (sc) dot(sc.car.x, sc.car.y, '#ffb020', 6);
      dot(me.car.x, me.car.y, '#f2c14e', 7);
    }
    particles.update(dt);
    drawRain(dt);
    skids.update(dt);

    // camera: follow your car, looking ahead along its motion
    const c = me.car;
    target.set(c.x + (c.vx / c.cls.topSpeed) * t.lead, c.z * 0.5, c.y + (c.vy / c.cls.topSpeed) * t.lead);
    focus.lerp(target, 1 - Math.exp(-dt * 6));
    const pitch = deg(LOOK.pitch);
    const dist = viewH / (2 * Math.tan(deg(LOOK.fov / 2))) / t.zoom;
    camera.position.set(focus.x, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * dist);
    camera.lookAt(focus.x, focus.y, focus.z);
    world.followSun(focus);


    if (settle > 0) settle--;
    else governor.sample(dt);
    const q = QUALITY_LEVELS[governor.level];
    applySize();
    world.setShadowMapSize(q.shadowMap);
    post.render(dt, { bloom: LOOK.bloom, blur: LOOK.blur, bloomOn: q.bloom, blurOn: q.blur });

    frames++;
    statTime += dt;
    if (statTime >= 0.5) {
      fps = Math.round(frames / statTime);
      frames = 0;
      statTime = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  return { resize };
};
