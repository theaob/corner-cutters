// The menu shown before a race: each circuit's outline, name and a line about
// it, then your team. On a phone it's all touch (the
// deck is hidden): tap a circuit to race it, swipe a row (or tap its sides) to
// change it. On a keyboard, up/down moves, left/right changes a row, Enter races.

import type { Button } from '../engine/controls';
import { holdTouches } from '../engine/deck';
import type { Services } from '../engine/services';
import type { CircuitLayout } from './layouts';
import { TEAMS, type Team } from './teams';
import { logoSvg } from './logos';

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
export interface MenuChoice {
  layout: CircuitLayout;
  team: Team;
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
function optionRow<T>(label: string, values: T[], start: T, show: (v: T) => { name: string; about: string; colors?: string[]; icon?: Element }) {
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
  /** where up/down is: a circuit (0…), then the team row */
  let focus = selected;
  /** the button a press started on: lifting on the same button picks it */
  let armed: number | undefined;
  let finish: (l: CircuitLayout) => void = () => {};

  const teamRow = optionRow('TEAM', TEAMS, team, (t) => ({ name: t.name.toUpperCase(), about: t.code, colors: [t.body, t.trim, ...(t.accent ? [t.accent] : [])], icon: logoSvg(t.id, 30) }));
  const rows = [teamRow];

  const buttons = layouts.map((layout, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const name = document.createElement('strong');
    name.textContent = layout.name;
    const about = document.createElement('span');
    about.textContent = layout.about;
    const text = document.createElement('div');
    text.append(name, about);
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
  const show = () => {
    buttons.forEach((b, i) => b.classList.toggle('selected', i === selected));
    rows.forEach((r, k) => r.el.classList.toggle('focused', focus === layouts.length + k));
  };
  // a tap on a row focuses it too
  rows.forEach((r, k) => r.el.addEventListener('pointerdown', () => {
    focus = layouts.length + k;
    show();
  }));
  show();
  menu.append(...rows.map((r) => r.el));
  // embedded in another site's page (itch.io), the browser may hold the game to 30 fps (Safari
  // does, in a frame it doesn't count as played with): offer the game in a tab of its own
  if (framed()) menu.append(ownTabButton());
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
      done = true;
      menu.remove();
      resolve({ layout, team: teamRow.value() });
    };
    const places = layouts.length + rows.length;
    const tick = () => {
      if (done) return;
      // poll every button each frame, so a press is never counted late
      const [down, right, up, left, a, start] = (['down', 'right', 'up', 'left', 'a', 'start'] as const).map(pressed);
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (move) {
        focus = (focus + move + places) % places;
        if (focus < layouts.length) selected = focus;
        show();
      }
      const row = rows[focus - layouts.length];
      if (row && (left || right)) row.step(right ? 1 : -1);
      if (a || start) finish(layouts[selected]);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
