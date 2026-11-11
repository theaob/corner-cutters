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

/** What a tower row looks like apart from its words: when it changes, the row is built again. */
const lookOf = (r: TowerRow) => (r === 'gap' ? 'gap' : `${r.color}|${r.trim}|${r.you}|${r.out}|${r.blue}`);
const looks = new WeakMap<HTMLElement, string[]>();

/** A row of the tower, built from scratch. */
function buildRow(r: TowerRow): HTMLElement {
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
}

/** Set a text node's string only if it differs (a write, even of the same text, makes the browser re-lay it out). */
const setText = (el: Element, text: string) => {
  if (el.textContent !== text) el.textContent = text;
};

/**
 * Fill `el` with `rows`. A row that looks the same as last time (the same car, colours and state) keeps its elements
 * and only its changed words are rewritten, so a gap ticking over doesn't rebuild the tower.
 */
export function renderTower(el: HTMLElement, rows: TowerRow[]): void {
  const before = looks.get(el) ?? [];
  const now = rows.map(lookOf);
  const kids = Array.from(el.children) as HTMLElement[];
  const next = rows.map((r, i) => {
    const old = kids[i];
    if (!old || before[i] !== now[i]) return buildRow(r);
    if (r !== 'gap') {
      const spans = old.querySelectorAll('span');
      setText(spans[0], String(r.place));
      setText(spans[1], r.name);
      setText(spans[2], r.gap);
    }
    return old;
  });
  // (unchanged rows are the same elements, so replaceChildren keeps them in place)
  if (next.length !== kids.length || next.some((n, i) => n !== kids[i])) el.replaceChildren(...next);
  looks.set(el, now);
}
