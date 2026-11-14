// The capture build's showreel (capture/?show): a hands-off tour for screen recording. Open it, start the recording and
// tap the title; after that it plays itself: the menus, then every circuit in turn with a different team (some in the
// rain), the AI driving your car, the camera on it, a flight past each circuit's set pieces (the tunnel, the castle
// walls, the pit lane, ...), the champagne ceremony on some, a Time Trial lap and a Time Attack run. The page's address
// says where it is (?show=<step>), so a reload carries on from there. No controls or buttons are shown.

import type { CircuitLayout } from './layouts';
import type { Team } from './teams';
import { capturePlaces } from './capture';

export interface ShowStep {
  kind: 'screen' | 'race';
  /** a screen: which one (the menu, the car shop, the Championship, the Daily Challenge) */
  screen?: 'menu' | 'shop' | 'championship' | 'daily';
  circuit?: string;
  mode?: 'race' | 'timetrial' | 'timeattack';
  team?: string;
  weather?: string;
  /** a screen's time, or a Time Trial's or Time Attack's (s) */
  secs: number;
  /** the set pieces to fly past (capture.ts's labels), in order */
  jumps?: string[];
  /** ends in the champagne ceremony */
  champagne?: boolean;
}

/** Wet and damp weather on a few circuits (not where the pit lane's on show: the stop wants dry). */
const WEATHER: (string | undefined)[] = [undefined, undefined, 'wet', undefined, 'damp', undefined, undefined];

export function buildScript(layouts: CircuitLayout[], teams: Team[]): ShowStep[] {
  const steps: ShowStep[] = [
    { kind: 'screen', screen: 'menu', secs: 5 },
    { kind: 'screen', screen: 'shop', secs: 5 },
    { kind: 'screen', screen: 'championship', secs: 5 },
    { kind: 'screen', screen: 'daily', secs: 4 },
  ];
  layouts.forEach((l, i) => {
    const pit = !!l.pitRoof;
    const jumps = capturePlaces(l, 1000, 24, 0).map((p) => p.label).filter((x) => x !== 'START / FINISH' && (pit || x !== 'PIT LANE'));
    steps.push({
      kind: 'race', circuit: l.id, mode: 'race', team: teams[i % teams.length].id, secs: 0,
      weather: pit ? undefined : WEATHER[i % WEATHER.length], jumps: jumps.slice(0, 3), champagne: i % 6 === 5 || i === layouts.length - 1,
    });
  });
  steps.push({ kind: 'race', circuit: layouts[3 % layouts.length].id, mode: 'timetrial', team: teams[2].id, secs: 22 });
  steps.push({ kind: 'race', circuit: layouts[0].id, mode: 'timeattack', team: teams[4].id, secs: 22 });
  return steps;
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
  if (!step) {
    p.delete('show');
    return url.href;
  }
  p.set('show', String(i));
  if (step.kind === 'race') {
    p.set('circuit', step.circuit!);
    if (step.mode !== 'race') p.set('mode', step.mode!);
  } else if (step.screen !== 'menu') p.set('mode', step.screen!);
  return url.href;
}
