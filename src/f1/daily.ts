// The Daily Challenge: one Time Attack a day, the same for everyone in the
// world (a circuit and weather drawn from the day's date, UTC; NORMAL; any
// team, they're all the same car), as many runs as you like, your best on the
// day's online board by your initials (supabase/schema.sql). Kept on the
// device: your best on each day, your streak of days played, and a best not
// yet sent (sent next time there's a connection). Engine-free but for the
// board's calls.

import { rpc } from '../engine/backend';
import { save, saved } from '../engine/save';
import { LAYOUTS, type CircuitLayout } from './layouts';
import { DRY, WEATHERS, type Weather } from './weather';
import { parseGhost, type Ghost } from './timeTrial';

/** The day (UTC) as YYYY-MM-DD. */
export const dayOf = (at: Date = new Date()): string => at.toISOString().slice(0, 10);

/** The day before `day`. */
export const dayBefore = (day: string): string => dayOf(new Date(Date.parse(`${day}T12:00:00Z`) - 86400000));

/** A number from `text` (FNV-1a), the same everywhere. */
function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Challenge {
  day: string;
  layout: CircuitLayout;
  weather: Weather;
}

/** The circuit `day` would draw (none twice running: a day drawing yesterday's takes the next). */
function circuitOn(day: string, layouts: CircuitLayout[], depth = 0): number {
  const k = hash(`circuit:${day}`) % layouts.length;
  if (depth > 0) return k;
  const yesterday = circuitOn(dayBefore(day), layouts, depth + 1);
  return k === yesterday ? (k + 1) % layouts.length : k;
}

/** `day`'s challenge: its circuit (out of `layouts`) and weather (dry most days, damp some, wet now and then). */
export function challengeOn(day: string, layouts: CircuitLayout[] = LAYOUTS): Challenge {
  const roll = (hash(`weather:${day}`) % 100) / 100;
  const id = roll < 0.65 ? 'dry' : roll < 0.85 ? 'damp' : 'wet';
  return { day, layout: layouts[circuitOn(day, layouts)], weather: WEATHERS.find((w) => w.id === id) ?? DRY };
}

/** ms until the next day's challenge (midnight UTC). */
export const untilNext = (at: Date = new Date()): number => Date.parse(`${dayOf(new Date(at.getTime() + 86400000))}T00:00:00Z`) - at.getTime();

/** A run: checkpoints passed, and s from the clock starting to the last of them. */
export interface Run {
  score: number;
  time: number;
}

/** Whether `a` beats `b`: further, or as far sooner. */
export const beats = (a: Run, b: Run | undefined): boolean => !b || a.score > b.score || (a.score === b.score && a.time < b.time);

/** What's kept: the last day you played and your streak of days running, your best on each day lately, and a best not yet on the board (with its ghost, for others to chase). */
export interface DailyLog {
  last?: string;
  streak: number;
  best: Record<string, Run>;
  pending?: Run & { day: string; ghost?: Ghost };
}

const isRun = (r: unknown): r is Run => !!r && typeof (r as Run).score === 'number' && typeof (r as Run).time === 'number';

export function loadDaily(): DailyLog {
  const best = saved('daily', 'best');
  const pending = saved('daily', 'pending') as (Run & { day: string; ghost?: unknown }) | undefined;
  const streak = saved('daily', 'streak');
  const last = saved('daily', 'last');
  return {
    last: typeof last === 'string' ? last : undefined,
    streak: typeof streak === 'number' && streak > 0 ? Math.floor(streak) : 0,
    best: best && typeof best === 'object' ? Object.fromEntries(Object.entries(best as Record<string, unknown>).filter(([, r]) => isRun(r))) as Record<string, Run> : {},
    pending: isRun(pending) && typeof pending.day === 'string' ? { day: pending.day, score: pending.score, time: pending.time, ...(parseGhost(pending.ghost) ? { ghost: parseGhost(pending.ghost) } : {}) } : undefined,
  };
}

/** Your streak as of `today`: days played running, up to today or yesterday (0 once a day's been missed). */
export const streakOn = (log: DailyLog, today: string): number => (log.last === today || log.last === dayBefore(today) ? log.streak : 0);

/** A run of `day`'s challenge (and its `ghost`), into `log`: the streak, your best on the day (and, if it's better, to send). True if it's your best. */
export function logRun(log: DailyLog, day: string, run: Run, ghost?: Ghost): boolean {
  if (log.last !== day) log.streak = log.last === dayBefore(day) ? log.streak + 1 : 1;
  log.last = day;
  const better = beats(run, log.best[day]);
  if (better) {
    log.best[day] = run;
    // (a run that passed no checkpoint isn't one for the board)
    if (run.score > 0) log.pending = { day, score: run.score, time: run.time, ...(ghost ? { ghost } : {}) };
  }
  // (a fortnight's bests are plenty)
  for (const d of Object.keys(log.best).sort().slice(0, -14)) delete log.best[d];
  return better;
}

export function saveDaily(log: DailyLog): void {
  save('daily', 'last', log.last);
  save('daily', 'streak', log.streak);
  save('daily', 'best', log.best);
  save('daily', 'pending', log.pending);
}

/** One place on a day's board. */
export interface BoardEntry {
  place: number;
  name: string;
  score: number;
  time: number;
  you?: boolean;
}

/** A day's board: how many have run it, its top, and your place (if you have one). */
export interface Board {
  entries: number;
  top: BoardEntry[];
  you?: BoardEntry;
}

/** Send the best not yet sent (by `player`, as `name`): true once it's on the board (or there was none to send). */
export async function sendPending(log: DailyLog, player: string, name: string): Promise<boolean> {
  const run = log.pending;
  if (!run) return true;
  const args = { p_day: run.day, p_player: player, p_name: name, p_score: run.score, p_time: Math.round(run.time * 100) / 100 };
  // (with its ghost; a project whose schema is older refuses that: then without)
  let ok = (await rpc('submit_daily', run.ghost ? { ...args, p_ghost: run.ghost } : args)) !== undefined;
  if (!ok && run.ghost) ok = (await rpc('submit_daily', args)) !== undefined;
  if (ok) {
    log.pending = undefined;
    saveDaily(log);
  }
  return ok;
}

/** `day`'s board (the top `top`, and `player`'s place); undefined offline. */
export const fetchBoard = (day: string, player: string, top = 10): Promise<Board | undefined> => rpc<Board>('daily_board', { p_day: day, p_player: player, p_top: top });
