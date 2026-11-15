// The capture build's showreel, before it starts: a dark page with two steps, so a recording holds nothing but the
// reel. First a tap anywhere takes the whole screen (the browser's own "press Esc" notice shows then, and goes or
// is closed); then a START button, pressed once the recorder is running, starts the reel from its title. Nothing
// of the game is drawn or sounds until then.

/** ms from START being pressed to the reel starting (the button gone, the page dark: a clean first frame to cut on) */
export const GATE_BEAT_MS = 700;

/** Ask for the whole screen, the screen's turn held as it is (a recording mustn't change shape); resolves either way. */
async function wholeScreen(win: Window, doc: Document): Promise<void> {
  try {
    if (doc.fullscreenElement || !doc.documentElement.requestFullscreen) return;
    await doc.documentElement.requestFullscreen({ navigationUI: 'hide' });
    const o = win.screen?.orientation as (ScreenOrientation & { lock?: (t: string) => Promise<void> }) | undefined;
    await o?.lock?.(o.type).catch(() => {});
  } catch {
    // (no full screen here: the reel runs in the window)
  }
}

/** Show the gate over the page; resolves once START has been pressed (and the beat after it has passed). */
export function showReelGate(win: Window = window, doc: Document = document): Promise<void> {
  const page = doc.createElement('div');
  page.className = 'reel-gate';
  const line = doc.createElement('p');
  line.textContent = 'TAP OR PRESS A KEY FOR FULL SCREEN';
  const start = doc.createElement('button');
  start.type = 'button';
  start.textContent = '▶ START THE REEL';
  start.hidden = true;
  const note = doc.createElement('small');
  note.textContent = 'CLOSE ANY NOTICE, START RECORDING, THEN PRESS START';
  note.hidden = true;
  page.append(line, start, note);
  doc.body.append(page);
  return new Promise<void>((resolve) => {
    let stage: 'screen' | 'start' | 'gone' = 'screen';
    const toStart = () => {
      if (stage !== 'screen') return;
      stage = 'start';
      void wholeScreen(win, doc).then(() => {
        line.hidden = true;
        start.hidden = false;
        note.hidden = false;
      });
    };
    page.addEventListener('pointerup', toStart);
    const key = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (stage === 'screen') toStart();
    };
    win.addEventListener('keydown', key);
    // (a click only: a key that closes a notice mustn't start the reel; Enter or Space on the button is a click)
    start.addEventListener('click', () => {
      if (stage !== 'start' || start.hidden) return;
      stage = 'gone';
      win.removeEventListener('keydown', key);
      page.classList.add('going');
      setTimeout(() => {
        page.remove();
        resolve();
      }, GATE_BEAT_MS);
    });
  });
}
