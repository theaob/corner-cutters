// The Championship screen, between rounds: the season so far (each round's
// circuit, your place in the ones raced), the drivers' standings, and the way
// on: race the next round, start a new season, or back to the menu. At the end
// of the season it crowns the champion. Touch, or keys: up/down moves, A or
// START picks, SELECT goes back.

import type { Button } from '../../engine/controls';
import { holdTouches } from '../../engine/deck';
import type { Services } from '../../engine/services';
import { menuButton } from '../circuitSelect';
import { pointsOf, seasonOver, standings, teamOf, type Season } from '../championship';
import { difficultyById } from '../difficulty';
import { layoutById } from '../layouts';
import { menuPick, menuTick } from '../sounds';
import { weatherById } from '../weather';

export type ChampionshipAction = 'race' | 'new' | 'back';

const nameOf = (id: string) => layoutById(id)?.name.toUpperCase() ?? id.toUpperCase();

/** The standings as a table: place, driver, team, points, wins; you in gold. */
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
  head.append(cell('th', '', true), cell('th', 'DRIVER'), cell('th', 'TEAM'), cell('th', 'PTS', true), cell('th', 'WINS', true), cell('th', 'LAST', true));
  table.append(head);
  standings(s).forEach((r, pos) => {
    const d = s.drivers[r.driver];
    const row = document.createElement('tr');
    if (r.driver === s.you) row.style.color = 'var(--gold)';
    const lastPlace = last?.[r.driver];
    row.append(
      cell('td', `${pos + 1}`, true), cell('td', d.name), cell('td', teamOf(d).code), cell('td', `${points[r.driver]}`, true), cell('td', `${r.wins}`, true),
      cell('td', lastPlace === undefined ? '' : lastPlace < 0 ? 'DNF' : `P${lastPlace + 1}`, true),
    );
    table.append(row);
  });
  return table;
}

/**
 * Show the Championship screen for `season` (none: no season yet) in `host`
 * until the player picks what next.
 */
export function showChampionship(host: HTMLElement, services: Services, season: Season | undefined, closed?: AbortSignal): Promise<ChampionshipAction> {
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
      screen.append(line(champ.name === 'YOU' ? 'YOU ARE THE CHAMPION!' : `CHAMPION: ${champ.name} (${teamOf(champ).code})`, 'var(--gold)'));
    } else screen.append(line(`ROUND ${season.round + 1} OF ${season.rounds.length} · ${nameOf(season.rounds[season.round])}`, 'var(--gold)'));
    screen.append(line(settings));
    // the rounds: raced (your place), next, to come
    screen.append(line(season.rounds.map((id, k) => `${k < season.round ? (season.places[k][season.you] < 0 ? 'DNF' : `P${season.places[k][season.you] + 1}`) : k === season.round ? '▶' : '·'} ${nameOf(id)}`).join('   ')));
    screen.append(standingsTable(season));
  } else screen.append(line('A SEASON: A ROUND ON EACH CIRCUIT, F1 POINTS FOR THE TOP TEN'), line('YOUR TEAM, DIFFICULTY, WEATHER AND QUALIFYING FROM THE MENU'));

  return new Promise((resolve) => {
    let done = false;
    const finish = (a: ChampionshipAction) => {
      if (done) return;
      done = true;
      menuPick();
      screen.remove();
      resolve(a);
    };
    // a season in progress is only thrown away on a second press
    let confirmNew = false;
    const pickNew = () => {
      if (season && !over && !confirmNew) {
        confirmNew = true;
        newButton.textContent = 'NEW SEASON? THIS ONE ENDS · PRESS AGAIN';
        menuTick();
        return;
      }
      finish('new');
    };
    const newButton = menuButton(season && !over ? 'NEW SEASON' : 'START A SEASON', pickNew);
    const choices: { el: HTMLButtonElement; pick: () => void }[] = [
      ...(season && !over ? [{ el: menuButton(`RACE ROUND ${season.round + 1} · ${nameOf(season.rounds[season.round])}`, () => finish('race')), pick: () => finish('race') }] : []),
      { el: newButton, pick: pickNew },
      { el: menuButton('BACK', () => finish('back')), pick: () => finish('back') },
    ];
    const buttons = choices.map((c) => c.el);
    screen.append(...buttons);
    let focus = 0;
    const show = () => buttons.forEach((b, i) => b.classList.toggle('focused', i === focus));
    show();
    holdTouches(screen);
    host.append(screen);
    hud.setPosition('');
    hud.setLap('');
    hud.setLabel('a', 'OK');
    hud.setLabel('b', '');
    closed?.addEventListener('abort', () => {
      done = true;
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
      const [down, up, a, start, select] = (['down', 'up', 'a', 'start', 'select'] as const).map(pressed);
      const move = (down ? 1 : 0) - (up ? 1 : 0);
      if (move) {
        focus = (focus + move + buttons.length) % buttons.length;
        menuTick();
        show();
      }
      if (a || start) choices[focus].pick();
      if (select) finish('back');
      if (!done) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
