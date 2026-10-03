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
import { lapsFrom } from './f1/laps';
import { curtainDown, curtainUp } from './f1/screens/curtain';
import { forgetChangedCircuits } from './f1/circuitHash';
import { chooseCircuit, type GameMode } from './f1/circuitSelect';
import { showChampionship } from './f1/screens/championship';
import { loadSeason, newSeason, recordRound, roundSeed, saveSeason, seasonOver, standings, teamOf } from './f1/championship';
import { awardTitle } from './f1/medals';
import { unlock } from './f1/achievements';
import { achievementToast, hintToast } from './f1/screens/celebrate';
import { listenForBack, pressBack } from './engine/backButton';
import { newSeed } from './engine/rng';
import { openCircuits, savedUnlocks, unlockCircuit } from './f1/unlocks';
import { PAYWALL, circuitsOpen, openShop, ownsChampionship } from './f1/purchase';
import { loadRecords } from './f1/records';
import type { RaceOptions } from './f1/race';
import { TEAMS, teamById, type Seat } from './f1/teams';
import { NORMAL, difficultyById } from './f1/difficulty';
import { DRY, WEATHERS, weatherById } from './f1/weather';
import { roundForecast } from './f1/forecast';

const screen = document.getElementById('screen')!;
const deck = document.getElementById('deck')!;

const app = document.getElementById('app')!;
const layoutButton = document.querySelector<HTMLButtonElement>('[data-layout]');

// this game's saves (each game has its own prefix: itch.io games share one origin's storage), in its save format
useStore('cc:');
useSave(CC_SAVE);
// (records and ghosts on a circuit an update has reshaped were set on another track: forgotten)
forgetChangedCircuits(LAYOUTS);

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
// the phone's back button (in the Android app): each screen's own back, and on the menu's first screen a second press
// to leave
void listenForBack(() => hintToast('PRESS BACK AGAIN TO EXIT'));
// (with ?debug, a press of it by hand: __back())
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __back: () => pressBack(performance.now() / 1000, () => hintToast('PRESS BACK AGAIN TO EXIT'), () => console.log('exit')) });
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
  // (on a phone the deck floats over the screen's lower part: what it covers, for the race's panels to keep clear of)
  const controls = deck.querySelector<HTMLElement>('.controls');
  const cover = fit.desktop || !controls ? 0 : deck.offsetHeight - controls.offsetTop;
  screen.style.setProperty('--deck-cover', `${cover}px`);
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
const savedSeat = (): Seat => (choice('seat') === '1' ? 1 : 0);
const savedDifficulty = () => difficultyById(choice('difficulty')) ?? NORMAL;
const savedWeather = () => weatherById(choice('weather')) ?? DRY;
const clockWeather = () => WEATHERS.find((w) => w.id === savedWeather().id) ?? DRY;
const savedQualifying = () => choice('qualifying') === 'on';
const savedLaps = () => lapsFrom(choice('laps'));
const asMode = (v: string | null): GameMode => (v === 'timetrial' || v === 'timeattack' || v === 'championship' ? v : 'race');
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
  // the curtain down over the screen going (going to a race, with its loading card), then the screen closed behind it
  const params0 = new URLSearchParams(window.location.search);
  const going = params0.get('circuit') === DESIGNER_DRAFT_ID ? designerDraft() : layoutById(params0.get('circuit'));
  await curtainDown(going ? { layout: going, line: raceLine(params0.get('mode')) } : undefined);
  if (id !== routeId) return;
  current?.close();
  current = undefined;
  // (nothing held on one screen carries over to the next)
  controls.clearAll();
  releaseDeck(deck);
  const params = new URLSearchParams(window.location.search);
  // (a circuit straight from the track designer: ?circuit=designer-draft)
  const layout = params.get('circuit') === DESIGNER_DRAFT_ID ? designerDraft() : layoutById(params.get('circuit'));
  // (and a draft edited in the designer since it was last driven)
  if (layout?.id === DESIGNER_DRAFT_ID) forgetChangedCircuits([layout], LAYOUTS);
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

/** The line under a race's name on its loading card: the mode (a Championship's round) and the weather. */
function raceLine(mode: string | null): string {
  if (mode === 'tutorial') return 'CONTROLS LAP';
  const season = mode === 'championship' ? loadSeason() : undefined;
  const what = season ? `CHAMPIONSHIP · ROUND ${season.round + 1} OF ${season.rounds.length}` : mode === 'timetrial' ? 'TIME TRIAL' : mode === 'timeattack' ? 'TIME ATTACK' : 'QUICK RACE';
  if (season) return `${what} · FORECAST: ${roundForecast(roundSeed(season, season.round), 1).name}`;
  // (against the clock, the weather's the same all session: a Quick Race's changeable is dry there)
  const weather = mode === 'timetrial' || mode === 'timeattack' ? clockWeather() : savedWeather();
  return `${what} · ${weather.name}`;
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
  // a race going on behind the menu (loaded once it's up), on the circuit last picked
  let stopBackdrop = () => {};
  closed.signal.addEventListener('abort', () => stopBackdrop());
  current = { close: () => closed.abort() };
  const picking = chooseCircuit(screen, services, LAYOUTS, layoutById(choice('circuit')), savedTeam(), savedDifficulty(), savedWeather(), savedQualifying(), savedMode(), savedLaps(), savedSeat(), openNow(), closed.signal);
  curtainUp();
  const backdropOn = layoutById(choice('circuit')) && openNow().has(choice('circuit')!) ? layoutById(choice('circuit'))! : LAYOUTS[0];
  void import('./f1/screens/menuBackdrop').then(({ startBackdrop }) => {
    if (!closed.signal.aborted) stopBackdrop = startBackdrop(screen, backdropOn);
  });
  const picked = await picking;
  stopBackdrop();
  if (id !== routeId) return;
  save('choices', 'circuit', picked.layout.id);
  save('choices', 'team', picked.team.id);
  save('choices', 'seat', String(picked.seat));
  save('choices', 'difficulty', picked.difficulty.id);
  save('choices', 'weather', picked.weather.id);
  save('choices', 'qualifying', picked.qualifying ? 'on' : 'off');
  save('choices', 'laps', String(picked.laps));
  save('choices', 'mode', picked.mode);
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

/** The circuits open for a Quick Race, a Time Attack or a Time Trial now (in the Google Play build, without the Championship bought: the first only). */
const openNow = () => circuitsOpen(ownsChampionship(), LAYOUTS[0].id, openCircuits(LAYOUTS.map((l) => l.id), savedUnlocks(), Object.keys(loadRecords().circuits)));
/** A new player: never done (or skipped) the controls lap, and nothing played yet (no records, no season, nothing unlocked). */
const needsControlsLap = () => saved('progress', 'onboarded') !== true && !Object.keys(loadRecords().circuits).length && !loadSeason() && !savedUnlocks().length;
/** A circuit the Championship just unlocked (said on its screen once). */
let justUnlocked: string | undefined;
/** The Championship was just won (celebrated on its screen once). */
let justWon = false;

/** The Championship screen: the season so far and the way on (the next round, a new season, or back to the menu). */
async function showSeason(id: number): Promise<void> {
  menuScreen();
  playMusic(THEME_MUSIC);
  const closed = new AbortController();
  current = { close: () => closed.abort() };
  // (the Google Play build, the Championship not bought yet: its shop first)
  if (!ownsChampionship()) {
    const { showShop } = await import('./f1/screens/shop');
    curtainUp();
    const got = await showShop(screen, services, openShop(), closed.signal);
    if (id !== routeId) return;
    if (got === 'back') return navigate(withCircuit(null));
  }
  const season = loadSeason();
  const showing = showChampionship(screen, services, season, justUnlocked, { team: savedTeam(), seat: savedSeat(), qualifying: savedQualifying() }, closed.signal, justWon);
  justWon = false;
  curtainUp();
  const action = await showing;
  justUnlocked = undefined;
  if (id !== routeId) return;
  if (action === 'race' && season) navigate(withCircuit(season.rounds[season.round], 'championship'));
  else if (typeof action === 'object') {
    // a new season with the team and qualifying picked for it (kept as the choices), and the difficulty from
    // the settings: a round on every circuit
    const { team, seat, qualifying } = action.new;
    save('choices', 'team', team.id);
    save('choices', 'seat', String(seat));
    save('choices', 'qualifying', qualifying ? 'on' : 'off');
    saveSeason(newSeason({ seed: newSeed(), team, seat, difficulty: savedDifficulty().id, qualifying, rounds: LAYOUTS.map((l) => l.id), total: 10 }));
    void route();
  } else navigate(withCircuit(null));
}

async function showRace(id: number, layout: CircuitLayout, mode: GameMode | 'tutorial'): Promise<void> {
  // (a draft from the designer: a quick race or a time trial, never a Championship round)
  // a Championship round: the season's next round (any other circuit: back to its screen)
  if (layout.id === DESIGNER_DRAFT_ID && mode === 'championship') mode = 'race';
  const season = mode === 'championship' ? loadSeason() : undefined;
  // (a round of a Championship not bought, or a circuit not open: to the Championship's screen, its shop first)
  if (mode === 'championship' && (!ownsChampionship() || !season || seasonOver(season) || season.rounds[season.round] !== layout.id)) {
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
        team: teamOf(season.drivers[season.you]), difficulty: difficultyById(season.difficulty) ?? NORMAL, qualifying: season.qualifying,
        championship: {
          season,
          onDone: (finish, out) => {
            recordRound(season, finish, out);
            saveSeason(season);
            // the season won: into the trophy cabinet
            if (seasonOver(season) && standings(season)[0]?.driver === season.you) {
              awardTitle();
              justWon = true;
              for (const a of unlock(['champion'])) achievementToast(a);
            }
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
      ? { team: savedTeam(), seat: savedSeat(), difficulty: NORMAL, weather: DRY, mode: 'tutorial' }
      : { team: savedTeam(), seat: savedSeat(), difficulty: savedDifficulty(), weather: mode === 'timetrial' || mode === 'timeattack' ? clockWeather() : savedWeather(), qualifying: savedQualifying(), laps: savedLaps(), mode: mode === 'timetrial' || mode === 'timeattack' ? mode : 'race' };
  const view: StandaloneView = await raceOn(layout, quit, options)({ host: screen, services, tuning, fit });
  if (id !== routeId) {
    view.dispose();
    return;
  }
  current = { close: () => view.dispose() };
  onResize = () => view.resize(sizeScreen());
  curtainUp();
}

// (the Google Play build: the store up from the start, so a Championship bought on another install comes back)
if (PAYWALL) openShop();
void route();
