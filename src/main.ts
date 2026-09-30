import { type StandaloneView } from './engine/view';
import { mountTuning } from './engine/tuning';
import { Controls, bindKeyboard, guardInput } from './engine/controls';
import type { Services } from './engine/services';
import { Hud, bindDeck, releaseDeck } from './engine/deck';
import { showInputLog } from './engine/inputLog';
import { canSwitchLayout, measureFit, startLayout, type LayoutMode, type ScreenFit } from './engine/layout';
import { storeKey, useStore } from './engine/storage';
import { F1_TUNING } from './f1/tuning';
import { LAYOUTS, layoutById } from './f1/layouts';
import { chooseCircuit } from './f1/circuitSelect';
import { TEAMS, teamById } from './f1/teams';

const screen = document.getElementById('screen')!;
const deck = document.getElementById('deck')!;

const app = document.getElementById('app')!;
const layoutButton = document.querySelector<HTMLButtonElement>('[data-layout]');

// this game's saves (each game has its own prefix: itch.io games share one origin's storage)
useStore('cc:');

// The layout: every device starts in the handheld one. The player can switch
// to the desktop layout (a wide screen with the deck laid over it as a HUD)
// with the WIDE button or the V key, and back; the choice is kept on the device.
const LAYOUT_KEY = storeKey('layout');
const savedLayout = () => {
  try {
    return localStorage.getItem(LAYOUT_KEY);
  } catch {
    return null;
  }
};
let layout: LayoutMode = startLayout(window.location.search, savedLayout());
function applyLayout(): void {
  const desktop = layout === 'desktop';
  document.documentElement.classList.toggle('desktop', desktop);
  // the deck sits over the screen as a HUD on desktop, under it on a phone
  if (desktop) screen.append(deck);
  else app.append(deck);
  if (layoutButton) {
    layoutButton.hidden = !canSwitchLayout() && !desktop;
    layoutButton.textContent = desktop ? 'HANDHELD' : 'WIDE';
  }
}
applyLayout();

const controls = new Controls();
bindKeyboard(controls);
bindDeck(deck, controls);
guardInput(controls, () => releaseDeck(deck));
const services: Services = { controls, hud: new Hud(deck) };
// ?inputlog lists the input events the page receives, for debugging controls on a device
if (new URLSearchParams(window.location.search).has('inputlog')) showInputLog(document.getElementById('app')!, controls);

/** Size the screen element: full column width and a height to suit the phone, or the window on a desktop. */
function sizeScreen(): ScreenFit {
  const fit = measureFit(layout);
  screen.style.width = `${fit.width * fit.scale}px`;
  screen.style.height = `${fit.height * fit.scale}px`;
  return fit;
}

/** What a window resize (or a layout switch) does: re-fit the screen and tell the running view. */
let onResize: () => void = () => sizeScreen();
window.addEventListener('resize', () => onResize());

/** The player switches layout: no reload, the game carries on in the new shape. */
function switchLayout(): void {
  layout = layout === 'desktop' ? 'handheld' : 'desktop';
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {
    // storage blocked: the switch still holds until the page closes
  }
  controls.clearAll();
  releaseDeck(deck);
  applyLayout();
  onResize();
}
layoutButton?.addEventListener('click', (e) => {
  e.preventDefault();
  switchLayout();
  layoutButton.blur();
});
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyV' && !e.repeat && !(e.target instanceof HTMLInputElement)) switchLayout();
});

/** This page's address with ?circuit set to `id`, or removed (null); other flags (?tune, ?debug…) stay. */
function withCircuit(id: string | null): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('circuit', id);
  else url.searchParams.delete('circuit');
  return url.href;
}

// the last circuit raced, highlighted first in the menu, and the team chosen there
const CIRCUIT_KEY = storeKey('circuit');
const TEAM_KEY = storeKey('team');
const saved = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
};
const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // storage blocked: not remembered
  }
};
const savedTeam = () => teamById(saved(TEAM_KEY)) ?? TEAMS[0];

/**
 * ?circuit=<id> races there; otherwise the circuit menu comes first. Picking
 * one (or SELECT during a race) moves between the two by address, so the
 * browser's back button works and the race starts from a clean page.
 */
async function start(): Promise<void> {
  const fit = sizeScreen();
  const layout = layoutById(new URLSearchParams(window.location.search).get('circuit'));
  if (!layout) {
    // the menu: all touch, no deck; the screen fills the column
    document.documentElement.classList.add('menu');
    const fillScreen = () => {
      screen.style.width = '100%';
      screen.style.height = '100%';
    };
    fillScreen();
    onResize = fillScreen;
    const picked = await chooseCircuit(screen, services, LAYOUTS, layoutById(saved(CIRCUIT_KEY)), savedTeam());
    save(CIRCUIT_KEY, picked.layout.id);
    save(TEAM_KEY, picked.team.id);
    window.location.assign(withCircuit(picked.layout.id));
    return;
  }
  // the TUNE button (laps, grid, AI pace, camera), in every build; values are kept on the device
  const tuning = mountTuning(screen, 'f1', F1_TUNING);
  const { raceOn } = await import('./f1/race');
  const quit = () => window.location.assign(withCircuit(null));
  const view: StandaloneView = await raceOn(layout, quit, savedTeam())({ host: screen, services, tuning, fit });
  onResize = () => view.resize(sizeScreen());
}

void start();
