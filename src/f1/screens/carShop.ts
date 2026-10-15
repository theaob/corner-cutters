// The shop: every look for your car (carStyle.ts), the ones your daily streak has earned to equip (tap, or A), the
// rest shown locked with the streak that earns them. The one equipped is the one raced in. Touch, or keys: up/down
// moves, A or START equips, SELECT (or the phone's back button) goes back.

import { onBack } from '../../engine/backButton';
import { holdTouches } from '../../engine/deck';
import type { Services } from '../../engine/services';
import { menuButton } from '../circuitSelect';
import { carStyle, shopStyles, setCarStyle, styled, type CarStyle } from '../carStyle';
import { loadDaily } from '../daily';
import { reportOpen } from '../report';
import { menuPick, menuTick } from '../sounds';
import { loadStreak } from '../streak';
import type { Team } from '../teams';

const WHITE_HELMET = '#f4f4f8';
const GOLD_HELMET = '#f2c14e';

/** A small car from above in `team`'s colours with a style's look over them: wings, body, sidepods and the helmet. */
export function carPreview(team: Team, style: CarStyle): SVGSVGElement {
  const look = styled({ body: team.body, stripe: team.trim, accent: team.accent ?? team.body, helmet: WHITE_HELMET } as { body: string; stripe?: string; accent?: string; helmet?: string }, style);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 56');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '56');
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { width: '40px', height: '56px', flex: 'none' });
  const shape = (tag: string, attrs: Record<string, string | number>) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.append(el);
  };
  const stripe = look.stripe ?? look.body;
  // (tyres, wings, sidepods, body, the helmet)
  for (const [x, y] of [[2, 8], [31, 8], [1, 38], [30, 38]]) shape('rect', { x, y, width: 7, height: 12, rx: 1.5, fill: '#15151c' });
  shape('rect', { x: 8, y: 2, width: 24, height: 5, fill: stripe });
  shape('rect', { x: 6, y: 50, width: 28, height: 5, fill: stripe });
  shape('rect', { x: 9, y: 22, width: 22, height: 16, rx: 3, fill: look.accent ?? look.body });
  shape('rect', { x: 15, y: 6, width: 10, height: 44, rx: 4, fill: look.body });
  shape('circle', { cx: 20, cy: 28, r: 5, fill: look.helmet === 'gold' ? GOLD_HELMET : look.helmet ?? WHITE_HELMET, stroke: '#15151c', 'stroke-width': 1 });
  return svg;
}

/** The shop in `host` until the player goes back. */
export function showCarShop(host: HTMLElement, services: Services, team: Team, closed?: AbortSignal): Promise<void> {
  const { controls, hud } = services;
  const screen = document.createElement('div');
  screen.className = 'circuit-menu';
  const title = document.createElement('h1');
  title.textContent = 'SHOP';
  const best = loadStreak(loadDaily()).best;
  const line = (text: string, color = 'var(--muted)') => {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { margin: '0', color, textAlign: 'center', font: '11px var(--pixel)' });
    return p;
  };
  const status = line('\u00a0');
  screen.append(title, line('LOOKS FOR YOUR CAR: A STREAK OF DAYS PLAYED EARNS THEM, YOURS FOR GOOD', 'var(--text)'), status);
  const entries = shopStyles(best);
  const rows = entries.map(({ style, owned }) => {
    const b = menuButton('', () => equip(style, owned));
    b.disabled = false;
    b.setAttribute('aria-disabled', String(!owned));
    Object.assign(b.style, { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: '14px', textAlign: 'left', padding: '8px 14px', opacity: owned ? '1' : '0.45' });
    const text = document.createElement('div');
    text.style.flex = '1';
    const name = document.createElement('strong');
    name.textContent = style.name;
    const about = document.createElement('span');
    about.style.display = 'block';
    about.textContent = owned ? '' : `LOCKED · ${style.days} DAYS RUNNING TO EARN${best ? ` · BEST SO FAR ${best}` : ''}`.toLowerCase();
    text.append(name, about);
    const state = document.createElement('span');
    Object.assign(state.style, { font: '11px var(--pixel)' });
    b.append(carPreview(team, style), text, state);
    return { b, style, owned, about, state };
  });
  let finish = () => {};
  const backButton = menuButton('BACK', () => finish());
  screen.append(...rows.map((r) => r.b), backButton);
  let focus = Math.max(0, entries.findIndex((e) => e.style.id === carStyle(best).id));
  const render = () => {
    const mine = carStyle(best).id;
    for (const [k, r] of rows.entries()) {
      r.state.textContent = !r.owned ? '🔒' : r.style.id === mine ? 'EQUIPPED' : 'EQUIP';
      r.state.style.color = r.style.id === mine ? 'var(--gold)' : 'var(--muted)';
      if (r.owned) r.about.textContent = r.style.id === mine ? 'raced in on the track' : 'tap to wear it';
      r.b.classList.toggle('focused', k === focus);
    }
    backButton.classList.toggle('focused', focus === rows.length);
  };
  function equip(style: CarStyle, owned: boolean) {
    focus = rows.findIndex((r) => r.style === style);
    if (!owned) {
      menuTick();
      status.textContent = `${style.name}: ${style.days} DAYS RUNNING EARNS IT`;
      status.style.color = 'var(--gold)';
    } else {
      menuPick();
      setCarStyle(style);
      status.textContent = `${style.name} EQUIPPED`;
      status.style.color = 'var(--accent-b)';
    }
    render();
  }
  render();
  holdTouches(screen);
  host.append(screen);
  hud.setPosition('');
  hud.setLap('');
  hud.setLabel('a', 'EQUIP');
  hud.setLabel('b', '');

  return new Promise((resolve) => {
    let done = false;
    const offBack = onBack(() => (finish(), true));
    finish = () => {
      if (done) return;
      done = true;
      offBack();
      menuPick();
      screen.remove();
      resolve();
    };
    closed?.addEventListener('abort', () => {
      done = true;
      offBack();
      screen.remove();
      resolve();
    });
    const seen = new Map<string, number>();
    const pressed = (b: 'down' | 'up' | 'a' | 'start' | 'select') => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge && !reportOpen();
    };
    const tick = () => {
      if (done) return;
      const [down, up, a, start, select] = (['down', 'up', 'a', 'start', 'select'] as const).map(pressed);
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (move) {
        focus = (focus + move + rows.length + 1) % (rows.length + 1);
        menuTick();
        render();
      }
      if (a || start) {
        if (focus === rows.length) finish();
        else equip(rows[focus].style, rows[focus].owned);
      }
      if (select) finish();
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
