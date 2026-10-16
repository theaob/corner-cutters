// The settings rows shared by the menu's SETTINGS screen and the pause screen:
// the screen's shape (SCREEN: HANDHELD or WIDE, where the device can switch), the text's size (TEXT) and the
// colours (COLOURS: COLOUR-SAFE for colour blindness; access.ts), which side the thumbstick sits on, how the controls drive (DRIVING), vibration, screen shake, the grid walk
// before a race, and the sound and music volumes, each changed with left/right (or a tap or swipe) and remembered
// as it changes. Difficulty is the menu's alone (not changed mid-race).

import { setStickSide, stickSide, type StickSide } from '../engine/deck';
import { setVibration, vibrate, vibrationOn } from '../engine/haptics';
import { VOLUMES, setSoundVolume, soundVolume } from '../engine/audio';
import { musicVolume, setMusicVolume } from '../engine/music';
import { menuButton, optionRow } from './circuitSelect';
import { setShake, shakeOn } from './shake';
import { gridWalkOn, setGridWalk } from './gridPan';
import { DRIVE_STYLES, driveStyle, setDriveStyle } from './driveStyle';
import { INITIALS, initials, setInitials, setStats, statsOn } from './profile';
import { online } from '../engine/backend';
import type { LayoutMode } from '../engine/layout';
import { colourSafe, largeText, MOTION_SETTINGS, motionSetting, setColourSafe, setLargeText, setMotionSetting, type MotionSetting } from './access';
import { REMINDER_HOURS, reminderSetting, remindersHere, setReminder, type ReminderSetting } from './reminder';

/** The page's layout, as the page (src/app.ts) switches it: the one now, whether this device can switch, and a switch. */
export interface LayoutSwitch {
  now(): LayoutMode;
  can(): boolean;
  set(mode: LayoutMode): void;
}
let layoutSwitch: LayoutSwitch | undefined;
/** The page hands over its layout switch, for the SCREEN row. */
export function useLayoutSwitch(s: LayoutSwitch): void {
  layoutSwitch = s;
}

/** The nearest volume step to `v`. */
const nearest = (v: number) => VOLUMES.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
const volumeName = (v: number) => ['OFF', 'LOW', 'MEDIUM', 'HIGH'][VOLUMES.indexOf(v as (typeof VOLUMES)[number])];

export type SettingsRow = ReturnType<typeof optionRow<unknown>>;

/** The settings' pages: CONTROLS (how you drive), GAME (how it plays), SOUND and ACCESSIBILITY (text size, colours, camera shake). */
export type SettingsSection = 'controls' | 'game' | 'sound' | 'access';
export const SETTINGS_SECTIONS: SettingsSection[] = ['controls', 'game', 'sound', 'access'];
const SECTION_ABOUT: Record<SettingsSection, string> = { controls: 'CONTROLS', game: 'GAME', sound: 'SOUND', access: 'ACCESSIBILITY' };

/** The rows, read from the save as they are now, by page. */
export function settingsRows(): Record<SettingsSection, SettingsRow[]> {
  const deck = document.getElementById('deck');
  const sides: StickSide[] = ['left', 'right'];
  const stickRow = optionRow('STICK', sides, stickSide(), (side) => ({ name: side.toUpperCase(), about: side === 'left' ? 'thumbstick left · A and B right' : 'thumbstick right · A and B left' }), (side) => {
    if (deck) setStickSide(deck, side);
  });
  const drivingRow = optionRow('DRIVING', DRIVE_STYLES, driveStyle(), (s) => ({
    name: s.toUpperCase(),
    about: s === 'auto' ? 'touch points the way · keys and pads steer' : s === 'point' ? 'the car goes where you point' : 'touch: a slider, gas and brake · keys and pads steer',
  }), setDriveStyle);
  const vibrationRow = optionRow('VIBRATION', [true, false], vibrationOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, grass, kerbs' : 'no buzzing' }), (on) => {
    setVibration(on);
    vibrate(40);
  });
  const soundRow = optionRow('SOUND', [...VOLUMES], nearest(soundVolume()), (v) => ({ name: volumeName(v), about: v ? 'engines, tyres, crashes, lights' : 'silence' }), setSoundVolume);
  const musicRow = optionRow('MUSIC', [...VOLUMES], nearest(musicVolume()), (v) => ({ name: volumeName(v), about: v ? 'menu and race tracks' : 'silence' }), setMusicVolume);
  const shakeRow = optionRow('SCREEN SHAKE', [true, false], shakeOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, kerbs and grass shake the camera' : 'the camera stays still' }), setShake);
  const gridWalkRow = optionRow('GRID WALK', [true, false], gridWalkOn(), (on) => ({ name: on ? 'ON' : 'SKIP', about: on ? 'the camera down the grid before the lights' : 'straight to the start lights' }), setGridWalk);
  const statsRow = optionRow('STATS', [true, false], statsOn(), (on) => ({ name: on ? 'SHARE' : 'OFF', about: on ? 'anonymous play counts, to improve the game' : 'nothing sent' }), setStats);
  // SCREEN: the handheld (a phone's shape, the deck under it) or the wide screen (the whole window, the deck over it as
  // a HUD); only on a device with a mouse or trackpad (or already wide), where it was the deck's WIDE button
  const layouts: LayoutMode[] = ['handheld', 'desktop'];
  const screenRow = layoutSwitch && (layoutSwitch.can() || layoutSwitch.now() === 'desktop')
    ? optionRow('SCREEN', layouts, layoutSwitch.now(), (m) => ({ name: m === 'desktop' ? 'WIDE' : 'HANDHELD', about: m === 'desktop' ? 'the whole window · V switches' : "a phone's shape · V switches" }), (m) => layoutSwitch?.set(m))
    : undefined;
  const textRow = optionRow('TEXT', [false, true], largeText(), (on) => ({ name: on ? 'LARGE' : 'NORMAL', about: on ? 'menus and messages a size up' : 'the standard size' }), setLargeText);
  const coloursRow = optionRow('COLOURS', [false, true], colourSafe(), (on) => ({ name: on ? 'COLOUR-SAFE' : 'STANDARD', about: on ? 'splits in blue, white, orange, and in words' : 'splits in purple, green, amber' }), setColourSafe);
  const MOTION_ABOUT: Record<MotionSetting, { name: string; about: string }> = {
    auto: { name: 'PHONE', about: "follows your phone's reduce-motion setting" },
    reduced: { name: 'REDUCED', about: 'less movement, whatever the phone says' },
    full: { name: 'FULL', about: 'all the movement, whatever the phone says' },
  };
  const motionRow = optionRow('MOTION', MOTION_SETTINGS, motionSetting(), (m) => MOTION_ABOUT[m], setMotionSetting);
  // NAME: your three letters on the timing screens and the boards, typed (the phone's keyboard comes up), as on an arcade board
  const nameRow = (() => {
    const el = document.createElement('div');
    el.className = 'option-row';
    const label = Object.assign(document.createElement('b'), { textContent: 'NAME' });
    const right = document.createElement('div');
    right.className = 'value';
    const field = document.createElement('input');
    Object.assign(field, { type: 'text', maxLength: 3, autocomplete: 'off', spellcheck: false, value: initials() ?? '', placeholder: 'YOU' });
    field.setAttribute('autocapitalize', 'characters');
    field.setAttribute('enterkeyhint', 'done');
    field.setAttribute('aria-label', 'Your three letters');
    Object.assign(field.style, { width: '4.5em', textAlign: 'center', font: 'inherit', textTransform: 'uppercase' });
    const about = Object.assign(document.createElement('span'), { textContent: 'three letters or digits, for races and boards' });
    field.addEventListener('input', () => {
      const clean = field.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      if (clean !== field.value) field.value = clean;
      if (INITIALS.test(clean)) setInitials(clean);
    });
    right.append(field, about);
    el.append(label, right);
    return { el, step: () => {}, value: () => initials(), refresh: () => { field.value = initials() ?? ''; } };
  })();
  // DAILY REMINDER (the app): a notification at that hour on a day not yet played (reminder.ts)
  const reminderRow = remindersHere()
    ? optionRow<ReminderSetting>('DAILY REMINDER', ['off', ...REMINDER_HOURS], reminderSetting() ?? 'off', (v) => ({
      name: v === 'off' ? 'OFF' : `${String(v).padStart(2, '0')}:00`,
      about: v === 'off' ? 'no notifications' : "on a day you haven't played: the Daily Challenge and your streak",
    }), (v) => void setReminder(v))
    : undefined;
  // (STATS only where the build has a backend to send them to)
  // (the page for what doesn't clearly fit: the daily reminder, STATS and the screen are about the game)
  return {
    controls: [stickRow, drivingRow, vibrationRow],
    game: [nameRow, ...(reminderRow ? [reminderRow] : []), ...(screenRow ? [screenRow] : []), gridWalkRow, ...(online() ? [statsRow] : [])],
    sound: [soundRow, musicRow],
    access: [textRow, coloursRow, motionRow, shakeRow],
  } as Record<SettingsSection, SettingsRow[]>;
}

/**
 * The settings as pages: a list (CONTROLS, GAME, SOUND, DONE), and a page of rows under each (and BACK). One for the
 * menu's screen and one for the pause screen's; they share how it is moved (up/down, left/right, A) and drawn.
 * `onDone` is called when the list is left.
 */
export function settingsPages(rows: Record<SettingsSection, SettingsRow[]>, onDone: () => void) {
  let page: SettingsSection | undefined;
  let focus = 0;
  const title = document.createElement('h2');
  const open = (s: SettingsSection) => {
    page = s;
    focus = 0;
    render();
  };
  const back = () => {
    if (page) {
      focus = SETTINGS_SECTIONS.indexOf(page);
      page = undefined;
      render();
    } else onDone();
  };
  const links = SETTINGS_SECTIONS.map((s) => menuButton(SECTION_ABOUT[s], () => open(s)));
  const end = menuButton('◀ BACK', back);
  end.classList.add('settings-done');
  const version = versionLine();
  const els: HTMLElement[] = [title, ...links, ...SETTINGS_SECTIONS.flatMap((s) => rows[s].map((r) => r.el)), end, version];
  const shown = () => (page ? rows[page] : links);
  /** how many places up/down moves between: the page's rows (or the list) and the button at the end */
  const places = () => shown().length + 1;
  const render = () => {
    title.textContent = page ? SECTION_ABOUT[page] : 'SETTINGS';
    title.style.display = '';
    end.style.display = '';
    links.forEach((b, k) => {
      b.style.display = page ? 'none' : '';
      b.classList.toggle('focused', !page && focus === k);
    });
    for (const s of SETTINGS_SECTIONS) rows[s].forEach((r, k) => {
      r.el.style.display = s === page ? '' : 'none';
      r.el.classList.toggle('focused', s === page && focus === k);
    });
    end.textContent = '◀ BACK';
    end.classList.toggle('focused', focus === shown().length);
    version.style.display = page ? 'none' : '';
  };
  // a tap on a row focuses it too
  for (const s of SETTINGS_SECTIONS) rows[s].forEach((r, k) => r.el.addEventListener('pointerdown', () => {
    focus = k;
    render();
  }));
  render();
  return {
    els,
    /** back to the list, as the page was first opened */
    reset() {
      page = undefined;
      focus = 0;
      render();
    },
    /** up (-1) or down (1) */
    move(d: number) {
      focus = (focus + d + places()) % places();
      render();
    },
    /** left (-1) or right (1) on a row */
    step(d: number) {
      if (page) rows[page][focus]?.step(d);
    },
    /** A or START: opens a page from the list, or goes back */
    pick() {
      if (!page && focus < SETTINGS_SECTIONS.length) open(SETTINGS_SECTIONS[focus]);
      else back();
    },
    /** B or the phone's back button: up a level, and out of the settings from the list */
    back,
    /** shown or hidden (the rows' own displays kept for the page) */
    show(on: boolean) {
      if (on) render();
      else for (const el of els) el.style.display = 'none';
    },
    open: () => page,
  };
}

/** The build's version (package and commit: vite.config.ts) as the settings say it: VERSION 0.0.1 · BUILD 2790585. */
export function versionText(version: string = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : 'dev'): string {
  const [release, build] = version.split('+');
  return `VERSION ${release.toUpperCase()}${build ? ` · BUILD ${build.toUpperCase()}` : ''}`;
}

/** The version line under the settings, centred and quiet. */
export function versionLine(): HTMLElement {
  const p = document.createElement('p');
  p.className = 'version-line';
  p.textContent = versionText();
  return p;
}
