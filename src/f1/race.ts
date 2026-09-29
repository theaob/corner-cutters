// The F1 race: you and the AI field in F1 cars at Amimo Park.
// Start lights, laps, positions, lap times, a minimap, and results at the flag.
// START restarts the race.

import * as THREE from 'three';
import type { Button } from '../engine/controls';
import {
  bodyTilt,
  carClass,
  collideCars,
  condition,
  newCar,
  speedOf,
  stepCar,
  type Car,
  type DriveInput,
} from '../engine/driving';
import { groundAt } from '../engine/sim';
import { RACE_HANDLING, aiInput, coolDownInput, lineCornerSpeed, lineDecel, newProgress, standings, stepProgress, type AiDriver, type RaceProgress } from './racing';
import { createCarMesh, type CarMesh } from '../engine/render/vehicles3d';
import { CarFx, Particles, SkidLayer } from '../engine/render/effects';
import { Hd2dPipeline } from '../engine/render/hd2d';
import { HD2D_VIEW } from '../engine/look';
import { QUALITY_LEVELS, QualityGovernor } from '../engine/render/quality';
import type { ScreenFit } from '../engine/layout';
import { loadVehicleEdits, vehicleColors } from '../engine/vehicleEdits';
import type { MountStandalone } from '../engine/view';
import { defaults } from '../engine/tuning';
import { buildCircuit } from './circuit';
import { createCircuitScene } from './circuitScene';
import { F1_TUNING } from './tuning';

type F1Tuning = Record<keyof typeof F1_TUNING, number>;
const deg = THREE.MathUtils.degToRad;
const LOOK = HD2D_VIEW;
const NAMES = ['VOLT', 'RAZZ', 'MOCHI', 'TANK', 'ZIGGY', 'PIP', 'NOVA', 'BLAZE', 'DOT'];

interface Racer {
  name: string;
  car: Car;
  mesh: CarMesh;
  fx: CarFx;
  ai?: AiDriver;
  progress: RaceProgress;
  color: string;
}

const fmt = (s?: number) => (s === undefined ? '–' : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`);

export const mount: MountStandalone = async ({ host, services, tuning, fit }) => {
  const t = (tuning ?? defaults(F1_TUNING)) as F1Tuning;
  const { controls, hud } = services;
  const edits = loadVehicleEdits();
  const f1 = carClass('f1');
  const HANDLING = RACE_HANDLING;
  // the AI's line: flat out wherever the car can follow the bend, like a player can
  const circuit = buildCircuit({ cornerSpeed: lineCornerSpeed(f1, HANDLING), decel: lineDecel(f1) });
  const { track, grid } = circuit;
  const world = createCircuitScene(circuit);
  const skids = new SkidLayer((x, y) => groundAt(grid, x, y).h);
  const particles = new Particles();
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
  const banner = document.createElement('div');
  style(banner, {
    position: 'absolute', left: '0', right: '0', top: '30%', zIndex: '2', textAlign: 'center',
    font: '20px Silkscreen, monospace', color: '#f2c14e', textShadow: '0 2px 0 #1b1b26', pointerEvents: 'none',
  });
  const results = document.createElement('div');
  style(results, {
    position: 'absolute', left: '10px', right: '10px', top: '18%', zIndex: '3', padding: '10px', borderRadius: '10px',
    background: 'rgba(21,20,31,.92)', color: '#f4f2fa', font: '13px Silkscreen, monospace', whiteSpace: 'pre', display: 'none',
  });
  const MINI_W = 96;
  const MINI_H = Math.round((MINI_W * circuit.height) / circuit.width);
  const map = world.minimap(MINI_W * 2, MINI_H * 2);
  const mini = document.createElement('canvas');
  mini.width = MINI_W * 2;
  mini.height = MINI_H * 2;
  style(mini, {
    position: 'absolute', right: '6px', top: '40px', zIndex: '2', width: `${MINI_W}px`, height: `${MINI_H}px`,
    background: 'rgba(21,20,31,.6)', borderRadius: '6px',
  });
  const miniCtx = mini.getContext('2d')!;
  host.append(readout, banner, results, mini);

  // ---------------------------------------------------------------- race state
  let racers: Racer[] = [];
  let phase: 'lights' | 'racing' | 'done' = 'lights';
  let clock = 0; // seconds since the lights went out (negative during the lights)
  let lightsOut = 0;
  let you = 0;

  const startRace = () => {
    for (const r of racers) world.scene.remove(r.mesh);
    const total = Math.min(circuit.slots.length, 1 + Math.round(t.opponents));
    you = Math.floor(total / 2);
    const palette = vehicleColors('f1', edits);
    const yourColor = palette[0];
    const others = ['#d8323c', '#3d7fc4', '#1b1b26', '#f08a24', '#5fe0d0', '#f4f4f8', '#8a3cc8', '#f2c14e', '#3f9a4c', '#ff5fb8'].filter((c) => c !== yourColor);
    racers = Array.from({ length: total }, (_, i) => {
      const slot = circuit.slots[i];
      const car = newCar(carClass('f1'), slot.x, slot.y, slot.heading);
      const color = i === you ? yourColor : others[i % others.length];
      const mesh = createCarMesh('f1', color);
      world.scene.add(mesh);
      // AI drivers differ a little in pace and line; a quicker car starts further up the grid
      const ai: AiDriver | undefined = i === you ? undefined : { lane: ((i * 7) % 11) - 5, pace: t.aiPace * (1 - (i / total) * 0.05) };
      return { name: i === you ? 'YOU' : NAMES[i % NAMES.length], car, mesh, fx: new CarFx(mesh), ai, progress: newProgress(track.samples.length - 4), color };
    });
    phase = 'lights';
    clock = -3.6; // five lights, one every 0.6 s, then out after a short random wait
    lightsOut = 0.3 + Math.random() * 0.7;
    skids.clear();
    particles.clear();
    results.style.display = 'none';
  };
  startRace();

  const seen = new Map<Button, number>();
  const pressed = (b: Button) => {
    const n = controls.presses(b);
    const edge = n > (seen.get(b) ?? n);
    seen.set(b, n);
    return edge;
  };

  if (new URLSearchParams(window.location.search).has('debug')) {
    Object.assign(window, {
      __cc: {
        phase: () => phase,
        clock: () => clock,
        order: () => standings(racers.map((r) => r.progress), track).map((i) => racers[i].name),
        you: () => ({ ...racers[you].progress, speed: speedOf(racers[you].car), x: racers[you].car.x, y: racers[you].car.y }),
        racers: () => racers.map((r) => ({ name: r.name, lap: r.progress.lap, idx: r.progress.idx, finished: r.progress.finished, health: r.car.health })),
        skip: (seconds: number) => (clock += seconds),
      },
    });
  }

  const showResults = (order: number[]) => {
    const winner = racers[order[0]].progress.finished ?? 0;
    const lines = order.map((i, pos) => {
      const r = racers[i];
      const p = r.progress;
      const time = p.finished !== undefined ? (pos === 0 ? fmt(p.finished) : `+${(p.finished - winner).toFixed(2)}`) : `${p.lap}/${Math.round(t.laps)} laps`;
      const best = p.lapTimes.length ? fmt(Math.min(...p.lapTimes)) : '–';
      return `${String(pos + 1).padStart(2)}  ${r.name.padEnd(6)} ${time.padStart(9)}  ${best}`;
    });
    results.textContent = `CHEQUERED FLAG\n\n    NAME        TIME  BEST LAP\n${lines.join('\n')}\n\nSTART to race again`;
    results.style.display = 'block';
  };

  // ---------------------------------------------------------------- loop
  const focus = new THREE.Vector3(racers[you].car.x, 0, racers[you].car.y);
  const target = new THREE.Vector3();
  let last = performance.now();
  let frames = 0;
  let statTime = 0;
  let fps = 0;
  let miniTime = 0;
  hud.setLabel('a', '');
  hud.setLabel('b', 'DRIFT');

  const tick = (now: number) => {
    // (the first frame's timestamp can be a touch before mount time)
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    if (pressed('start')) startRace();
    pressed('a');
    pressed('select');
    const laps = Math.round(t.laps);
    clock += dt;

    // start lights: five reds come on, then all go out together
    if (phase === 'lights') {
      const lit = Math.max(0, Math.min(5, Math.floor((clock + 3.6) / 0.6)));
      banner.textContent = clock < 0 ? '● '.repeat(lit).trim() + ' ○'.repeat(5 - lit) : '● ● ● ● ●';
      banner.style.color = '#d8323c';
      if (clock >= lightsOut) {
        phase = 'racing';
        clock = 0;
      }
    } else if (phase === 'racing' && clock < 1.2) {
      banner.textContent = 'GO!';
      banner.style.color = '#5fe0d0';
    }

    // cars
    const cars = racers.map((r) => r.car);
    racers.forEach((r, i) => {
      let input: DriveInput;
      const others = cars.filter((c) => c !== r.car);
      if (phase === 'lights') {
        input = { handbrake: true, brake: true };
      } else if (r.progress.finished !== undefined) {
        // after the flag everyone (you too, on autopilot) coasts round a cool-down lap
        input = coolDownInput(r.car, track, r.progress.idx, others);
      } else if (r.ai) {
        input = aiInput(r.car, track, r.progress.idx, r.ai, others);
      } else {
        const d = controls.direction();
        input = { steer: d.x || d.y ? d : undefined, handbrake: controls.isDown('b') };
      }
      const ev = stepCar(r.car, input, HANDLING, dt, grid);
      if (ev.skidding) skids.mark(i, r.car.x, r.car.y, r.car.heading, Math.min(1, speedOf(r.car) / r.car.cls.topSpeed), r.car.cls);
      else skids.lift(i);
      if (phase !== 'lights') r.progress = stepProgress(r.progress, track, r.car, clock, laps, dt);
      const speed = speedOf(r.car);
      const tilt = bodyTilt(r.car, grid);
      r.mesh.position.set(r.car.x, r.car.z, r.car.y);
      r.mesh.rotation.set(tilt.pitch, -r.car.heading, tilt.roll, 'YXZ');
      r.fx.update(dt, condition(r.car), particles, ev.onRough && speed > 25 ? Math.min(1, speed / 120) : 0);
    });
    for (let i = 0; i < racers.length; i++) for (let j = i + 1; j < racers.length; j++) collideCars(racers[i].car, racers[j].car, HANDLING);

    // standings and HUD
    const order = standings(racers.map((r) => r.progress), track);
    const me = racers[you];
    const pos = order.indexOf(you) + 1;
    const p = me.progress;
    if (phase === 'racing' && p.finished !== undefined) {
      phase = 'done';
      banner.textContent = '';
    }
    if (phase === 'done' && results.style.display === 'none' && clock > (p.finished ?? 0) + 1.5) showResults(order);
    if (phase === 'done' && results.style.display === 'block') showResults(order); // keep the table live as others finish
    hud.setPosition(`P${pos}/${racers.length}`);
    hud.setLap(`LAP ${Math.min(laps, p.lap + 1)}/${laps}`);
    if (phase === 'racing' && clock > 1.2) banner.textContent = p.wrongWay > 1 ? 'WRONG WAY' : me.car.wrecked ? 'DNF · START to restart' : '';
    if (p.wrongWay > 1) banner.style.color = '#d8323c';
    const lapTime = p.lapStart !== undefined && p.finished === undefined ? clock - p.lapStart : undefined;
    const best = p.lapTimes.length ? Math.min(...p.lapTimes) : undefined;
    readout.textContent = `${Math.round(speedOf(me.car))} PX/S · ${fps} FPS\nLAP  ${fmt(lapTime)}\nLAST ${fmt(p.lapTimes[p.lapTimes.length - 1])}\nBEST ${fmt(best)}`;

    // minimap, ten times a second
    miniTime += dt;
    if (miniTime > 0.1) {
      miniTime = 0;
      miniCtx.clearRect(0, 0, mini.width, mini.height);
      miniCtx.drawImage(map.canvas, 0, 0);
      racers.forEach((r, i) => {
        const q = map.toMap(r.car.x, r.car.y);
        miniCtx.fillStyle = i === you ? '#f2c14e' : r.color;
        const size = i === you ? 7 : 5;
        miniCtx.fillRect(q.x - size / 2, q.y - size / 2, size, size);
      });
    }
    particles.update(dt);
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

    governor.sample(dt);
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
