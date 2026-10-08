// Today: what playing does for the day. Each thing done in a session (missions.ts' PlayEvent) counts towards the
// day's missions, and the first that counts as playing (a race finished, a Time Trial lap, a Time Attack or Daily
// run) keeps the streak going (streak.ts). Gives back what's to be said: missions done, the streak grown, a reward
// reached, and the achievements that brings. Engine-free but for the save.

import { loadDaily } from './daily';
import { count, isDone, loadProgress, missionsOn, saveProgress, type Mission, type PlayEvent } from './missions';
import { loadStreak, localDay, playedOn, saveStreak, type Reward } from './streak';

/** the streaks the achievements are for */
export const STREAK_ACHIEVEMENTS = { regular: 7, devoted: 30 };

export interface TodayNews {
  /** missions just done, and whether that's all three */
  missions: Mission[];
  allMissions: boolean;
  /** the day's missions done so far, of three */
  doneToday: number;
  /** the streak, if this was the day's first play: its days, a missed day forgiven, rewards newly earned */
  streak?: { days: number; forgave: boolean; rewards: Reward[] };
  /** achievement ids due */
  achievements: string[];
}

/** Events that count as having played today (the rest count only towards missions). */
const PLAYED: PlayEvent['kind'][] = ['race', 'trial-lap', 'attack'];

/** `e` done now (`day`: today by this device's clock): the day's missions and streak brought up to date and saved. */
export function played(e: PlayEvent, day: string = localDay()): TodayNews {
  const progress = loadProgress(day);
  const { done, all } = count(progress, e);
  if (done.length) saveProgress(progress);
  const news: TodayNews = { missions: done, allMissions: all, doneToday: missionsOn(day).filter((m) => isDone(progress, m)).length, achievements: all ? ['busy-day'] : [] };
  if (PLAYED.includes(e.kind)) {
    const s = loadStreak(loadDaily());
    const step = playedOn(s, day);
    if (step.grew) {
      saveStreak(s);
      news.streak = { days: step.days, forgave: step.forgave, rewards: step.rewards };
      for (const [id, days] of Object.entries(STREAK_ACHIEVEMENTS)) if (s.days >= days) news.achievements.push(id);
    }
  }
  return news;
}
