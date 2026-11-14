// The capture build's showreel (capture/?show): a hands-off tour for screen recording. Open it, start the recording and
// tap the title; after that it plays itself: the menus, then the Ardennes (a pit stop, a big crash at La Source, the
// safety car and the replay), then every circuit in succession as a turning 3D model, a few of them raced in its place
// (the AI driving your car): a flight through Monaco's tunnel, rain in Brazil, the champagne ceremony, then a Time Trial
// lap and a Time Attack run. It's cut like a trailer: a curtain that wipes across between steps, the short races
// starting rolling part-way round the lap (no lights), and the camera directed shot by shot (SHOTS: close, low, round
// the car, high over the circuit). The page's address says where it is (?show=<step>), so a reload carries on from
// there. No controls or buttons are shown.
//
// The steps are data: showreel.json, the one place the reel is written down (each step's length, circuit, team,
// weather, how it starts, the camera's shots, what happens when, and its caption). `npm run reel:sheet` writes the same as a timed run sheet
// (docs/showreel-sheet.md), and the tests check every circuit, team, weather and place in it exists.

import type { CircuitLayout } from './layouts';
import type { Team } from './teams';
import type { Shot } from './race/camera';
import { capturePlaces } from './capture';
import { weatherById } from './weather';
import reel from './showreel.json';

/**
 * The camera's shots, by the names the script uses: `wide` is the game's own view; the rest come closer, lower or
 * round the car (`orbit` keeps turning; `high` pulls right back over the circuit).
 */
export const SHOTS: Record<string, Shot> = {
  wide: { zoom: 1, yaw: 0, pitch: 0 },
  close: { zoom: 1.7, yaw: 0, pitch: 0 },
  low: { zoom: 1.5, yaw: 0, pitch: -18 },
  left: { zoom: 1.4, yaw: -28, pitch: -8 },
  right: { zoom: 1.4, yaw: 28, pitch: -8 },
  orbit: { zoom: 1.45, yaw: -20, pitch: -8, spin: 12 },
  high: { zoom: 0.6, yaw: 0, pitch: 10 },
};
/** A crash's replay in the reel: close on the wreck, turning slowly round it. */
export const REPLAY_SHOT: Shot = { zoom: 1.5, yaw: -15, pitch: -8, spin: 8 };

/** Something that happens during a race step, `at` seconds after the lights go out. */
export interface ShowEvent {
  at: number;
  /** a flight past a set piece (`place`: capture.ts's label) or to a share of the way round the lap (`lap`: 0 to 1), the
   * cars round yours brought along; a crash staged by your car (`place`: at a named corner, such as La Source, rather
   * than beside you); the champagne ceremony; or the camera moved to another shot (`shot`: one of SHOTS; `cut`: at once) */
  do: 'flight' | 'crash' | 'champagne' | 'cam';
  place?: string;
  lap?: number;
  shot?: string;
  cut?: boolean;
}

export interface ShowStep {
  kind: 'screen' | 'race' | 'model';
  /** a screen: which one (the menu, the car shop, the Championship) */
  screen?: 'menu' | 'shop' | 'championship';
  /** a race's circuit; a model's: the circuit shown as a turning 3D model on the loading card, no racing */
  circuit?: string;
  mode?: 'race' | 'timetrial' | 'timeattack';
  team?: string;
  /** dry, damp, wet or changeable (dry when left out) */
  weather?: string;
  /** a screen's time; a race's racing seconds after the lights (when it ends, ceremony aside) */
  secs: number;
  events?: ShowEvent[];
  /** a race's opening shot (one of SHOTS; the game's own view when left out) */
  shot?: string;
  /** a rolling start: no lights, the field already racing this share of the way round the lap (0 to 1) */
  start?: number;
  /** the caption lines (when captions are on): a screen's; a race's own in place of its circuit and team */
  caption?: string[];
  /** only with captions on (the end card) */
  captionsOnly?: boolean;
}

/** The reel's timings, for the run sheet (s): the loading card, a model's card before its seconds, the lights, a crash replay, a ceremony. */
export const REEL_TIMING = reel.timing;

/** The steps of the reel, with the end card only when captions are on. */
export const loadScript = (captions = false): ShowStep[] => (reel.steps as ShowStep[]).filter((s) => captions || !s.captionsOnly);

/** What's wrong with a script, in words: an unknown circuit, team, weather or place, an event outside its step. Empty when it's fine. */
export function checkScript(steps: ShowStep[], layouts: CircuitLayout[], teams: Team[]): string[] {
  const bad: string[] = [];
  steps.forEach((s, i) => {
    const at = `step ${i} (${s.circuit ?? s.screen})`;
    if (!(s.secs > 0)) bad.push(`${at}: no length`);
    if (s.kind === 'screen') return;
    const layout = layouts.find((l) => l.id === s.circuit);
    if (!layout) return void bad.push(`${at}: unknown circuit`);
    if (s.kind === 'model') return;
    if (!teams.some((t) => t.id === s.team)) bad.push(`${at}: unknown team ${s.team}`);
    if (s.weather && !weatherById(s.weather)) bad.push(`${at}: unknown weather ${s.weather}`);
    const places = capturePlaces(layout, 1000, 24, 0).map((p) => p.label);
    if (s.shot && !SHOTS[s.shot]) bad.push(`${at}: unknown shot ${s.shot}`);
    if (s.start !== undefined && !(s.start >= 0 && s.start < 1)) bad.push(`${at}: a rolling start is a share of the lap, 0 to 1`);
    for (const e of s.events ?? []) {
      if (e.at < 0 || e.at > s.secs) bad.push(`${at}: ${e.do} at ${e.at} s is outside the step's ${s.secs} s`);
      if (e.do === 'cam' && !SHOTS[e.shot ?? '']) bad.push(`${at}: unknown shot ${e.shot}`);
      if (e.lap !== undefined && !(e.do === 'flight' && e.lap >= 0 && e.lap < 1)) bad.push(`${at}: lap ${e.lap} is not a share of the lap for a flight`);
      if (((e.do === 'flight' && e.lap === undefined) || (e.do === 'crash' && e.place)) && !places.includes(e.place ?? '')) bad.push(`${at}: no place "${e.place}" on ${layout.name}`);
      if (e.do === 'champagne' && s.mode && s.mode !== 'race') bad.push(`${at}: champagne only in a race`);
    }
  });
  return bad;
}

/** One line of the timed run sheet. */
export interface SheetRow {
  /** s from the start of the reel */
  start: number;
  /** s it takes, as estimated (the sim's own clock decides in the end) */
  length: number;
  what: string;
}

/** The run sheet's rows: each step's start and length, estimated from the timings, and what happens in it. */
export function sheetRows(steps: ShowStep[], layouts: CircuitLayout[], teams: Team[], captions = true): SheetRow[] {
  const t = REEL_TIMING;
  let clock = 0;
  const rows: SheetRow[] = [];
  steps.filter((s) => captions || !s.captionsOnly).forEach((s) => {
    const events = s.events ?? [];
    const crash = events.some((e) => e.do === 'crash');
    const champagne = events.some((e) => e.do === 'champagne');
    const length = s.kind === 'screen' ? s.secs : s.kind === 'model' ? s.secs + t.card : t.load + ((s.mode === 'race' || !s.mode) && s.start === undefined ? t.lights : 0) + s.secs + (crash ? t.replay : 0) + (champagne ? t.ceremony : 0);
    let what = '';
    if (s.kind === 'screen') what = `${s.screen} screen`;
    else if (s.kind === 'model') what = `3D model · ${layouts.find((l) => l.id === s.circuit)?.name ?? s.circuit}`;
    else {
      const layout = layouts.find((l) => l.id === s.circuit);
      const team = teams.find((x) => x.id === s.team);
      const mode = s.mode === 'timetrial' ? 'Time Trial' : s.mode === 'timeattack' ? 'Time Attack' : 'Race';
      what = `${mode} · ${layout?.name ?? s.circuit} · ${team?.name ?? s.team} · ${s.weather ?? 'dry'}`;
      const ev = events.map((e) => `${e.at} s ${
        e.do === 'cam' ? `camera ${e.shot}${e.cut ? ' (cut)' : ''}`
          : e.do === 'flight' ? (e.lap !== undefined ? `cut to ${Math.round(e.lap * 100)}% round the lap` : `fly past ${e.place}`)
            : e.do === 'crash' ? `${e.place ? `big crash at ${e.place} ` : 'crash '}+ replay` : 'champagne'}`);
      if (s.start !== undefined) what += ` · rolling start${s.start ? ` ${Math.round(s.start * 100)}% round the lap` : ''}`;
      if (s.shot) what += ` · opens ${s.shot}`;
      if (ev.length) what += ` · ${ev.join(', ')}`;
    }
    rows.push({ start: clock, length, what });
    clock += length;
  });
  return rows;
}

/** The step the address is on (?show=<n>; ?show alone is the first), or undefined when it isn't a showreel. */
export function showIndex(search: string): number | undefined {
  const p = new URLSearchParams(search);
  if (!p.has('show')) return undefined;
  const n = Number.parseInt(p.get('show') ?? '', 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** The address of step `i` (other flags kept, such as ?desktop), or of the menu with no showreel when `step` is undefined. */
export function stepUrl(href: string, i: number, step: ShowStep | undefined): string {
  const url = new URL(href);
  const p = url.searchParams;
  p.delete('circuit');
  p.delete('mode');
  p.delete('model');
  if (!step) {
    p.delete('show');
    return url.href;
  }
  p.set('show', String(i));
  if (step.kind === 'race') {
    p.set('circuit', step.circuit!);
    if (step.mode && step.mode !== 'race') p.set('mode', step.mode);
  } else if (step.kind === 'model') p.set('model', step.circuit!);
  else if (step.screen !== 'menu') p.set('mode', step.screen!);
  return url.href;
}
