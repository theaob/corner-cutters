// The F1 race: you and the AI field in F1 cars on one of the circuits.
// Start lights, laps, positions, lap times, damage, pit stops to repair it,
// the safety car after a big crash, a minimap, and results at the flag. The rules live in raceControl.ts;
// this is the picture and the HUD. START restarts; SELECT goes back to choose a circuit.

import * as THREE from 'three';
import type { Button } from '../engine/controls';
import { applyDamage, bodyTilt, carClass, condition, newCar, speedOf } from '../engine/driving';
import { groundAt } from '../engine/sim';
import { RACE_HANDLING, lineCornerSpeed, lineDecel, playerInput, type AiDriver } from './racing';
import { LIGHTS, SAFETY_CAR, newRace, order as raceOrder, running, stepRace, type Race } from './raceControl';
import { createSafetyCarMesh } from './safetyCar3d';
import { PIT, between, wantsPit } from './pits';
import { TEAMS, secondCars, teamGrid, type Team } from './teams';
import { logoSvg } from './logos';
import { createCarMesh, type CarMesh } from '../engine/render/vehicles3d';
import { CarFx, Particles, SkidLayer } from '../engine/render/effects';
import { Hd2dPipeline } from '../engine/render/hd2d';
import { HD2D_VIEW } from '../engine/look';
import { QUALITY_LEVELS, QualityGovernor } from '../engine/render/quality';
import type { ScreenFit } from '../engine/layout';
import { loadVehicleEdits } from '../engine/vehicleEdits';
import type { MountStandalone } from '../engine/view';
import { defaults } from '../engine/tuning';
import { buildCircuit } from './circuit';
import type { CircuitLayout } from './layouts';
import { createCircuitScene } from './circuitScene';
import { F1_TUNING } from './tuning';

type F1Tuning = Record<keyof typeof F1_TUNING, number>;
const deg = THREE.MathUtils.degToRad;
const LOOK = HD2D_VIEW;
/** The T-camera colour marking a team's second car. */
const TCAM_GREEN = '#39ff14';
const NAMES = ['VOLT', 'RAZZ', 'MOCHI', 'TANK', 'ZIGGY', 'PIP', 'NOVA', 'BLAZE', 'DOT'];

/** How each entrant looks: its name, team, colour, model and effects (index-matched with the race's entrants). */
interface Look {
  name: string;
  team: Team;
  mesh: CarMesh;
  fx: CarFx;
  color: string;
}

const fmt = (s?: number) => (s === undefined ? '–' : `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`);

/** The race on `layout`, driven for `team`; `onQuit` runs when the player presses and releases SELECT. */
export const raceOn = (layout: CircuitLayout, onQuit: () => void, team: Team = TEAMS[0]): MountStandalone => async ({ host, services, tuning, fit }) => {
  const t = (tuning ?? defaults(F1_TUNING)) as F1Tuning;
  const { controls, hud } = services;
  loadVehicleEdits(); // (any saved stat edits apply to the cars)
  const f1 = carClass('f1');
  const HANDLING = RACE_HANDLING;
  // the AI's line: flat out wherever the car can follow the bend, like a player can
  const circuit = buildCircuit(layout, { cornerSpeed: lineCornerSpeed(f1, HANDLING), decel: lineDecel(f1) });
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
  teamCard.append(team.name.toUpperCase());
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
  host.append(readout, banner, results, mini, teamCard);

  // ---------------------------------------------------------------- race state
  let race!: Race;
  let looks: Look[] = [];
  /** your race is over (finished, or out) and the results are coming */
  let done = false;
  let you = 0;
  const safetyCar = createSafetyCarMesh();
  /** a message over the race for a few seconds (safety car, penalty…), shown unless something more urgent is */
  let notice = { text: '', color: '', until: 0 };
  const announce = (text: string, color: string, seconds = 3) => (notice = { text, color, until: race.clock + seconds });

  const startRace = () => {
    for (const l of looks) world.scene.remove(l.mesh);
    world.scene.remove(safetyCar.group);
    const total = Math.min(circuit.slots.length, 1 + Math.round(t.opponents));
    you = Math.floor(total / 2);
    // your team and four drawn at random, two cars each, in their liveries
    const teams = teamGrid(team, total, you);
    const seconds = secondCars(teams);
    looks = [];
    const field = Array.from({ length: total }, (_, i) => {
      const slot = circuit.slots[i];
      const livery = teams[i];
      // teammates: the team's second car has the bright green T-camera
      const mesh = createCarMesh('f1', { body: livery.body, stripe: livery.trim, accent: livery.accent, pattern: livery.pattern, tcam: seconds[i] ? TCAM_GREEN : undefined });
      world.scene.add(mesh);
      // each AI driver its own name (the grid slots skip yours)
      looks.push({ name: i === you ? 'YOU' : NAMES[(i < you ? i : i - 1) % NAMES.length], team: livery, mesh, fx: new CarFx(mesh), color: livery.body });
      // AI drivers differ a little in pace and line; a quicker car starts further up the grid
      const ai: AiDriver | undefined = i === you ? undefined : { lane: ((i * 7) % 11) - 5, pace: t.aiPace * (1 - (i / total) * 0.05) };
      // each team its own box in the pit lane
      return { car: newCar(carClass('f1'), slot.x, slot.y, slot.heading), ai, box: [...new Set(teams)].indexOf(livery) };
    });
    // five lights, one every 0.6 s, then out after a short random wait
    race = newRace(track, grid, HANDLING, Math.round(t.laps), field, 0.3 + Math.random() * 0.7, circuit.pit);
    done = false;
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
        order: () => raceOrder(race).map((i) => looks[i].name),
        you: () => ({ ...race.entrants[you].progress, speed: speedOf(race.entrants[you].car), health: race.entrants[you].car.health, x: race.entrants[you].car.x, y: race.entrants[you].car.y }),
        racers: () => race.entrants.map((e, i) => ({ name: looks[i].name, team: looks[i].team.code, lap: e.progress.lap, idx: e.progress.idx, finished: e.progress.finished, retired: !!e.progress.retired, penalty: e.progress.penalty, health: e.car.health, stops: e.stops, pit: e.pit?.phase })),
        safetyCar: () => !!race.sc,
        skip: (seconds: number) => (race.clock += seconds),
        /** wreck the car in position `pos` (1 = the leader), for trying out the safety car */
        wreck: (pos: number) => applyDamage(race.entrants[raceOrder(race)[pos - 1]].car, 1000, HANDLING),
        /** show the results table as the race stands, for checking its layout */
        results: () => showResults(raceOrder(race)),
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
    const lapTime = p.lapTimes[p.lapTimes.length - 1] ?? track.length / 280;
    return wantsPit(me.car, race.laps - p.lap - p.idx / n, lapTime, HANDLING.damageSlow);
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
      const notes = [p.penalty ? `+${p.penalty}S` : '', e.stops ? `${e.stops}P` : ''].filter(Boolean).join(' ');
      const row = document.createElement('tr');
      if (i === you) row.style.color = '#f2c14e';
      row.append(cell('td', `${pos + 1}`, true), cell('td', looks[i].name), cell('td', looks[i].team.code), cell('td', time, true), cell('td', best, true), cell('td', notes));
      table.append(row);
    });
    const line = (text: string, css: Partial<CSSStyleDeclaration> = {}) => {
      const d = document.createElement('div');
      d.textContent = text;
      Object.assign(d.style, css);
      return d;
    };
    results.replaceChildren(
      line('CHEQUERED FLAG', { fontSize: '13px', color: '#f2c14e', marginBottom: '8px' }),
      table,
      line('P = PIT STOPS · S = PENALTY SECONDS', { color: '#9d9ab8', marginTop: '8px' }),
      line('START to race again', { marginTop: '8px' }),
      line('SELECT for circuits'),
    );
    results.style.display = 'block';
  };

  // ---------------------------------------------------------------- loop
  const focus = new THREE.Vector3(race.entrants[you].car.x, 0, race.entrants[you].car.y);
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
    // SELECT goes back to the circuits once it's let go: leaving the page with a finger still down
    // can leave the next page deaf to touch on a phone (in itch.io's frame the lifting finger's
    // events go to a page that's gone)
    if (pressed('select')) quitting = true;
    if (quitting && !controls.isDown('select')) {
      quitting = false;
      onQuit();
    }
    // laps can be tuned live (TUNE), so the race picks up the current value
    race.laps = Math.round(t.laps);
    const laps = race.laps;

    // the race: everyone drives, the rules run
    const pad = { stick: controls.direction(), a: controls.isDown('a'), b: controls.isDown('b') };
    const step = stepRace(race, dt, () => playerInput(pad));
    for (const e of step.race) {
      if (e.kind === 'safety-car') announce('SAFETY CAR', '#f2c14e', 2.5);
      else if (e.kind === 'green') announce('GREEN FLAG', '#5fe0d0', 2);
      else if (e.kind === 'penalty' && e.who === you) announce(`NO PASSING UNDER SC · +${e.seconds} S`, '#d8323c', 3);
      else if (e.kind === 'retired') world.scene.remove(looks[e.who].mesh);
      else if (e.kind === 'pit-out' && e.who === you) announce('PIT EXIT', '#5fe0d0', 1.5);
      else if (e.kind === 'pit-stop' && e.who !== you && race.clock >= notice.until) announce(`${looks[e.who].name} PITS`, '#9d9ab8', 1.5);
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
    const limiter = me.pit ? ` · PIT ${PIT.limit}` : sc && !done ? ` · SC ${SAFETY_CAR.limit}` : '';
    readout.textContent = `${Math.round(speedOf(me.car))} PX/S · ${fps} FPS\nLAP  ${fmt(lapTime)}\nLAST ${fmt(p.lapTimes[p.lapTimes.length - 1])}\nBEST ${fmt(best)}\nCAR  ${car}${limiter}`;

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
