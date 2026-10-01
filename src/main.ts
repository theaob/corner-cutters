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
import { THEME_MUSIC } from './f1/music';
import { unlockAudio } from './engine/audio';
import { F1_TUNING } from './f1/tuning';
import { LAYOUTS, layoutById, type CircuitLayout } from './f1/layouts';
import { DESIGNER_DRAFT_ID, designerDraft } from './f1/designerDraft';
import { chooseCircuit, type GameMode } from './f1/circuitSelect';
import { showChampionship } from './f1/screens/championship';
import { loadSeason, newSeason, recordRound, saveSeason, seasonOver, teamOf } from './f1/championship';
import { newSeed } from './engine/rng';
import { openCircuits, savedUnlocks, unlockCircuit } from './f1/unlocks';
import { loadRecords } from './f1/records';
import type { RaceOptions } from './f1/race';
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

/** This page's address with ?circuit set to `id` (or removed: null) and ?mode to a mode other than a race (or removed); other flags (?tune, ?debug…) stay. */
function withCircuit(id: string | null, mode: GameMode | 'tutorial' = 'race'): string {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('circuit', id);
  else url.searchParams.delete('circuit');
  if (mode !== 'race') url.searchParams.set('mode', mode);
  else url.searchParams.delete('mode');
  return url.href;
}

/** A menu choice saved last time, by id (null for none): the last circuit raced (highlighted first in the menu), and the team, difficulty, weather and qualifying chosen there. */
const choice = (name: string): string | null => {
  const v = saved('choices', name);
  return typeof v === 'string' ? v : null;
};
const savedTeam = () => teamById(choice('team')) ?? TEAMS[0];
const savedDifficulty = () => difficultyById(choice('difficulty')) ?? NORMAL;
const savedWeather = () => weatherById(choice('weather')) ?? DRY;
const savedQualifying = () => choice('qualifying') === 'on';
const asMode = (v: string | null): GameMode => (v === 'timetrial' || v === 'championship' ? v : 'race');
const savedMode = (): GameMode => asMode(choice('mode'));

/** The screen showing now (the menu or a race): closed before the next one opens. */
let current: { close(): void } | undefined;
/** Counts screen changes: a screen that finishes opening after a newer change is closed at once. */
let routeId = 0;
/** The TUNE button (laps, grid, AI pace, camera), in every build, mounted with the first race; values are kept on the device. */
let tuning: ReturnType<typeof mountTuning<typeof F1_TUNING>> | undefined;

/**
 * Show the screen the address asks for: ?circuit=<id> races there (?mode=timetrial: a Time Trial there;
 * ?mode=championship: the season's round there), ?mode=championship alone the Championship screen; otherwise
 * the circuit menu. Moving between them changes the address (so the browser's
 * back button works) without loading the page again: the screen before is
 * closed and the next one opened in its place.
 */
async function route(): Promise<void> {
  const id = ++routeId;
  current?.close();
  current = undefined;
  // (nothing held on one screen carries over to the next)
  controls.clearAll();
  releaseDeck(deck);
  const params = new URLSearchParams(window.location.search);
  // (a circuit straight from the track designer: ?circuit=designer-draft)
  const layout = params.get('circuit') === DESIGNER_DRAFT_ID ? designerDraft() : layoutById(params.get('circuit'));
  const mode = asMode(params.get('mode'));
  // a new player: the controls lap first, on the first circuit
  if (!layout && mode !== 'championship' && needsControlsLap()) {
    history.replaceState(null, '', withCircuit(LAYOUTS[0].id, 'tutorial'));
    return route();
  }
  if (params.get('mode') === 'tutorial' && layout) await showRace(id, layout, 'tutorial');
  else if (mode === 'championship' && !layout) await showSeason(id);
  else if (!layout) await showMenu(id);
  else await showRace(id, layout, mode);
}

/** Go to `url` (this page with other flags) and show its screen. */
function navigate(url: string): void {
  history.pushState(null, '', url);
  void route();
}
window.addEventListener('popstate', () => void route());

async function showMenu(id: number): Promise<void> {
  // the menu: all touch, no deck; the screen fills the column
  menuScreen();
  // the landing screen's anthem (it starts with the first tap: browsers allow no sound before one)
  playMusic(THEME_MUSIC);
  const closed = new AbortController();
  current = { close: () => closed.abort() };
  const picked = await chooseCircuit(screen, services, LAYOUTS, layoutById(choice('circuit')), savedTeam(), savedDifficulty(), savedWeather(), savedQualifying(), savedMode(), openNow(), closed.signal);
  if (id !== routeId) return;
  save('choices', 'circuit', picked.layout.id);
  save('choices', 'team', picked.team.id);
  save('choices', 'difficulty', picked.difficulty.id);
  save('choices', 'weather', picked.weather.id);
  save('choices', 'qualifying', picked.qualifying ? 'on' : 'off');
  save('choices', 'mode', picked.mode);
  if (picked.controlsLap) return navigate(withCircuit(LAYOUTS[0].id, 'tutorial'));
  // (a Championship picks its own circuits: to its screen)
  navigate(withCircuit(picked.mode === 'championship' ? null : picked.layout.id, picked.mode));
}

/** The screen fills the column (the menus: all touch, no deck). */
function menuScreen(): void {
  document.documentElement.classList.add('menu');
  const fillScreen = () => {
    screen.style.width = '100%';
    screen.style.height = '100%';
  };
  fillScreen();
  onResize = fillScreen;
}

/** The circuits open for a Quick Race or a Time Trial now. */
const openNow = () => openCircuits(LAYOUTS.map((l) => l.id), savedUnlocks(), Object.keys(loadRecords().circuits));
/** A new player: never done (or skipped) the controls lap, and nothing played yet (no records, no season, nothing unlocked). */
const needsControlsLap = () => saved('progress', 'onboarded') !== true && !Object.keys(loadRecords().circuits).length && !loadSeason() && !savedUnlocks().length;
/** A circuit the Championship just unlocked (said on its screen once). */
let justUnlocked: string | undefined;

/** The Championship screen: the season so far and the way on (the next round, a new season, or back to the menu). */
async function showSeason(id: number): Promise<void> {
  menuScreen();
  playMusic(THEME_MUSIC);
  const closed = new AbortController();
  current = { close: () => closed.abort() };
  const season = loadSeason();
  const action = await showChampionship(screen, services, season, justUnlocked, closed.signal);
  justUnlocked = undefined;
  if (id !== routeId) return;
  if (action === 'race' && season) navigate(withCircuit(season.rounds[season.round], 'championship'));
  else if (action === 'new') {
    // a new season with the menu's team, difficulty, weather and qualifying: a round on every circuit
    saveSeason(newSeason({ seed: newSeed(), team: savedTeam(), difficulty: savedDifficulty().id, weather: savedWeather().id, qualifying: savedQualifying(), rounds: LAYOUTS.map((l) => l.id), total: 10 }));
    void route();
  } else navigate(withCircuit(null));
}

async function showRace(id: number, layout: CircuitLayout, mode: GameMode | 'tutorial'): Promise<void> {
  // (a draft from the designer: a quick race or a time trial, never a Championship round)
  // a Championship round: the season's next round (any other circuit: back to its screen)
  if (layout.id === DESIGNER_DRAFT_ID && mode === 'championship') mode = 'race';
  const season = mode === 'championship' ? loadSeason() : undefined;
  if (mode === 'championship' && (!season || seasonOver(season) || season.rounds[season.round] !== layout.id)) {
    history.replaceState(null, '', withCircuit(null, 'championship'));
    return route();
  }
  document.documentElement.classList.remove('menu');
  const fit = sizeScreen();
  tuning ??= mountTuning(screen, 'f1', F1_TUNING);
  const { raceOn } = await import('./f1/race');
  if (id !== routeId) return;
  const toSeason = () => navigate(withCircuit(null, 'championship'));
  const quit = season
    ? toSeason
    : layout.id === DESIGNER_DRAFT_ID
      ? () => {
          // (a draft from the track designer: back to it)
          window.location.href = './designer.html';
        }
    : mode === 'tutorial'
      ? () => {
          // (done or skipped: either way, not shown on its own again)
          save('progress', 'onboarded', true);
          navigate(withCircuit(null));
        }
      : () => navigate(withCircuit(null));
  const options: RaceOptions = season
    ? {
        team: teamOf(season.drivers[season.you]), difficulty: difficultyById(season.difficulty) ?? NORMAL, weather: weatherById(season.weather) ?? DRY, qualifying: season.qualifying,
        championship: {
          season,
          onDone: (finish, out) => {
            recordRound(season, finish, out);
            saveSeason(season);
            // reaching the next round's circuit unlocks it for a Quick Race and a Time Trial
            const next = season.rounds[season.round];
            if (next && !openNow().has(next)) {
              unlockCircuit(next);
              justUnlocked = next;
            }
            toSeason();
          },
        },
      }
    : mode === 'tutorial'
      ? { team: savedTeam(), difficulty: NORMAL, weather: DRY, mode: 'tutorial' }
      : { team: savedTeam(), difficulty: savedDifficulty(), weather: savedWeather(), qualifying: savedQualifying(), mode: mode === 'timetrial' ? 'timetrial' : 'race' };
  const view: StandaloneView = await raceOn(layout, quit, options)({ host: screen, services, tuning, fit });
  if (id !== routeId) {
    view.dispose();
    return;
  }
  current = { close: () => view.dispose() };
  onResize = () => view.resize(sizeScreen());
}

void route();
