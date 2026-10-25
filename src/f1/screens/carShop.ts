// The shop: every look for your car (carStyle.ts), the ones your daily streak has earned to equip (tap, or A), the
// rest shown locked with the streak that earns them. The one equipped is the one raced in. Touch, or keys: up/down
// moves, A or START equips, SELECT (or the phone's back button) goes back.

import type { CarLook, LiveryPattern } from '../../engine/render/vehicles3d';
import { t, backLabel } from '../../engine/i18n';
import { onBack } from '../../engine/backButton';
import { holdTouches } from '../../engine/deck';
import type { Services } from '../../engine/services';
import { menuButton } from '../circuitSelect';
import { carStyle, shopStyles, setCarStyle, styled, type CarStyle } from '../carStyle';
import { loadDaily } from '../daily';
import { reportOpen } from '../report';
import { menuPick, menuTick } from '../sounds';
import { loadStreak } from '../streak';
import { motionReduced } from '../access';
import { startPreviews3d, type Preview3d } from './carPreview3d';
import type { Team } from '../teams';

const WHITE_HELMET = '#f4f4f8';
const GOLD_HELMET = '#f2c14e';

/** A small car from above in `team`'s colours with a style's look over them: wings, body, sidepods and the helmet. */
export function carPreview(team: Team, style: CarStyle): SVGSVGElement {
  const look = styled({ body: team.body, stripe: team.trim, accent: team.accent ?? team.body, helmet: WHITE_HELMET, pattern: team.pattern } as { body: string; stripe?: string; accent?: string; helmet?: string; pattern?: LiveryPattern }, style);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 40 56');
  svg.setAttribute('width', '40');
  svg.setAttribute('height', '56');
  svg.setAttribute('aria-hidden', 'true');
  Object.assign(svg.style, { width: '29px', height: '40px', flex: 'none' });
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
  // (the livery's pattern over the body, as the car is painted: the front is the top)
  const clip = document.createElementNS(ns, 'clipPath');
  clip.setAttribute('id', 'body-clip');
  const clipShape = document.createElementNS(ns, 'rect');
  for (const [k, v] of Object.entries({ x: 15, y: 6, width: 10, height: 44, rx: 4 })) clipShape.setAttribute(k, String(v));
  clip.append(clipShape);
  svg.append(clip);
  const paint = document.createElementNS(ns, 'g');
  paint.setAttribute('clip-path', 'url(#body-clip)');
  svg.append(paint);
  const mark = (attrs: Record<string, string | number>, tag = 'rect') => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries({ fill: stripe, ...attrs })) el.setAttribute(k, String(v));
    paint.append(el);
  };
  switch (look.pattern) {
    case 'stripe': mark({ x: 18.6, y: 6, width: 2.8, height: 44 }); break;
    case 'twin': mark({ x: 16.4, y: 6, width: 1.8, height: 44 }); mark({ x: 21.8, y: 6, width: 1.8, height: 44 }); break;
    case 'band': for (let y = 11; y < 50; y += 13) mark({ x: 15, y, width: 10, height: 5 }); break;
    case 'chevron': for (let y = 12; y < 56; y += 15) mark({ d: `M15 ${y + 5} L20 ${y} L25 ${y + 5}`, fill: 'none', stroke: stripe, 'stroke-width': 3.5 }, 'path'); break;
    case 'halves': mark({ x: 15, y: 6, width: 10, height: 22 }); break;
    case 'split': mark({ x: 20, y: 6, width: 5, height: 44 }); break;
    case 'nose': mark({ x: 15, y: 6, width: 10, height: 15 }); break;
  }
  // (the LED helmet: the Neon City's swirl of colours)
  if (look.helmet === 'led') {
    const grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'led-helmet');
    ['#ff3df2', '#3dd8ff', '#9d4dff', '#ff7a3d'].forEach((c, k) => {
      const stop = document.createElementNS(ns, 'stop');
      stop.setAttribute('offset', String(k / 3));
      stop.setAttribute('stop-color', c);
      grad.append(stop);
    });
    svg.append(grad);
  }
  shape('circle', { cx: 20, cy: 28, r: 5, fill: look.helmet === 'led' ? 'url(#led-helmet)' : look.helmet === 'gold' ? GOLD_HELMET : look.helmet ?? WHITE_HELMET, stroke: '#15151c', 'stroke-width': 1 });
  return svg;
}

/** A tile's preview, in px: the 3D canvas's size on a phone's screen. */
const PREVIEW = 104;

/** The shop in `host` until the player goes back. */
export function showCarShop(host: HTMLElement, services: Services, team: Team, closed?: AbortSignal): Promise<void> {
  const { controls, hud } = services;
  const screen = document.createElement('div');
  screen.className = 'circuit-menu';
  const title = document.createElement('h1');
  title.textContent = t('SHOP');
  const best = loadStreak(loadDaily()).best;
  const line = (text: string, color = 'var(--muted)') => {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { margin: '0', color, textAlign: 'center', font: '11px var(--pixel)' });
    return p;
  };
  const status = line(' ');
  screen.append(title, line(t('LOOKS FOR YOUR CAR: A STREAK OF DAYS PLAYED EARNS THEM, YOURS FOR GOOD'), 'var(--text)'));
  const entries = shopStyles(best);
  // (helmets, and whole-car paint, apart: a look that sets only the helmet is a helmet, NO CUSTOMIZATION leading them)
  const isPaint = (s: CarStyle) => !('helmet' in s.look) && Object.keys(s.look).length > 0;
  const sections = [
    { name: t('HELMETS'), entries: entries.filter((e) => !isPaint(e.style)) },
    { name: t('CAR PAINT'), entries: entries.filter((e) => isPaint(e.style)) },
  ];
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const previews: Preview3d[] = [];
  const rows = sections.flatMap((section) => section.entries.map(({ style, owned }) => {
    const b = menuButton('', () => equip(style, owned));
    b.disabled = false;
    b.setAttribute('aria-disabled', String(!owned));
    Object.assign(b.style, { flexDirection: 'column', justifyContent: 'center', gap: '4px', minHeight: '0', padding: '8px 2px', textAlign: 'center', opacity: owned ? '1' : '0.45' });
    // (the car turning in 3D, or its flat picture where there's no WebGL)
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = Math.round(PREVIEW * dpr);
    Object.assign(canvas.style, { width: `${PREVIEW}px`, height: `${PREVIEW}px` });
    const flat = carPreview(team, style);
    const look = styled({ body: team.body, stripe: team.trim, accent: team.accent ?? team.body, pattern: team.pattern } as Partial<CarLook>, style);
    previews.push({ canvas, look, helmetOnly: !isPaint(style) });
    const name = document.createElement('strong');
    Object.assign(name.style, { font: '10px var(--pixel)', lineHeight: '1.2' });
    name.textContent = style.days === 0 ? t('STANDARD') : t(style.name);
    const state = document.createElement('span');
    Object.assign(state.style, { font: '9px var(--pixel)' });
    b.append(canvas, name, state);
    return { b, canvas, flat, style, owned, state, section: section.name };
  }));
  const grids = sections.map((section) => {
    const heading = document.createElement('h2');
    heading.textContent = section.name;
    Object.assign(heading.style, { margin: '6px 2px 0', font: '11px var(--pixel)', letterSpacing: '0.1em', color: 'var(--gold)', fontWeight: '400' });
    const grid = document.createElement('div');
    Object.assign(grid.style, { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' });
    grid.append(...rows.filter((r) => r.section === section.name).map((r) => r.b));
    return [heading, grid];
  }).flat();
  let finish = () => {};
  const backButton = menuButton(backLabel(), () => finish());
  // (the status line and BACK held at the bottom of the screen, set a little apart from the looks above them: a phone
  // can't scroll this list with the browser's own scrolling (holdTouches), and with the looks and cars it holds BACK
  // was below the fold)
  const footer = document.createElement('div');
  Object.assign(footer.style, { position: 'sticky', bottom: '-20px', flex: 'none', zIndex: '1', display: 'flex', flexDirection: 'column', gap: '6px', margin: '0 -16px -20px', padding: '8px 16px 20px', background: '#111118' });
  footer.append(status, backButton);
  screen.append(...grids, footer);
  const tiles = rows.map((r) => r.b);
  let focus = Math.max(0, rows.findIndex((r) => r.style.id === carStyle(best).id));
  const render = () => {
    const mine = carStyle(best).id;
    for (const [k, r] of rows.entries()) {
      r.state.textContent = !r.owned ? `🔒 ${t('{n} DAYS', { n: r.style.days })}` : r.style.id === mine ? t('EQUIPPED') : t('EQUIP');
      r.state.style.color = r.style.id === mine ? 'var(--gold)' : 'var(--muted)';
      r.b.classList.toggle('focused', k === focus);
    }
    backButton.classList.toggle('focused', focus === rows.length);
  };
  function equip(style: CarStyle, owned: boolean) {
    focus = rows.findIndex((r) => r.style === style);
    if (!owned) {
      menuTick();
      status.textContent = `${style.name}: ${style.days} DAYS RUNNING EARNS IT${best ? ` · BEST SO FAR ${best}` : ''}`;
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
  // (holdTouches takes the browser's own scrolling, so a finger dragging the list scrolls it here)
  let dragFrom: number | undefined;
  screen.addEventListener('touchstart', (e) => (dragFrom = e.touches[0]?.clientY), { passive: true });
  screen.addEventListener('touchmove', (e) => {
    const y = e.touches[0]?.clientY;
    if (y === undefined || dragFrom === undefined) return;
    screen.scrollTop += dragFrom - y;
    dragFrom = y;
  }, { passive: true });
  host.append(screen);
  // (the previews turn once the tiles are on the page; those with no WebGL show the flat cars)
  const stopPreviews = startPreviews3d(previews, Math.round(PREVIEW * dpr), motionReduced());
  if (!stopPreviews) for (const r of rows) r.canvas.replaceWith(r.flat);
  hud.setPosition('');
  hud.setLap('');
  hud.setLabel('a', 'EQUIP');
  hud.setLabel('b', '');

  /** Move the focus to the nearest tile (or BACK) in a direction on the screen. */
  const step = (dx: number, dy: number) => {
    const at = (i: number) => (i === rows.length ? backButton : tiles[i]).getBoundingClientRect();
    const from = at(focus);
    const cx = from.left + from.width / 2;
    const cy = from.top + from.height / 2;
    let best: { i: number; cost: number } | undefined;
    for (let i = 0; i <= rows.length; i++) {
      if (i === focus) continue;
      const r = at(i);
      const ahead = ((r.left + r.width / 2) - cx) * dx + ((r.top + r.height / 2) - cy) * dy;
      if (ahead <= 1) continue;
      const aside = Math.abs(((r.left + r.width / 2) - cx) * dy + ((r.top + r.height / 2) - cy) * dx);
      const cost = ahead + aside * 3;
      if (!best || cost < best.cost) best = { i, cost };
    }
    if (!best) return;
    focus = best.i;
    menuTick();
    render();
    (focus === rows.length ? backButton : tiles[focus]).scrollIntoView({ block: 'nearest' });
  };

  return new Promise((resolve) => {
    let done = false;
    const offBack = onBack(() => (finish(), true));
    finish = () => {
      if (done) return;
      done = true;
      stopPreviews?.();
      offBack();
      menuPick();
      screen.remove();
      resolve();
    };
    closed?.addEventListener('abort', () => {
      done = true;
      stopPreviews?.();
      offBack();
      screen.remove();
      resolve();
    });
    const seen = new Map<string, number>();
    const pressed = (b: 'down' | 'up' | 'left' | 'right' | 'a' | 'start' | 'select') => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge && !reportOpen();
    };
    const tick = () => {
      if (done) return;
      const [down, up, left, right, a, start, select] = (['down', 'up', 'left', 'right', 'a', 'start', 'select'] as const).map(pressed);
      if (down) step(0, 1);
      else if (up) step(0, -1);
      else if (right) step(1, 0);
      else if (left) step(-1, 0);
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
