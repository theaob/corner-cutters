// The results at the flag and qualifying's times, as tables (the pixel font
// isn't monospaced, so the columns line up in cells): what each row says is
// worked out from the race (`resultRows`, `qualifyingRows`: engine-free), then
// drawn into the results panel, the rows sliding in one after another.

import { formatTime as fmt } from '../records';
import type { Race } from '../raceControl';
import { line } from './dom';

/** A driver as the results name them. */
export interface Named {
  name: string;
  number?: number;
  team: { code: string };
}

/** One row of the results: place, places gained from the grid, number, name, team, time, best lap, notes. */
export interface ResultRow {
  place: number;
  /** places gained (+) or lost (−) from the grid slot */
  moved: number;
  number?: number;
  name: string;
  team: string;
  /** the winner's time, the gap to it, laps done, or DNF */
  time: string;
  best: string;
  /** the race's fastest lap (in purple) */
  fastest: boolean;
  /** penalty seconds and pit stops (+5S 1P) */
  notes: string;
  you: boolean;
}

/** The results' rows in finishing `order` (the entrants are in grid order). */
export function resultRows(race: Race, order: number[], named: Named[], you: number, fastestWho?: number): ResultRow[] {
  const first = race.entrants[order[0]].progress;
  const winner = (first.finished ?? 0) + first.penalty;
  return order.map((i, pos) => {
    const e = race.entrants[i];
    const p = e.progress;
    const time = p.retired
      ? 'DNF'
      : p.finished !== undefined
        ? pos === 0
          ? fmt(p.finished + p.penalty)
          : `+${(p.finished + p.penalty - winner).toFixed(2)}`
        : `${p.lap}/${race.laps} LAPS`;
    return {
      place: pos + 1, moved: i - pos, number: named[i].number, name: named[i].name, team: named[i].team.code, time,
      best: p.lapTimes.length ? fmt(Math.min(...p.lapTimes)) : '–', fastest: fastestWho === i,
      notes: [p.penalty ? `+${p.penalty}S` : '', e.stops ? `${e.stops}P` : ''].filter(Boolean).join(' '), you: i === you,
    };
  });
}

/** One row of qualifying's times, in grid order. */
export interface QualifyingRow {
  place: number;
  name: string;
  team: string;
  time: string;
  gap: string;
  you: boolean;
}

/** Qualifying's rows: the grid (drivers by slot), each driver's time (none: NO TIME), the gap to pole. */
export function qualifyingRows(grid: number[], times: (number | undefined)[], named: Named[], you: number): QualifyingRow[] {
  const pole = times[grid[0]];
  return grid.map((k, pos) => {
    const time = times[k];
    return {
      place: pos + 1, name: named[k].name, team: named[k].team.code, time: time === undefined ? 'NO TIME' : fmt(time),
      gap: time === undefined || pole === undefined || pos === 0 ? '' : `+${(time - pole).toFixed(3)}`, you: k === you,
    };
  });
}

const cell = (tag: 'td' | 'th', text: string, right = false, padding = '1px 2px') => {
  const c = document.createElement(tag);
  c.textContent = text;
  Object.assign(c.style, { padding, textAlign: right ? 'right' : 'left', fontWeight: 'normal', whiteSpace: 'nowrap' });
  return c;
};
const table = (heads: [string, boolean][], padding?: string) => {
  const t = document.createElement('table');
  Object.assign(t.style, { width: '100%', borderCollapse: 'collapse', font: 'inherit', color: 'inherit' });
  const head = document.createElement('tr');
  head.style.color = '#9d9ab8';
  head.append(...heads.map(([text, right]) => cell('th', text, right, padding)));
  t.append(head);
  return t;
};

/** A line under a table: its text, and whether it's new (in gold, NEW!). */
export interface Note {
  text: string;
  isNew?: boolean;
}
const noteLine = (n: Note, first: boolean) => line(`${n.text}${n.isNew ? ' · NEW!' : ''}`, { color: n.isNew ? '#f2c14e' : '#f4f2fa', ...(first ? { marginTop: '8px' } : {}) });

/**
 * The results into `el`: `title`, the table (your row in gold, the fastest lap in purple, places gained green and
 * lost red), the key, the records `notes`, and `next` (what A does, if anything). `since`: s since the results went
 * up, so the rows rebuilt as the others finish carry on sliding in where they were.
 */
export function renderResults(el: HTMLElement, title: string, rows: ResultRow[], notes: Note[], next: string | undefined, since: number): void {
  const t = table([['', true], ['', false], ['NO', true], ['NAME', false], ['TEAM', false], ['TIME', true], ['BEST', true], ['', false]]);
  for (const r of rows) {
    const row = document.createElement('tr');
    if (r.you) row.style.color = '#f2c14e';
    row.style.animation = `row-in 0.35s ease-out ${(0.15 + (r.place - 1) * 0.07 - since).toFixed(3)}s both`;
    const change = cell('td', r.moved > 0 ? `▲${r.moved}` : r.moved < 0 ? `▼${-r.moved}` : '–');
    change.style.color = r.moved > 0 ? '#5fe0d0' : r.moved < 0 ? '#d8323c' : '#6c6a88';
    const best = cell('td', r.best, true);
    if (r.fastest) best.style.color = '#b36bff';
    row.append(cell('td', `${r.place}`, true), change, cell('td', r.number === undefined ? '' : `${r.number}`, true), cell('td', r.name), cell('td', r.team), cell('td', r.time, true), best, cell('td', r.notes));
    t.append(row);
  }
  el.replaceChildren(
    line(title, { fontSize: '15px', color: '#f2c14e', marginBottom: '8px' }),
    t,
    line('▲▼ PLACES FROM THE GRID · P = PIT STOPS · S = PENALTY SECONDS', { color: '#9d9ab8', marginTop: '8px' }),
    ...notes.map((n, k) => noteLine(n, k === 0)),
    // (RESTART and EXIT are buttons under the table: no lines for them here)
    ...(next ? [line(next, { marginTop: '8px' })] : []),
  );
  el.style.display = 'block';
}

/** Qualifying's times into `el`: `title`, the table (your row in gold), where you start, the record `note`, and on to the race. */
export function renderQualifying(el: HTMLElement, title: string, rows: QualifyingRow[], note: Note): void {
  const t = table([['', true], ['NAME', false], ['TEAM', false], ['TIME', true], ['GAP', true]], '1px 3px');
  for (const r of rows) {
    const row = document.createElement('tr');
    if (r.you) row.style.color = '#f2c14e';
    row.append(...[cell('td', `${r.place}`, true, '1px 3px'), cell('td', r.name, false, '1px 3px'), cell('td', r.team, false, '1px 3px'), cell('td', r.time, true, '1px 3px'), cell('td', r.gap, true, '1px 3px')]);
    row.style.animation = `row-in 0.35s ease-out ${(0.15 + (r.place - 1) * 0.07).toFixed(2)}s both`;
    t.append(row);
  }
  const place = rows.find((r) => r.you)?.place ?? 0;
  el.replaceChildren(
    line(title, { fontSize: '15px', color: '#f2c14e', marginBottom: '8px' }),
    t,
    line(place === 1 ? 'POLE POSITION!' : `YOU START P${place}`, { color: '#f2c14e', marginTop: '8px' }),
    noteLine(note, true),
    line('RACE: on to the grid', { marginTop: '8px' }),
  );
  el.style.animation = 'row-in 0.25s ease-out both';
  el.style.display = 'block';
}
