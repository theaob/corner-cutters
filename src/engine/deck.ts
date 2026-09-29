// The control deck under the game screen: touch D-pad, A/B, Start/Select,
// and the status strip (race position, lap) plus A/B context labels.

import { directionsFromOffset, stickFromOffset, type Button, type Controls } from './controls';

const DEAD_ZONE = 0.14; // fraction of the D-pad's width

function buzz(): void {
  try {
    navigator.vibrate?.(8);
  } catch {
    // not allowed here (some frames): no buzz
  }
}

/**
 * Keep the browser's own touch gestures (scrolling, zooming, a tap turning into
 * a click) off `el`, so every touch on it reaches the game as pointer events.
 * `touch-action: none` in the CSS should be enough, but inside a cross-origin
 * frame (itch.io on a phone) the page around the frame can still take a touch
 * over as a scroll, which cancels it; a non-passive touch handler can't be overruled.
 */
export function holdTouches(el: HTMLElement): void {
  const stop = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };
  el.addEventListener('touchstart', stop, { passive: false });
  el.addEventListener('touchmove', stop, { passive: false });
}

/** Keep the pointer's events coming to `el` while it's held, if the browser allows it (it can refuse). */
function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // the pointer is already gone (or capture isn't allowed): the press still counts
  }
}

export function bindDeck(deck: HTMLElement, controls: Controls): void {
  deck.addEventListener('contextmenu', (e) => e.preventDefault());
  holdTouches(deck);

  const dpad = deck.querySelector<HTMLElement>('[data-dpad]');
  if (dpad) bindDpad(dpad, controls);

  for (const el of deck.querySelectorAll<HTMLElement>('[data-button]')) {
    const button = el.dataset.button as Button;
    const source = `touch-${button}`;
    let held: number | undefined;
    const release = () => {
      held = undefined;
      controls.clear(source);
      el.classList.remove('pressed');
    };
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      held = e.pointerId;
      controls.press(source, button, true);
      el.classList.add('pressed');
      capture(el, e.pointerId);
      buzz();
    });
    el.addEventListener('pointerup', release);
    el.addEventListener('pointercancel', release);
    el.addEventListener('lostpointercapture', release);
    // (without capture the finger can lift off somewhere else)
    releaseAnywhere(() => held, release);
  }
}

/** Also let go when the held pointer lifts anywhere on the page. */
function releaseAnywhere(held: () => number | undefined, release: () => void): void {
  for (const type of ['pointerup', 'pointercancel'] as const) {
    window.addEventListener(type, (e) => {
      if (e.pointerId === held()) release();
    });
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
    held = undefined;
    controls.clear('dpad');
    last = '';
    dpad.dataset.held = '';
  };
  let held: number | undefined;
  dpad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    held = e.pointerId;
    update(e);
    capture(dpad, e.pointerId);
  });
  dpad.addEventListener('pointermove', (e) => {
    if (e.pointerId === held) update(e);
  });
  dpad.addEventListener('pointerup', release);
  dpad.addEventListener('pointercancel', release);
  dpad.addEventListener('lostpointercapture', release);
  releaseAnywhere(() => held, release);
}

/** Show every deck button as let go (after the controls were cleared from outside). */
export function releaseDeck(deck: HTMLElement): void {
  deck.querySelectorAll('.pressed').forEach((el) => el.classList.remove('pressed'));
  const dpad = deck.querySelector<HTMLElement>('[data-dpad]');
  if (dpad) dpad.dataset.held = '';
}

/** Status strip (race position and lap) + button labels. */
export class Hud {
  constructor(private readonly deck: HTMLElement) {}

  private el(name: string): HTMLElement | null {
    return this.deck.querySelector(`[data-hud="${name}"]`);
  }

  private set(name: string, text: string): void {
    const el = this.el(name);
    if (el && el.textContent !== text) el.textContent = text;
  }

  /** Race position, e.g. "P3/10". */
  setPosition(text: string): void {
    this.set('position', text);
  }

  /** Lap counter, e.g. "LAP 2/3". */
  setLap(text: string): void {
    this.set('lap', text);
  }

  setLabel(button: 'a' | 'b', text: string): void {
    this.set(`label-${button}`, text);
  }
}
