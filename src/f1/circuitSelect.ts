// The menu shown before a race: each circuit's outline, name and the real
// circuit it's inspired by, and the control scheme. Up/down picks a circuit,
// left/right (or a tap on the row) switches the controls, A or START (or a tap
// on a circuit) races.

import type { Button } from '../engine/controls';
import { holdTouches } from '../engine/deck';
import type { Services } from '../engine/services';
import type { CircuitLayout } from './layouts';
import { CONTROL_SCHEMES, type ControlScheme } from './racing';

/** What each control scheme is called, and how it drives, in a line. */
const SCHEME_TEXT: Record<ControlScheme, [name: string, how: string]> = {
  stick: ['STICK', 'point where to go · push = throttle · B drift'],
  pedals: ['PEDALS', 'stick steers · B gas · A brake/reverse · A+B drift'],
};

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

/** Show the menu in `host` until a circuit is picked; `initial` is highlighted first, with the controls set to `scheme`. */
export function chooseCircuit(
  host: HTMLElement,
  services: Services,
  layouts: CircuitLayout[],
  initial?: CircuitLayout,
  scheme: ControlScheme = 'stick',
): Promise<{ layout: CircuitLayout; scheme: ControlScheme }> {
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
  /** the button a press started on: lifting on the same button picks it */
  let armed: number | undefined;
  let finish: (l: CircuitLayout) => void = () => {};
  // the control scheme row, under the circuits
  const controlsRow = document.createElement('button');
  controlsRow.className = 'controls-row';
  const showScheme = () => {
    const [name, how] = SCHEME_TEXT[scheme];
    controlsRow.innerHTML = '';
    const label = document.createElement('strong');
    label.textContent = `CONTROLS  ◀ ${name} ▶`;
    const about = document.createElement('span');
    about.textContent = how;
    controlsRow.append(label, about);
  };
  const switchScheme = (step: number) => {
    scheme = CONTROL_SCHEMES[(CONTROL_SCHEMES.indexOf(scheme) + step + CONTROL_SCHEMES.length) % CONTROL_SCHEMES.length];
    showScheme();
  };
  controlsRow.addEventListener('pointerup', () => switchScheme(1));
  showScheme();
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
    // picked on the pointer's press and release, not 'click': in a cross-origin frame on a phone
    // the click a tap turns into can land on the wrong button
    b.addEventListener('pointerdown', (e) => {
      armed = i;
      selected = i;
      show();
      try {
        b.releasePointerCapture(e.pointerId); // (touch captures to the button: let pointerup find where the finger lifts)
      } catch {
        // nothing to release
      }
    });
    b.addEventListener('pointerup', () => {
      if (armed === i) finish(layouts[i]);
      armed = undefined;
    });
    b.addEventListener('pointerleave', () => (armed = undefined));
    li.append(b);
    list.append(li);
    return b;
  });
  const show = () => buttons.forEach((b, i) => b.classList.toggle('selected', i === selected));
  show();
  menu.append(controlsRow);
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
      resolve({ layout, scheme });
    };
    const tick = () => {
      if (done) return;
      // poll every button each frame, so a press is never counted late
      const [down, right, up, left, a, start] = (['down', 'right', 'up', 'left', 'a', 'start'] as const).map(pressed);
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (move) {
        selected = (selected + move + layouts.length) % layouts.length;
        show();
      }
      if (left || right) switchScheme(right ? 1 : -1);
      if (a || start) finish(layouts[selected]);
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
