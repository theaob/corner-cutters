import { type StandaloneView } from './engine/view';
import { mountTuning } from './engine/tuning';
import { Controls, bindGamepad, bindKeyboard, guardInput } from './engine/controls';
import type { Services } from './engine/services';
import { Hud, bindDeck, releaseDeck, setStickSide, stickSide } from './engine/deck';
import { showInputLog } from './engine/inputLog';
import { canSwitchLayout, measureFit, startLayout, type LayoutMode, type ScreenFit } from './engine/layout';
import { useStore } from './engine/storage';
import { save, saved, useSave } from './engine/save';
import { CC_SAVE } from './f1/save';
import { playMusic } from './engine/music';
import { MENU_MUSIC } from './f1/music';
import { unlockAudio } from './engine/audio';
import { F1_TUNING } from './f1/tuning';
import { LAYOUTS, layoutById } from './f1/layouts';
import { chooseCircuit } from './f1/circuitSelect';
import { TEAMS, teamById } from './f1/teams';
import { NORMAL, difficultyById } from './f1/difficulty';
import { DRY, weatherById } from './f1/weather';

const screen = document.getElementById('screen')!;
const deck = document.getElementById('deck')!;

const app = document.getElementById('app')!;
const layoutButton = document.querySelector<HTMLButtonElement>('[data-layout]');

// this game's saves (each game has its own prefix: itch.io games share one origin's storage), in its save format
useStore('cc:');
useSave(CC_SAVE);

// The layout: every device starts in the handheld one. The player can switch
// to the desktop layout (a wide screen with the deck laid over it as a HUD)
// with the WIDE button or the V key, and back; the choice is kept on the device.
const savedLayout = () => {
  const v = saved('settings', 'layout');
  return typeof v === 'string' ? v : null;
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
bindGamepad(controls);
unlockAudio();
bindDeck(deck, controls);
setStickSide(deck, stickSide());
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
  save('settings', 'layout', layout);
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

/** A menu choice saved last time, by id (null for none): the last circuit raced (highlighted first in the menu), and the team, difficulty and weather chosen there. */
const choice = (name: string): string | null => {
  const v = saved('choices', name);
  return typeof v === 'string' ? v : null;
};
const savedTeam = () => teamById(choice('team')) ?? TEAMS[0];
const savedDifficulty = () => difficultyById(choice('difficulty')) ?? NORMAL;
const savedWeather = () => weatherById(choice('weather')) ?? DRY;

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
    // the menu's music (it starts with the first tap: browsers allow no sound before one)
    playMusic(MENU_MUSIC);
    const picked = await chooseCircuit(screen, services, LAYOUTS, layoutById(choice('circuit')), savedTeam(), savedDifficulty(), savedWeather());
    save('choices', 'circuit', picked.layout.id);
    save('choices', 'team', picked.team.id);
    save('choices', 'difficulty', picked.difficulty.id);
    save('choices', 'weather', picked.weather.id);
    window.location.assign(withCircuit(picked.layout.id));
    return;
  }
  // the TUNE button (laps, grid, AI pace, camera), in every build; values are kept on the device
  const tuning = mountTuning(screen, 'f1', F1_TUNING);
  const { raceOn } = await import('./f1/race');
  const quit = () => window.location.assign(withCircuit(null));
  const view: StandaloneView = await raceOn(layout, quit, savedTeam(), savedDifficulty(), savedWeather())({ host: screen, services, tuning, fit });
  onResize = () => view.resize(sizeScreen());
}

void start();
