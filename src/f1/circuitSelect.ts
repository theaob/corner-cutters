// The menu shown before a race: each circuit's outline, name and a line about
// it, then your team. On a phone it's all touch (the
// deck is hidden): tap a circuit to race it, swipe a row (or tap its sides) to
// change it. On a keyboard, up/down moves, left/right changes a row, Enter races.

import type { Button } from '../engine/controls';
import { holdTouches, setStickSide, stickSide, type StickSide } from '../engine/deck';
import { setVibration, vibrate, vibrationOn } from '../engine/haptics';
import { VOLUMES, setSoundVolume, soundVolume } from '../engine/audio';
import { musicVolume, setMusicVolume } from '../engine/music';
import { menuPick, menuTick } from './sounds';
import type { Services } from '../engine/services';
import type { CircuitLayout } from './layouts';
import { TEAMS, type Team } from './teams';
import { logoSvg } from './logos';
import { formatTime, loadRecords } from './records';
import { DIFFICULTIES, NORMAL, type Difficulty } from './difficulty';
import { DRY, WEATHERS, type Weather } from './weather';

/** A small outline of the circuit: the centreline, fitted to size×size, with the start marked. */
function outline(layout: CircuitLayout, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2; // drawn at 2× for crisp lines
  const x = c.getContext('2d')!;
  const pts = layout.points;
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const [minX, minY] = [Math.min(...xs), Math.min(...ys)];
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY);
  const pad = 8;
  const k = (c.width - pad * 2) / span;
  const ox = (c.width - (Math.max(...xs) - minX) * k) / 2;
  const oy = (c.height - (Math.max(...ys) - minY) * k) / 2;
  const at = (i: number) => [ox + (pts[i].x - minX) * k, oy + (pts[i].y - minY) * k] as const;
  x.lineJoin = x.lineCap = 'round';
  x.strokeStyle = '#f4f2fa';
  x.lineWidth = 5;
  x.beginPath();
  pts.forEach((_, i) => (i ? x.lineTo(...at(i)) : x.moveTo(...at(i))));
  x.closePath();
  x.stroke();
  const [sx, sy] = at(0);
  x.fillStyle = '#f2c14e';
  x.fillRect(sx - 6, sy - 6, 12, 12);
  Object.assign(c.style, { width: `${size}px`, height: `${size}px` });
  return c;
}

/** Whether the game is running inside another page's frame. */
function framed(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true; // (a cross-origin top can refuse even the comparison)
  }
}

/** A button that opens this page in a tab of its own (the same saves: it's the same site). */
function ownTabButton(): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'own-tab';
  b.textContent = 'SLOW HERE? PLAY IN ITS OWN TAB ↗';
  // on the press's release, not 'click' (in a cross-origin frame on a phone a tap's click can go astray)
  let armed = false;
  b.addEventListener('pointerdown', () => (armed = true));
  b.addEventListener('pointerleave', () => (armed = false));
  b.addEventListener('pointerup', () => {
    if (!armed) return;
    armed = false;
    const tab = window.open(window.location.href, '_blank');
    if (tab) tab.opener = null;
    else b.textContent = 'THE PAGE BLOCKED A NEW TAB';
  });
  return b;
}

/** What the menu comes back with. */
/** What to play: a race weekend, a Time Trial (flying laps against your ghost), or a Championship season. */
export type GameMode = 'race' | 'timetrial' | 'championship';
export const MODES: { id: GameMode; name: string; about: string }[] = [
  { id: 'race', name: 'QUICK RACE', about: 'a race against the field' },
  { id: 'timetrial', name: 'TIME TRIAL', about: 'flying laps against your ghost' },
  { id: 'championship', name: 'CHAMPIONSHIP', about: 'a season: points and standings' },
];

export interface MenuChoice {
  mode: GameMode;
  layout: CircuitLayout;
  team: Team;
  difficulty: Difficulty;
  weather: Weather;
  /** a qualifying lap before the race, to set your place on the grid */
  qualifying: boolean;
}

/** px a finger must travel sideways for a swipe; less than TAP_SLOP counts as a tap */
const SWIPE = 28;
const TAP_SLOP = 12;

/**
 * What a gesture on an option row does: a swipe left is the next value and a
 * swipe right the previous (like a carousel); a tap on the row's left third
 * (its ◀) steps back, anywhere else forward; a short wobble does nothing.
 * `dx` is how far the finger moved sideways (px), `at` where it lifted across the row (0…1).
 */
export function rowGesture(dx: number, at: number): -1 | 0 | 1 {
  if (Math.abs(dx) >= SWIPE) return dx < 0 ? 1 : -1;
  if (Math.abs(dx) < TAP_SLOP) return at < 1 / 3 ? -1 : 1;
  return 0;
}

/**
 * A row of options under the circuits: its label and the current value (with a
 * line about it and, for a team, its colours), switched with left/right or a tap.
 */
function optionRow<T>(
  label: string, values: T[], start: T, show: (v: T) => { name: string; about: string; colors?: string[]; icon?: Element }, onChange?: (v: T) => void,
) {
  const el = document.createElement('button');
  el.className = 'option-row';
  let i = Math.max(0, values.indexOf(start));
  const render = () => {
    const v = show(values[i]);
    el.innerHTML = '';
    const top = document.createElement('strong');
    top.textContent = `${label}  ◀ ${v.name} ▶`;
    const about = document.createElement('span');
    about.textContent = v.about;
    el.append(top);
    if (v.colors || v.icon) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      if (v.icon) chips.append(v.icon);
      for (const c of v.colors ?? []) {
        const chip = document.createElement('i');
        chip.style.background = c;
        chips.append(chip);
      }
      el.append(chips);
    }
    el.append(about);
  };
  const step = (by: number) => {
    i = (i + by + values.length) % values.length;
    render();
    menuTick();
    onChange?.(values[i]);
  };
  // swipe it, or tap its sides (the row keeps the finger's events: touch captures to it)
  let startX: number | undefined;
  el.addEventListener('pointerdown', (e) => (startX = e.clientX));
  el.addEventListener('pointercancel', () => (startX = undefined));
  el.addEventListener('pointerup', (e) => {
    if (startX === undefined) return;
    const r = el.getBoundingClientRect();
    const by = rowGesture(e.clientX - startX, (e.clientX - r.left) / Math.max(1, r.width));
    startX = undefined;
    if (by) step(by);
  });
  render();
  return { el, step, value: () => values[i] };
}

/** A menu button, picked on the press's release (not 'click': in a cross-origin frame on a phone a tap's click can go astray). */
export function menuButton(text: string, onPick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'menu-button';
  b.textContent = text;
  let armed = false;
  b.addEventListener('pointerdown', () => (armed = true));
  b.addEventListener('pointerleave', () => (armed = false));
  b.addEventListener('pointerup', () => {
    if (armed) onPick();
    armed = false;
  });
  return b;
}

/**
 * Show the menu in `host` until a circuit is picked: `initial` highlighted
 * first, and your team `team` as last chosen.
 */
export function chooseCircuit(
  host: HTMLElement,
  services: Services,
  layouts: CircuitLayout[],
  initial?: CircuitLayout,
  team: Team = TEAMS[0],
  difficulty: Difficulty = NORMAL,
  weather: Weather = DRY,
  qualifying = false,
  mode: GameMode = 'race',
  /** the circuits open for a Quick Race or a Time Trial (the rest are reached in a Championship) */
  open: ReadonlySet<string> = new Set(layouts.map((l) => l.id)),
  /** closes the menu without a choice (the player went elsewhere: the browser's back or forward button) */
  closed?: AbortSignal,
): Promise<MenuChoice> {
  const { controls, hud } = services;
  const menu = document.createElement('div');
  menu.className = 'circuit-menu';
  const title = document.createElement('h1');
  title.textContent = 'CORNER CUTTERS';
  const hint = document.createElement('p');
  hint.textContent = 'TAP A CIRCUIT TO RACE · SWIPE TO CHANGE';
  const list = document.createElement('ul');
  menu.append(title, hint, list);

  /** the circuit A or START races (the last one moved to) */
  let selected = Math.max(0, layouts.indexOf(initial!));
  // (a circuit that's locked isn't highlighted first)
  if (!open.has(layouts[selected].id)) selected = Math.max(0, layouts.findIndex((l) => open.has(l.id)));
  /** where up/down is: on the menu a circuit (0…), then the team, weather and qualifying rows, then SETTINGS; in the settings, a row, then DONE */
  let focus = selected;
  /** the menu, or the settings screen over it */
  let view: 'menu' | 'settings' = 'menu';
  /** the button a press started on: lifting on the same button picks it */
  let armed: number | undefined;
  let finish: (l: CircuitLayout) => void = () => {};

  const modeRow = optionRow('MODE', MODES, MODES.find((m) => m.id === mode) ?? MODES[0], (m) => ({ name: m.name, about: m.about }));
  const teamRow = optionRow('TEAM', TEAMS, team, (t) => ({ name: t.name.toUpperCase(), about: t.code, colors: [t.body, t.trim, ...(t.accent ? [t.accent] : [])], icon: logoSvg(t.id, 30) }));
  const weatherRow = optionRow('WEATHER', WEATHERS, weather, (w) => ({ name: w.name, about: w.about }));
  const qualifyingRow = optionRow('QUALIFYING', [false, true], qualifying, (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'one flying lap sets your grid slot' : 'start mid-grid' }));
  const rows = [modeRow, teamRow, weatherRow, qualifyingRow];

  // the settings screen: difficulty, which side the thumbstick sits on, vibration, sound and music volumes
  const deck = document.getElementById('deck');
  const difficultyRow = optionRow('DIFFICULTY', DIFFICULTIES, difficulty, (d) => ({ name: d.name, about: d.about }));
  const sides: StickSide[] = ['left', 'right'];
  const stickRow = optionRow('STICK', sides, stickSide(), (side) => ({ name: side.toUpperCase(), about: side === 'left' ? 'thumbstick left · A and B right' : 'thumbstick right · A and B left' }), (side) => {
    if (deck) setStickSide(deck, side);
  });
  const vibrationRow = optionRow('VIBRATION', [true, false], vibrationOn(), (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'crashes, grass, kerbs' : 'no buzzing' }), (on) => {
    setVibration(on);
    vibrate(40);
  });
  // (the nearest step to the saved volume)
  const volumeNow = VOLUMES.reduce((a, b) => (Math.abs(b - soundVolume()) < Math.abs(a - soundVolume()) ? b : a));
  const soundRow = optionRow('SOUND', [...VOLUMES], volumeNow, (v) => ({ name: ['OFF', 'LOW', 'MEDIUM', 'HIGH'][VOLUMES.indexOf(v as (typeof VOLUMES)[number])], about: v ? 'engines, tyres, crashes, lights' : 'silence' }), (v) => {
    setSoundVolume(v);
  });
  const musicNow = VOLUMES.reduce((a, b) => (Math.abs(b - musicVolume()) < Math.abs(a - musicVolume()) ? b : a));
  const musicRow = optionRow('MUSIC', [...VOLUMES], musicNow, (v) => ({ name: ['OFF', 'LOW', 'MEDIUM', 'HIGH'][VOLUMES.indexOf(v as (typeof VOLUMES)[number])], about: v ? 'menu and race tracks' : 'silence' }), (v) => {
    setMusicVolume(v);
  });
  const settingsRows = [difficultyRow, stickRow, vibrationRow, soundRow, musicRow];
  const settingsTitle = document.createElement('h2');
  settingsTitle.textContent = 'SETTINGS';
  const openSettings = () => {
    menuPick();
    view = 'settings';
    focus = 0;
    show();
  };
  const closeSettings = () => {
    menuPick();
    view = 'menu';
    focus = layouts.length + rows.length;
    show();
  };
  const settingsButton = menuButton('SETTINGS', openSettings);
  const doneButton = menuButton('DONE', closeSettings);

  const records = loadRecords();
  const buttons = layouts.map((layout, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const name = document.createElement('strong');
    name.textContent = layout.name;
    const about = document.createElement('span');
    const locked = !open.has(layout.id);
    about.textContent = locked ? 'LOCKED · REACH IT IN A CHAMPIONSHIP' : layout.about;
    if (locked) b.classList.add('locked');
    const text = document.createElement('div');
    text.append(name, about);
    // your lap record here, once you have one
    const best = records.circuits[layout.id]?.bestLap;
    if (best !== undefined) {
      const record = document.createElement('span');
      record.className = 'record';
      record.textContent = `LAP RECORD ${formatTime(best)}`;
      text.append(record);
    }
    b.append(outline(layout, 56), text);
    // picked on the pointer's press and release, not 'click': in a cross-origin frame on a phone
    // the click a tap turns into can land on the wrong button
    let downX = 0;
    b.addEventListener('pointerdown', (e) => {
      armed = i;
      downX = e.clientX;
      selected = focus = i;
      show();
      try {
        b.releasePointerCapture(e.pointerId); // (touch captures to the button: let pointerup find where the finger lifts)
      } catch {
        // nothing to release
      }
    });
    b.addEventListener('pointerup', (e) => {
      // a tap races; a finger dragged across (a swipe that started here) doesn't
      if (armed === i && Math.abs(e.clientX - downX) < TAP_SLOP) finish(layouts[i]);
      armed = undefined;
    });
    b.addEventListener('pointerleave', () => (armed = undefined));
    li.append(b);
    list.append(li);
    return b;
  });
  const tab = framed() ? ownTabButton() : undefined;
  const menuParts: HTMLElement[] = [hint, list, ...rows.map((r) => r.el), settingsButton, ...(tab ? [tab] : [])];
  const settingsParts: HTMLElement[] = [settingsTitle, ...settingsRows.map((r) => r.el), doneButton];
  const show = () => {
    for (const el of menuParts) el.style.display = view === 'menu' ? '' : 'none';
    for (const el of settingsParts) el.style.display = view === 'settings' ? '' : 'none';
    buttons.forEach((b, i) => b.classList.toggle('selected', i === selected));
    rows.forEach((r, k) => r.el.classList.toggle('focused', view === 'menu' && focus === layouts.length + k));
    settingsButton.classList.toggle('focused', view === 'menu' && focus === layouts.length + rows.length);
    settingsRows.forEach((r, k) => r.el.classList.toggle('focused', view === 'settings' && focus === k));
    doneButton.classList.toggle('focused', view === 'settings' && focus === settingsRows.length);
  };
  // a tap on a row focuses it too
  rows.forEach((r, k) => r.el.addEventListener('pointerdown', () => {
    focus = layouts.length + k;
    show();
  }));
  settingsRows.forEach((r, k) => r.el.addEventListener('pointerdown', () => {
    focus = k;
    show();
  }));
  menu.append(...rows.map((r) => r.el), settingsButton, ...settingsParts);
  // embedded in another site's page (itch.io), the browser may hold the game to 30 fps (Safari
  // does, in a frame it doesn't count as played with): offer the game in a tab of its own
  if (tab) menu.append(tab);
  show();
  holdTouches(menu);
  host.append(menu);
  hud.setPosition('');
  hud.setLap('');
  hud.setLabel('a', 'RACE');
  hud.setLabel('b', '');

  return new Promise((resolve) => {
    const seen = new Map<Button, number>();
    const pressed = (b: Button) => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge;
    };
    let done = false;
    finish = (layout) => {
      if (done) return;
      // a locked circuit: raced only in a Championship (any circuit picked there goes to its screen)
      if (!open.has(layout.id) && modeRow.value().id !== 'championship') {
        menuTick();
        hint.textContent = `${layout.name.toUpperCase()}: REACH IT IN A CHAMPIONSHIP TO UNLOCK`;
        return;
      }
      done = true;
      menuPick();
      menu.remove();
      resolve({ mode: modeRow.value().id, layout, team: teamRow.value(), difficulty: difficultyRow.value(), weather: weatherRow.value(), qualifying: qualifyingRow.value() });
    };
    closed?.addEventListener('abort', () => {
      done = true;
      menu.remove();
    });
    const tick = () => {
      if (done) return;
      // poll every button each frame, so a press is never counted late
      const [down, right, up, left, a, start] = (['down', 'right', 'up', 'left', 'a', 'start'] as const).map(pressed);
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (view === 'settings') {
        // the settings: up/down moves, left/right changes a row, A or START (or DONE) goes back
        const places = settingsRows.length + 1;
        if (move) {
          focus = (focus + move + places) % places;
          show();
        }
        const row = settingsRows[focus];
        if (row && (left || right)) row.step(right ? 1 : -1);
        if (a || start) closeSettings();
      } else {
        const places = layouts.length + rows.length + 1;
        if (move) {
          focus = (focus + move + places) % places;
          if (focus < layouts.length) selected = focus;
          show();
        }
        const row = rows[focus - layouts.length];
        if (row && (left || right)) row.step(right ? 1 : -1);
        if ((a || start) && focus === layouts.length + rows.length) openSettings();
        else if (a || start) finish(layouts[selected]);
      }
      if (!done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
