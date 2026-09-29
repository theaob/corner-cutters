// Virtual handheld buttons, fed by the keyboard and the on-screen deck.
// Each input source keeps its own set of held buttons, so releasing a key
// doesn't cancel a button still held on the touch deck (and vice versa).

export type Button = 'up' | 'down' | 'left' | 'right' | 'a' | 'b' | 'start' | 'select';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface Stick {
  /** screen-space direction (y down); length 0…1 is how far the thumb is pushed */
  x: number;
  y: number;
}

export class Controls {
  private readonly held = new Map<string, Set<Button>>();
  private readonly pressCounts = new Map<Button, number>();
  private readonly sticks = new Map<string, Stick>();

  set(source: string, buttons: Iterable<Button>): void {
    const next = new Set(buttons);
    for (const b of next) if (!this.isDown(b)) this.countPress(b);
    this.held.set(source, next);
  }

  press(source: string, button: Button, down: boolean): void {
    const set = this.held.get(source) ?? new Set<Button>();
    if (down && !this.isDown(button)) this.countPress(button);
    if (down) set.add(button);
    else set.delete(button);
    this.held.set(source, set);
  }

  /**
   * How many times `button` has gone from up to down, ever. Compare against a
   * previous reading to catch taps that start and end between two frames.
   */
  presses(button: Button): number {
    return this.pressCounts.get(button) ?? 0;
  }

  private countPress(button: Button): void {
    this.pressCounts.set(button, this.presses(button) + 1);
  }

  clear(source: string): void {
    this.held.delete(source);
    this.sticks.delete(source);
  }

  /** Let go of everything from every source (the page lost focus or is being left). */
  clearAll(): void {
    this.held.clear();
    this.sticks.clear();
  }

  /** Analogue position from a touch source (the D-pad reports the thumb's exact offset). */
  setStick(source: string, stick: Stick): void {
    this.sticks.set(source, stick);
  }

  /** The analogue stick if a touch source is providing one; undefined for keyboard-only input. */
  stick(): Stick | undefined {
    for (const s of this.sticks.values()) return s;
    return undefined;
  }

  /**
   * Where the player is pushing, length 0…1: the touch D-pad's exact thumb
   * position when there is one, otherwise the held direction buttons (8-way,
   * length 1). Used for analogue walking and driving.
   */
  direction(): Stick {
    const s = this.stick();
    if (s && (s.x !== 0 || s.y !== 0)) return s;
    const x = (this.isDown('right') ? 1 : 0) - (this.isDown('left') ? 1 : 0);
    const y = (this.isDown('down') ? 1 : 0) - (this.isDown('up') ? 1 : 0);
    const len = Math.hypot(x, y);
    return len ? { x: x / len, y: y / len } : { x: 0, y: 0 };
  }

  isDown(button: Button): boolean {
    for (const set of this.held.values()) if (set.has(button)) return true;
    return false;
  }
}

// Eight 45° sectors, starting at "right" and going clockwise (screen y points down).
const SECTORS: Direction[][] = [
  ['right'],
  ['down', 'right'],
  ['down'],
  ['down', 'left'],
  ['left'],
  ['up', 'left'],
  ['up'],
  ['up', 'right'],
];

/**
 * Directions held for a thumb at (dx, dy) from the centre of the D-pad.
 * Anything inside the dead zone counts as no direction.
 */
export function directionsFromOffset(dx: number, dy: number, deadZone: number): Direction[] {
  if (Math.hypot(dx, dy) < deadZone) return [];
  const sector = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return SECTORS[((sector % 8) + 8) % 8];
}

/**
 * Analogue reading of a thumb at (dx, dy) on a pad of the given radius: the
 * exact direction, with length rising from 0 at the dead zone to 1 at the rim.
 */
export function stickFromOffset(dx: number, dy: number, radius: number, deadZone: number): Stick {
  const d = Math.hypot(dx, dy);
  const t = Math.min(1, Math.max(0, (d / radius - deadZone) / (1 - deadZone)));
  return d === 0 ? { x: 0, y: 0 } : { x: (dx / d) * t, y: (dy / d) * t };
}

const KEY_MAP: Record<string, Button> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyZ: 'a',
  KeyK: 'a',
  Space: 'a',
  KeyX: 'b',
  KeyJ: 'b',
  ShiftLeft: 'b',
  ShiftRight: 'b',
  Enter: 'start',
  Backspace: 'select',
};

export function bindKeyboard(controls: Controls, target: Window = window): void {
  const onKey = (down: boolean) => (e: KeyboardEvent) => {
    const button = KEY_MAP[e.code];
    if (!button) return;
    e.preventDefault();
    controls.press('keyboard', button, down);
  };
  target.addEventListener('keydown', onKey(true));
  target.addEventListener('keyup', onKey(false));
  target.addEventListener('blur', () => controls.clear('keyboard'));
}

/**
 * Keep input from getting stuck across page switches (SELECT + START reloads
 * the page): let go of everything when the page is hidden or left, reload a
 * page the browser brings back from its back/forward cache (its loops have
 * stopped and it thinks buttons are still held), and take keyboard focus back
 * on load and on any tap, since inside the itch.io frame focus can stay with
 * the outer page after a switch.
 */
export function guardInput(controls: Controls, onRelease: () => void, target: Window = window): void {
  const release = () => {
    controls.clearAll();
    onRelease();
  };
  target.addEventListener('pagehide', release);
  target.addEventListener('blur', release);
  target.document.addEventListener('visibilitychange', () => {
    if (target.document.visibilityState === 'hidden') release();
  });
  target.addEventListener('pageshow', (e) => {
    if (e.persisted) target.location.reload();
  });
  target.focus();
  target.addEventListener('pointerdown', () => target.focus(), { capture: true });
}
