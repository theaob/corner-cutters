import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GATE_BEAT_MS, showReelGate } from '../src/f1/screens/reelGate';

/** just enough of a page for the gate: elements that take listeners and children */
function fakePage() {
  const el = () => {
    const on = new Map<string, (e?: unknown) => void>();
    const classes = new Set<string>();
    return {
      className: '', textContent: '', hidden: false, type: '', children: [] as unknown[], removed: false,
      classList: { add: (c: string) => classes.add(c), contains: (c: string) => classes.has(c) },
      append(...kids: unknown[]) { this.children.push(...kids); },
      remove() { this.removed = true; },
      addEventListener: (t: string, f: (e?: unknown) => void) => on.set(t, f),
      fire: (t: string, e?: unknown) => on.get(t)?.(e),
    };
  };
  const made: ReturnType<typeof el>[] = [];
  const asked = vi.fn(() => Promise.resolve());
  const keys = new Map<string, (e: unknown) => void>();
  const doc = { createElement: () => (made.push(el()), made[made.length - 1]), body: el(), fullscreenElement: null, documentElement: { requestFullscreen: asked } };
  const win = { addEventListener: (t: string, f: (e: unknown) => void) => keys.set(t, f), removeEventListener: (t: string) => keys.delete(t), screen: {} };
  return { doc, win, made, asked, keys };
}

describe("the showreel's gate", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('takes the whole screen on the first tap, and starts the reel only from its START button', async () => {
    const { doc, win, made, asked, keys } = fakePage();
    let started = false;
    void showReelGate(win as unknown as Window, doc as unknown as Document).then(() => (started = true));
    const [page, line, start, note] = made;
    expect([line.hidden, start.hidden, note.hidden]).toEqual([false, true, true]);
    // (the button does nothing before the screen is whole)
    start.fire('click');
    page.fire('pointerup');
    await vi.advanceTimersByTimeAsync(0);
    expect(asked).toHaveBeenCalledTimes(1);
    expect([line.hidden, start.hidden, note.hidden]).toEqual([true, false, false]);
    // (a key now, say one closing a notice, starts nothing)
    keys.get('keydown')?.({ repeat: false });
    await vi.advanceTimersByTimeAsync(5000);
    expect(started).toBe(false);
    start.fire('click');
    await vi.advanceTimersByTimeAsync(GATE_BEAT_MS - 1);
    expect(started).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(started).toBe(true);
    expect(page.removed).toBe(true);
  });

  it('goes on to its START button where the browser gives no full screen', async () => {
    const { doc, win, made } = fakePage();
    doc.documentElement.requestFullscreen = vi.fn(() => Promise.reject(new Error('no')));
    void showReelGate(win as unknown as Window, doc as unknown as Document);
    made[0].fire('pointerup');
    await vi.advanceTimersByTimeAsync(0);
    expect(made[2].hidden).toBe(false);
  });
});
