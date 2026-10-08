import { beforeEach, describe, expect, it } from 'vitest';
import { save, useSave, type SaveStore } from '../src/engine/save';
import { CC_SAVE } from '../src/f1/save';
import { REWARDS, addDays, daysBetween, earned, loadStreak, localDay, nextReward, playedOn, saveStreak, streakDue, streakNow, type Streak } from '../src/f1/streak';
import { MISSIONS, MISSION_CIRCUITS, count, isDone, loadProgress, missionsOn, progressOf, type PlayEvent } from '../src/f1/missions';
import { played } from '../src/f1/today';
import { CAR_STYLES, carStyle, setCarStyle, styled, stylesFor } from '../src/f1/carStyle';
import { ACHIEVEMENTS } from '../src/f1/achievements';
import { FREE_LAYOUTS, LAYOUTS } from '../src/f1/layouts';

beforeEach(() => {
  const items = new Map<string, string>();
  const store: SaveStore = { getItem: (k) => items.get(k) ?? null, setItem: (k, v) => void items.set(k, v), removeItem: (k) => void items.delete(k) };
  useSave(CC_SAVE, store);
});

const D = '2026-10-08';
const raceAt = (o: Partial<Extract<PlayEvent, { kind: 'race' }>> = {}): PlayEvent => ({
  kind: 'race', place: 6, grid: 6, field: 10, fastest: false, clean: false, weather: 'dry', circuit: 'nowhere', difficulty: 'normal', ...o,
});

describe('days', () => {
  it('the local day, and days between and after', () => {
    expect(localDay(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(daysBetween('2026-02-27', '2026-03-01')).toBe(2);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('the streak', () => {
  it('grows a day at a time, once a day, and starts again after two days missed', () => {
    const s: Streak = { days: 0, best: 0 };
    expect(playedOn(s, D)).toMatchObject({ days: 1, grew: true });
    expect(playedOn(s, D)).toMatchObject({ days: 1, grew: false });
    expect(playedOn(s, addDays(D, 1)).days).toBe(2);
    expect(playedOn(s, addDays(D, 2)).days).toBe(3);
    // (two days missed: over)
    expect(playedOn(s, addDays(D, 5))).toMatchObject({ days: 1, forgave: false });
    expect(s.best).toBe(3);
  });

  it('forgives one missed day a week, not two', () => {
    const s: Streak = { days: 0, best: 0 };
    playedOn(s, D);
    playedOn(s, addDays(D, 1));
    // (a day missed: forgiven, the streak goes on)
    expect(playedOn(s, addDays(D, 3))).toMatchObject({ days: 3, forgave: true });
    // (another missed within the week: not)
    expect(playedOn(s, addDays(D, 5))).toMatchObject({ days: 1, forgave: false });
  });

  it('is alive today if played today or yesterday (or the day before, with a miss to forgive)', () => {
    const s: Streak = { last: D, days: 4, best: 4 };
    expect(streakNow(s, D)).toBe(4);
    expect(streakNow(s, addDays(D, 1))).toBe(4);
    expect(streakNow(s, addDays(D, 2))).toBe(4);
    expect(streakNow({ ...s, forgiven: addDays(D, -1) }, addDays(D, 2))).toBe(0);
    expect(streakNow(s, addDays(D, 3))).toBe(0);
    expect(streakDue(s, D)).toBe(false);
    expect(streakDue(s, addDays(D, 1))).toBe(true);
  });

  it('earns the rewards as it reaches them, once, and they stay with the best streak', () => {
    const s: Streak = { days: 0, best: 0 };
    const got: string[] = [];
    for (let k = 0; k < 30; k++) got.push(...playedOn(s, addDays(D, k)).rewards.map((r) => r.id));
    expect(got).toEqual(REWARDS.map((r) => r.id));
    playedOn(s, addDays(D, 40));
    expect(earned(s.best).length).toBe(REWARDS.length);
    expect(nextReward(5)?.days).toBe(7);
    expect(nextReward(30)).toBeUndefined();
  });

  it("carries a Daily Challenge streak over from before, and keeps what's saved", () => {
    expect(loadStreak({ last: D, streak: 5 })).toMatchObject({ last: D, days: 5, best: 5 });
    saveStreak({ last: D, days: 2, best: 9 });
    expect(loadStreak({ last: D, streak: 5 })).toMatchObject({ days: 2, best: 9 });
  });
});

describe('the daily missions', () => {
  it('three a day, an easy one, a harder one and one further afield; the same for everyone, and a new three most days', () => {
    expect(missionsOn(D)).toHaveLength(3);
    expect(missionsOn(D).map((m) => m.id)).toEqual(missionsOn(D).map((m) => m.id));
    expect(new Set(missionsOn(D).map((m) => m.id)).size).toBe(3);
    const weeks = new Set(Array.from({ length: 14 }, (_, k) => missionsOn(addDays(D, k)).map((m) => m.id).join()));
    expect(weeks.size).toBeGreaterThan(10);
  });

  it('every mission can be done, and has words short enough for the menu', () => {
    expect(new Set(MISSIONS.map((m) => m.id)).size).toBe(MISSIONS.length);
    const events: PlayEvent[] = [
      raceAt({ place: 1, grid: 10, fastest: true, clean: true, weather: 'wet' }), { kind: 'lap' }, { kind: 'launch', great: true }, { kind: 'pit' },
      { kind: 'trial-lap', record: true }, { kind: 'attack', passed: 12, daily: true }, ...MISSION_CIRCUITS.map((c) => raceAt({ circuit: c.id })),
    ];
    for (const m of MISSIONS) {
      const best = Math.max(...events.map((e) => m.count(e)));
      expect(best, m.id).toBeGreaterThan(0);
      expect(m.text.length, m.id).toBeLessThanOrEqual(34);
    }
  });

  it('sends you only to circuits everyone has', () => {
    const open = new Set([LAYOUTS[0].id, ...FREE_LAYOUTS.map((l) => l.id)]);
    for (const c of MISSION_CIRCUITS) expect(open.has(c.id)).toBe(true);
  });

  it('counts towards the day’s three: a total, or the best in one go', () => {
    const day = '2026-10-09';
    const p = loadProgress(day);
    const [easy, medium, far] = missionsOn(day);
    // (whatever the day's are: done by enough of what each counts)
    const doing = (m: typeof easy): PlayEvent => (m.id === 'races' || m.id === 'top5' ? raceAt({ place: 1 }) : m.id === 'laps' ? { kind: 'lap' } : m.id === 'launches' ? { kind: 'launch', great: false } : { kind: 'pit' });
    let done = 0;
    for (let k = 0; k < 10 && !isDone(p, easy); k++) done += count(p, doing(easy)).done.length;
    expect(isDone(p, easy)).toBe(true);
    expect(progressOf(p, easy)).toBe(easy.goal);
    expect(done).toBe(1);
    // (and one done stays done: counted no further)
    expect(count(p, doing(easy)).done).toEqual([]);
    expect([medium, far].length).toBe(2);
  });

  it('a best-in-one-go mission takes the best, not the total', () => {
    // (a day that has CLEAR 8 SECTORS IN A TIME ATTACK)
    let day = D;
    while (!missionsOn(day).some((m) => m.id === 'attack')) day = addDays(day, 1);
    const p = loadProgress(day);
    count(p, { kind: 'attack', passed: 5, daily: false });
    count(p, { kind: 'attack', passed: 6, daily: false });
    const attack = MISSIONS.find((m) => m.id === 'attack')!;
    expect(progressOf(p, attack)).toBe(6);
    expect(count(p, { kind: 'attack', passed: 9, daily: false }).done.map((m) => m.id)).toEqual(['attack']);
  });
});

describe('playing today', () => {
  it('keeps the streak going on the first play of the day, and says so once', () => {
    const first = played(raceAt(), D);
    expect(first.streak).toMatchObject({ days: 1 });
    expect(played(raceAt(), D).streak).toBeUndefined();
    expect(played(raceAt(), addDays(D, 1)).streak).toMatchObject({ days: 2 });
  });

  it("a lap or a launch counts for missions, not for the streak", () => {
    expect(played({ kind: 'lap' }, D).streak).toBeUndefined();
    expect(played({ kind: 'launch', great: true }, D).streak).toBeUndefined();
  });

  it('the streak achievements at 7 and 30 days, BUSY DAY for all three missions', () => {
    let news = played(raceAt(), D);
    for (let k = 1; k < 7; k++) news = played(raceAt(), addDays(D, k));
    expect(news.achievements).toContain('regular');
    expect(news.streak?.rewards.map((r) => r.id)).toEqual(['neon-helmet']);
    for (const id of ['regular', 'devoted', 'busy-day']) expect(ACHIEVEMENTS.some((a) => a.id === id)).toBe(true);
  });
});

describe('your car style', () => {
  it('STANDARD, and the looks your best streak has earned; one not earned falls back to STANDARD', () => {
    expect(stylesFor(0).map((s) => s.id)).toEqual(['standard']);
    expect(stylesFor(7).map((s) => s.id)).toEqual(['standard', 'silver-helmet', 'neon-helmet']);
    setCarStyle(CAR_STYLES.find((s) => s.id === 'black-gold')!);
    expect(carStyle(14).id).toBe('standard');
    expect(carStyle(30).id).toBe('black-gold');
    save('choices', 'carStyle', 'nonsense');
    expect(carStyle(30).id).toBe('standard');
  });

  it("puts the style over your team's livery", () => {
    const team = { body: '#ff0000', stripe: '#00ff00', helmet: 'gold' as const };
    expect(styled(team, CAR_STYLES[0])).toEqual(team);
    expect(styled(team, CAR_STYLES.find((s) => s.id === 'neon-helmet')!)).toMatchObject({ body: '#ff0000', helmet: '#39ff14' });
    expect(styled(team, CAR_STYLES.find((s) => s.id === 'black-gold')!)).toMatchObject({ body: '#17161f', stripe: '#f2c14e' });
  });
});

describe('the daily reminder', () => {
  it("planned a week ahead at the hour picked: from today if you haven't played, else from tomorrow", async () => {
    const { plan, PLAN_DAYS } = await import('../src/f1/reminder');
    const morning = new Date(2026, 9, 8, 8, 0);
    const fresh = plan(morning, 18);
    expect(fresh).toHaveLength(PLAN_DAYS);
    expect(fresh[0].at).toEqual(new Date(2026, 9, 8, 18, 0));
    expect(new Set(fresh.map((n) => n.id)).size).toBe(PLAN_DAYS);
    // (an hour already gone today: from tomorrow)
    expect(plan(new Date(2026, 9, 8, 19, 0), 18)[0].at).toEqual(new Date(2026, 9, 9, 18, 0));
    // (played today: none today)
    saveStreak({ last: '2026-10-08', days: 3, best: 3 });
    const after = plan(morning, 18);
    expect(after[0].at).toEqual(new Date(2026, 9, 9, 18, 0));
    expect(after).toHaveLength(PLAN_DAYS - 1);
  });

  it('says the day’s challenge, and your streak while it lasts', async () => {
    const { plan, reminderText } = await import('../src/f1/reminder');
    const { challengeOn } = await import('../src/f1/daily');
    saveStreak({ last: '2026-10-08', days: 3, best: 3 });
    const [tomorrow, , third] = plan(new Date(2026, 9, 8, 8, 0), 18);
    expect(tomorrow.title).toContain('3-day streak');
    // (two days missed by then, with one forgiven at most: no streak to keep)
    expect(third.title).not.toContain('streak');
    const t = reminderText('2026-10-09', 0);
    expect(t.body).toContain(challengeOn('2026-10-09').layout.name);
  });
});
