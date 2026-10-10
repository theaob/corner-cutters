// The daily reminder, in the Android app: a notification at the hour you pick (DAILY REMINDER in the settings) on a
// day you haven't played yet, with the day's Daily Challenge and your streak in it. Planned on the device a week at a
// time (a fresh week each time the app's opened or put away: played today, today's is dropped), so a player who stops
// coming hears no more after a week. Asked for once, on the menu, after a first day's play. Nothing leaves the device.

import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { save, saved } from '../engine/save';
import { challengeOn, dayOf, loadDaily } from './daily';
import { addDays, loadStreak, localDay, streakNow } from './streak';

/** The hours it can come at (local time); off is OFF. */
export const REMINDER_HOURS = [9, 12, 18, 20] as const;
export type ReminderSetting = 'off' | (typeof REMINDER_HOURS)[number];
/** the hour suggested on asking */
export const SUGGESTED_HOUR = 18;
/** days planned ahead */
export const PLAN_DAYS = 7;
/** the notifications' ids: the first day's, then one a day */
const FIRST_ID = 4100;

/** Whether this build can remind: the app (not a browser). */
export const remindersHere = (): boolean => Capacitor.isNativePlatform();

/** The setting: off, an hour, or never asked (undefined). */
export function reminderSetting(): ReminderSetting | undefined {
  const v = saved('settings', 'reminder');
  return v === 'off' || REMINDER_HOURS.includes(v as (typeof REMINDER_HOURS)[number]) ? (v as ReminderSetting) : undefined;
}

/** A reminder's words for `day` (your streak as it would stand then, the day's challenge). */
export function reminderText(day: string, streakDays: number): { title: string; body: string } {
  const c = challengeOn(day);
  const what = `${c.layout.name} · ${c.weather.name.toLowerCase()}`;
  return streakDays > 0
    ? { title: `Keep your ${streakDays}-day streak going`, body: `Today's Daily Challenge: ${what}. Three new missions too.` }
    : { title: "Today's Daily Challenge", body: `${what}. Three new missions, and a streak to start.` };
}

/** The reminders due from `now`: one a day at `hour` for PLAN_DAYS days, from tomorrow if you've played today. */
export function plan(now: Date, hour: number): { id: number; at: Date; title: string; body: string }[] {
  const s = loadStreak(loadDaily());
  const today = localDay(now);
  const out = [];
  for (let k = s.last === today ? 1 : 0; k < PLAN_DAYS; k++) {
    const day = addDays(today, k);
    const [y, m, d] = day.split('-').map(Number);
    const at = new Date(y, m - 1, d, hour, 0, 0);
    if (at.getTime() <= now.getTime() + 60000) continue;
    out.push({ id: FIRST_ID + k, at, ...reminderText(dayOf(at), streakNow(s, day)) });
  }
  return out;
}

/** Whether the app may show notifications (asking first, if `ask`). */
async function allowed(ask: boolean): Promise<boolean> {
  try {
    let p = await LocalNotifications.checkPermissions();
    if (p.display !== 'granted' && ask) p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
  } catch {
    return false;
  }
}

/** The week's reminders planned afresh, as the setting has them (cancelled when it's off). */
export async function planReminders(): Promise<void> {
  if (!remindersHere()) return;
  const ids = Array.from({ length: PLAN_DAYS }, (_, k) => FIRST_ID + k);
  try {
    const setting = reminderSetting();
    const on = typeof setting === 'number' && (await allowed(false));
    const due = on ? plan(new Date(), setting) : [];
    // (scheduled first, over the same ids, and only what's no longer due cancelled after: this runs as the app's put
    // away, and a webview stopped between a cancel and a schedule would leave the week with no reminders at all)
    if (due.length) {
      await LocalNotifications.schedule({
        notifications: due.map((n) => ({ id: n.id, title: n.title, body: n.body, schedule: { at: n.at, allowWhileIdle: true }, isExactNotification: false, extra: { open: 'daily' } })),
      });
    }
    const kept = new Set(due.map((n) => n.id));
    const rest = ids.filter((id) => !kept.has(id));
    if (rest.length) await LocalNotifications.cancel({ notifications: rest.map((id) => ({ id })) });
  } catch (e) {
    // (no reminders this time: the game goes on, with the reason in the logbook)
    console.warn('daily reminders not planned:', e);
  }
}

/** Set the reminder (asking for leave to notify when it's an hour): what it ends up as (off, if leave was refused). */
export async function setReminder(setting: ReminderSetting): Promise<ReminderSetting> {
  const got = setting !== 'off' && !(await allowed(true)) ? 'off' : setting;
  save('settings', 'reminder', got);
  await planReminders();
  return got;
}

/** Whether to ask now: the app, never asked, and a day played already. */
export const shouldAsk = (): boolean => remindersHere() && reminderSetting() === undefined && !!loadStreak(loadDaily()).last;

/** A tap on a reminder opens the Daily Challenge: `open` is told. */
export function onReminderTapped(open: () => void): void {
  if (!remindersHere()) return;
  void LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    if (a.notification.extra?.open === 'daily') open();
  }).catch(() => {});
}
