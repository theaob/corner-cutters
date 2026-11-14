// The curtain between screens: a dark sheet over the whole page that fades in
// before a screen goes and out once the next is up, so the menu, a race and the
// Championship screen follow one another instead of cutting. Going to a race it
// carries a loading card (the circuit as a turning 3D map, its name, the mode and the
// weather, and a run of chequered squares lighting in turn) while the circuit is
// built. The page opens with it down, lifted once the first screen is up.

import { flagSvg } from '../flags';
import type { CircuitLayout } from '../layouts';
import { motionReduced } from '../access';
import { TRACK_MODEL, drawModel, fitModel, trackModel } from '../trackModel';

/** ms the curtain takes to fade in or out. */
export const CURTAIN_MS = 180;
/** ms the showreel's curtain takes to wipe across (game.css) */
const WIPE_MS = 240;

let sheet: HTMLDivElement | undefined;
let card: HTMLDivElement | undefined;
/** stops the loading card's turning map (the capture build's showreel) */
let stopSpin: () => void = () => {};
/** the showreel's curtain put back where it wipes in from, once it's wiped off */
let wiped: ReturnType<typeof setTimeout> | undefined;
const inReel = () => document.documentElement.classList.contains('showreel');

function ensure(): HTMLDivElement {
  if (sheet) return sheet;
  sheet = document.getElementById('curtain') as HTMLDivElement | null ?? document.createElement('div');
  sheet.id = 'curtain';
  if (!sheet.parentElement) document.body.append(sheet);
  card = document.createElement('div');
  card.className = 'curtain-card';
  sheet.replaceChildren(card);
  return sheet;
}

/** The circuit as the menu draws it, a line in 3D, turning (once every few seconds: the card isn't up long; still under less motion), `size` px tall and `wide` across (square unless said). */
function spinningModel(layout: CircuitLayout, size: number, whip = false, wide = size): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = wide * 2;
  c.height = size * 2;
  Object.assign(c.style, { width: `${wide}px`, height: `${size}px` });
  const ctx = c.getContext('2d');
  if (!ctx) return c;
  const m = trackModel(layout);
  const view = fitModel(m, c.width, c.height);
  if (motionReduced()) {
    drawModel(ctx, m, view, c.width, c.height, -0.35);
    return c;
  }
  let id = 0;
  let began: number | undefined;
  const draw = (now: number) => {
    began ??= now;
    // (the showreel's: whipped round as it comes up, settling into the slow turn)
    const whipped = whip ? 2.4 * Math.exp(-(now - began) / 300) : 0;
    drawModel(ctx, m, view, c.width, c.height, -0.35 + whipped + ((now / 1000) * 2 * Math.PI) / (TRACK_MODEL.turn / 4));
    id = requestAnimationFrame(draw);
  };
  id = requestAnimationFrame(draw);
  stopSpin = () => cancelAnimationFrame(id);
  return c;
}

const frame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Bring the curtain down (resolves once it's down and drawn): with a loading card for a race on `layout` (`line`
 * under its name: the mode, the weather; `glass`: the showreel's, the screen behind left showing, blurred), or plain.
 */
export async function curtainDown(race?: { layout: CircuitLayout; line: string; hold?: number; glass?: boolean }): Promise<void> {
  const s = ensure();
  const reel = inReel();
  const fade = reel ? WIPE_MS : CURTAIN_MS;
  clearTimeout(wiped);
  s.classList.remove('lifting');
  // (the showreel's model over a race: see-through, the race blurred behind it; any other card solid, what's behind it going)
  s.classList.toggle('glass', !!race?.glass);
  card!.replaceChildren();
  if (race) {
    const name = document.createElement('strong');
    name.textContent = race.layout.name.toUpperCase();
    name.prepend(flagSvg(race.layout.country, reel ? 34 : 24) ?? '');
    const line = document.createElement('span');
    line.textContent = race.line;
    const dots = document.createElement('div');
    dots.className = 'curtain-dots';
    for (let k = 0; k < 5; k++) dots.append(document.createElement('i'));
    // the circuit as a turning 3D map (the menu's model), big; in the capture build's showreel also held a moment so it's seen
    stopSpin();
    // (the showreel's card is just the turning map, the flag and the name, as big as the screen takes: no description, no squares)
    const map = reel
      ? spinningModel(race.layout, Math.min(460, Math.round(window.innerHeight * 0.58), Math.round(Math.min(820, window.innerWidth * 0.92) * 0.7)), true, Math.min(820, Math.round(window.innerWidth * 0.92)))
      : spinningModel(race.layout, Math.min(240, Math.round(window.innerWidth * 0.7), Math.round(window.innerHeight * 0.4)));
    if (reel) card!.append(map, name);
    else card!.append(map, name, line, dots);
    if (reel) {
      const shown = !s.classList.contains('down');
      s.classList.add('down');
      if (shown) await wait(fade);
      // (held just long enough to whip in before the circuit's built behind it, which stops it turning; a model's card stays up for its own seconds)
      await wait(race.hold ?? 250);
    }
  }
  const was = s.classList.contains('down');
  s.classList.add('down');
  // (already down: just the card; else wait out the fade, and a frame so the card is drawn before the work starts)
  if (!was) await wait(fade);
  await frame();
  await frame();
}

let lifted: () => void = () => {};
const firstUp = new Promise<void>((resolve) => (lifted = resolve));
/** Resolves once the curtain's first lifted (the game's first screen is up, and can be played). */
export const curtainFirstUp = (): Promise<void> => firstUp;

/** Whether the curtain's down (a screen going, or a race being built behind its card). */
export const curtainIsDown = (): boolean => !!sheet?.classList.contains('down');

/** Lift the curtain (the next screen is up). */
export function curtainUp(): void {
  stopSpin();
  const s = ensure();
  // (the showreel's wipes on across the picture: off the far side, then put back, unseen, where it comes in from)
  if (inReel() && s.classList.contains('down')) {
    s.classList.add('lifting');
    clearTimeout(wiped);
    wiped = setTimeout(() => {
      s.classList.add('unseen');
      s.classList.remove('lifting');
      void s.offsetWidth;
      s.classList.remove('unseen');
    }, WIPE_MS + 40);
  }
  s.classList.remove('down');
  lifted();
}
