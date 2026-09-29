import { describe, expect, it, vi } from 'vitest';
import { Controls, directionsFromOffset, guardInput, stickFromOffset } from '../src/engine/controls';

describe('directionsFromOffset', () => {
  it('ignores the dead zone', () => {
    expect(directionsFromOffset(3, -2, 10)).toEqual([]);
  });

  it('maps the four arms', () => {
    expect(directionsFromOffset(40, 0, 10)).toEqual(['right']);
    expect(directionsFromOffset(-40, 2, 10)).toEqual(['left']);
    expect(directionsFromOffset(0, -40, 10)).toEqual(['up']);
    expect(directionsFromOffset(1, 40, 10)).toEqual(['down']);
  });

  it('maps diagonals', () => {
    expect(directionsFromOffset(30, -30, 10)).toEqual(['up', 'right']);
    expect(directionsFromOffset(-30, 30, 10)).toEqual(['down', 'left']);
  });
});

describe('Controls', () => {
  it('holds a button while any source holds it', () => {
    const c = new Controls();
    c.press('keyboard', 'b', true);
    c.press('touch-b', 'b', true);
    c.press('keyboard', 'b', false);
    expect(c.isDown('b')).toBe(true);
    c.clear('touch-b');
    expect(c.isDown('b')).toBe(false);
  });

  it('replaces a source’s buttons with set()', () => {
    const c = new Controls();
    c.set('dpad', ['up', 'right']);
    c.set('dpad', ['down']);
    expect(c.isDown('up')).toBe(false);
    expect(c.isDown('down')).toBe(true);
  });

  it('counts taps shorter than a frame', () => {
    const c = new Controls();
    c.press('keyboard', 'a', true);
    c.press('keyboard', 'a', false);
    expect(c.isDown('a')).toBe(false);
    expect(c.presses('a')).toBe(1);
  });

  it('does not double-count a button held by two sources', () => {
    const c = new Controls();
    c.press('keyboard', 'a', true);
    c.press('touch-a', 'a', true);
    expect(c.presses('a')).toBe(1);
    c.set('dpad', ['up']);
    c.set('dpad', ['up', 'right']);
    expect(c.presses('up')).toBe(1);
    expect(c.presses('right')).toBe(1);
  });
});

describe('stickFromOffset', () => {
  it('keeps the exact angle and scales length from the dead zone to the rim', () => {
    const s = stickFromOffset(30, 40, 50, 0.2);
    expect(s.x / s.y).toBeCloseTo(0.75);
    expect(Math.hypot(s.x, s.y)).toBeCloseTo(1);
    expect(Math.hypot(...Object.values(stickFromOffset(3, 4, 50, 0.2)))).toBe(0);
    expect(Math.hypot(...Object.values(stickFromOffset(0, 30, 50, 0.2)))).toBeCloseTo(0.5);
  });
});

describe('Controls.direction', () => {
  it('uses the touch thumb position when there is one', () => {
    const c = new Controls();
    c.setStick('dpad', { x: 0.3, y: -0.4 });
    c.set('dpad', ['up']);
    expect(c.direction()).toEqual({ x: 0.3, y: -0.4 });
  });

  it('falls back to the held buttons, 8-way at full length', () => {
    const c = new Controls();
    c.press('keyboard', 'right', true);
    c.press('keyboard', 'down', true);
    const d = c.direction();
    expect(d.x).toBeCloseTo(Math.SQRT1_2);
    expect(d.y).toBeCloseTo(Math.SQRT1_2);
    c.clear('keyboard');
    expect(c.direction()).toEqual({ x: 0, y: 0 });
  });
});

describe('guardInput', () => {
  const fakeWindow = () => {
    const win = Object.assign(new EventTarget(), {
      document: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
      location: { reload: vi.fn() },
      focus: vi.fn(),
    });
    return win;
  };
  const holding = () => {
    const c = new Controls();
    c.press('touch-select', 'select', true);
    c.press('touch-start', 'start', true);
    c.set('dpad', ['up']);
    c.setStick('dpad', { x: 0, y: -1 });
    return c;
  };

  it('lets go of every source when the page is left', () => {
    const win = fakeWindow();
    const c = holding();
    const onRelease = vi.fn();
    guardInput(c, onRelease, win as unknown as Window);
    win.dispatchEvent(new Event('pagehide'));
    expect(c.isDown('select') || c.isDown('start') || c.isDown('up')).toBe(false);
    expect(c.stick()).toBeUndefined();
    expect(onRelease).toHaveBeenCalled();
  });

  it('lets go when the page is hidden or loses focus', () => {
    const win = fakeWindow();
    const c = holding();
    guardInput(c, () => {}, win as unknown as Window);
    win.dispatchEvent(new Event('blur'));
    expect(c.isDown('start')).toBe(false);
    c.press('touch-a', 'a', true);
    win.document.visibilityState = 'hidden';
    win.document.dispatchEvent(new Event('visibilitychange'));
    expect(c.isDown('a')).toBe(false);
  });

  it('reloads a page brought back from the back/forward cache, and takes focus', () => {
    const win = fakeWindow();
    guardInput(new Controls(), () => {}, win as unknown as Window);
    expect(win.focus).toHaveBeenCalledTimes(1);
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: false }));
    expect(win.location.reload).not.toHaveBeenCalled();
    win.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
    expect(win.location.reload).toHaveBeenCalled();
    win.dispatchEvent(new Event('pointerdown'));
    expect(win.focus).toHaveBeenCalledTimes(2);
  });
});
