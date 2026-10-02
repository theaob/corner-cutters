// The Championship screen, between rounds: the season so far (each round's
// circuit, your place in the ones raced), the drivers' standings, and the way
// on: race the next round, start a new season, or back to the menu. At the end
// of the season it crowns the champion. Touch, or keys: up/down moves, A or
// START picks, SELECT goes back.

import type { Button } from '../../engine/controls';
import { holdTouches } from '../../engine/deck';
import type { Services } from '../../engine/services';
import { carRow, menuButton, optionRow } from '../circuitSelect';
import { confetti, trophy } from './celebrate';
import { onBack } from '../../engine/backButton';
import { POINTS, pointsOf, seasonOver, standings, teamOf, type Season } from '../championship';
import { difficultyById } from '../difficulty';
import { layoutById } from '../layouts';
import { menuPick, menuTick } from '../sounds';
import { WEATHERS, weatherById, type Weather } from '../weather';
import { TEAMS, type Seat, type Team } from '../teams';
import { logoSvg } from '../logos';

/** What next: the next round, a new season (with the team, weather and qualifying picked for it), or back to the menu. */
export type ChampionshipAction = 'race' | 'back' | { new: { team: Team; seat: Seat; weather: Weather; qualifying: boolean } };

/** A new season's choices, as last picked. */
export interface SeasonChoices {
  team: Team;
  seat: Seat;
  weather: Weather;
  qualifying: boolean;
}

const nameOf = (id: string) => layoutById(id)?.name.toUpperCase() ?? id.toUpperCase();

/** Count `el`'s number up from `from` to `to`, starting after `delay` ms, over most of a second. */
function countUp(el: HTMLElement, from: number, to: number, delay: number): void {
  const start = performance.now() + delay;
  const tick = (now: number) => {
    const k = Math.min(1, Math.max(0, (now - start) / 800));
    el.textContent = `${Math.round(from + (to - from) * (1 - (1 - k) ** 3))}`;
    if (k < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** The standings as a table: place, driver, team, points (and what the last round brought), wins; you in gold. */
function standingsTable(s: Season): HTMLTableElement {
  const points = pointsOf(s);
  const last = s.places[s.places.length - 1];
  const cell = (tag: 'td' | 'th', text: string, right = false) => {
    const c = document.createElement(tag);
    c.textContent = text;
    Object.assign(c.style, { padding: '2px 4px', textAlign: right ? 'right' : 'left', fontWeight: 'normal', whiteSpace: 'nowrap' });
    return c;
  };
  const table = document.createElement('table');
  Object.assign(table.style, { width: '100%', borderCollapse: 'collapse', font: '12px var(--pixel)', color: 'var(--text)' });
  const head = document.createElement('tr');
  head.style.color = 'var(--muted)';
  head.append(cell('th', '', true), cell('th', 'DRIVER'), cell('th', 'TEAM'), cell('th', 'PTS', true), cell('th', ''), cell('th', 'WINS', true), cell('th', 'LAST', true));
  table.append(head);
  standings(s).forEach((r, pos) => {
    const d = s.drivers[r.driver];
    const row = document.createElement('tr');
    if (r.driver === s.you) row.style.color = 'var(--gold)';
    // (sliding in one after another)
    row.style.animation = `row-in 0.35s ease-out ${(0.1 + pos * 0.06).toFixed(2)}s both`;
    const lastPlace = last?.[r.driver];
    // the points the last round brought: a +n beside the total, which counts up to it
    const scored = lastPlace !== undefined && lastPlace >= 0 ? (POINTS[lastPlace] ?? 0) : 0;
    const pts = cell('td', `${points[r.driver] - scored}`, true);
    if (scored) countUp(pts, points[r.driver] - scored, points[r.driver], 700 + pos * 60);
    const plus = cell('td', scored ? `+${scored}` : '');
    Object.assign(plus.style, { color: 'var(--gold)', fontSize: '10px', animation: scored ? `score-in 1.6s ease-out ${(0.5 + pos * 0.06).toFixed(2)}s both` : '' });
    row.append(
      cell('td', `${pos + 1}`, true), cell('td', d.name), cell('td', teamOf(d).code), pts, plus, cell('td', `${r.wins}`, true),
      cell('td', lastPlace === undefined ? '' : lastPlace < 0 ? 'DNF' : `P${lastPlace + 1}`, true),
    );
    table.append(row);
  });
  return table;
}

/**
 * Show the Championship screen for `season` (none: no season yet) in `host`
 * until the player picks what next; `unlocked`, a circuit the season has just unlocked.
 */
export function showChampionship(host: HTMLElement, services: Services, season: Season | undefined, unlocked: string | undefined, picked: SeasonChoices, closed?: AbortSignal, justWon = false): Promise<ChampionshipAction> {
  const { controls, hud } = services;
  const screen = document.createElement('div');
  screen.className = 'circuit-menu';
  const title = document.createElement('h1');
  title.textContent = 'CHAMPIONSHIP';
  screen.append(title);
  const line = (text: string, color = 'var(--muted)') => {
    const p = document.createElement('p');
    p.textContent = text;
    Object.assign(p.style, { margin: '0', color, textAlign: 'center', font: '11px var(--pixel)' });
    return p;
  };
  const over = !!season && seasonOver(season);
  if (season) {
    const table = standings(season);
    const settings = `${difficultyById(season.difficulty)?.name ?? ''} · ${weatherById(season.weather)?.name ?? ''} · QUALIFYING ${season.qualifying ? 'ON' : 'OFF'} · ${teamOf(season.drivers[season.you]).name.toUpperCase()}`;
    if (over) {
      const champ = season.drivers[table[0].driver];
      // yours: the trophy (and, as the title's just been won, confetti)
      if (champ.name === 'YOU') {
        screen.append(trophy(96));
        if (justWon) requestAnimationFrame(() => confetti(host, 4500));
      }
      screen.append(line(champ.name === 'YOU' ? 'YOU ARE THE CHAMPION!' : `CHAMPION: ${champ.name} (${teamOf(champ).code})`, 'var(--gold)'));
    } else screen.append(line(`ROUND ${season.round + 1} OF ${season.rounds.length} · ${nameOf(season.rounds[season.round])}`, 'var(--gold)'));
    screen.append(line(settings));
    // the rounds: raced (your place), next, to come (each kept on one line as the list wraps)
    screen.append(line(season.rounds.map((id, k) => `${k < season.round ? (season.places[k][season.you] < 0 ? 'DNF' : `P${season.places[k][season.you] + 1}`) : k === season.round ? '▶' : '·'}\u00a0${nameOf(id).replace(/ /g, '\u00a0')}`).join('   ')));
    // a circuit just unlocked: said once
    if (unlocked) screen.append(line(`${nameOf(unlocked)} UNLOCKED FOR QUICK RACE, TIME ATTACK AND TIME TRIAL`, 'var(--accent-b)'));
    screen.append(standingsTable(season));
  } else screen.append(line('A SEASON: A ROUND ON EACH CIRCUIT, F1 POINTS FOR THE TOP TEN'), line('PICK YOUR TEAM AND CAR, THE WEATHER AND QUALIFYING (DIFFICULTY IN SETTINGS)'));
  // a new season's team, weather and qualifying: shown when one can be started (mid-season, once NEW SEASON is pressed)
  const teamRow = optionRow('TEAM', TEAMS, picked.team, (t) => ({ name: t.name.toUpperCase(), about: t.code, colors: [t.body, t.trim, ...(t.accent ? [t.accent] : [])], icon: logoSvg(t.id, 20) }), () => carChoice.refresh());
  const carChoice = carRow(() => teamRow.value(), picked.seat);
  const weatherRow = optionRow('WEATHER', WEATHERS, picked.weather, (w) => ({ name: w.name, about: w.about }));
  const qualifyingRow = optionRow('QUALIFYING', [false, true], picked.qualifying, (on) => ({ name: on ? 'ON' : 'OFF', about: on ? 'one flying lap sets your grid slot' : 'start mid-grid' }));
  const rows = [teamRow, carChoice, weatherRow, qualifyingRow];
  const options = document.createElement('div');
  options.className = 'options';
  options.append(...rows.map((r) => r.el));
  screen.append(options);
  /** the rows are up: a new season can be started */
  let setUp = !season || over;

  return new Promise((resolve) => {
    let done = false;
    // the phone's back button: back to the menu
    const offBack = onBack(() => (finish('back'), true));
    const finish = (a: ChampionshipAction) => {
      if (done) return;
      done = true;
      offBack();
      menuPick();
      screen.remove();
      resolve(a);
    };
    // a season in progress is only thrown away on a second press, once its rows are up
    const pickNew = () => {
      if (!setUp) {
        setUp = true;
        newButton.textContent = 'NEW SEASON? THIS ONE ENDS · PRESS AGAIN';
        menuTick();
        layOut();
        return;
      }
      finish({ new: { team: teamRow.value(), seat: carChoice.value(), weather: weatherRow.value(), qualifying: qualifyingRow.value() } });
    };
    const newButton = menuButton(season && !over ? 'NEW SEASON' : 'START A SEASON', pickNew);
    const choices: { el: HTMLButtonElement; pick: () => void }[] = [
      ...(season && !over ? [{ el: menuButton(`RACE ROUND ${season.round + 1} · ${nameOf(season.rounds[season.round])}`, () => finish('race')), pick: () => finish('race') }] : []),
      { el: newButton, pick: pickNew },
      { el: menuButton('BACK', () => finish('back')), pick: () => finish('back') },
    ];
    const buttons = choices.map((c) => c.el);
    screen.append(...buttons);
    /** up/down: the rows (while they're up), then the buttons */
    let places: { el: HTMLElement; pick?: () => void; step?: (by: number) => void }[] = [];
    let focus = 0;
    const show = () => places.forEach((p, i) => p.el.classList.toggle('focused', i === focus));
    const layOut = () => {
      options.style.display = setUp ? '' : 'none';
      places = [...(setUp ? rows.map((r) => ({ el: r.el, step: r.step })) : []), ...choices];
      // (on the button that starts the season)
      focus = places.findIndex((p) => p.el === newButton);
      show();
    };
    layOut();
    if (season && !over) {
      // (mid-season: on the next round)
      focus = 0;
      show();
    }
    rows.forEach((r) => r.el.addEventListener('pointerdown', () => {
      focus = places.findIndex((p) => p.el === r.el);
      show();
    }));
    holdTouches(screen);
    host.append(screen);
    hud.setPosition('');
    hud.setLap('');
    hud.setLabel('a', 'OK');
    hud.setLabel('b', '');
    closed?.addEventListener('abort', () => {
      done = true;
      offBack();
      screen.remove();
    });
    const seen = new Map<Button, number>();
    const pressed = (b: Button) => {
      const n = controls.presses(b);
      const edge = n > (seen.get(b) ?? n);
      seen.set(b, n);
      return edge;
    };
    const tick = () => {
      if (done) return;
      const [down, up, left, right, a, start, select] = (['down', 'up', 'left', 'right', 'a', 'start', 'select'] as const).map(pressed);
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (move) {
        focus = (focus + move + places.length) % places.length;
        menuTick();
        show();
      }
      const at = places[focus];
      if ((left || right) && at.step) at.step(right ? 1 : -1);
      if ((a || start) && at.pick) at.pick();
      if (select) finish('back');
      if (!done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
