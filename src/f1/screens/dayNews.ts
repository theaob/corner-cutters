// What playing did for the day, said in toasts as it happens (today.ts): a mission done (and all three), the streak
// a day on (and a missed day forgiven), a reward for your car earned; the achievements that brings, unlocked.

import { lower, t } from '../../engine/i18n';
import { nextReward } from '../streak';
import { missionText } from '../missions';
import type { TodayNews } from '../today';
import { achievementToast } from './celebrate';

/** Say `news`; `achieve` unlocks (and says) achievements. */
export function sayDayNews(news: TodayNews, achieve: (ids: string[]) => void): void {
  for (const m of news.missions) {
    achievementToast({ head: 'MISSION', mark: '✓', name: missionText(m), about: news.allMissions && m === news.missions[news.missions.length - 1] ? t('all three done today') : t('{n} of 3 done today', { n: news.doneToday }) });
  }
  const s = news.streak;
  if (s) {
    const next = nextReward(s.days);
    achievementToast({
      head: 'STREAK',
      mark: '▲',
      name: t('DAY {n}', { n: s.days }),
      about: s.forgave ? t('a missed day forgiven: keep it going') : s.days === 1 ? t('play tomorrow for day 2') : next ? t('{n} more for the {name}', { n: next.days - s.days, name: lower(t(next.name)) }) : t('every look earned: keep it going'),
    });
    for (const r of s.rewards) achievementToast({ head: 'REWARD', mark: '◆', name: r.name, about: t('yours: wear it from the shop') });
  }
  if (news.achievements.length) achieve(news.achievements);
}
