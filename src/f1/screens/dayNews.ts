// What playing did for the day, said in toasts as it happens (today.ts): a mission done (and all three), the streak
// a day on (and a missed day forgiven), a reward for your car earned; the achievements that brings, unlocked.

import { nextReward } from '../streak';
import type { TodayNews } from '../today';
import { achievementToast } from './celebrate';

/** Say `news`; `achieve` unlocks (and says) achievements. */
export function sayDayNews(news: TodayNews, achieve: (ids: string[]) => void): void {
  for (const m of news.missions) {
    achievementToast({ head: 'MISSION', mark: '✓', name: m.text, about: news.allMissions && m === news.missions[news.missions.length - 1] ? 'all three done today' : `${news.doneToday} of 3 done today` });
  }
  const s = news.streak;
  if (s) {
    const next = nextReward(s.days);
    achievementToast({
      head: 'STREAK',
      mark: '▲',
      name: `DAY ${s.days}`,
      about: s.forgave ? 'a missed day forgiven: keep it going' : s.days === 1 ? 'play tomorrow for day 2' : next ? `${next.days - s.days} more for the ${next.name.toLowerCase()}` : 'every look earned: keep it going',
    });
    for (const r of s.rewards) achievementToast({ head: 'REWARD', mark: '◆', name: r.name, about: 'yours: pick it in settings · car style' });
  }
  if (news.achievements.length) achieve(news.achievements);
}
