// Daily missions: three small goals a day, drawn from the day's date (by this device's clock), so everyone has the
// same three: one easy, one harder, and one off the beaten track (another mode, a circuit, a win). Played towards in
// any mode; the progress kept for the day, a fresh three the next. Engine-free but for the save.

import { save, saved } from '../engine/save';
import { FREE_LAYOUTS, LAYOUTS } from './layouts';

/** Something done in a session, as missions count it. */
export type PlayEvent =
  /** a race finished (your flag): where you finished, from where, on which circuit, and how it went */
  | { kind: 'race'; place: number; grid: number; field: number; fastest: boolean; clean: boolean; weather: string; circuit: string; difficulty: string }
  /** a lap done, in a race or a Time Trial */
  | { kind: 'lap' }
  /** a start off the lights: GOOD or GREAT */
  | { kind: 'launch'; great: boolean }
  /** a pit stop of yours */
  | { kind: 'pit' }
  /** a Time Trial lap set (a new record, or not) */
  | { kind: 'trial-lap'; record: boolean }
  /** a Time Attack run over: its sectors cleared, and whether it was the Daily Challenge */
  | { kind: 'attack'; passed: number; daily: boolean };

export interface Mission {
  id: string;
  /** what to do, short enough for the menu */
  text: string;
  /** how many it takes */
  goal: number;
  /** what an event counts towards it (0: nothing); `max`: the best in one go counts, not the total */
  count(e: PlayEvent): number;
  max?: boolean;
}

/** The circuits a mission can send you to: the ones open to everyone (the first, and the free ones). */
export const MISSION_CIRCUITS: { id: string; name: string }[] = [...new Set([LAYOUTS[0], ...FREE_LAYOUTS])].map((l) => ({ id: l.id, name: l.name.toUpperCase() }));

const race = (e: PlayEvent) => (e.kind === 'race' ? e : undefined);

const EASY: Mission[] = [
  { id: 'races', text: 'FINISH 2 RACES', goal: 2, count: (e) => (race(e) ? 1 : 0) },
  { id: 'laps', text: 'DRIVE 10 LAPS', goal: 10, count: (e) => (e.kind === 'lap' ? 1 : 0) },
  { id: 'launches', text: 'GET 2 GOOD LAUNCHES', goal: 2, count: (e) => (e.kind === 'launch' ? 1 : 0) },
  { id: 'pit', text: 'MAKE A PIT STOP', goal: 1, count: (e) => (e.kind === 'pit' ? 1 : 0) },
  { id: 'top5', text: 'FINISH IN THE TOP 5', goal: 1, count: (e) => (race(e) && race(e)!.place <= 5 ? 1 : 0) },
];

const MEDIUM: Mission[] = [
  { id: 'podium', text: 'FINISH ON THE PODIUM', goal: 1, count: (e) => (race(e) && race(e)!.place <= 3 ? 1 : 0) },
  { id: 'charge', text: 'GAIN 3 PLACES IN A RACE', goal: 3, max: true, count: (e) => (race(e) ? Math.max(0, race(e)!.grid - race(e)!.place) : 0) },
  { id: 'fastest', text: 'SET A RACE’S FASTEST LAP', goal: 1, count: (e) => (race(e)?.fastest ? 1 : 0) },
  { id: 'clean', text: 'FINISH A RACE WITHOUT A SCRATCH', goal: 1, count: (e) => (race(e)?.clean ? 1 : 0) },
  { id: 'great', text: 'GET A GREAT LAUNCH', goal: 1, count: (e) => (e.kind === 'launch' && e.great ? 1 : 0) },
  { id: 'rain', text: 'FINISH A RACE IN THE RAIN', goal: 1, count: (e) => (race(e) && race(e)!.weather !== 'dry' ? 1 : 0) },
];

const FAR: Mission[] = [
  { id: 'daily', text: 'RUN THE DAILY CHALLENGE', goal: 1, count: (e) => (e.kind === 'attack' && e.daily ? 1 : 0) },
  { id: 'trial', text: 'SET 3 TIME TRIAL LAPS', goal: 3, count: (e) => (e.kind === 'trial-lap' ? 1 : 0) },
  { id: 'attack', text: 'CLEAR 8 SECTORS IN A TIME ATTACK', goal: 8, max: true, count: (e) => (e.kind === 'attack' ? e.passed : 0) },
  { id: 'win', text: 'WIN A RACE', goal: 1, count: (e) => (race(e)?.place === 1 ? 1 : 0) },
  { id: 'record', text: 'BEAT YOUR TIME TRIAL RECORD', goal: 1, count: (e) => (e.kind === 'trial-lap' && e.record ? 1 : 0) },
  ...MISSION_CIRCUITS.map((c): Mission => ({ id: `at-${c.id}`, text: `FINISH A RACE AT ${c.name}`, goal: 1, count: (e) => (race(e)?.circuit === c.id ? 1 : 0) })),
];

/** Every mission there is (by its id). */
export const MISSIONS: Mission[] = [...EASY, ...MEDIUM, ...FAR];

/** A number from `text` (FNV-1a), the same everywhere. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** `day`'s three missions: an easy one, a harder one, and one further afield. */
export const missionsOn = (day: string): Mission[] => [EASY, MEDIUM, FAR].map((lot, k) => lot[hash(`mission:${k}:${day}`) % lot.length]);

/** A day's progress: how far along each of its missions is. */
export interface DayProgress {
  day: string;
  progress: Record<string, number>;
}

export function loadProgress(day: string): DayProgress {
  const v = saved('missions', 'today') as Partial<DayProgress> | undefined;
  if (!v || v.day !== day || !v.progress || typeof v.progress !== 'object') return { day, progress: {} };
  return { day, progress: Object.fromEntries(Object.entries(v.progress).filter(([, n]) => typeof n === 'number' && n >= 0)) as Record<string, number> };
}

export const saveProgress = (p: DayProgress): void => save('missions', 'today', p);

/** How far along `m` is (no further than its goal). */
export const progressOf = (p: DayProgress, m: Mission): number => Math.min(m.goal, p.progress[m.id] ?? 0);

export const isDone = (p: DayProgress, m: Mission): boolean => progressOf(p, m) >= m.goal;

/** `e` counted towards the day's missions: those it finishes, and whether that makes all three. */
export function count(p: DayProgress, e: PlayEvent): { done: Mission[]; all: boolean } {
  const today = missionsOn(p.day);
  const done: Mission[] = [];
  for (const m of today) {
    if (isDone(p, m)) continue;
    const n = m.count(e);
    if (!n) continue;
    p.progress[m.id] = m.max ? Math.max(p.progress[m.id] ?? 0, n) : (p.progress[m.id] ?? 0) + n;
    if (isDone(p, m)) done.push(m);
  }
  return { done, all: done.length > 0 && today.every((m) => isDone(p, m)) };
}
