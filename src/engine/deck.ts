// The control deck under the game screen: touch D-pad, A/B, Start/Select,
// and the status strip (district, cash, clock, heat) plus A/B context labels.

import { directionsFromOffset, stickFromOffset, type Button, type Controls } from './controls';

const DEAD_ZONE = 0.14; // fraction of the D-pad's width

function buzz(): void {
  navigator.vibrate?.(8);
}

export function bindDeck(deck: HTMLElement, controls: Controls): void {
  deck.addEventListener('contextmenu', (e) => e.preventDefault());

  const dpad = deck.querySelector<HTMLElement>('[data-dpad]');
  if (dpad) bindDpad(dpad, controls);

  for (const el of deck.querySelectorAll<HTMLElement>('[data-button]')) {
    const button = el.dataset.button as Button;
    const source = `touch-${button}`;
    const release = () => {
      controls.clear(source);
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      controls.press(source, button, true);
      el.classList.add('pressed');
      buzz();
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
  }
}

function bindDpad(dpad: HTMLElement, controls: Controls): void {
  let last = '';
  const update = (e: PointerEvent) => {
    const r = dpad.getBoundingClientRect();
    const ox = e.clientX - (r.left + r.width / 2);
    const oy = e.clientY - (r.top + r.height / 2);
    const dirs = directionsFromOffset(ox, oy, r.width * DEAD_ZONE);
    controls.set('dpad', dirs);
    controls.setStick('dpad', stickFromOffset(ox, oy, r.width / 2, DEAD_ZONE * 2));
    const key = dirs.join(',');
    if (key !== last && dirs.length) buzz();
    last = key;
    dpad.dataset.held = dirs.join(' ');
  };
  const release = () => {
    controls.clear('dpad');
    last = '';
    dpad.dataset.held = '';
  };
  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    dpad.setPointerCapture(e.pointerId);
    update(e);
  });
  dpad.addEventListener('pointermove', (e) => {
    if (dpad.hasPointerCapture(e.pointerId)) update(e);
  });
  dpad.addEventListener('pointerup', release);
  dpad.addEventListener('pointercancel', release);
  dpad.addEventListener('lostpointercapture', release);
}

/** Show every deck button as let go (after the controls were cleared from outside). */
export function releaseDeck(deck: HTMLElement): void {
  deck.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
  const dpad = deck.querySelector<HTMLElement>('[data-dpad]');
  if (dpad) dpad.dataset.held = '';
}

/** Status strip + button labels. */
export class Hud {
  constructor(private readonly deck: HTMLElement) {}

  private el(name: string): HTMLElement | null {
    return this.deck.querySelector(`[data-hud="${name}"]`);
  }

  setDistrict(name: string): void {
    const el = this.el('district');
    if (el) el.textContent = name.toUpperCase();
  }

  setCash(amount: number): void {
    const el = this.el('cash');
    if (el) el.textContent = `$${amount.toLocaleString('en-US')}`;
  }

  /** Free text in the cash slot, for demos that show something else there. */
  setInfo(text: string): void {
    const el = this.el('cash');
    if (el && el.textContent !== text) el.textContent = text;
  }

  /** The game clock, e.g. "21:30" (empty hides it). */
  setClock(text: string): void {
    const el = this.el('clock');
    if (el && el.textContent !== text) el.textContent = text;
  }

  setHeat(level: number): void {
    this.deck.querySelectorAll<HTMLElement>('[data-heat-pip]').forEach((pip, i) => {
      pip.classList.toggle('on', i < level);
    });
  }

  setLabel(button: 'a' | 'b', text: string): void {
    const el = this.el(`label-${button}`);
    if (el && el.textContent !== text) el.textContent = text;
  }
}
