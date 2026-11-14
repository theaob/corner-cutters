// Full screen on a phone's browser: Chrome keeps its address bar over a web game unless the page asks for the whole
// screen, and it only lets a page ask from a tap. The title screen's tap (the one that starts the sound too) asks.
// Only the web game on a touch screen: the apps are full screen already, and a frame (YouTube, itch.io's page) has
// its own button. The ask is best effort: a browser that says no leaves the game as it was.

import { platformName } from './platform';
import { YOUTUBE } from './host';

/** Whether to ask for full screen at a tap: the web game, on a touch screen, not already full screen or installed. */
export function wantsFullscreen(win: Window = window, doc: Document = document): boolean {
  if (YOUTUBE || platformName() !== 'web') return false;
  if (!(win.matchMedia?.('(pointer: coarse)').matches ?? false)) return false;
  if (doc.fullscreenElement || win.matchMedia?.('(display-mode: fullscreen), (display-mode: standalone)').matches) return false;
  return !!doc.fullscreenEnabled && !!doc.documentElement.requestFullscreen;
}

/**
 * Ask for full screen (from a tap), and with `holdTurn` keep the screen's turn as it is now (a recording
 * mustn't change shape when the phone is tilted). Quietly nothing where the browser won't.
 */
export function goFullscreen(holdTurn = false, win: Window = window, doc: Document = document): void {
  if (!wantsFullscreen(win, doc)) return;
  try {
    const asked = doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    void asked.then(() => {
      const o = win.screen?.orientation as (ScreenOrientation & { lock?: (t: string) => Promise<void> }) | undefined;
      if (holdTurn && o?.lock) return o.lock(o.type).catch(() => {});
    }, () => {});
  } catch {
    // (no full screen here)
  }
}
