// Your streak: the days running you've played (a race finished, a Time Trial lap set, a Time Attack or Daily run
// over), by your own clock's days. One day missed a week is forgiven (the streak saved, not grown); a second ends it.
// Reaching 3, 7, 14 and 30 days earns a look for your car (carStyle.ts), yours for good. Engine-free but for the save.

import { save, saved } from '../engine/save';

/** The day by this device's clock, YYYY-MM-DD. */
export const localDay = (at: Date = new Date()): string =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

/** Whole days from day `a` to day `b` (YYYY-MM-DD). */
export const daysBetween = (a: string, b: string): number => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);

/** The day `n` days after `day`. */
export const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** days between two forgiven misses, at the least */
export const FORGIVE_EVERY = 7;

export interface Streak {
  /** the last day played */
  last?: string;
  /** days running, up to `last` */
  days: number;
  /** the longest streak ever (what the rewards go by) */
  best: number;
  /** the last day a missed day was forgiven */
  forgiven?: string;
}

/** What playing on a day did to the streak. */
export interface StreakStep {
  /** days now */
  days: number;
  /** a new day for the streak (not the first time today) */
  grew: boolean;
  /** a missed day forgiven on the way */
  forgave: boolean;
  /** rewards reached for the first time */
  rewards: Reward[];
}

/** A look for your car, earned by a streak of `days`. */
export interface Reward {
  id: string;
  days: number;
  name: string;
}

export const REWARDS: Reward[] = [
  { id: 'silver-helmet', days: 3, name: 'SILVER HELMET' },
  { id: 'neon-helmet', days: 7, name: 'NEON HELMET' },
  { id: 'gold-wings', days: 14, name: 'GOLD WINGS' },
  { id: 'black-gold', days: 30, name: 'BLACK & GOLD' },
];

/** The streak, as saved. (A Daily Challenge streak from before carries over: `daily` is its last day and length.) */
export function loadStreak(daily?: { last?: string; streak: number }): Streak {
  const v = saved('streak', 'now') as Partial<Streak> | undefined;
  if (v && typeof v === 'object' && typeof v.days === 'number') {
    return { last: typeof v.last === 'string' ? v.last : undefined, days: Math.max(0, Math.floor(v.days)), best: Math.max(0, Math.floor(v.best ?? v.days)), forgiven: typeof v.forgiven === 'string' ? v.forgiven : undefined };
  }
  return daily?.last && daily.streak > 0 ? { last: daily.last, days: daily.streak, best: daily.streak } : { days: 0, best: 0 };
}

export const saveStreak = (s: Streak): void => save('streak', 'now', s);

/** Whether a miss can be forgiven on `today`: none forgiven in the last FORGIVE_EVERY days. */
const canForgive = (s: Streak, today: string) => !s.forgiven || daysBetween(s.forgiven, today) >= FORGIVE_EVERY;

/** The streak as of `today`: its days if it's still alive (played today or yesterday, or the day before with a miss to forgive), else 0. */
export function streakNow(s: Streak, today: string): number {
  if (!s.last) return 0;
  const gap = daysBetween(s.last, today);
  return gap <= 1 || (gap === 2 && canForgive(s, today)) ? s.days : 0;
}

/** Whether today's still to play for the streak to go on (alive, not played today). */
export const streakDue = (s: Streak, today: string): boolean => streakNow(s, today) > 0 && s.last !== today;

/** Played on `today`: the streak grown (once a day), a missed day forgiven if it can be; the rewards newly reached. */
export function playedOn(s: Streak, today: string): StreakStep {
  if (s.last === today) return { days: s.days, grew: false, forgave: false, rewards: [] };
  const gap = s.last ? daysBetween(s.last, today) : Infinity;
  let forgave = false;
  if (gap === 1) s.days += 1;
  else if (gap === 2 && canForgive(s, today)) {
    s.days += 1;
    s.forgiven = today;
    forgave = true;
  } else s.days = 1;
  s.last = today;
  const before = s.best;
  s.best = Math.max(s.best, s.days);
  return { days: s.days, grew: true, forgave, rewards: REWARDS.filter((r) => r.days > before && r.days <= s.best) };
}

/** The rewards a best streak of `best` has earned. */
export const earned = (best: number): Reward[] => REWARDS.filter((r) => best >= r.days);

/** The next reward after a streak of `days`, if any. */
export const nextReward = (days: number): Reward | undefined => REWARDS.find((r) => r.days > days);
