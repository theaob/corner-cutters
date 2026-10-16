// The timing tower, as on TV: the top three, then the cars around you, each
// with its team's colour, its name, and its gap to the leader (or
// OUT, PIT, BLUE); a ··· where rows are left out. Your row in gold.

import { style } from './dom';

/** the blue flag's colour on the screen */
export const BLUE_COLOR = '#4fa3ff';

export type TowerRow = 'gap' | {
  place: number;
  /** the team's colours */
  color: string;
  trim: string;
  name: string;
  /** the gap to the leader, or OUT, PIT, ▮ BLUE */
  gap: string;
  you: boolean;
  out: boolean;
  blue: boolean;
};

/** Fill `el` with `rows`. */
export function renderTower(el: HTMLElement, rows: TowerRow[]): void {
  el.replaceChildren(...rows.map((r) => {
    const row = document.createElement('div');
    if (r === 'gap') {
      row.textContent = '···';
      style(row, { textAlign: 'center', color: '#6c6a88', lineHeight: '8px' });
      return row;
    }
    style(row, {
      display: 'grid', gridTemplateColumns: '16px 3px 28px 1fr', gap: '4px', alignItems: 'center', padding: '1px 6px 1px 4px',
      background: r.you ? 'rgba(242,193,78,.18)' : '', color: r.you ? '#f2c14e' : r.out ? '#6c707a' : '#f4f2fa',
    });
    const bar = document.createElement('i');
    style(bar, { height: '9px', background: r.color, boxShadow: `inset 0 -2px ${r.trim}` });
    const cells = [String(r.place), bar, r.name, r.gap].map((c) => {
      if (typeof c !== 'string') return c;
      const span = document.createElement('span');
      span.textContent = c;
      return span;
    });
    style(cells[3] as HTMLElement, { textAlign: 'right', color: r.blue ? BLUE_COLOR : '#9d9ab8' });
    row.append(...cells);
    return row;
  }));
}
