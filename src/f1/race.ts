// The F1 race: you and the AI field in F1 cars on one of the circuits.
// Start lights, laps, positions, lap times, damage, pit stops to repair it,
// the safety car after a big crash, a minimap, and results at the flag. The rules live in raceControl.ts;
// this is the picture and the HUD. A pauses (so does leaving the app or tab); START restarts;
// SELECT goes back to choose a circuit.

import { gridFor, underDeck } from './bridge';
import { carOutline, type CarOutline } from './outline3d';
import * as THREE from 'three';
import type { Button } from '../engine/controls';
import type { DeckButton } from '../engine/deck';
import { applyDamage, bodyTilt, carClass, condition, newCar, speedOf, type Car, type StepEvents } from '../engine/driving';
import { SIM_DT, advance, fixedClock, lerp, lerpAngle, resetClock } from '../engine/fixedStep';
import { newSeed, seededRandom } from '../engine/rng';
import { groundAt } from '../engine/sim';
import { SECTORS, keysWheel, lineCornerSpeed, lineDecel, nearestSample, playerInput, wheelInput, type AiDriver } from './racing';
import { NORMAL, aiCraftFor, aiIncidentsFor, aiMistakesFor, aiPaceFor, handlingFor, paceRanks, type Difficulty } from './difficulty';
import { numberOf, styleOf } from './drivers';
import { DRY, lookAt as weatherLook, type Weather, type WeatherId } from './weather';
import { changeableForecast, conditionOf, fixedForecast, roundForecast, type Forecast } from './forecast';
import { COMPOUNDS, fitTyres, tyreFor, type Compound } from './tyres';
import { LIMITS } from './trackLimits';
import { aiTimes, gridOrder, judgeLap, newQualiLap, newQualifying, referenceLap, type QualiLap } from './qualifying';
import { roundSeed, teamOf, type Season } from './championship';
import { RACE_LAPS } from './laps';
import { GRID_PAN, panAt, panLength } from './gridPan';
import { landmarksOf } from './town3d';
import { standsOf } from './stands';
import { CRASH_REPLAY, REPLAY, crashSpeed, crashWindow, newReplay, recordReplay, replayPose, replaySpeed, replayWindow, wantsCrashReplay, type ReplayRecorder } from './replay';
import { advance as nextPrompt, apexesPassed, newOnboarding, prompt, STEPS, type Device, type Onboarding } from './onboarding';
import { ghostPose, ghostTimeAt, loadGhost, markSplit, newRecorder, recordFrame, saveGhost, toGhost, type Ghost, type LapRecorder, type SplitMark } from './timeTrial';
import { LIGHTS, SAFETY_CAR, VSC, callVsc, newRace, tyreCall, wrongTyres, type RaceEvent, order as raceOrder, planLapTime, running, skipToParked, stepRace, type Race } from './raceControl';
import { createSafetyCarMesh } from './safetyCar3d';
import { createChequeredFlag } from './flag3d';
import { createCeremony, podiumSpot } from './podium3d';
import { PIT, between, inLimitZone, wantsPit } from './pits';
import { TEAMS, driverSeats, teamGrid, type Seat, type Team } from './teams';
import { logoSvg } from './logos';
import { formatTime as fmt, loadRecords, recordAttack, recordLap, recordQualifying, recordRace, saveRecords } from './records';
import { distance, newAttack, stepAttack, type Attack } from './timeAttack';
import { createCarMesh, type CarMesh } from '../engine/render/vehicles3d';
import { CarFx, DebrisLayer, Particles, SkidLayer } from '../engine/render/effects';
import { Hd2dPipeline } from '../engine/render/hd2d';
import { HD2D_VIEW } from '../engine/look';
import { QUALITY_LEVELS, QualityGovernor } from '../engine/render/quality';
import type { ScreenFit } from '../engine/layout';
import { loadVehicleEdits } from '../engine/vehicleEdits';
import type { MountStandalone } from '../engine/view';
import { defaults } from '../engine/tuning';
import { HALF_WIDTH, TILE, buildCircuit } from './circuit';
import { vibrate } from '../engine/haptics';
import { newRumble, rumble } from './rumble';
import { RUSH, newShake, rushOf, shakeOffset, shakeOn, stepShake, timeScale } from './shake';
import { RaceSounds, crowdNear, menuPick } from './sounds';
import { onBack } from '../engine/backButton';
import { menuButton } from './circuitSelect';
import { settingsRows } from './settingsRows';
import { LAUNCH, aiReaction, kickOf, newLaunch, stepLaunch } from './launch';
import { finishLine, newRadio, radioFor, radioLine, say, stepRadio, type RadioCue } from './radio';
import { setAudioPaused } from '../engine/audio';
import { musicPlaying, playMusic } from '../engine/music';
import { MENU_MUSIC, PODIUM_MUSIC, RACE_MUSIC } from './music';
import { gapBetween, newGapTimer, stepGaps, type GapTimer } from './gaps';
import { overtakeOf, towerGap, towerRows } from './tower';
import { achievementToast, stampMedal } from './screens/celebrate';
import { medalAchievements, raceAchievements, raced, unlock } from './achievements';
import { LAYOUTS } from './layouts';
/** the blue flag's colour on the screen */
const BLUE_COLOR = '#4fa3ff';
import { type Medal, MEDAL_COLOR, MEDAL_NAME, attackMedal, attackTargets, awardMedal, lapMedal, lapTargets, loadTrophies, nextMedal } from './medals';
import type { CircuitLayout } from './layouts';
import { createCircuitScene } from './circuitScene';
import { F1_TUNING } from './tuning';

type F1Tuning = Record<keyof typeof F1_TUNING, number>;
const deg = THREE.MathUtils.degToRad;
const LOOK = HD2D_VIEW;
/** Seconds of the champagne ceremony before the results (A shows them at once). */
const PODIUM_HOLD = 7;
/** How much closer the camera comes for the ceremony. */
const CEREMONY_ZOOM = 2.6;

/** The T-camera colour marking a team's second car. */
const TCAM_GREEN = '#39ff14';

/** How each entrant looks: its name, team, colour, model and effects (index-matched with the race's entrants). */
interface Look {
  name: string;
  /** its outline, for when it's under a bridge (a circuit with one only) */
  outline?: CarOutline;
  /** the driver's race number (yours: the seat's) */
  number?: number;
  team: Team;
  mesh: CarMesh;
  fx: CarFx;
  color: string;
  /** last frame's speed and health (for its rear light and its sparks), and s its rear light stays lit */
  was?: { speed: number; health: number };
  lit?: number;
}

/** A driver as the screens name them: their number first, when they have one (#44 HAM). */
const numbered = (l: Pick<Look, 'name' | 'number'>) => (l.number === undefined ? l.name : `#${l.number} ${l.name}`);

/** The rear light: lit while a car slows by more than this (px/s²: braking, or lifting at speed, as the hybrid harvests), held this long (s) so it doesn't flicker. */
const REAR_LIGHT = { decel: 140, hold: 0.18 };


/** How a race weekend is set up. */
export interface RaceOptions {
  /** the team you drive for, and which of its cars (its first unless set) */
  team?: Team;
  seat?: Seat;
  difficulty?: Difficulty;
  weather?: Weather;
  /** a qualifying lap first, to set your grid slot */
  qualifying?: boolean;
  /** how many laps the race is (a Championship round is always RACE_LAPS) */
  laps?: number;
  /** a race weekend, a Time Trial (flying laps on your own against your best lap's ghost), or the controls lap for a new player */
  mode?: 'race' | 'timetrial' | 'timeattack' | 'tutorial';
  /**
   * a round of a Championship: the season (its field, all season), and where the result goes once you've seen the
   * results: the drivers (the season's indexes) in finishing order, and those who didn't finish
   */
  championship?: { season: Season; onDone(finish: number[], out: Set<number>): void };
}

/**
 * The race on `layout` with `options` (your team, the difficulty, the weather, and whether you qualify first);
 * `onQuit` runs when the player leaves (EXIT on the deck, SELECT inside).
 */
export const raceOn = (layout: CircuitLayout, onQuit: () => void, options: RaceOptions = {}): MountStandalone => async ({ host, services, tuning, fit }) => {
  const { team = TEAMS[0], seat: yourSeat = 0, difficulty = NORMAL, weather = DRY, qualifying = false, mode = 'race', championship } = options;
  const LAPS = championship ? RACE_LAPS : Math.max(1, Math.round(options.laps ?? RACE_LAPS));
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
  /**
   * the weekend's weather: the one picked, the same all session, or (a changeable one, or a Championship round's)
   * a forecast drawn with the weekend; the race runs to it, qualifying in the weather it starts in
   */
  const changeable = !!championship || weather.id === 'changeable';
  /** about how long the race runs (s: its laps at a typical pace), for the forecast's timing */
  const raceSeconds = (LAPS * track.length) / 300;
  const roundWeather = championship && roundForecast(roundSeed(championship.season, championship.season.round), raceSeconds);
  let forecast: Forecast = roundWeather || fixedForecast(weather.id === 'changeable' ? 'dry' : weather.id);
  /** the weather for a session on your own (it doesn't change there): the race's at the start */
  const sessionWeather = (): WeatherId => conditionOf(forecast.start);
  /** how the circuit looks now (wetness and rain), last put on the scene, so it's only redone as it changes */
  let shownLook = { wetness: -1, rain: -1 };
  const skids = new SkidLayer((x, y) => groundAt(grid, x, y).h);
  // (a bigger pool in the wet: every car throws up spray)
  const particles = new Particles(weather.spray || changeable ? 220 : 90);
  // parts torn off in big crashes: the nose, and wheels off a wreck
  const debris = new DebrisLayer();
  world.scene.add(skids.group, particles.group, debris.group);
  /** a wheel torn off lies on its side */
  const onItsSide = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);

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
  // the slipstream: TOW and a bar that fills as it builds, in cyan, while you're in a car's wake
  const towLine = document.createElement('span');
  towLine.style.color = '#5fe0d0';
  // Time Trial: the live gap to your record lap's ghost, green ahead of it, red behind
  const ghostLine = document.createElement('span');
  // Time Trial and Time Attack: the next medal here and what it asks for (or the gold, held)
  const medalLine = document.createElement('span');
  // track limits: your strikes, amber while they're warnings, red once they cost you
  const limitsLine = document.createElement('span');
  // the speed, frame rate and picture quality, small and dim under the rest (with ?debug only: not for players)
  const statsLine = document.createElement('span');
  const showStats = new URLSearchParams(window.location.search).has('debug');
  Object.assign(statsLine.style, { color: '#6c6a88', fontSize: '10px' });
  const banner = document.createElement('div');
  style(banner, {
    position: 'absolute', left: '0', right: '0', top: '30%', zIndex: '2', textAlign: 'center',
    font: '20px Silkscreen, monospace', color: '#f2c14e', textShadow: '0 2px 0 #1b1b26', pointerEvents: 'none',
  });
  // the team radio: your engineer's line in a panel in your team's colour, keyed with a click and a squelch
  const radioPanel = document.createElement('div');
  style(radioPanel, {
    position: 'absolute', left: '6px', right: '6px', bottom: '8px', zIndex: '2', padding: '4px 8px', borderRadius: '6px',
    background: 'rgba(21,20,31,.88)', borderLeft: `3px solid ${team.body}`, color: '#f4f2fa', font: '11px Silkscreen, monospace',
    pointerEvents: 'none', display: 'none',
  });
  const radioLabel = document.createElement('div');
  // (the brighter of your team's colours, so it reads on the dark panel)
  const lightness = (hex: string) => {
    const n = parseInt(hex.slice(1), 16);
    return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  };
  const radioColor = [team.body, team.trim, ...(team.accent ? [team.accent] : [])].reduce((a, c) => (lightness(c) > lightness(a) ? c : a));
  radioPanel.style.borderLeftColor = radioColor;
  style(radioLabel, { color: radioColor, fontSize: '9px', marginBottom: '2px' });
  radioLabel.textContent = '◉ RADIO';
  const radioText = document.createElement('div');
  radioPanel.append(radioLabel, radioText);
  let radioQ = newRadio();
  /** Your engineer says `cue` (in a race or qualifying: not on your own against the clock). */
  const sayRadio = (cue: RadioCue) => {
    if (session === 'race' || session === 'qualifying') say(radioQ, radioLine(cue));
  };
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
  const weatherTag = document.createElement('span');
  teamCard.append(`${team.name.toUpperCase()} · ${difficulty.name} · `, weatherTag);
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
  // the timing tower under the minimap, as on TV: the top three, then the cars around you, each with its team's
  // colour and its gap to the leader (in a race)
  const tower = document.createElement('div');
  style(tower, {
    position: 'absolute', right: '6px', top: `${46 + MINI_H}px`, zIndex: '2', minWidth: `${Math.max(96, MINI_W)}px`,
    background: 'rgba(21,20,31,.75)', borderRadius: '6px', padding: '2px 0', color: '#f4f2fa',
    font: '10px Silkscreen, monospace', pointerEvents: 'none', display: 'none',
  });
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
  pauseHint.textContent = 'OR ON THE DECK: RESUME · RESTART · EXIT';
  style(pauseHint, { color: '#9d9ab8', fontSize: '10px', marginTop: '6px', textAlign: 'center', padding: '0 12px' });
  // rain over the picture: streaks falling at a slant, under the readouts
  // the rush of speed: pale streaks flowing past the screen's edges near top speed and in a tow (none in the middle,
  // where the racing is), the way the car's going
  const streaks = document.createElement('canvas');
  style(streaks, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', pointerEvents: 'none' });
  const streakCtx = streaks.getContext('2d')!;
  const streakAt = () => ({ x: Math.random(), y: Math.random(), len: 0.05 + Math.random() * 0.07, v: 1.4 + Math.random() * 1.4 });
  const streakList = Array.from({ length: 28 }, streakAt);
  /** the rush now (eased toward what the speed says) */
  let rushNow = 0;
  /** wheel to wheel: a rival this close (px) pulls the camera back this much more, eased in and slowly out */
  const BATTLE = { near: 50, pullBack: 0.08 };
  let battleNow = 0;
  /** Draw the streaks for `rush` (0…1), flowing back from the way the car's going on the screen (`dx`, `dy`, a unit vector). */
  const drawStreaks = (dt: number, rush: number, dx: number, dy: number) => {
    const w = streaks.clientWidth;
    const h = streaks.clientHeight;
    if (streaks.width !== w || streaks.height !== h) [streaks.width, streaks.height] = [w, h];
    streakCtx.clearRect(0, 0, w, h);
    if (rush < 0.02) return;
    streakCtx.strokeStyle = `rgba(244,242,250,${(0.5 * rush).toFixed(3)})`;
    streakCtx.lineWidth = 1;
    streakCtx.beginPath();
    for (const st of streakList) {
      st.x -= dx * st.v * rush * dt;
      st.y -= dy * st.v * rush * dt;
      if (st.x < -0.1 || st.x > 1.1 || st.y < -0.1 || st.y > 1.1) Object.assign(st, streakAt());
      // (only round the edges: outside an oval over the middle)
      const ox = (st.x - 0.5) / 0.5;
      const oy = (st.y - 0.5) / 0.5;
      if (ox * ox + oy * oy < 0.55) continue;
      const len = st.len * h * (0.5 + rush);
      streakCtx.moveTo(Math.round(st.x * w), Math.round(st.y * h));
      streakCtx.lineTo(Math.round(st.x * w - dx * len), Math.round(st.y * h - dy * len));
    }
    streakCtx.stroke();
  };
  const rain = document.createElement('canvas');
  style(rain, { position: 'absolute', inset: '0', width: '100%', height: '100%', zIndex: '1', pointerEvents: 'none', display: 'none' });
  const rainCtx = rain.getContext('2d')!;
  // (as many drops as the heaviest rain has: as many of them drawn as it's raining now)
  const drops = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), v: 0.9 + Math.random() * 0.6 }));
  const drawRain = (dt: number) => {
    const falling = Math.round(drops.length * race.rain);
    rain.style.display = falling > 0 ? 'block' : 'none';
    if (falling <= 0) return;
    const w = (rain.width = rain.clientWidth);
    const h = (rain.height = rain.clientHeight);
    rainCtx.clearRect(0, 0, w, h);
    rainCtx.strokeStyle = 'rgba(210,220,236,.45)';
    rainCtx.lineWidth = 1;
    rainCtx.beginPath();
    for (const d of drops.slice(0, falling)) {
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
  // your chequered flag: a big waving one over the picture for a few seconds as you cross the line
  const flagOverlay = document.createElement('canvas');
  flagOverlay.width = 168;
  flagOverlay.height = 112;
  style(flagOverlay, { position: 'absolute', left: '50%', top: 'calc(30% + 34px)', transform: 'translateX(-50%)', width: '168px', height: '112px', zIndex: '3', pointerEvents: 'none', display: 'none', imageRendering: 'pixelated' });
  const flagCtx = flagOverlay.getContext('2d')!;
  /** Draw the waving flag at `t` s: a pole, and 8 × 5 squares, each column lifted and shaded by a wave running along it. */
  const drawFlag = (t: number) => {
    flagCtx.clearRect(0, 0, 168, 112);
    flagCtx.fillStyle = '#c9ccd4';
    flagCtx.fillRect(8, 6, 4, 104);
    const cell = 18;
    for (let c = 0; c < 8; c++) {
      const phase = c * 0.8 - t * 9;
      const lift = Math.sin(phase) * 5 * ((c + 1) / 8);
      const light = 0.78 + 0.22 * Math.cos(phase);
      for (let r = 0; r < 5; r++) {
        const white = (c + r) % 2 === 0;
        const v = Math.round((white ? 244 : 21) * light);
        flagCtx.fillStyle = `rgb(${v},${v},${white ? Math.round(248 * light) : Math.round(31 * light)})`;
        flagCtx.fillRect(12 + c * cell, 8 + r * cell + lift, cell, cell);
      }
    }
  };
  host.append(streaks, rain, readout, banner, radioPanel, results, mini, tower, teamCard, pauseScreen, flagOverlay);

  // ---------------------------------------------------------------- race state
  let race!: Race;
  /** the HUD's own state: gap timing, your last position and its flash, and the race's fastest lap so far (set up by startRace) */
  let hudState: { gaps: GapTimer; lastPos: number; lastOrder?: number[]; flashUntil: number; lapsSeen: number[]; fastest?: { time: number; who: number } } = {
    gaps: newGapTimer(0), lastPos: 0, flashUntil: 0, lapsSeen: [],
  };
  let looks: Look[] = [];
  /** your race is over (finished, or out) and the results are coming */
  let done = false;
  /** the in-lap skipped (A): the top three in their spots, and seconds the camera has been on them (the results follow) */
  let mistakeCount = 0;
  let podium: { top: number[]; time: number } | undefined;
  let you = 0;
  const safetyCar = createSafetyCarMesh();
  // your car's marker on the grid, so you can find it before the start: a gold arrow bobbing above it and a
  // gold ring on the ground round it (unlit, so they stay bright in shade and in the rain); gone at lights out
  const youMarker = new THREE.Group();
  const markerGold = new THREE.MeshBasicMaterial({ color: 0xf2c14e, toneMapped: false });
  const youArrow = new THREE.Mesh(new THREE.ConeGeometry(7, 12, 4).rotateX(Math.PI), markerGold);
  const youRing = new THREE.Mesh(
    new THREE.RingGeometry(19, 22, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xf2c14e, toneMapped: false, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  youRing.position.y = 0.8;
  youMarker.add(youArrow, youRing);
  world.scene.add(youMarker);
  // the chequered flag, on the pit wall at the line, flying out over the track: out once the winner has crossed it
  const chequered = createChequeredFlag();
  {
    const s0 = track.samples[0];
    const lat = circuit.pit.side * 58;
    const fx = s0.x + Math.cos(s0.dir) * lat;
    const fy = s0.y + Math.sin(s0.dir) * lat;
    chequered.group.position.set(fx, groundAt(grid, fx, fy).h, fy);
    // (the cloth flies toward the flag's +x: the right of the way of the race, so turned round when the pole's on the right)
    chequered.group.rotation.y = -s0.dir + (circuit.pit.side > 0 ? Math.PI : 0);
    chequered.group.visible = false;
    world.scene.add(chequered.group);
  }
  // the champagne ceremony: a podium on the run-off across the straight from the top three's spots, or up on the deck over it
  const spot = podiumSpot(circuit);
  const ceremony = createCeremony(spot.raise);
  ceremony.group.position.set(spot.x, spot.h, spot.y);
  // (facing the camera, which always looks from the south: the backboard behind the drivers)
  ceremony.group.rotation.y = 0;
  ceremony.group.visible = false;
  world.scene.add(ceremony.group);
  /** a message over the race for a few seconds (safety car, penalty…), shown unless something more urgent is */
  let notice = { text: '', color: '', until: 0 };
  const announce = (text: string, color: string, seconds = 3) => (notice = { text, color, until: race.clock + seconds });
  /** Whether car `i` is near yours (within about a screen's height). */
  const near = (i: number) => {
    const a = race.entrants[i].car;
    const b = race.entrants[you].car;
    return Math.hypot(a.x - b.x, a.y - b.y) < 360;
  };
  /** Fill the timing tower (a race, from the lights to your flag). */
  const drawTower = () => {
    const show = session === 'race' && race.phase === 'racing' && !gridPan && !done && !podium;
    tower.style.display = show ? 'block' : 'none';
    if (!show) return;
    const order = raceOrder(race);
    const lead = order[0];
    const n = track.samples.length;
    const along = (i: number) => race.entrants[i].progress.lap * n + race.entrants[i].progress.idx;
    tower.replaceChildren(...towerRows(order, you).map((i) => {
      const row = document.createElement('div');
      if (i === 'gap') {
        row.textContent = '···';
        style(row, { textAlign: 'center', color: '#6c6a88', lineHeight: '8px' });
        return row;
      }
      const e = race.entrants[i];
      const place = order.indexOf(i) + 1;
      const gap = e.progress.retired ? 'OUT' : e.pit ? 'PIT' : e.blue !== undefined ? '▮ BLUE' : race.phase === 'lights' ? '' : towerGap(place, gapBetween(hudState.gaps, lead, i), Math.max(0, Math.floor((along(lead) - along(i)) / n)));
      style(row, {
        display: 'grid', gridTemplateColumns: '16px 3px 14px 28px 1fr', gap: '4px', alignItems: 'center', padding: '1px 6px 1px 4px',
        background: i === you ? 'rgba(242,193,78,.18)' : '', color: i === you ? '#f2c14e' : e.progress.retired ? '#6c707a' : '#f4f2fa',
      });
      const bar = document.createElement('i');
      style(bar, { height: '9px', background: looks[i].color, boxShadow: `inset 0 -2px ${looks[i].team.trim}` });
      const cells = [String(place), bar, looks[i].number === undefined ? '' : String(looks[i].number), looks[i].name, gap].map((c) => {
        if (typeof c !== 'string') return c;
        const span = document.createElement('span');
        span.textContent = c;
        return span;
      });
      // (the number small and dim beside the name)
      Object.assign((cells[2] as HTMLElement).style, { textAlign: 'right', fontSize: '8px', color: i === you ? '' : '#9d9ab8' });
      (cells[4] as HTMLElement).style.textAlign = 'right';
      (cells[4] as HTMLElement).style.color = e.blue !== undefined ? BLUE_COLOR : '#9d9ab8';
      row.append(...cells);
      return row;
    }));
  };
  /** Show the next medal here and what it asks for (on starting a Time Trial or a Time Attack, and on winning one). */
  const showMedal = () => {
    const kind = session === 'timetrial' ? 'trial' : session === 'timeattack' ? 'attack' : undefined;
    if (!kind || reference === undefined) {
      medalLine.textContent = '';
      return;
    }
    const next = nextMedal(loadTrophies().medals[layout.id]?.[kind]);
    const target = !next ? undefined : kind === 'trial' ? fmt(lapTargets(reference)[next]) : attack ? distance(attackTargets(attack.a.generous)[next]) : undefined;
    medalLine.textContent = !next ? '● GOLD\n' : target ? `${MEDAL_NAME[next]} ${target}\n` : '';
    medalLine.style.color = MEDAL_COLOR[next ?? 'gold'];
  };
  // your records here, kept between races: each lap is saved as soon as it's done, the race at your flag
  const records = loadRecords();
  // (kept apart for each weather: a wet lap is slower)
  // (a changeable weekend's apart from them all: a Championship round's too, unless its weather's the same all race)
  const recordKind = championship ? (forecast.fixed ? sessionWeather() : 'changeable') : weather.id;
  const recordId = recordKind === 'dry' ? layout.id : `${layout.id}:${recordKind}`;
  const rec = () => records.circuits[recordId];
  /** your laps saved so far this race, whether your finish is saved, and the records this race (or qualifying) set */
  let saved = { laps: 0, race: false, newLap: false, newRace: false, newQualifying: false };

  /** the race is stopped: nothing moves and the clock doesn't run */
  let paused = false;
  /** frames to leave out of the quality governor after a pause (the first frame back measures the pause) */
  let settle = 0;
  let last = performance.now();
  // the race's sounds (silent until the first tap or key: browsers require one)
  const sounds = new RaceSounds(0);
  /** start lights lit so far (a beep for each), and whether your flag has been sounded */
  let soundState = { lights: 0, flag: false, finalLap: false, boxLap: -1 };
  /** the camera's shake, and the hit-stop of a big hit */
  let shake = newShake();
  /** a hit to your car the debug hook asked for, dealt next frame */
  let pendingHit = 0;
  /** your start off the lights (judged once, in a race) */
  let launch = newLaunch();
  /** you've taken damage this session (for SPOTLESS) */
  let tookDamage = false;
  /** Unlock achievements `ids`: a toast for each new one. */
  const achieve = (ids: string[]) => {
    for (const a of unlock(ids)) achievementToast(a);
  };
  const setPaused = (on: boolean) => {
    if (on === paused) return;
    paused = on;
    setAudioPaused(on);
    pauseScreen.style.display = on ? 'flex' : 'none';
    if (!on) openPauseSettings(false);
    if (!on) {
      last = performance.now();
      settle = 2;
    }
  };

  // the simulation steps at a fixed rate (engine/fixedStep.ts); each car is drawn between its last two steps
  const simClock = fixedClock();
  /** each car (then the safety car, when it's out) where it was before the latest step (undefined: draw it where it is, after a restart or a skip) */
  let before: { x: number; y: number; z: number; heading: number }[] | undefined;
  const pose = (car: Car, i: number, alpha: number) => {
    const b = before?.[i];
    return b ? { x: lerp(b.x, car.x, alpha), y: lerp(b.y, car.y, alpha), z: lerp(b.z, car.z, alpha), heading: lerpAngle(b.heading, car.heading, alpha) } : car;
  };
  /** the cars' driving events over the latest frame's steps (kept through a frame with none, less its one-off hits) */
  let frameEvents: StepEvents[] = [];
  // each race's random draws (its rival teams, the start-light wait) come from its seed: ?seed=<n> repeats a race exactly
  const seedParam = Number(new URLSearchParams(window.location.search).get('seed'));
  let seed = 0;
  /** the session on track: qualifying (your flying lap, alone), the race, or a Time Trial (flying laps, alone, against your ghost) */
  let session: 'qualifying' | 'race' | 'timetrial' | 'timeattack' | 'tutorial' = 'race';
  /** The replay over (or skipped): back to the in-lap, live. */
  const endReplay = () => {
    // (a crash's replay over, the race goes on; the finish's is shown once)
    if (replay?.kind === 'finish') replayed = true;
    replay = undefined;
    before = undefined;
    debris.back();
  };
  /** The grid pan over: the lights come on (the camera swings back to your car). */
  const endPan = () => {
    gridPan = undefined;
  };
  /** qualifying: your laps so far, this weekend's field, and once it's over, the grid it set (drivers by slot) and the times */
  let quali: { lap: QualiLap; weekend: ReturnType<typeof drawWeekend>; flying?: boolean; over?: { grid: number[]; times: (number | undefined)[] } } | undefined;
  /**
   * a Time Trial: the lap being recorded (its start, the sectors passed), your laps' verdicts (a cut deletes one), the
   * session's best lap and your record lap (the ghost you chase, kept on the device)
   */
  /** the controls lap: the prompt you're on, the bends you've been through, and where you were last frame */
  let learn: { o: Onboarding; bends: number; lastIdx: number } | undefined;
  let trial: { recorder: LapRecorder; lapStart?: number; sector: number; lap: QualiLap; best?: Ghost; record?: Ghost } | undefined;
  /** a Time Attack: the clock, and the best distance here when it started (checkpoints) */
  let attack: { a: Attack; best?: number; result?: { passed: number; record: boolean; medal?: Medal; newMedal: boolean } } | undefined;

  /** The champagne ceremony: the race finished at once (the rest at their pace, everyone put where their in-lap ends), and
   * the top three on the podium, spraying champagne, till the results. */
  const startCeremony = () => {
    podium = { top: skipToParked(race), time: 0 };
    before = undefined;
    hudState.flashUntil = 0;
    ceremony.setDrivers(podium.top.map((i) => ({ body: looks[i].team.body, trim: looks[i].team.trim, helmet: i === you ? '#f2c14e' : '#f4f4f8' })));
  };

  /**
   * This weekend's field, drawn from its seed (so the same for the qualifying and the race after it): your team and four
   * at random, two cars each, in their liveries; each car's seat in its team (you take the car you picked, your
   * teammate the other); each AI driver's pace, line, racecraft and dice; and the start lights' wait. Driver `k`'s grid slot is
   * `k` unless qualifying sets another; you're `youDriver`, mid-grid.
   */
  const drawWeekend = () => {
    const rng = seededRandom(seed);
    // (a Championship round: the season's field, its teams and each driver's pace all season)
    const season = championship?.season;
    const total = season ? season.drivers.length : Math.min(circuit.slots.length, 1 + Math.round(t.opponents));
    const youDriver = season ? season.you : Math.floor(total / 2);
    const teams = season ? season.drivers.map(teamOf) : teamGrid(team, total, youDriver, rng);
    const seats = driverSeats(teams, youDriver, season ? (season.seat ?? 0) : yourSeat);
    const ranks = season ? season.drivers.map((d) => d.rank) : paceRanks(total, rng);
    const boxes = [...new Set(teams)];
    const drivers = teams.map((livery, k) => {
      // AI drivers differ in pace, line and racecraft (the difficulty's, and their style's aggression), and make
      // mistakes now and then (fewer the more consistent their style), on their own dice from the race's seed; the
      // quicker cars start mostly further up the grid, but not always
      const style = styleOf(livery.drivers[seats[k]]);
      const ai: AiDriver | undefined = k === youDriver ? undefined : {
        lane: ((k * 7) % 11) - 5, pace: aiPaceFor(difficulty, ranks[k], total, t.aiPaceAdjust), craft: aiCraftFor(difficulty, rng, style.aggression),
        mistakes: aiMistakesFor(difficulty, style.consistency), rng: seededRandom(Math.floor(rng() * 4294967296)),
        incidents: aiIncidentsFor(difficulty, style.aggression),
      };
      // its reaction off the lights, on dice of its own from the seed and its slot (not drawn from the weekend's, so the
      // rest of the field is drawn as it was)
      if (ai) ai.reaction = aiReaction(seededRandom(((seed * 2654435761) ^ ((k + 1) * 40503)) >>> 0 || 1), ai.craft ?? 0.6, style.consistency);
      // each team its own box in the pit lane
      return { livery, seat: seats[k], ai, box: boxes.indexOf(livery) };
    });
    // five lights, one every 0.6 s, then out after a short random wait
    return { youDriver, drivers, lightsOut: 0.3 + rng() * 0.7 };
  };
  /** A car on the track in its team's livery (teammates: the team's second car has the bright green T-camera). */
  const addLook = (livery: Team, seat: number, mine: boolean): Look => {
    const number = numberOf(livery.drivers[seat]);
    const mesh = createCarMesh('f1', { body: livery.body, stripe: livery.trim, accent: livery.accent, pattern: livery.pattern, tcam: seat === 1 ? TCAM_GREEN : undefined, helmet: mine ? 'gold' : undefined, number });
    world.scene.add(mesh);
    // (under a bridge, the deck hides it: its outline drawn through the deck, yours in gold)
    const outline = track.levels ? carOutline(mesh, mine ? 0xf2c14e : 0xf4f4f8) : undefined;
    if (outline) world.scene.add(outline.group);
    return { name: mine ? 'YOU' : livery.drivers[seat], outline, number, team: livery, mesh, fx: new CarFx(mesh), color: livery.body };
  };
  /** Clear the track and the screen for a new session. */
  const resetSession = () => {
    shake = newShake();
    launch = newLaunch();
    tookDamage = false;
    medalLine.textContent = '';
    setPaused(false);
    resetClock(simClock);
    before = undefined;
    frameEvents = [];
    soundState = { lights: 0, flag: false, finalLap: false, boxLap: -1 };
    radioQ = newRadio();
    radioPanel.style.display = 'none';
    playMusic(RACE_MUSIC);
    for (const l of looks) world.scene.remove(l.mesh, ...(l.outline ? [l.outline.group] : []));
    world.scene.remove(safetyCar.group);
    hud.setPositionChange(undefined);
    done = false;
    podium = undefined;
    saved = { laps: 0, race: false, newLap: false, newRace: false, newQualifying: false };
    notice = { text: '', color: '', until: 0 };
    skids.clear();
    particles.clear();
    debris.clear();
    results.style.display = 'none';
  };

  /** every car through the race, for the replay after your flag; and the replay when it's on: the race time it's showing, its end, your finish */
  let recorder: ReplayRecorder = newReplay(0);
  let replay: { t: number; to: number; kind: 'finish' | 'crash'; at: number; follow: number } | undefined;
  /** a big crash's replay to come (its race time, and the car), and when the last was */
  let crashDue: { at: number; who: number } | undefined;
  let lastCrashReplay = -Infinity;
  /** when the results went up (ms, page time), for their rows sliding in */
  let resultsUpAt = 0;
  /** the replay has been shown (or skipped) this race */
  let replayed = false;
  /** the grid pan before the lights: seconds in, and how long it lasts (undefined: it's over, or skipped) */
  let gridPan: { t: number; length: number } | undefined;
  /** the grid the race started from (drivers by slot; none: everyone in their own), for restarting it */
  let raceGrid: number[] | undefined;
  /** the race's entrants' drivers (entrant i is driver raceDrivers[i]) */
  let raceDrivers: number[] = [];
  /** The race, from the grid qualifying set (drivers by slot, pole first), or everyone in their own slot. */
  const startRace = (gridSlots?: number[]) => {
    session = 'race';
    learn = undefined;
    quali = undefined;
    trial = undefined;
    attack = undefined;
    raceGrid = gridSlots;
    resetSession();
    const w = drawWeekend();
    const slots = gridSlots ?? w.drivers.map((_, k) => k);
    raceDrivers = slots;
    you = slots.indexOf(w.youDriver);
    looks = slots.map((k) => addLook(w.drivers[k].livery, w.drivers[k].seat, k === w.youDriver));
    const field = slots.map((k, i) => {
      const slot = circuit.slots[i];
      return { car: newCar(carClass('f1'), slot.x, slot.y, slot.heading), ai: w.drivers[k].ai, box: w.drivers[k].box };
    });
    race = newRace(track, grid, HANDLING, LAPS, field, w.lightsOut, circuit.pit, forecast);
    // (on the ground from the start: the grid pan shows them before the first step puts them there)
    for (const e of race.entrants) e.car.z = groundAt(grid, e.car.x, e.car.y).h;
    hudState = { gaps: newGapTimer(slots.length), lastPos: 0, flashUntil: 0, lapsSeen: new Array(slots.length).fill(0), fastest: undefined };
    // the grid pan first (A skips it), then the lights
    gridPan = { t: 0, length: panLength(slots.length) };
    // (every car and the safety car recorded, for the replay)
    recorder = newReplay(slots.length + 1);
    replay = undefined;
    replayed = false;
    crashDue = undefined;
    lastCrashReplay = -Infinity;
  };

  /** Qualifying: you on your own, on a flying lap (A skips it: you start mid-grid). */
  const startQualifying = () => {
    session = 'qualifying';
    gridPan = undefined;
    learn = undefined;
    trial = undefined;
    attack = undefined;
    resetSession();
    const w = drawWeekend();
    you = 0;
    const d = w.drivers[w.youDriver];
    looks = [addLook(d.livery, d.seat, true)];
    race = newQualifying(track, grid, HANDLING, sessionWeather());
    quali = { lap: newQualiLap(), weekend: w };
    hudState = { gaps: newGapTimer(1), lastPos: 0, flashUntil: 0, lapsSeen: [0], fastest: undefined };
    announce('QUALIFYING · ONE FLYING LAP', '#f2c14e', 3);
  };

  /** A Time Trial: you on your own, on the run-up to your first flying lap, your record lap's ghost to chase. */
  const startTimeTrial = () => {
    session = 'timetrial';
    gridPan = undefined;
    learn = undefined;
    quali = undefined;
    resetSession();
    const w = drawWeekend();
    you = 0;
    const d = w.drivers[w.youDriver];
    looks = [addLook(d.livery, d.seat, true)];
    race = newQualifying(track, grid, HANDLING, sessionWeather());
    trial = { recorder: newRecorder(), sector: 0, lap: newQualiLap(), record: loadGhost(recordId) };
    // (the medals' laps are shares of it)
    reference ??= referenceLap(track, grid, HANDLING, sessionWeather());
    showMedal();
    hudState = { gaps: newGapTimer(1), lastPos: 0, flashUntil: 0, lapsSeen: [0], fastest: undefined };
    announce(trial.record ? `TIME TRIAL · BEAT ${fmt(trial.record.time)}` : 'TIME TRIAL', '#f2c14e', 3);
  };

  /** A Time Attack: you on your own, on the run-up; at the line the clock starts, and each checkpoint adds time. */
  const startTimeAttack = () => {
    session = 'timeattack';
    gridPan = undefined;
    learn = undefined;
    quali = undefined;
    trial = undefined;
    resetSession();
    const w = drawWeekend();
    you = 0;
    const d = w.drivers[w.youDriver];
    looks = [addLook(d.livery, d.seat, true)];
    race = newQualifying(track, grid, HANDLING, sessionWeather());
    reference ??= referenceLap(track, grid, HANDLING, sessionWeather());
    const best = rec()?.bestAttack;
    attack = { a: newAttack(reference, difficulty), best };
    showMedal();
    hudState = { gaps: newGapTimer(1), lastPos: 0, flashUntil: 0, lapsSeen: [0], fastest: undefined };
    announce(best ? `TIME ATTACK · BEAT ${distance(best)}` : 'TIME ATTACK · THE CLOCK STARTS AT THE LINE', '#f2c14e', 3);
  };

  /** The controls lap: you on your own on the run-up, a prompt at a time for the controls. */
  const startTutorial = () => {
    session = 'tutorial';
    gridPan = undefined;
    quali = undefined;
    trial = undefined;
    attack = undefined;
    resetSession();
    const w = drawWeekend();
    you = 0;
    const d = w.drivers[w.youDriver];
    looks = [addLook(d.livery, d.seat, true)];
    race = newQualifying(track, grid, HANDLING, sessionWeather());
    learn = { o: newOnboarding(), bends: 0, lastIdx: race.entrants[0].progress.idx };
    hudState = { gaps: newGapTimer(1), lastPos: 0, flashUntil: 0, lapsSeen: [0], fastest: undefined };
  };

  /** A reference lap for the AI's qualifying times (worked out once: it's the same all weekend). */
  let reference: number | undefined;
  /** Qualifying's over: your time (none if you wrecked) against the AI's, and the grid they make, up until A. */
  const endQualifying = (time: number | undefined) => {
    if (!quali) return;
    const w = quali.weekend;
    reference ??= referenceLap(track, grid, HANDLING, sessionWeather());
    const times = aiTimes(w.drivers.map((d) => d.ai?.pace), reference, seededRandom(seed + 1));
    times[w.youDriver] = time;
    // your qualifying record here (apart from the race's lap record)
    if (time !== undefined) {
      saved.newQualifying = recordQualifying(records, recordId, time);
      saveRecords(records);
    }
    quali.over = { grid: gridOrder(times), times };
    // (the session's held from here, on the times: the car falls quiet)
    sounds.quiet();
    showQualifying();
  };

  /** A new weekend: a new seed (unless ?seed= gave one), then qualifying if it's on, or straight to the race. */
  const newWeekend = () => {
    seed = championship ? roundSeed(championship.season, championship.season.round) : Number.isInteger(seedParam) && seedParam > 0 ? seedParam : newSeed();
    reference = undefined;
    // (a Championship round's weather is its own; a changeable weekend's drawn afresh)
    forecast = roundWeather || (weather.id === 'changeable' ? changeableForecast(seed, raceSeconds) : fixedForecast(weather.id));
    weatherTag.textContent = forecast.name;
    if (mode === 'tutorial') startTutorial();
    else if (mode === 'timetrial') startTimeTrial();
    else if (mode === 'timeattack') startTimeAttack();
    else if (qualifying) startQualifying();
    else startRace();
  };
  newWeekend();
  /**
   * Restart: in qualifying, qualifying afresh; in a race after qualifying, the same race again from the grid it set (no
   * need to qualify again); without qualifying, a new weekend (new rivals), as ever.
   */
  const restart = () => (session === 'race' && qualifying ? startRace(raceGrid) : session === 'timetrial' ? startTimeTrial() : session === 'timeattack' ? startTimeAttack() : session === 'tutorial' ? startTutorial() : newWeekend());

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
        you: () => ({ ...race.entrants[you].progress, tow: race.entrants[you].tow, speed: speedOf(race.entrants[you].car), health: race.entrants[you].car.health, x: race.entrants[you].car.x, y: race.entrants[you].car.y }),
        racers: () => race.entrants.map((e, i) => ({ name: looks[i].name, team: looks[i].team.code, react: e.ai?.reaction, speed: Math.round(speedOf(e.car)), lap: e.progress.lap, idx: e.progress.idx, finished: e.progress.finished, retired: !!e.progress.retired, penalty: e.progress.penalty, strikes: e.limits.strikes, health: e.car.health, stops: e.stops, pit: e.pit?.phase, move: e.ai?.move?.kind, craft: e.ai?.craft, mistakes: e.ai?.mistakes, dice: !!e.ai?.rng })),
        safetyCar: () => !!race.sc,
        /** the virtual safety car: seconds it's been out (undefined: it isn't) */
        vsc: () => race.vsc?.out,
        /** call the virtual safety car now, for trying it out */
        callVsc: () => {
          callVsc(race);
          announce('VIRTUAL SAFETY CAR', '#f2c14e', 2.5);
        },
        /** your car driven by the AI's line at `pace`, for trying out a session hands-off */
        autopilot: (pace = 0.97) => (race.entrants[you].ai = { lane: 0, pace }),
        /** Time Trial: laps done, the session's best, your record lap's time and splits */
        /** Time Attack: seconds left, checkpoints passed, whether it's over, and your best here */
        attack: () => attack && { left: attack.a.left, passed: attack.a.passed, over: attack.a.over, best: attack.best },
        trial: () => trial && { laps: race.entrants[you].progress.lapTimes, best: trial.best?.time, record: trial.record?.time, splits: trial.record?.splits, ghost: ghostMesh.visible },
        /** a street circuit's landmarks (where they stand on the map), and the camera held on a point of the map (none: back on your car), for looking at the scenery */
        landmarks: () => landmarksOf(circuit),
        /** the circuit's grandstands */
        stands: () => standsOf(circuit),
        look: (x?: number, y?: number) => (lookAt = x === undefined || y === undefined ? undefined : { x, y }),
        /** the replay after your flag: whether it's on, the race time it's showing, its end and your finish */
        replay: () => replay && { ...replay },
        /** the grid pan before the lights: whether it's on, and the car it's on */
        gridPan: () => gridPan && { t: gridPan.t, length: gridPan.length, car: panAt(circuit.slots, gridPan.t).car },
        /** the session (qualifying or race), and once qualifying's over, the grid it set (names, pole first) and your time */
        session: () => session,
        qualifying: () => quali?.over && { grid: quali.over.grid.map((k) => (k === quali!.weekend.youDriver ? 'YOU' : quali!.weekend.drivers[k].livery.drivers[quali!.weekend.drivers[k].seat])), you: quali.over.times[quali.weekend.youDriver] },
        skip: (seconds: number) => (race.clock += seconds),
        /** wreck the car in position `pos` (1 = the leader), for trying out the safety car */
        wreck: (pos: number) => applyDamage(race.entrants[raceOrder(race)[pos - 1]].car, 1000, HANDLING),
        /** the team radio's line up now, and the camera's shake (trauma) and the rush of speed */
        radio: () => radioQ.now?.text,
        /** the weather: the forecast, the track's wetness and the rain now, and your tyres (and whether they're the wrong ones) */
        weather: () => ({ forecast: { ...forecast }, wetness: race.wetness, rain: race.rain, condition: race.weather, tyres: race.entrants[you].tyres.compound, wrong: !!race.forecast && wrongTyres(race, you), compounds: race.entrants.map((e) => e.tyres.compound) }),
        feel: () => ({ trauma: shake.trauma, hold: shake.hold, rush: rushNow, battle: battleNow }),
        /** your start off the lights, judged */
        launch: () => ({ ...launch }),
        /** hit your car for `health` (a crash of your own, for trying out the shake and sparks) */
        hitMe: (health: number) => (pendingHit = health),
        /** parts torn off in crashes, flying or lying on the ground now */
        debris: () => debris.count,
        /** show the results table as the race stands, for checking its layout */
        results: () => showResults(raceOrder(race)),
        records: () => records,
        /** mistakes the AI has made this race */
        mistakes: () => mistakeCount,
        /** this race's seed (?seed=<n> plays it again) */
        seed: () => seed,
        /** the music track playing (or loading) */
        music: () => musicPlaying(),
        /** wave the chequered flag for everyone now, in race order (you in `place`, 1 = the winner, if given), for watching the in-lap and the parking */
        flag: (place?: number) => {
          const ranked = raceOrder(race).filter((i) => i !== you);
          ranked.splice(place ? place - 1 : raceOrder(race).indexOf(you), 0, you);
          ranked.forEach((i, k) => (race.entrants[i].progress = { ...race.entrants[i].progress, finished: race.clock + k * 0.5 }));
        },
        inLap: () => race.entrants.map((e, i) => ({ name: looks[i].name, to: e.inLap?.to, parked: !!e.inLap?.parked, pit: e.pit?.phase })),
        /** put your car on the inside of marked corner `k` (off the track, at its apex), for trying out track limits; `wide`: on its outside instead */
        cut: (k = 0, wide = false) => {
          const me = race.entrants[you];
          const corner = race.corners[k % race.corners.length];
          const s = track.samples[corner.apex];
          const lat = (HALF_WIDTH + 16) * corner.side * (wide ? -1 : 1);
          Object.assign(me.car, { x: s.x + Math.cos(s.dir) * lat, y: s.y + Math.sin(s.dir) * lat, heading: s.dir, vx: Math.sin(s.dir) * 120, vy: -Math.cos(s.dir) * 120 });
          me.progress = { ...me.progress, idx: corner.apex };
        },
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
    if (!race.pit || p.lapStart === undefined || p.finished !== undefined || !between(p.idx, circuit.pit.entry - 60, circuit.pit.entry + 4, n)) return false;
    const lapsLeft = race.laps - p.lap - p.idx / n;
    return (lapsLeft > 0.4 && wrongTyres(race, you)) || wantsPit(me.car, me.tyres, lapsLeft, planLapTime(race, me), HANDLING.damageSlow, track.length);
  };
  /** The radio's box call: for the tyres the weather wants (when it's turned), or plain. */
  const boxCue = (): RadioCue => {
    const me = race.entrants[you];
    const call: Compound = tyreCall(race, me);
    return call === me.tyres.compound ? 'box' : `box-${call}`;
  };

  /**
   * The results as a table, so the columns line up (the pixel font isn't monospaced): position,
   * driver, team, time (the winner's, then the gap), best lap, and penalties and pit stops. Your row is in gold.
   */
  /** The banner on your in-lap: where you're heading, P1–P3 to a numbered spot on the straight, the rest to the garage. */
  const inLapBanner = (to: 'garage' | number | undefined, place: number): [string, string] => {
    const podium = typeof to === 'number' ? to < 3 : to === undefined && place < 3;
    return [podium ? `IN LAP · PARK IN SPOT ${typeof to === 'number' ? to + 1 : place + 1}` : 'IN LAP · BACK TO THE GARAGE', podium ? '#f2c14e' : '#9d9ab8'];
  };

  const showResults = (order: number[]) => {
    // (the rows slide in one after another from when the results first went up: rebuilt as the others finish, each
    // row's animation carries on where it was)
    if (results.style.display !== 'block') {
      resultsUpAt = performance.now();
      results.style.animation = 'row-in 0.25s ease-out both';
    }
    const since = (performance.now() - resultsUpAt) / 1000;
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
    head.append(cell('th', '', true), cell('th', ''), cell('th', 'NO', true), cell('th', 'NAME'), cell('th', 'TEAM'), cell('th', 'TIME', true), cell('th', 'BEST', true), cell('th', ''));
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
      row.style.animation = `row-in 0.35s ease-out ${(0.15 + pos * 0.07 - since).toFixed(3)}s both`;
      // places gained (green) or lost (red) from the grid slot (the entrants are in grid order)
      const moved = i - pos;
      const change = cell('td', moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : '–');
      change.style.color = moved > 0 ? '#5fe0d0' : moved < 0 ? '#d8323c' : '#6c6a88';
      row.append(cell('td', `${pos + 1}`, true), change, cell('td', looks[i].number === undefined ? '' : `${looks[i].number}`, true), cell('td', looks[i].name), cell('td', looks[i].team.code), cell('td', time, true), cell('td', best, true), cell('td', notes));
      // the race's fastest lap in purple
      if (fastest) (row.children[6] as HTMLElement).style.color = '#b36bff';
      table.append(row);
    });
    const line = (text: string, css: Partial<CSSStyleDeclaration> = {}) => {
      const d = document.createElement('div');
      d.textContent = text;
      Object.assign(d.style, css);
      return d;
    };
    results.replaceChildren(
      line(championship ? `ROUND ${championship.season.round + 1} OF ${championship.season.rounds.length} · ${layout.name.toUpperCase()}` : `CHEQUERED FLAG · ${difficulty.name} · ${weather.name}`, { fontSize: '13px', color: '#f2c14e', marginBottom: '8px' }),
      table,
      line('▲▼ PLACES FROM THE GRID · P = PIT STOPS · S = PENALTY SECONDS', { color: '#9d9ab8', marginTop: '8px' }),
      line(`LAP RECORD ${fmt(rec()?.bestLap)}${saved.newLap ? ' · NEW!' : ''}`, { color: saved.newLap ? '#f2c14e' : '#f4f2fa', marginTop: '8px' }),
      line(`BEST ${race.laps}-LAP RACE ${fmt(rec()?.bestRace[race.laps])}${saved.newRace ? ' · NEW!' : ''}`, { color: saved.newRace ? '#f2c14e' : '#f4f2fa' }),
      ...(championship
        ? [line('NEXT: on to the standings', { marginTop: '8px' }), line('EXIT: leave the round (not counted)')]
        : [line(qualifying ? 'RESTART: race again from the same grid' : 'RESTART: race again', { marginTop: '8px' }), line('EXIT: back to the circuits')]),
    );
    results.style.display = 'block';
  };

  /** Qualifying's times as a table, in grid order: your row in gold; then A or START to go to the grid. */
  const showQualifying = () => {
    if (!quali?.over) return;
    const { grid: slots, times } = quali.over;
    const w = quali.weekend;
    const pole = times[slots[0]];
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
    head.append(cell('th', '', true), cell('th', 'NAME'), cell('th', 'TEAM'), cell('th', 'TIME', true), cell('th', 'GAP', true));
    table.append(head);
    slots.forEach((k, pos) => {
      const d = w.drivers[k];
      const time = times[k];
      const row = document.createElement('tr');
      if (k === w.youDriver) row.style.color = '#f2c14e';
      const gap = time === undefined || pole === undefined ? '' : pos === 0 ? '' : `+${(time - pole).toFixed(3)}`;
      row.append(cell('td', `${pos + 1}`, true), cell('td', k === w.youDriver ? 'YOU' : d.livery.drivers[d.seat]), cell('td', d.livery.code), cell('td', time === undefined ? 'NO TIME' : fmt(time), true), cell('td', gap, true));
      row.style.animation = `row-in 0.35s ease-out ${(0.15 + pos * 0.07).toFixed(2)}s both`;
      table.append(row);
    });
    const line = (text: string, css: Partial<CSSStyleDeclaration> = {}) => {
      const d = document.createElement('div');
      d.textContent = text;
      Object.assign(d.style, css);
      return d;
    };
    const place = slots.indexOf(w.youDriver) + 1;
    results.replaceChildren(
      line(`QUALIFYING · ${difficulty.name} · ${weather.name}`, { fontSize: '13px', color: '#f2c14e', marginBottom: '8px' }),
      table,
      line(place === 1 ? 'POLE POSITION!' : `YOU START P${place}`, { color: '#f2c14e', marginTop: '8px' }),
      line(`QUALIFYING RECORD ${fmt(rec()?.bestQualifying)}${saved.newQualifying ? ' · NEW!' : ''}`, { color: saved.newQualifying ? '#f2c14e' : '#f4f2fa', marginTop: '8px' }),
      line('RACE: on to the grid', { marginTop: '8px' }),
      line('EXIT: back to the circuits'),
    );
    results.style.animation = 'row-in 0.25s ease-out both';
    results.style.display = 'block';
  };

  // vibration on or off, from the pause screen (and remembered)
  const rumbleState = newRumble();
  /** the grandstands (where the crowd is heard) */
  const stands = standsOf(circuit);
  // the settings, from the pause screen: the menu's (but difficulty, not changed mid-race), each remembered as it
  // changes; tapped and swiped, or up/down and left/right on the deck, A, START or B back to the pause screen
  const pauseSettings = document.createElement('div');
  pauseSettings.className = 'circuit-menu pause-settings';
  style(pauseSettings, { zIndex: '5', display: 'none', justifyContent: 'center', background: 'rgba(14,13,22,.9)' });
  const settingsTitle = document.createElement('h2');
  settingsTitle.textContent = 'SETTINGS';
  const pauseRows = settingsRows();
  const settingsDone = menuButton('DONE', () => openPauseSettings(false));
  pauseSettings.append(settingsTitle, ...pauseRows.map((r) => r.el), settingsDone);
  host.append(pauseSettings);
  /** the settings are up, and the row the deck is on (the last place is DONE) */
  let pauseSettingsOn = false;
  let pauseFocus = 0;
  const showPauseFocus = () => {
    pauseRows.forEach((r, k) => r.el.classList.toggle('focused', k === pauseFocus));
    settingsDone.classList.toggle('focused', pauseFocus === pauseRows.length);
  };
  pauseRows.forEach((r, k) => r.el.addEventListener('pointerdown', () => {
    pauseFocus = k;
    showPauseFocus();
  }));
  const openPauseSettings = (on: boolean) => {
    if (on === pauseSettingsOn) return;
    menuPick();
    pauseSettingsOn = on;
    pauseSettings.style.display = on ? 'flex' : 'none';
    // (the pause screen's buttons out of the way under it)
    pauseScreen.style.visibility = on ? 'hidden' : '';
    pauseFocus = 0;
    showPauseFocus();
  };
  pauseScreen.append(
    pauseTitle,
    pauseButton('RESUME', () => setPaused(false)),
    pauseButton('RESTART', () => restart()),
    pauseButton('SETTINGS', () => openPauseSettings(true)),
    pauseHint,
  );
  // the phone's back button: a replay skipped, the pause screen's settings closed, the pause screen resumed, the race paused; once
  // it's over, on (a Championship round with its results seen counts, as with A)
  const offBack = onBack(() => {
    if (replay && !paused) endReplay();
    else if (pauseSettingsOn) openPauseSettings(false);
    else if (paused) setPaused(false);
    else if (!done) setPaused(true);
    else if (championship && results.style.display === 'block') finishRound();
    else onQuit();
    return true;
  });
  // leaving the app or the tab pauses the race; so do Esc and P on a keyboard
  const onHidden = () => {
    if (document.hidden && !done) setPaused(true);
  };
  const onKey = (e: KeyboardEvent) => {
    if ((e.code === 'Escape' || e.code === 'KeyP') && !e.repeat && !(e.target instanceof HTMLInputElement) && !done) setPaused(!paused);
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('keydown', onKey);

  /** A Championship round's result to the season: the drivers in finishing order, and the ones who didn't finish. */
  let roundDone = false;
  const finishRound = () => {
    if (!championship || roundDone) return;
    roundDone = true;
    const ranked = raceOrder(race);
    const out = new Set(ranked.filter((i) => race.entrants[i].progress.retired).map((i) => raceDrivers[i]));
    championship.onDone(ranked.map((i) => raceDrivers[i]), out);
  };

  /** The device you're driving with (before you've touched anything: touch on a touch screen, else keys). */
  const device = (): Device => {
    const s = controls.lastSource();
    if (s === 'keyboard') return 'keys';
    if (s === 'gamepad') return 'pad';
    if (s === 'dpad') return 'touch';
    return window.matchMedia?.('(any-pointer: coarse)').matches ? 'touch' : 'keys';
  };

  // ---------------------------------------------------------------- time trial
  const SPLIT_COLOR: Record<SplitMark, string> = { record: '#b36bff', better: '#5fe0d0', worse: '#f2c14e' };
  const signed = (d: number) => `${d < 0 ? '−' : '+'}${Math.abs(d).toFixed(2)}`;
  /** A Time Trial lap done, `g`: a new record (saved, and the ghost from now on), the session's best, or neither. */
  const trialLapDone = (g: Ghost) => {
    if (!trial) return;
    const { record, best } = trial;
    if (!record || g.time < record.time) {
      trial.record = g;
      saveGhost(recordId, g);
      announce(`NEW RECORD ${fmt(g.time)}${record ? ` · ${signed(g.time - record.time)}` : ''}`, SPLIT_COLOR.record, 3);
      sounds.record();
    } else if (!best || g.time < best.time) announce(`BEST LAP ${fmt(g.time)} · ${signed(g.time - record.time)}`, SPLIT_COLOR.better, 3);
    else announce(`LAP ${fmt(g.time)} · ${signed(g.time - best.time)}`, SPLIT_COLOR.worse, 3);
    if (!best || g.time < best.time) trial.best = g;
    // a medal here, better than the one you had: said over the rest
    const medal = reference === undefined ? undefined : lapMedal(g.time, reference);
    if (medal && awardMedal(layout.id, 'trial', medal)) {
      showMedal();
      stampMedal(host, medal, fmt(g.time));
      sounds.record();
      achieve(medalAchievements(loadTrophies(), LAYOUTS.map((l) => l.id)));
    }
  };
  /** A Time Trial step (`cut`: you cut a corner): the lap's verdict at the line, its splits, and its frames for a ghost. */
  const stepTrial = (cut: boolean) => {
    if (!trial) return;
    const me = race.entrants[you];
    const p = me.progress;
    // no tyre wear against the clock: every lap on fresh tyres
    me.tyres.wear = 0;
    fitTyres(me.tyres, me.car, race.wetness);
    const verdict = judgeLap(trial.lap, p, cut);
    if (p.lapStart !== trial.lapStart) {
      // over the line: the lap before is over (as the verdict says), and the next is timed
      const done = trial.recorder;
      trial.recorder = newRecorder();
      trial.lapStart = p.lapStart;
      trial.sector = 0;
      if (verdict && typeof verdict === 'object') trialLapDone(toGhost(done, verdict.time));
      else if (verdict === 'void') announce('LAP DELETED · GO AGAIN', '#f2c14e', 2);
      else announce('FLYING LAP', '#5fe0d0', 1.5);
    }
    if (verdict === 'deleted') {
      announce('LAP DELETED · TRACK LIMITS', '#d8323c', 3);
      sounds.trackLimits(true);
    }
    if (p.lapStart === undefined) return;
    const t = race.clock - p.lapStart;
    // a sector's split, against the session's best lap and your record
    if (p.sector > trial.sector) {
      trial.sector = p.sector;
      trial.recorder.splits.push(t);
      if (!trial.lap.deleted) {
        const k = p.sector - 1;
        const { delta, mark } = markSplit(t, k, trial.best ?? trial.record, trial.record);
        announce(`S${k + 1} ${fmt(t)}${delta === undefined ? '' : ` · ${signed(delta)}`}`, SPLIT_COLOR[mark], 2);
      }
    }
    recordFrame(trial.recorder, t, me.car, p.idx);
  };
  // ---------------------------------------------------------------- time attack
  /** A Time Attack step (`cut`: you cut a corner): the clock, time added at each checkpoint, and TIME UP. */
  const stepTimeAttack = (cut: boolean) => {
    if (!attack || attack.a.over) return;
    const me = race.entrants[you];
    const p = me.progress;
    // no tyre wear against the clock: fresh tyres all the way
    me.tyres.wear = 0;
    fitTyres(me.tyres, me.car, race.wetness);
    const step = stepAttack(attack.a, SIM_DT, p.lapStart !== undefined, p.lapTimes.length * SECTORS + p.sector, cut);
    if (step.started) announce('THE CLOCK IS RUNNING', '#5fe0d0', 1.5);
    if (step.added) announce(`+${step.added.toFixed(1)} S`, '#5fe0d0', 1.2);
    if (step.lost) {
      announce(`CUT · −${step.lost} S`, '#d8323c', 2);
      sounds.trackLimits(true);
    }
    if (step.timeUp) {
      const passed = attack.a.passed;
      const record = recordAttack(records, recordId, passed);
      if (record) saveRecords(records);
      const medal = attackMedal(passed, attack.a.generous);
      attack.result = { passed, record, medal, newMedal: awardMedal(layout.id, 'attack', medal) };
      if (attack.result.newMedal && medal) {
        sounds.record();
        stampMedal(host, medal, distance(passed));
        achieve(medalAchievements(loadTrophies(), LAYOUTS.map((l) => l.id)));
      }
      showMedal();
      if (record) sounds.record();
      sounds.quiet();
    }
  };
  // your record lap's ghost: your car, see-through, driving it again from the line
  const ghostMesh = createCarMesh('f1', { body: '#f4f4f8', stripe: '#9d9ab8' });
  /** the track sample the ghost is beside (followed round, for its level on a bridge) */
  let ghostIdx: number | undefined;
  ghostMesh.traverse((o) => {
    const mesh = o as THREE.Mesh;
    for (const m of [mesh.material ?? []].flat() as THREE.Material[]) {
      m.transparent = true;
      m.opacity = 0.35;
      m.depthWrite = false;
    }
    mesh.castShadow = false;
  });
  ghostMesh.visible = false;
  world.scene.add(ghostMesh);

  /**
   * What each deck button does just now ('' for nothing), as the loop below reads them: A the session's own action
   * (pause, skip, on to what's next), B drift while you're driving (on the keys or a gamepad: the touch deck has no
   * drift button), START restart, SELECT exit.
   */
  const deckLabels = (): Record<DeckButton, string> => {
    if (pauseSettingsOn) return { a: 'DONE', b: '', start: '', select: '' };
    const resultsUp = results.style.display === 'block';
    const roundOver = !!championship && done;
    let a = '';
    if (roundOver && resultsUp) a = 'NEXT';
    else if (quali?.over) a = 'RACE';
    else if (attack?.result) a = 'AGAIN';
    else if (session === 'qualifying') a = 'SKIP';
    else if (session === 'tutorial') a = learn?.o.step === 'done' ? 'MENU' : 'SKIP';
    else if (gridPan || replay) a = 'SKIP';
    else if (!done) a = paused ? 'RESUME' : 'PAUSE';
    else if (!resultsUp) a = 'SKIP';
    const driving = !paused && !done && !replay && !gridPan && !quali?.over && !attack?.result;
    return { a, b: driving ? 'DRIFT' : '', start: roundOver || quali?.over || attack?.result ? '' : 'RESTART', select: 'EXIT' };
  };
  const showDeckLabels = () => {
    const labels = deckLabels();
    for (const k of ['a', 'b', 'start', 'select'] as const) hud.setLabel(k, labels[k]);
  };

  // ---------------------------------------------------------------- loop
  const focus = new THREE.Vector3(race.entrants[you].car.x, 0, race.entrants[you].car.y);
  const target = new THREE.Vector3();
  let frames = 0;
  let statTime = 0;
  let fps = 0;
  let miniTime = 0;

  /** the camera held on a point of the map (a debug hook, for looking at the scenery) */
  let lookAt: { x: number; y: number } | undefined;
  /** the camera's zoom for the grid pan, eased */
  let panZoom = 1;
  /** the view has been closed: the loop stops */
  let closed = false;
  const tick = (now: number) => {
    if (closed) return;
    // (the first frame's timestamp can be a touch before mount time)
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    showDeckLabels();
    // the pause screen's settings: the deck moves through them (and nothing else)
    if (pauseSettingsOn) {
      const [up, down, left, right, a, b, start] = (['up', 'down', 'left', 'right', 'a', 'b', 'start'] as const).map(pressed);
      pressed('select');
      const places = pauseRows.length + 1;
      if (up || down) {
        pauseFocus = (pauseFocus + (down ? 1 : -1) + places) % places;
        showPauseFocus();
      }
      const row = pauseRows[pauseFocus];
      if (row && (left || right)) row.step(right ? 1 : -1);
      if (a || b || start) openPauseSettings(false);
      requestAnimationFrame(tick);
      return;
    }
    const startPressed = pressed('start');
    // A pauses and resumes (not once the race is over: the results are up); in qualifying it skips it, or once it's
    // over goes to the grid
    const aPressed = pressed('a');
    // a Championship round, over: on to the standings with the result, once you've seen the results (and a finished
    // round can't be restarted)
    if (championship && done && (aPressed || startPressed) && results.style.display === 'block') finishRound();
    else if (quali?.over && (aPressed || startPressed)) startRace(quali.over.grid);
    else if (attack?.result && (aPressed || startPressed)) startTimeAttack();
    else if (startPressed && !(championship && done)) restart();
    else if (aPressed && session === 'qualifying') startRace();
    // the controls lap: A skips it, or once it's done goes on to the menu
    else if (aPressed && session === 'tutorial') onQuit();
    // the grid pan: A skips it, straight to the lights
    else if (aPressed && gridPan) endPan();
    // a replay: A skips it, back to the race (or the in-lap)
    else if (aPressed && replay) endReplay();
    else if (aPressed && !done) setPaused(!paused);
    // after your flag (or once you're out), A skips the in-lap: straight to the champagne ceremony, then the results
    else if (aPressed && done && results.style.display !== 'block') {
      if (!podium) startCeremony();
      else podium.time = PODIUM_HOLD;
    }
    // SELECT goes back to the circuits once it's let go: leaving the page with a finger still down
    // can leave the next page deaf to touch on a phone (in itch.io's frame the lifting finger's
    // events go to a page that's gone)
    if (pressed('select')) quitting = true;
    if (quitting && !controls.isDown('select')) {
      quitting = false;
      onQuit();
    }
    // paused (or qualifying's times up): nothing moves, and the last frame stays on the screen
    if (attack?.result) {
      const { passed, record, medal, newMedal } = attack.result;
      banner.textContent = `TIME UP · ${distance(passed)}${medal ? ` · ${MEDAL_NAME[medal]}${newMedal ? ' MEDAL!' : ''}` : ''}${record ? ' · NEW RECORD' : attack.best ? ` · BEST ${distance(attack.best)}` : ''}`;
      banner.style.color = medal && newMedal ? MEDAL_COLOR[medal] : record ? SPLIT_COLOR.record : '#f2c14e';
    }
    if (paused || quali?.over || attack?.result) {
      requestAnimationFrame(tick);
      return;
    }
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
    // the start: once all five lights are lit, going is a jump start; after they're out, your reaction is judged
    if (session === 'race' && !gridPan) {
      const car = race.entrants[you].car;
      const input = driveInput(car);
      const gas = input.wheel ? (input.wheel.reverse ? 0 : input.wheel.gas) : Math.hypot(input.steer?.x ?? 0, input.steer?.y ?? 0);
      const verdict = stepLaunch(launch, race.phase === 'lights' && race.clock >= 0, race.phase === 'racing' ? race.clock : undefined, gas);
      if (verdict === 'jump') {
        race.entrants[you].progress.penalty += LAUNCH.jumpPenalty;
        achieve(['too-keen']);
        announce(`JUMP START · +${LAUNCH.jumpPenalty} S`, '#d8323c', 3);
        sayRadio('jump-start');
      } else if (verdict && verdict !== 'slow') {
        const kick = kickOf(verdict);
        car.vx += Math.sin(car.heading) * kick;
        car.vy -= Math.cos(car.heading) * kick;
        if (verdict === 'great') achieve(['rocket']);
        announce(`${verdict === 'great' ? 'GREAT' : 'GOOD'} LAUNCH · ${launch.reaction!.toFixed(2)} S`, verdict === 'great' ? '#b36bff' : '#5fe0d0', 2);
      }
    }
    const healthBefore = race.entrants[you].car.health;
    // (the debug hook's hit, dealt inside the frame so the frame feels it)
    if (pendingHit) {
      applyDamage(race.entrants[you].car, pendingHit, HANDLING);
      pendingHit = 0;
    }
    // the race runs in fixed steps: as many as this frame's time holds (none, one, or a few)
    // (during the grid pan nothing moves and the lights wait)
    if (gridPan) {
      gridPan.t += dt;
      if (gridPan.t >= gridPan.length) endPan();
    }
    // the replay: a few seconds after your flag (the flag's moment live), the race holds and your finish plays again
    {
      const mine = race.entrants[you].progress;
      if (!replay && !replayed && session === 'race' && mine.finished !== undefined && race.clock >= mine.finished + REPLAY.startAt && !podium && results.style.display !== 'block') {
        const w = replayWindow(recorder, mine.finished);
        replay = { t: w.from, to: w.to, kind: 'finish', at: mine.finished, follow: you };
      }
      // a big crash's: a moment after it, the seconds round it, on the crashed car (then the race goes on)
      if (!replay && crashDue && race.clock >= crashDue.at + CRASH_REPLAY.delay) {
        const w = crashWindow(recorder, crashDue.at);
        replay = { t: w.from, to: w.to, kind: 'crash', at: crashDue.at, follow: crashDue.who };
        crashDue = undefined;
      }
      if (replay) {
        replay.t += dt * (replay.kind === 'crash' ? crashSpeed(replay.t, replay.at) : replaySpeed(replay.t, replay.at));
        if (replay.t >= replay.to) endReplay();
      }
    }
    // (through a big hit's hit-stop, the race runs at a crawl)
    const { steps, alpha } = gridPan || replay ? { steps: 0, alpha: 1 } : advance(simClock, dt * timeScale(shake));
    const raceEvents: RaceEvent[] = [];
    const cars: StepEvents[] = race.entrants.map(() => ({ damage: 0, skidding: false, wreckedNow: false, onRough: false, airborne: false, landed: 0 }));
    for (let k = 0; k < steps; k++) {
      before = [...race.entrants.map((e) => e.car), ...(race.sc ? [race.sc.car] : [])].map((c) => ({ x: c.x, y: c.y, z: c.z, heading: c.heading }));
      const s = stepRace(race, SIM_DT, (e) => driveInput(e.car));
      raceEvents.push(...s.race);
      s.cars.forEach((ev, i) => {
        const m = cars[i];
        m.damage += ev.damage;
        m.skidding ||= ev.skidding;
        m.wreckedNow ||= ev.wreckedNow;
        m.onRough ||= ev.onRough;
        m.airborne ||= ev.airborne;
        m.landed = Math.max(m.landed, ev.landed);
      });
      // gaps at the timing points, timed to the step
      if (race.phase === 'racing') stepGaps(hudState.gaps, race.entrants.map((e) => e.progress), track, race.clock);
      if (trial) stepTrial(s.race.some((e) => (e.kind === 'track-limits' || e.kind === 'off-track') && e.who === you));
      if (attack) stepTimeAttack(s.race.some((e) => e.kind === 'track-limits' && e.who === you));
      if (session === 'race' && race.phase === 'racing') {
        const scCar = race.sc?.car;
        recordReplay(recorder, race.clock, [...race.entrants.map((e) => (running(e) && e.pit?.phase !== 'garage' ? { x: e.car.x, y: e.car.y, z: e.car.z, heading: e.car.heading, condition: condition(e.car) } : undefined)), scCar]);
      }
    }
    // a frame between steps (a screen faster than the simulation) carries on the last one's skids and ground
    if (steps === 0) frameEvents.forEach((ev, i) => cars[i] && Object.assign(cars[i], { skidding: ev.skidding, onRough: ev.onRough, airborne: ev.airborne }));
    frameEvents = cars;
    const step = { cars, race: raceEvents };
    // qualifying: a cut deletes the lap you're on; a good lap (or a wreck) ends it
    if (quali) {
      // (track limits against the clock: a cut, or all four wheels past the white line anywhere)
      const lap = judgeLap(quali.lap, race.entrants[you].progress, raceEvents.some((e) => (e.kind === 'track-limits' || e.kind === 'off-track') && e.who === you));
      if (lap === 'deleted') {
        announce('LAP DELETED · TRACK LIMITS', '#d8323c', 3);
        sounds.trackLimits(true);
      } else if (lap === 'void') announce('FLYING LAP · GO AGAIN', '#f2c14e', 2);
      else if (lap) endQualifying(lap.time);
      else if (race.entrants[you].car.wrecked) endQualifying(undefined);
      else if (!quali.flying && race.entrants[you].progress.lapStart !== undefined) {
        // over the line from the run-up: the clock's running
        quali.flying = true;
        announce('FLYING LAP', '#5fe0d0', 1.5);
      }
    }
    // the controls lap: the prompt moves on as you do each thing; a wreck starts it again
    if (learn) {
      const me = race.entrants[you];
      const p = me.progress;
      me.tyres.wear = 0;
      fitTyres(me.tyres, me.car, race.wetness);
      learn.bends += apexesPassed(race.corners.map((c) => c.apex), learn.lastIdx, p.idx, track.samples.length);
      learn.lastIdx = p.idx;
      const facts = { speed: speedOf(me.car), top: me.car.cls.topSpeed, bends: learn.bends, drifting: pad.b, canDrift: device() !== 'touch', lapDone: p.lapTimes.length > 0 };
      if (nextPrompt(learn.o, facts)) sounds.record();
      if (me.car.wrecked) startTutorial();
    }
    // your car's vibration: crashes, landings, grass and gravel, kerbs
    {
      const me = race.entrants[you];
      const ev = step.cars[you];
      const cell = circuit.cells[Math.floor(me.car.y / TILE) * circuit.width + Math.floor(me.car.x / TILE)];
      const felt = {
        dt, speed: speedOf(me.car), topSpeed: me.car.cls.topSpeed, healthLost: healthBefore - me.car.health,
        wreckedNow: ev.wreckedNow, landed: ev.landed, onRough: ev.onRough, onKerb: cell === 'kerb',
      };
      vibrate(rumble(rumbleState, felt));
      // and the camera's shake (not in the replay, nor once you're out)
      stepShake(shake, replay || !running(me) ? { ...felt, healthLost: 0, wreckedNow: false, landed: 0, onRough: false, onKerb: false } : felt);
      // and its sounds: the engine, tyres, ground, the nearest rival, and hits
      const lost = healthBefore - me.car.health;
      if (lost > 0) tookDamage = true;
      if (ev.wreckedNow) sounds.hit(1);
      else if (lost > 0.5) sounds.hit(Math.min(1, 0.25 + lost / 15));
      // (and the scrape of metal with the sparks)
      if (!replay && (lost > 0.5 || ev.landed > 160)) sounds.scrape(Math.min(1, 0.3 + Math.max(lost, 0) / 10));
      else if (ev.landed > 160) sounds.hit(0.3);
      if (!running(me) || me.car.wrecked || replay) sounds.quiet();
      else {
        const f = { x: Math.sin(me.car.heading), y: -Math.cos(me.car.heading) };
        let rival: { speed: number; distance: number } | undefined;
        race.entrants.forEach((o, i) => {
          if (i === you || !running(o) || o.car.wrecked) return;
          const d = Math.hypot(o.car.x - me.car.x, o.car.y - me.car.y);
          if (!rival || d < rival.distance) rival = { speed: speedOf(o.car), distance: d };
        });
        sounds.update({
          dt, speed: speedOf(me.car), top: me.car.cls.topSpeed, slide: Math.abs(me.car.vx * -f.y + me.car.vy * f.x),
          onRough: ev.onRough, onKerb: cell === 'kerb', rival, tow: me.tow,
          onGravel: cell === 'gravel', crowd: crowdNear(stands, me.car.x, me.car.y),
          limiter: !!me.pit && inLimitZone(circuit.pit, circuit.pit.points[me.pit.at].s),
        });
      }
    }
    mistakeCount += step.race.filter((e) => e.kind === 'mistake').length;
    for (const e of step.race) {
      // achievements as they happen: a stop, lapping a car, a wreck (in a race)
      if (session === 'race') {
        if (e.kind === 'pit-stop' && e.who === you) achieve(['box']);
        if (e.kind === 'blue' && e.by === you) achieve(['lapped']);
        if (e.kind === 'wreck' && e.who === you) achieve(['scrapheap']);
      }
      if (e.kind === 'lights-out') {
        sounds.go();
        // (the crowd roars them away)
        if (session === 'race') sounds.cheer(0.9);
      }
      else if (e.kind === 'safety-car') {
        announce('SAFETY CAR', '#f2c14e', 2.5);
        sayRadio('safety-car');
      }
      else if (e.kind === 'vsc') {
        announce('VIRTUAL SAFETY CAR', '#f2c14e', 2.5);
        sayRadio('vsc');
      }
      else if (e.kind === 'vsc-ending') announce('VSC ENDING', '#f2c14e', VSC.warn);
      else if (e.kind === 'green') {
        announce('GREEN FLAG', '#5fe0d0', 2);
        sayRadio('green');
      }
      else if (e.kind === 'penalty' && e.who === you) announce(`NO PASSING UNDER ${race.vsc ? 'VSC' : 'SC'} · +${e.seconds} S`, '#d8323c', 3);
      else if (e.kind === 'track-limits' && e.who === you && session === 'tutorial') announce("THAT'S A CUT: IN A RACE, A WARNING, THEN +5 S", '#d8323c', 3);
      else if (e.kind === 'track-limits' && e.who === you && session === 'race') {
        sayRadio(e.seconds ? 'penalty' : 'warning');
        announce(e.seconds ? `TRACK LIMITS · +${e.seconds} S` : `TRACK LIMITS · WARNING ${e.strike}/${LIMITS.warnings}`, e.seconds ? '#d8323c' : '#f2c14e', 2.5);
        sounds.trackLimits(e.seconds > 0);
      }
      // (cleared off the track: hidden, though the replay may show it again)
      else if (e.kind === 'retired') looks[e.who].mesh.visible = false;
      // a big crash tears the nose off (the car keeps going, if it can); a wreck loses a wheel or two as well
      else if (e.kind === 'crash') {
        // a big one: replayed in a moment (in a race, before your flag)
        const me = race.entrants[you];
        const them = race.entrants[e.who].car;
        if (session === 'race' && !done && !crashDue && wantsCrashReplay({
          mine: e.who === you, wrecked: e.wrecked, hit: e.hit, bigHit: SAFETY_CAR.bigHit, distance: Math.hypot(them.x - me.car.x, them.y - me.car.y), now: race.clock, last: lastCrashReplay,
        })) {
          crashDue = { at: race.clock, who: e.who };
          lastCrashReplay = race.clock;
        }
        // (a gasp from the stands)
        sounds.cheer(e.wrecked ? 0.55 : 0.3);
        if (e.who === you && e.wrecked) sayRadio('wreck');
        const { nose, wheels } = looks[e.who].mesh.userData.parts;
        const power = e.wrecked ? 1 : Math.min(1, e.hit * 1.5);
        debris.tear(nose, race.clock, e.vx, e.vy, power);
        if (e.wrecked) {
          const first = Math.floor(Math.random() * 4);
          const lost = Math.random() < 0.5 ? [first] : [first, (first + 1 + Math.floor(Math.random() * 3)) % 4];
          for (const k of lost) debris.tear(wheels[k], race.clock, e.vx, e.vy, power, onItsSide);
        }
      }
      // (a stop repairs the car: the parts torn off it fitted back as the crew finish, before it pulls away)
      else if (e.kind === 'rain') {
        announce(e.on ? 'RAIN · THE TRACK IS GETTING WET' : 'THE RAIN HAS STOPPED · THE TRACK WILL DRY', '#8fb8e8', 2.5);
        sayRadio(e.on ? 'rain' : 'rain-stops');
      } else if (e.kind === 'track' && race.clock >= notice.until) announce(`TRACK ${e.condition.toUpperCase()} · ${COMPOUNDS[tyreFor(e.condition)].name.toUpperCase()} TYRES`, '#8fb8e8', 2);
      else if (e.kind === 'pit-repaired') debris.refit(looks[e.who].mesh, race.clock);
      else if (e.kind === 'pit-out') {
        if (e.who === you) {
          announce('PIT EXIT', '#5fe0d0', 1.5);
          sayRadio('pit-out');
        }
      }
      else if (e.kind === 'pit-stop' && e.who !== you && race.clock >= notice.until) announce(`${looks[e.who].name} PITS`, '#9d9ab8', 1.5);
      // blue flags: yours (let the leader by), or one shown to a car you're coming up to lap
      else if (e.kind === 'blue' && e.who === you) {
        announce(`BLUE FLAG · LET ${looks[e.by].name} BY`, BLUE_COLOR, 3);
        sayRadio('blue');
      } else if (e.kind === 'blue' && e.by === you && race.clock >= notice.until) announce(`BLUE FLAG · ${looks[e.who].name}`, BLUE_COLOR, 1.5);
      // a mistake by a car near you (on the screen, more or less): called out
      else if (e.kind === 'mistake' && !done && race.clock >= notice.until && near(e.who)) announce(e.what === 'late' ? `LOCK-UP · ${looks[e.who].name}` : `${looks[e.who].name} RUNS WIDE`, '#9d9ab8', 1.5);
    }
    // the race's fastest lap (announced; purple in the results)
    race.entrants.forEach((e, i) => {
      if (session !== 'race') return;
      const count = e.progress.lapTimes.length;
      if (count <= hudState.lapsSeen[i]) return;
      const lap = e.progress.lapTimes[count - 1];
      hudState.lapsSeen[i] = count;
      if (hudState.fastest && lap >= hudState.fastest.time) return;
      const first = !hudState.fastest;
      hudState.fastest = { time: lap, who: i };
      // (not for the first lap anyone completes: that's always the fastest so far)
      if (!first && race.clock >= notice.until) announce(`FASTEST LAP · ${looks[i].name} ${fmt(lap)}`, '#b36bff', 2.5);
      if (!first && i === you) {
        sounds.record();
        sayRadio('fastest-lap');
      }
    });
    // your records: a new lap as soon as it's done (a record announced if it beats one), the race at your flag
    const mine = race.entrants[you].progress;
    // (race laps only: qualifying keeps its own record, set as its good lap ends)
    if (session === 'race' && (mine.lapTimes.length > saved.laps || (mine.finished !== undefined && !saved.race))) {
      for (const lap of mine.lapTimes.slice(saved.laps)) {
        const had = rec()?.bestLap !== undefined;
        if (recordLap(records, recordId, lap)) {
          saved.newLap = true;
          if (had) {
            announce(`NEW LAP RECORD ${fmt(lap)}`, '#f2c14e', 3);
            sounds.record();
          }
        }
      }
      saved.laps = mine.lapTimes.length;
      if (mine.finished !== undefined && !saved.race) {
        saved.race = true;
        saved.newRace = recordRace(records, recordId, race.laps, mine.finished + mine.penalty);
        // achievements for how the race went (and GLOBETROTTER once every circuit's been raced)
        const me = race.entrants[you];
        achieve([
          ...raceAchievements({
            place: raceOrder(race).indexOf(you) + 1, field: race.entrants.length, grid: you + 1, fastest: hudState.fastest?.who === you,
            damaged: tookDamage, strikes: me.limits.strikes, laps: race.laps, difficulty: difficulty.id, weather: race.weather,
            tyresLeft: Math.round((1 - me.tyres.wear) * 100), burning: me.car.burn !== undefined,
          }),
          ...(raced(layout.id, LAYOUTS.map((l) => l.id)) ? ['globetrotter'] : []),
        ]);
      }
      saveRecords(records);
    }
    // (spray off a damp or wet track)
    const spray = race.wetness > 0.4;
    race.entrants.forEach((e, i) => {
      const l = looks[i];
      if (!running(e)) {
        // (cleared off the track: only in the replay, where it was then)
        const then = replay && replayPose(recorder, i, replay.t);
        l.mesh.visible = !!then;
        if (then) {
          l.mesh.position.set(then.x, then.z, then.y);
          l.mesh.rotation.set(0, -then.heading, 0, 'YXZ');
          l.outline?.update(l.mesh, !!track.levels && underDeck(track.levels, grid, then.x, then.y, then.z));
        } else l.outline?.update(l.mesh, false);
        return;
      }
      const ev = step.cars[i];
      if (ev.skidding && !replay) skids.mark(i, e.car.x, e.car.y, e.car.heading, Math.min(1, speedOf(e.car) / e.car.cls.topSpeed), e.car.cls);
      else skids.lift(i);
      // (in the replay, where it was then)
      const then = replay && replayPose(recorder, i, replay.t);
      l.mesh.visible = !replay || !!then;
      const tilt = then ? { pitch: 0, roll: 0 } : bodyTilt(e.car, gridFor(track, grid, e.progress.idx));
      const at = then || pose(e.car, i, alpha);
      l.mesh.position.set(at.x, at.z, at.y);
      l.mesh.rotation.set(tilt.pitch, -at.heading, tilt.roll, 'YXZ');
      l.outline?.update(l.mesh, !!track.levels && underDeck(track.levels, grid, at.x, at.y, at.z));
      const speed = speedOf(e.car);
      // (in the replay, as it was then: whole before its crash, not burning before it caught fire)
      l.fx.update(dt, then ? (then.condition ?? 'ok') : condition(e.car), particles, !then && ev.onRough && speed > 25 ? Math.min(1, speed / 120) : 0);
      // the tyres' compound colour, and spray off a wet track from behind the car at speed
      l.mesh.userData.tyreMark.color.set(COMPOUNDS[e.tyres.compound].color);
      // the rear light: lit while the car slows (braking, or lifting at speed: the hybrid harvesting, as in F1), and on a
      // damp or wet track blinking besides, each car a little out of step with the rest
      const was = l.was ?? { speed, health: e.car.health };
      if (!replay && dt > 0 && speed > 30 && (was.speed - speed) / dt > REAR_LIGHT.decel) l.lit = REAR_LIGHT.hold;
      else l.lit = Math.max(0, (l.lit ?? 0) - dt);
      l.mesh.userData.rainLight.visible = l.lit > 0 || (spray && (performance.now() / 1000 * 4 + i * 0.37) % 1 < 0.5);
      // sparks: off a hit (a wall, another car), thrown back the way it was going, and off a hard landing, from under it
      if (!replay && !then) {
        const lost = was.health - e.car.health;
        const back = speed > 1 ? { x: -e.car.vx / speed, z: -e.car.vy / speed } : { x: 0, z: 0 };
        if (lost > 0.5) particles.sparks(e.car.x, e.car.y, e.car.z, Math.min(14, 4 + Math.round(lost)), back.x * 0.6, back.z * 0.6);
        if (ev.landed > 160) particles.sparks(e.car.x, e.car.y, e.car.z, 6);
      }
      l.was = { speed, health: e.car.health };
      if (spray && speed > 60 && Math.random() < dt * (6 + 8 * race.rain) * Math.min(1, speed / 250)) {
        particles.spray(e.car.x - Math.sin(e.car.heading) * 14, e.car.y + Math.cos(e.car.heading) * 14, e.car.z);
      }
    });
    // the ghost: your record lap from the line, drawn where it was as far into its lap as you are into yours
    {
      const p0 = race.entrants[you].progress;
      const pose = trial?.record && p0.lapStart !== undefined ? ghostPose(trial.record, race.clock - p0.lapStart - (1 - alpha) * SIM_DT) : undefined;
      ghostMesh.visible = !!pose;
      if (pose) {
        // (on its level: followed round the lap, so on a bridge it's on the deck, or underneath)
        const gi = nearestSample(track, pose.x, pose.y, ghostIdx);
        ghostIdx = gi;
        ghostMesh.position.set(pose.x, groundAt(gridFor(track, grid, gi), pose.x, pose.y).h, pose.y);
        ghostMesh.rotation.set(0, -pose.heading, 0);
      }
    }
    // your marker, on the grid while the lights are on
    {
      const mine = race.entrants[you];
      youMarker.visible = race.phase === 'lights' && running(mine);
      youMarker.position.set(mine.car.x, mine.car.z, mine.car.y);
      const t = performance.now() / 1000;
      youArrow.position.y = 34 + Math.sin(t * 4) * 3;
      youArrow.rotation.y = t * 1.5;
    }
    // the safety car on the track while it's out (in the replay, if it was out then)
    const sc = race.sc;
    const scThen = replay && replayPose(recorder, race.entrants.length, replay.t);
    const scShown = replay ? !!scThen : !!sc;
    if (scShown && !safetyCar.group.parent) world.scene.add(safetyCar.group);
    if (!scShown && safetyCar.group.parent) world.scene.remove(safetyCar.group);
    if (scThen) {
      safetyCar.group.position.set(scThen.x, scThen.z, scThen.y);
      safetyCar.group.rotation.set(0, -scThen.heading, 0, 'YXZ');
    } else if (sc && !replay) {
      const tilt = bodyTilt(sc.car, gridFor(track, grid, sc.idx));
      // (drawn between its steps too, once it has been out for one)
      const at = before && before.length > race.entrants.length ? pose(sc.car, race.entrants.length, alpha) : sc.car;
      safetyCar.group.position.set(at.x, at.z, at.y);
      safetyCar.group.rotation.set(tilt.pitch, -at.heading, tilt.roll, 'YXZ');
      safetyCar.update(dt);
    }

    // standings and HUD
    const order = raceOrder(race);
    const me = race.entrants[you];
    const pos = order.indexOf(you) + 1;
    const p = me.progress;
    const clock = race.clock;
    if (!done && session === 'race' && race.phase === 'racing' && (p.finished !== undefined || p.retired)) {
      done = true;
    }
    // your last lap: called, with a bell, as you start it
    if (race.phase === 'racing' && p.lapStart !== undefined && p.finished === undefined && !p.retired && p.lap === laps - 1 && !soundState.finalLap) {
      soundState.finalLap = true;
      announce('FINAL LAP', '#f4f4f8', 3);
      sounds.finalLap();
      sayRadio('final-lap');
    }
    // the chequered flag: out at the line from the winner's finish, and big over the picture for a few seconds at yours
    const flagOut = race.entrants.some((e) => e.progress.finished !== undefined);
    chequered.group.visible = flagOut;
    if (flagOut) chequered.update(performance.now() / 1000);
    const yourFlag = p.finished !== undefined && clock < p.finished + 3.5 && !podium && !replay && results.style.display !== 'block';
    flagOverlay.style.display = yourFlag ? 'block' : 'none';
    if (yourFlag) drawFlag(performance.now() / 1000);
    if (p.finished !== undefined && !soundState.flag) {
      soundState.flag = true;
      sounds.flag();
      sounds.cheer(1);
      if (session === 'race') say(radioQ, finishLine(raceOrder(race).indexOf(you) + 1, race.entrants.length));
      // the race's music gives way to the menu's, for the in-lap and the results
      playMusic(MENU_MUSIC, 3);
    }
    // the results come up once you're parked after your in-lap (or at A), or once the rest have finished if you're out
    const others = race.entrants.filter((e) => e !== me && running(e));
    // parked after your in-lap: on to the ceremony
    if (!podium && p.finished !== undefined && me.inLap?.parked) startCeremony();
    ceremony.group.visible = !!podium && results.style.display !== 'block';
    if (podium) {
      podium.time += dt;
      ceremony.update(podium.time, dt);
    }
    // the winners drive into their spots to a march: from the moment the winner turns for its spot (or the in-lap is skipped)
    if (podium || race.entrants.some((e) => e.inLap?.to === 0)) playMusic(PODIUM_MUSIC, 1);
    const showNow = podium ? podium.time >= PODIUM_HOLD : p.finished === undefined && others.every((e) => e.progress.finished !== undefined);
    if (done && (results.style.display === 'block' || showNow)) showResults(order); // live as the others finish
    hud.setPosition(session === 'qualifying' ? 'QUALI' : session === 'timetrial' ? 'TIME TRIAL' : session === 'timeattack' ? 'TIME ATTACK' : session === 'tutorial' ? 'CONTROLS' : `P${pos}/${race.entrants.length}`);
    // a place gained or lost lights the position up in the strip below, green ▲ or red ▼, for a moment
    // (not while the lights are on, nor after your flag)
    if (race.phase === 'racing' && !done && hudState.lastPos && pos !== hudState.lastPos) {
      hud.setPositionChange(pos < hudState.lastPos ? 'gain' : 'lose');
      // the callout: who you went by, or who went by you (not a car in the pits: that's its stop, not a pass)
      const move = hudState.lastOrder && clock > 3 ? overtakeOf(hudState.lastOrder, order, you) : undefined;
      const other = move && race.entrants[move.other];
      if (move && other && !other.pit && !race.entrants[you].pit && running(other) && (race.clock >= notice.until || / PASS/.test(notice.text))) {
        const name = looks[move.other].name;
        announce(move.kind === 'passed' ? `PASSED ${name} · P${move.place}` : `${name} PASSES · P${move.place}`, move.kind === 'passed' ? '#5fe0d0' : '#f08a24', 1.8);
      }
      // (an overtake of yours: the crowd's with you)
      if (pos < hudState.lastPos) sounds.cheer(0.35);
      hudState.flashUntil = clock + 1.5;
    }
    if (clock > hudState.flashUntil) hud.setPositionChange(undefined);
    hudState.lastPos = pos;
    hudState.lastOrder = order;
    hud.setLap(learn ? `${Math.min(STEPS.length - 1, STEPS.indexOf(learn.o.step) + 1)}/${STEPS.length - 1}` : session === 'timetrial' ? (p.lapStart === undefined ? 'OUT TO THE LINE' : trial?.lap.deleted ? 'LAP DELETED' : `LAP ${p.lapTimes.length + 1}`) : session === 'timeattack' ? (p.lapStart === undefined ? 'OUT TO THE LINE' : `LAP ${p.lapTimes.length + 1}`) : session === 'qualifying' ? (p.lapStart === undefined ? 'OUT TO THE LINE' : quali?.lap.deleted ? 'LAP DELETED' : 'FLYING LAP') : p.retired ? 'OUT' : p.finished === undefined && p.lap === laps - 1 && p.lapStart !== undefined ? 'FINAL LAP' : `LAP ${Math.min(laps, p.lap + 1)}/${laps}`);

    // box, box: on the radio once a lap, as the pit wall's call goes up
    if (session === 'race' && soundState.boxLap !== p.lap && boxBox()) {
      soundState.boxLap = p.lap;
      sayRadio(boxCue());
    }
    // the radio: the next line up once the last is done
    {
      const line = stepRadio(radioQ, dt);
      if (line) {
        radioText.textContent = line;
        radioPanel.style.display = 'block';
        sounds.radio(Math.max(0.6, radioFor(line) - 0.5));
      }
      if (!radioQ.now) radioPanel.style.display = 'none';
    }
    // the banner: start lights, GO!, then the most urgent message
    teamCard.style.opacity = race.phase === 'lights' ? '1' : '0';
    if (gridPan) {
      // the grid pan: the car the camera's on, by grid place, name and team (you in gold)
      const k = panAt(circuit.slots, gridPan.t).car;
      banner.textContent = `P${k + 1} ${numbered(looks[k])} · ${looks[k].team.code}`;
      banner.style.color = k === you ? '#f2c14e' : '#f4f4f8';
    } else if (race.phase === 'lights') {
      const lit = Math.max(0, Math.min(5, Math.floor((clock + LIGHTS) / 0.6)));
      // a beep as each light comes on
      if (clock < 0 && lit > soundState.lights) sounds.light();
      soundState.lights = Math.max(soundState.lights, clock < 0 ? lit : 5);
      banner.textContent = clock < 0 ? '● '.repeat(lit).trim() + ' ○'.repeat(5 - lit) : '● ● ● ● ●';
      banner.style.color = '#d8323c';
    } else {
      const stop = me.pit;
      const [text, color] =
        replay ? [`${Math.floor(performance.now() / 500) % 2 ? '●' : '○'} REPLAY`, '#d8323c']
        : podium && results.style.display !== 'block' ? [podium.top.map((i, k) => `P${k + 1} ${looks[i].name}`).join(' · '), '#f2c14e']
        : me.car.wrecked || p.retired ? [championship ? 'DNF' : 'DNF · RESTART to go again', '#d8323c']
        : done && p.finished !== undefined && results.style.display !== 'block' ? inLapBanner(me.inLap?.to, order.indexOf(you))
        : done ? ['', '']
        : stop?.phase === 'stopped' ? [`PIT STOP ${Math.max(0, stop.left).toFixed(1)}`, '#f2c14e']
        : stop ? [inLimitZone(circuit.pit, circuit.pit.points[stop.at].s) ? 'PIT LIMITER' : 'PIT LANE', '#f2c14e']
        : boxBox() ? [`BOX, BOX · PITS ${pitSide}`, '#f2c14e']
        : p.wrongWay > 1 ? ['WRONG WAY', '#d8323c']
        : clock < 1.2 && session === 'race' ? ['GO!', '#5fe0d0']
        : clock < notice.until ? [notice.text, notice.color]
        : learn ? [prompt(learn.o.step, device()), learn.o.step === 'done' ? '#f2c14e' : '#f4f4f8']
        : session !== 'race' && session !== 'tutorial' && p.lapStart === undefined ? ['TIMING STARTS AT THE LINE', '#9d9ab8']
        : sc ? ['SAFETY CAR', '#f2c14e']
        : race.vsc ? ['VIRTUAL SAFETY CAR', '#f2c14e']
        // (a Time Attack's clock, red in its last seconds)
        : attack?.a.left !== undefined ? [`${attack.a.left.toFixed(1)} S`, attack.a.left < 5 ? '#d8323c' : '#f4f4f8']
        : ['', ''];
      banner.textContent = text;
      banner.style.color = color;
    }
    const lapTime = p.lapStart !== undefined && p.finished === undefined ? clock - p.lapStart : undefined;
    // (in a Time Trial your best good lap: a deleted one doesn't count)
    const best = session === 'timetrial' ? trial?.best?.time : p.lapTimes.length ? Math.min(...p.lapTimes) : undefined;
    // your car's health as five blocks (each is 20%)
    const blocks = Math.ceil((me.car.health / me.car.cls.health) * 5);
    const car = me.car.wrecked ? 'WRECKED' : '■'.repeat(blocks) + '□'.repeat(5 - blocks);
    // your tyres as five blocks and a share left, amber once they're past their best
    const left = 1 - me.tyres.wear;
    const tyreBlocks = Math.ceil(left * 5);
    const tyres = `${COMPOUNDS[me.tyres.compound].short} ${'■'.repeat(tyreBlocks)}${'□'.repeat(5 - tyreBlocks)} ${Math.round(left * 100)}%${me.tyres.wear >= 0.7 ? ' WORN' : ''}`;
    const limiter = me.pit && !done && inLimitZone(circuit.pit, circuit.pit.points[me.pit.at].s) ? ` · PIT ${PIT.limit}` : (sc || race.vsc) && !done ? ` · ${sc ? 'SC' : 'VSC'} ${Math.round(me.held ?? (sc ? SAFETY_CAR.limit : VSC.limit))}` : '';
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
    readout.textContent = attack
      ? // a Time Attack: the clock, how far you've got, and your best here
        `TIME ${attack.a.left === undefined ? '–' : attack.a.left.toFixed(1)}\nGOT  ${distance(attack.a.passed)}\nBEST ${attack.best ? distance(attack.best) : '–'}\nLAP  ${fmt(lapTime)}\nCAR  ${car}\n`
      : `LAP  ${fmt(lapTime)}\nLAST ${fmt(p.lapTimes[p.lapTimes.length - 1])}\nBEST ${fmt(best)}\nREC  ${fmt(session === 'qualifying' ? rec()?.bestQualifying : session === 'timetrial' ? trial?.record?.time : rec()?.bestLap)}${gapLine(ahead, '▲')}${gapLine(behind, '▼')}\nCAR  ${car}${limiter}\n`;
    // the tyre line in its compound's colour
    // (the wrong ones for the weather: what the crew would fit, in amber)
    const wrong = session === 'race' && !done && race.forecast && wrongTyres(race, you);
    tyreLine.textContent = `TYRE ${tyres}\n${wrong ? `BOX  FOR ${COMPOUNDS[tyreCall(race, me)].name}\n` : ''}`;
    tyreLine.style.color = COMPOUNDS[me.tyres.compound].color;
    statsLine.textContent = showStats ? `${Math.round(speedOf(me.car))} PX/S · ${fps} FPS ${QUALITY_LEVELS[governor.level].name.toUpperCase()}` : '';
    towLine.textContent = me.tow > 0.1 && !done ? `TOW  ${'▶'.repeat(Math.ceil(me.tow * 5))}\n` : '';
    const strikes = me.limits.strikes;
    limitsLine.textContent = strikes && session === 'race' ? `LIMITS ${strikes > LIMITS.warnings ? `+${(strikes - LIMITS.warnings) * LIMITS.penalty}S` : `${strikes}/${LIMITS.warnings}`}\n` : '';
    limitsLine.style.color = strikes > LIMITS.warnings ? '#d8323c' : '#f2c14e';
    // (the gap: how much sooner or later than the ghost you've reached this point of the lap)
    const ghostAt = trial?.record && p.lapStart !== undefined && !trial.lap.deleted ? ghostTimeAt(trial.record, p.idx, track.samples.length) : undefined;
    const ghostGap = ghostAt === undefined ? undefined : clock - p.lapStart! - ghostAt;
    ghostLine.textContent = ghostGap === undefined ? '' : `GAP  ${ghostGap < 0 ? '−' : '+'}${Math.abs(ghostGap).toFixed(2)}\n`;
    ghostLine.style.color = (ghostGap ?? 0) < 0 ? '#5fe0d0' : '#d8323c';
    readout.append(medalLine, ghostLine, towLine, tyreLine, limitsLine, statsLine);

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
      drawTower();
    }
    particles.update(dt);
    // (in the replay, thrown again as they flew then)
    if (replay) debris.replay(replay.t, (x, z) => groundAt(grid, x, z).h);
    else debris.update(race.clock, (x, z) => groundAt(grid, x, z).h);
    drawRain(dt);
    {
      // (the way the car's going, on the screen: the ground's y is foreshortened by the camera's pitch)
      const c = race.entrants[you].car;
      const sy = c.vy * Math.sin(deg(LOOK.pitch));
      const len = Math.hypot(c.vx, sy) || 1;
      drawStreaks(dt, rushNow, c.vx / len, sy / len);
    }
    skids.update(dt);

    // camera: follow your car, looking ahead along its motion; or, the in-lap skipped, on the top three in their spots
    const c = me.car;
    const drawn = pose(c, you, alpha);
    const mineThen = replay && replayPose(recorder, replay.follow, replay.t);
    if (lookAt) {
      // (the debug hook's: the camera on a point of the map)
      target.set(lookAt.x, groundAt(grid, lookAt.x, lookAt.y).h, lookAt.y);
      focus.copy(target);
    } else if (mineThen) {
      // the replay: on your car as it was, looking ahead along its way
      target.set(mineThen.x + Math.sin(mineThen.heading) * t.lead * 0.6, mineThen.z * 0.5, mineThen.y - Math.cos(mineThen.heading) * t.lead * 0.6);
    } else if (gridPan) {
      // the grid pan: along the grid from pole to the back
      const at = panAt(circuit.slots, gridPan.t);
      target.set(at.x, groundAt(grid, at.x, at.y).h * 0.5, at.y);
      focus.copy(target);
    } else if (podium) {
      // on the ceremony, close in
      target.copy(ceremony.focus);
      ceremony.group.localToWorld(target);
      if (podium.time <= dt) focus.copy(target);
    } else target.set(drawn.x + (c.vx / c.cls.topSpeed) * t.lead, drawn.z * 0.5, drawn.y + (c.vy / c.cls.topSpeed) * t.lead);
    focus.lerp(target, 1 - Math.exp(-dt * 6));
    const pitch = deg(LOOK.pitch);
    // (the zoom eases back out from the grid pan's)
    panZoom += ((gridPan ? GRID_PAN.zoom : 1) - panZoom) * (1 - Math.exp(-dt * 4));
    // (the rush of speed pulls the camera back a touch)
    const meNow = race.entrants[you];
    const rushWant = !replay && !podium && !gridPan && running(meNow) && !meNow.pit ? rushOf(speedOf(meNow.car), meNow.car.cls.topSpeed, meNow.tow) : 0;
    rushNow += (rushWant - rushNow) * Math.min(1, dt * 3);
    // (wheel to wheel with a rival, it pulls back a touch more, to show you both)
    const battleWant = !replay && !podium && !gridPan && session === 'race' && race.phase === 'racing' && running(meNow) && !meNow.pit
      && race.entrants.some((e, i) => i !== you && running(e) && !e.pit && Math.hypot(e.car.x - meNow.car.x, e.car.y - meNow.car.y) < BATTLE.near) ? 1 : 0;
    battleNow += (battleWant - battleNow) * Math.min(1, dt * (battleWant ? 2 : 0.8));
    const dist = (viewH / (2 * Math.tan(deg(LOOK.fov / 2))) / (t.zoom * (podium ? CEREMONY_ZOOM : panZoom))) * (1 + RUSH.pullBack * rushNow + BATTLE.pullBack * battleNow);
    camera.position.set(focus.x, focus.y + Math.sin(pitch) * dist, focus.z + Math.cos(pitch) * dist);
    camera.lookAt(focus.x, focus.y, focus.z);
    // the shake: the camera moved across and up its own view (SCREEN SHAKE off in the settings: still)
    if (shakeOn()) {
      const o = shakeOffset(shake);
      camera.translateX(o.x);
      camera.translateY(o.y);
    }
    world.followSun(focus);
    world.animate(performance.now() / 1000);
    // the weather's look, eased as the track wets and dries and the rain comes and goes (redone only as it changes)
    if (Math.abs(race.wetness - shownLook.wetness) > 0.02 || Math.abs(race.rain - shownLook.rain) > 0.02) {
      shownLook = { wetness: race.wetness, rain: race.rain };
      const look = weatherLook(race.wetness, race.rain);
      world.setSky(look.sky);
      world.setGroundTint(look.groundTint);
      sounds.setRain(race.rain);
    }


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

  const dispose = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('keydown', onKey);
    setAudioPaused(false);
    sounds.dispose();
    // everything on the GPU: the scene's meshes, materials and textures, the post passes, the context itself
    world.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      for (const m of [mesh.material ?? []].flat() as THREE.Material[]) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    });
    post.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    offBack();
    for (const el of [streaks, rain, readout, banner, radioPanel, results, mini, tower, teamCard, pauseScreen, pauseSettings, flagOverlay]) el.remove();
    delete (window as { __cc?: unknown }).__cc;
  };
  return { resize, dispose };
};
