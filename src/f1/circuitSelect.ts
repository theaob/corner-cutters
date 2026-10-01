// The menu shown before a race. First the modes: QUICK RACE, CHAMPIONSHIP, TIME
// ATTACK and TIME TRIAL, a big button each, SETTINGS, and TROPHIES (the
// cabinet: the Championships you've won, and your medals on each circuit). A Championship goes
// straight to its own screen (a season races every circuit); the others go on
// to the circuit: one card at a time (its outline, name, a line about it and
// your record there, dots for where it is in the list), a compact row for each
// of the mode's options (team and weather; a Quick Race's qualifying and laps
// too), the big button that races, and BACK to the modes. On a phone it's all
// touch (the deck is hidden): tap a mode; swipe the card or a row (or tap its
// sides) to change it, tap the card's middle or the race button to race. On a
// keyboard, up/down moves, left/right changes the circuit or a row, Enter picks
// or races, and B goes back.

import type { Button } from '../engine/controls';
import { holdTouches } from '../engine/deck';
import { menuPick, menuTick } from './sounds';
import type { Services } from '../engine/services';
import type { CircuitLayout } from './layouts';
import { TEAMS, type Team } from './teams';
import { logoSvg } from './logos';
import { formatTime, loadRecords } from './records';
import { DIFFICULTIES, NORMAL, type Difficulty } from './difficulty';
import { DRY, WEATHERS, type Weather } from './weather';
import { LAP_CHOICES, RACE_LAPS, lapsAbout } from './laps';
import { distance } from './timeAttack';
import { settingsRows as settingsRowsNow } from './settingsRows';
import { MEDAL_COLOR, MEDAL_NAME, loadTrophies, type Medal } from './medals';
import { medalBadge, trophy } from './screens/celebrate';

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
/** What to play: a race weekend, a Championship season, a Time Attack (beat the clock), or a Time Trial (flying laps against your ghost). */
export type GameMode = 'race' | 'championship' | 'timeattack' | 'timetrial';
export const MODES: { id: GameMode; name: string; about: string }[] = [
  { id: 'race', name: 'QUICK RACE', about: 'a race against the field, your circuit, your laps' },
  { id: 'championship', name: 'CHAMPIONSHIP', about: 'a season: a round on every circuit, points and standings' },
  { id: 'timeattack', name: 'TIME ATTACK', about: 'beat the clock: each sector you pass adds time' },
  { id: 'timetrial', name: 'TIME TRIAL', about: 'flying laps against your ghost' },
];

/** The option rows a mode has on its circuit screen (a Championship has none: it has its own screen). */
export const rowsOf = (mode: GameMode): ('team' | 'weather' | 'qualifying' | 'laps')[] =>
  mode === 'race' ? ['team', 'weather', 'qualifying', 'laps'] : mode === 'championship' ? [] : ['team', 'weather'];

export interface MenuChoice {
  mode: GameMode;
  /** the controls lap again, from the settings, instead of a race */
  controlsLap?: boolean;
  layout: CircuitLayout;
  team: Team;
  difficulty: Difficulty;
  weather: Weather;
  /** a qualifying lap before the race, to set your place on the grid */
  qualifying: boolean;
  /** a Quick Race's laps (a Championship round is always RACE_LAPS) */
  laps: number;
}

/** px a finger must travel sideways for a swipe; less than TAP_SLOP counts as a tap */
const SWIPE = 28;
const TAP_SLOP = 12;

const HINT = 'SWIPE TO CHANGE · TAP THE CIRCUIT TO RACE';
const MODES_HINT = 'PICK A MODE';

/**
 * What a gesture on the circuit card does: a swipe left is the next circuit and
 * a swipe right the one before; a tap on its left or right edge (its ◀ ▶)
 * steps back or on, and a tap in the middle races it; a short wobble does nothing.
 */
export function cardGesture(dx: number, at: number): -1 | 0 | 1 | 'race' {
  if (Math.abs(dx) >= SWIPE) return dx < 0 ? 1 : -1;
  if (Math.abs(dx) >= TAP_SLOP) return 0;
  if (at < 0.2) return -1;
  if (at > 0.8) return 1;
  return 'race';
}

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
export function optionRow<T>(
  label: string, values: T[], start: T, show: (v: T) => { name: string; about: string; colors?: string[]; icon?: Element }, onChange?: (v: T) => void,
) {
  const el = document.createElement('button');
  el.className = 'option-row';
  let i = Math.max(0, values.indexOf(start));
  const render = () => {
    const v = show(values[i]);
    el.innerHTML = '';
    // one line: the label on the left; on the right the value (with its colours) and a line about it
    const name = document.createElement('b');
    name.textContent = label;
    const right = document.createElement('div');
    right.className = 'value';
    const top = document.createElement('strong');
    top.textContent = `◀ ${v.name} ▶`;
    const line = document.createElement('div');
    line.className = 'line';
    if (v.colors || v.icon) {
      const chips = document.createElement('div');
      chips.className = 'chips';
      if (v.icon) chips.append(v.icon);
      for (const c of v.colors ?? []) {
        const chip = document.createElement('i');
        chip.style.background = c;
        chips.append(chip);
      }
      line.append(chips);
    }
    line.append(top);
    const about = document.createElement('span');
    about.textContent = v.about;
    right.append(line, about);
    el.append(name, right);
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
  /** a Quick Race's laps, as last chosen */
  laps: number = RACE_LAPS,
  /** the circuits open for a Quick Race, a Time Attack or a Time Trial (the rest are reached in a Championship) */
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
  hint.textContent = MODES_HINT;
  menu.append(title, hint);

  /** the circuit A or START races (the last one moved to) */
  let selected = Math.max(0, layouts.indexOf(initial!));
  // (a circuit that's locked isn't highlighted first)
  if (!open.has(layouts[selected].id)) selected = Math.max(0, layouts.findIndex((l) => open.has(l.id)));
  /** the mode picked (or, on the modes screen, last picked) */
  let current = MODES.find((m) => m.id === mode) ?? MODES[0];
  /**
   * where up/down is: on the modes screen a mode, then SETTINGS; on the circuit screen the circuit (0), then the mode's
   * rows, then the race button, then BACK; in the settings, a row, then CONTROLS LAP, then DONE
   */
  let focus = MODES.indexOf(current);
  /** the modes, a mode's circuit screen, the settings, or the trophy cabinet */
  let view: 'modes' | 'circuit' | 'settings' | 'trophies' = 'modes';
  let finish: (l: CircuitLayout, controlsLap?: boolean) => void = () => {};

  const teamRow = optionRow('TEAM', TEAMS, team, (t) => ({ name: t.name.toUpperCase(), about: t.code, colors: [t.body, t.trim, ...(t.accent ? [t.accent] : [])], icon: logoSvg(t.id, 20) }));
  const weatherRow = optionRow('WEATHER', WEATHERS, weather, (w) => ({ name: w.name, about: w.about }));
  const qualifyingRow = optionRow('QUALIFYING', [false, true], qualifying, (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'one flying lap sets your grid slot' : 'start mid-grid' }));
  // (a Quick Race's: a Championship round is always RACE_LAPS, and a Time Trial is laps until you stop)
  const lapsRow = optionRow('LAPS', [...LAP_CHOICES], laps, (n) => ({ name: `${n}`, about: lapsAbout(n) }));
  const ROWS = { team: teamRow, weather: weatherRow, qualifying: qualifyingRow, laps: lapsRow };
  /** the rows on the circuit screen, for the mode picked */
  let rows = rowsOf(current.id).map((k) => ROWS[k]);

  // the settings screen: difficulty, then the rows the pause screen has too (src/f1/settingsRows.ts)
  const difficultyRow = optionRow('DIFFICULTY', DIFFICULTIES, difficulty, (d) => ({ name: d.name, about: d.about }));
  const settingsRows = [difficultyRow, ...settingsRowsNow()];
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
    view = 'modes';
    focus = MODES.length;
    show();
  };
  const settingsButton = menuButton('SETTINGS', openSettings);
  // the trophy cabinet: the Championships won, then each circuit's medals in a Time Trial and a Time Attack
  const trophies = loadTrophies();
  const cabinetTitle = document.createElement('h2');
  cabinetTitle.textContent = 'TROPHIES';
  const cabinet = document.createElement('div');
  cabinet.className = 'cabinet';
  /** the medals won so far, each popping in a beat after the one before when the cabinet opens */
  let popped = 0;
  const medalCell = (m?: Medal) => {
    const cell = document.createElement('span');
    cell.className = 'medal';
    if (m) {
      cell.classList.add('won');
      cell.style.setProperty('--delay', `${0.15 + popped++ * 0.08}s`);
      const name = document.createElement('span');
      name.textContent = MEDAL_NAME[m];
      name.style.color = MEDAL_COLOR[m];
      cell.append(medalBadge(m, 14), name);
    } else cell.textContent = '–';
    return cell;
  };
  {
    const titles = document.createElement('div');
    titles.className = 'titles';
    const titleText = document.createElement('span');
    titleText.textContent = trophies.titles ? `× ${trophies.titles} CHAMPIONSHIP${trophies.titles === 1 ? '' : 'S'} WON` : 'NO CHAMPIONSHIPS WON YET';
    titleText.style.color = 'inherit';
    if (trophies.titles) titles.append(trophy(40));
    titles.append(titleText);
    const head = document.createElement('div');
    head.className = 'cabinet-row head';
    for (const t of ['CIRCUIT', 'TIME TRIAL', 'TIME ATTACK']) {
      const c = document.createElement('span');
      c.textContent = t;
      head.append(c);
    }
    const all = layouts.flatMap((l) => [trophies.medals[l.id]?.trial, trophies.medals[l.id]?.attack]);
    const count = (m: Medal) => all.filter((x) => x === m).length;
    const tally = document.createElement('div');
    tally.className = 'tally';
    for (const m of ['gold', 'silver', 'bronze'] as const) {
      const c = document.createElement('span');
      c.className = 'medal won';
      const n = document.createElement('span');
      n.textContent = `${count(m)}`;
      n.style.color = MEDAL_COLOR[m];
      c.append(medalBadge(m, 20), n);
      tally.append(c);
    }
    cabinet.append(titles, tally, head, ...layouts.map((l) => {
      const row = document.createElement('div');
      row.className = 'cabinet-row';
      const name = document.createElement('span');
      name.textContent = l.name.toUpperCase();
      row.classList.toggle('locked', !open.has(l.id));
      row.append(name, medalCell(trophies.medals[l.id]?.trial), medalCell(trophies.medals[l.id]?.attack));
      return row;
    }));
    const how = document.createElement('p');
    how.textContent = 'A LAP OR A RUN AS QUICK AS THE QUICKEST AI ON EASY: BRONZE · NORMAL: SILVER · HARD: GOLD';
    cabinet.append(how);
  }
  const openCabinet = () => {
    menuPick();
    view = 'trophies';
    show();
  };
  const closeCabinet = () => {
    menuPick();
    view = 'modes';
    focus = MODES.length + 1;
    show();
  };
  const trophiesButton = menuButton('TROPHIES', openCabinet);
  const cabinetDone = menuButton('DONE', closeCabinet);
  const doneButton = menuButton('DONE', closeSettings);
  // the controls lap again (a new player gets it on first launch)
  const controlsButton = menuButton('CONTROLS LAP', () => finish(layouts[0], true));

  // the circuits: one card at a time, swiped (or its sides tapped) to the next, tapped in the middle to race;
  // dots under it for where it is in the list
  const records = loadRecords();
  const card = document.createElement('button');
  card.className = 'circuit-card';
  const dots = document.createElement('div');
  dots.className = 'dots';
  const renderCard = () => {
    const layout = layouts[selected];
    const locked = !open.has(layout.id);
    card.innerHTML = '';
    card.classList.toggle('locked', locked);
    const prev = document.createElement('em');
    prev.textContent = '◀';
    const next = document.createElement('em');
    next.textContent = '▶';
    const name = document.createElement('strong');
    name.textContent = layout.name;
    const about = document.createElement('span');
    about.textContent = locked ? 'LOCKED · REACH IT IN A CHAMPIONSHIP' : layout.about;
    const text = document.createElement('div');
    text.append(name, about);
    // your record here, once you have one: in a Time Attack the furthest you've got, else your fastest lap
    const here = records.circuits[layout.id];
    const best = current.id === 'timeattack' ? (here?.bestAttack ? `BEST ${distance(here.bestAttack)}` : undefined) : here?.bestLap !== undefined ? `LAP RECORD ${formatTime(here.bestLap)}` : undefined;
    if (best) {
      const record = document.createElement('span');
      record.className = 'record';
      record.textContent = best;
      text.append(record);
    }
    // your medal here, in a Time Trial or a Time Attack
    const medal = current.id === 'timetrial' ? trophies.medals[layout.id]?.trial : current.id === 'timeattack' ? trophies.medals[layout.id]?.attack : undefined;
    if (medal) {
      const m = document.createElement('span');
      m.className = 'record';
      m.textContent = `● ${MEDAL_NAME[medal]} MEDAL`;
      m.style.color = MEDAL_COLOR[medal];
      text.append(m);
    }
    card.append(prev, outline(layout, 64), text, next);
    dots.innerHTML = '';
    layouts.forEach((l, k) => {
      const d = document.createElement('i');
      d.classList.toggle('on', k === selected);
      d.classList.toggle('locked', !open.has(l.id));
      dots.append(d);
    });
  };
  const stepCircuit = (by: number) => {
    selected = (selected + by + layouts.length) % layouts.length;
    hint.textContent = HINT;
    menuTick();
    renderCard();
  };
  let downX: number | undefined;
  card.addEventListener('pointerdown', (e) => {
    downX = e.clientX;
    focus = 0;
    show();
    try {
      card.releasePointerCapture(e.pointerId); // (touch captures to the card: let pointerup find where the finger lifts)
    } catch {
      // nothing to release
    }
  });
  card.addEventListener('pointercancel', () => (downX = undefined));
  card.addEventListener('pointerleave', (e) => {
    // (a swipe can carry the finger off the card: count it where it left)
    if (downX !== undefined && Math.abs(e.clientX - downX) >= 28) {
      stepCircuit(e.clientX < downX ? 1 : -1);
      downX = undefined;
    }
  });
  card.addEventListener('pointerup', (e) => {
    if (downX === undefined) return;
    const r = card.getBoundingClientRect();
    const by = cardGesture(e.clientX - downX, (e.clientX - r.left) / Math.max(1, r.width));
    downX = undefined;
    if (by === 'race') finish(layouts[selected]);
    else if (by) stepCircuit(by);
  });
  // the big button that races, named for the mode
  const raceButton = menuButton('', () => finish(layouts[selected]));
  raceButton.classList.add('race-button');
  const renderRace = () => (raceButton.textContent = `${current.name} ▶`);
  const options = document.createElement('div');
  options.className = 'options';
  /** a mode picked: a Championship to its screen; the others on to the circuit screen, with the mode's rows */
  const pickMode = (m: (typeof MODES)[number]) => {
    current = m;
    if (m.id === 'championship') {
      finish(layouts[selected]);
      return;
    }
    menuPick();
    view = 'circuit';
    rows = rowsOf(m.id).map((k) => ROWS[k]);
    options.replaceChildren(...rows.map((r) => r.el));
    hint.textContent = HINT;
    focus = 0;
    renderCard();
    renderRace();
    show();
  };
  /** back from the circuit screen to the modes */
  const toModes = () => {
    menuPick();
    view = 'modes';
    hint.textContent = MODES_HINT;
    focus = MODES.indexOf(current);
    show();
  };
  const modeButtons = MODES.map((m) => {
    const b = menuButton('', () => pickMode(m));
    b.classList.add('mode-button');
    const name = document.createElement('strong');
    name.textContent = m.name;
    const about = document.createElement('span');
    about.textContent = m.about;
    b.append(name, about);
    return b;
  });
  const backButton = menuButton('◀ BACK', toModes);
  const tab = framed() ? ownTabButton() : undefined;
  /** the circuit screen's places for up/down: the circuit, the rows, the race button, BACK */
  const raceAt = () => 1 + rows.length;
  const backAt = () => raceAt() + 1;
  const modesParts: HTMLElement[] = [...modeButtons, settingsButton, trophiesButton, ...(tab ? [tab] : [])];
  const cabinetParts: HTMLElement[] = [cabinetTitle, cabinet, cabinetDone];
  const circuitParts: HTMLElement[] = [card, dots, options, raceButton, backButton];
  const settingsParts: HTMLElement[] = [settingsTitle, ...settingsRows.map((r) => r.el), controlsButton, doneButton];
  const show = () => {
    hint.style.display = view === 'settings' || view === 'trophies' ? 'none' : '';
    for (const el of cabinetParts) el.style.display = view === 'trophies' ? '' : 'none';
    for (const el of modesParts) el.style.display = view === 'modes' ? '' : 'none';
    for (const el of circuitParts) el.style.display = view === 'circuit' ? '' : 'none';
    for (const el of settingsParts) el.style.display = view === 'settings' ? '' : 'none';
    modeButtons.forEach((b, k) => b.classList.toggle('focused', view === 'modes' && focus === k));
    settingsButton.classList.toggle('focused', view === 'modes' && focus === MODES.length);
    trophiesButton.classList.toggle('focused', view === 'modes' && focus === MODES.length + 1);
    cabinetDone.classList.toggle('focused', view === 'trophies');
    card.classList.toggle('focused', view === 'circuit' && focus === 0);
    rows.forEach((r, k) => r.el.classList.toggle('focused', view === 'circuit' && focus === 1 + k));
    raceButton.classList.toggle('focused', view === 'circuit' && focus === raceAt());
    backButton.classList.toggle('focused', view === 'circuit' && focus === backAt());
    settingsRows.forEach((r, k) => r.el.classList.toggle('focused', view === 'settings' && focus === k));
    controlsButton.classList.toggle('focused', view === 'settings' && focus === settingsRows.length);
    doneButton.classList.toggle('focused', view === 'settings' && focus === settingsRows.length + 1);
    hud.setLabel('a', view === 'circuit' ? 'RACE' : view === 'modes' ? 'PICK' : 'DONE');
    hud.setLabel('b', view === 'circuit' ? 'BACK' : '');
  };
  // a tap on a row focuses it too
  Object.values(ROWS).forEach((r) => r.el.addEventListener('pointerdown', () => {
    focus = 1 + rows.indexOf(r);
    show();
  }));
  settingsRows.forEach((r, k) => r.el.addEventListener('pointerdown', () => {
    focus = k;
    show();
  }));
  renderCard();
  renderRace();
  options.append(...rows.map((r) => r.el));
  menu.append(...modeButtons, settingsButton, trophiesButton, card, dots, options, raceButton, backButton, ...settingsParts, ...cabinetParts);
  // embedded in another site's page (itch.io), the browser may hold the game to 30 fps (Safari
  // does, in a frame it doesn't count as played with): offer the game in a tab of its own
  if (tab) menu.append(tab);
  show();
  holdTouches(menu);
  host.append(menu);
  hud.setPosition('');
  hud.setLap('');

  return new Promise((resolve) => {
    const seen = new Map<Button, number>();
    const pressed = (b: Button) => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge;
    };
    let done = false;
    finish = (layout, controlsLap = false) => {
      if (done) return;
      // a locked circuit: raced only in a Championship (any circuit picked there goes to its screen)
      if (!controlsLap && !open.has(layout.id) && current.id !== 'championship') {
        menuTick();
        hint.textContent = `${layout.name.toUpperCase()}: REACH IT IN A CHAMPIONSHIP TO UNLOCK`;
        return;
      }
      done = true;
      menuPick();
      menu.remove();
      resolve({ mode: current.id, controlsLap, layout, team: teamRow.value(), difficulty: difficultyRow.value(), weather: weatherRow.value(), qualifying: qualifyingRow.value(), laps: lapsRow.value() });
    };
    closed?.addEventListener('abort', () => {
      done = true;
      menu.remove();
    });
    const tick = () => {
      if (done) return;
      // poll every button each frame, so a press is never counted late
      const [down, right, up, left, a, start, b] = (['down', 'right', 'up', 'left', 'a', 'start', 'b'] as const).map(pressed);
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (view === 'settings') {
        // the settings: up/down moves, left/right changes a row, A or START (or DONE) goes back
        const places = settingsRows.length + 2;
        if (move) {
          focus = (focus + move + places) % places;
          show();
        }
        const row = settingsRows[focus];
        if (row && (left || right)) row.step(right ? 1 : -1);
        if ((a || start) && focus === settingsRows.length) finish(layouts[0], true);
        else if (a || start) closeSettings();
      } else if (view === 'trophies') {
        // the cabinet: A, START or B goes back
        if (a || start || b) closeCabinet();
      } else if (view === 'modes') {
        // the modes: up/down moves, A or START picks (or opens SETTINGS or TROPHIES)
        const places = MODES.length + 2;
        if (move) {
          focus = (focus + move + places) % places;
          show();
        }
        if ((a || start) && focus === MODES.length) openSettings();
        else if ((a || start) && focus === MODES.length + 1) openCabinet();
        else if (a || start) pickMode(MODES[focus]);
      } else {
        const places = backAt() + 1;
        if (move) {
          focus = (focus + move + places) % places;
          show();
        }
        // left/right: the circuit, or the focused row
        const row = rows[focus - 1];
        if (focus === 0 && (left || right)) stepCircuit(right ? 1 : -1);
        if (row && (left || right)) row.step(right ? 1 : -1);
        if (b || ((a || start) && focus === backAt())) toModes();
        else if (a || start) finish(layouts[selected]);
      }
      if (!done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
