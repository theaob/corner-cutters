// The circuit menu shown before a race: each circuit's outline, name and the
// real circuit it's inspired by. The D-pad moves, A or START (or a tap) picks.

import type { Button } from '../engine/controls';
import type { Services } from '../engine/services';
import type { CircuitLayout } from './layouts';

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

/** Show the menu in `host` until a circuit is picked; `initial` is highlighted first. */
export function chooseCircuit(host: HTMLElement, services: Services, layouts: CircuitLayout[], initial?: CircuitLayout): Promise<CircuitLayout> {
  const { controls, hud } = services;
  const menu = document.createElement('div');
  menu.className = 'circuit-menu';
  const title = document.createElement('h1');
  title.textContent = 'CORNER CUTTERS';
  const hint = document.createElement('p');
  hint.textContent = 'CHOOSE A CIRCUIT';
  const list = document.createElement('ul');
  menu.append(title, hint, list);

  let selected = Math.max(0, layouts.indexOf(initial!));
  let finish: (l: CircuitLayout) => void = () => {};
  const buttons = layouts.map((layout, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const name = document.createElement('strong');
    name.textContent = layout.name;
    const about = document.createElement('span');
    about.textContent = `inspired by ${layout.inspiredBy}`;
    const text = document.createElement('div');
    text.append(name, about);
    b.append(outline(layout, 56), text);
    b.addEventListener('click', () => finish(layouts[i]));
    li.append(b);
    list.append(li);
    return b;
  });
  const show = () => buttons.forEach((b, i) => b.classList.toggle('selected', i === selected));
  show();
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
      resolve(layout);
    };
    const tick = () => {
      if (done) return;
      // poll every button each frame, so a press is never counted late
      const [down, right, up, left, a, start] = (['down', 'right', 'up', 'left', 'a', 'start'] as const).map(pressed);
      const move = (down || right ? 1 : 0) - (up || left ? 1 : 0);
      if (move) {
        selected = (selected + move + layouts.length) % layouts.length;
        show();
      }
      if (a || start) finish(layouts[selected]);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
