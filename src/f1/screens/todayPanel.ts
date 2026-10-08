// The menu's TODAY panel, over the modes: your streak (and what it earns next), today's three missions and how far
// along each is, and how you placed on yesterday's Daily Challenge (looked up on its board, when you ran it). What
// brings a player back: the day's things to do, and the streak not to lose.

import { dayBefore, dayOf, fetchBoard, loadDaily } from '../daily';
import { isDone, loadProgress, missionsOn, progressOf } from '../missions';
import { playerId } from '../profile';
import { loadStreak, localDay, nextReward, streakDue, streakNow } from '../streak';

/** The panel as things are today; `signal` stops the lookup of yesterday's place once the menu's gone. */
export function todayPanel(signal?: AbortSignal): HTMLElement {
  const day = localDay();
  const panel = document.createElement('div');
  panel.className = 'today-panel';
  const line = (cls: string, ...parts: (string | HTMLElement)[]) => {
    const el = document.createElement('div');
    el.className = cls;
    el.append(...parts);
    return el;
  };
  const span = (cls: string, text: string) => {
    const el = document.createElement('span');
    el.className = cls;
    el.textContent = text;
    return el;
  };

  // the streak: its days, and what it's for (or, none going, how to start one)
  const s = loadStreak(loadDaily());
  const days = streakNow(s, day);
  const next = nextReward(days);
  const due = streakDue(s, day);
  panel.append(line(
    'today-streak',
    span('today-days', days ? `▲ ${days}-DAY STREAK` : '▲ START A STREAK'),
    span('today-next', due ? 'play today to keep it' : next ? `${next.days - days} more: ${next.name.toLowerCase()}` : 'every look earned'),
  ));

  // the day's missions
  const progress = loadProgress(day);
  const missions = missionsOn(day);
  const doneCount = missions.filter((m) => isDone(progress, m)).length;
  panel.append(line('today-head', span('', "TODAY'S MISSIONS"), span('today-count', `${doneCount}/3`)));
  for (const m of missions) {
    const done = isDone(progress, m);
    panel.append(line(`today-mission${done ? ' done' : ''}`, span('today-mark', done ? '✓' : '○'), span('today-text', m.text), span('today-of', `${progressOf(progress, m)}/${m.goal}`)));
  }

  // yesterday's Daily Challenge, if you ran it: your place on its board
  const yesterday = dayBefore(dayOf());
  if (loadDaily().best[yesterday]) {
    const result = line('today-yesterday', "YESTERDAY'S DAILY: …");
    panel.append(result);
    void fetchBoard(yesterday, playerId(), 1).then((board) => {
      if (signal?.aborted) return;
      if (board?.you) result.textContent = `YESTERDAY'S DAILY: P${board.you.place} OF ${board.entries}`;
      else result.remove();
    }, () => result.remove());
  }
  return panel;
}
