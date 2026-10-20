// The main menu's tiles: each mode (and SETTINGS, TROPHIES, RESUME RACE) a square button, an icon over its name.
// The icons are line drawings on a 24 grid, in the text's colour (so a focused tile's cyan colours its icon too).
import { t } from '../engine/i18n';

const SVG = 'http://www.w3.org/2000/svg';

export type TileIcon = 'daily' | 'race' | 'championship' | 'timeattack' | 'timetrial' | 'settings' | 'trophies' | 'shop' | 'resume';

const ICONS: Record<TileIcon, string> = {
  // a calendar page with the day marked
  daily: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/><circle cx="12" cy="15" r="1.8" fill="currentColor"/>',
  // a chequered flag on its pole
  race: '<path d="M5 21V3"/><path d="M5 4h14v10H5"/><path d="M5 9h14M10 4v10M14.5 4v10" opacity=".55"/><path d="M5 4h5v5H5zM14.5 4H19v5h-4.5zM10 9h4.5v5H10z" fill="currentColor" stroke="none"/>',
  // a cup
  championship: '<path d="M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1.5A3.5 3.5 0 0 0 7.5 11M17 6h3v1.5a3.5 3.5 0 0 1-3.5 3.5M12 14v4M8 21h8M9 18h6"/>',
  // a stopwatch
  timeattack: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9M9.5 2.5h5M12 2.5V6M19 6l1.5 1.5"/>',
  // a ghost
  timetrial: '<path d="M5.5 21V11a6.5 6.5 0 0 1 13 0v10l-2.17-2-2.16 2-2.17-2-2.17 2-2.16-2z"/><circle cx="9.7" cy="11" r="1.2" fill="currentColor"/><circle cx="14.3" cy="11" r="1.2" fill="currentColor"/>',
  // sliders
  settings: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.2" fill="#111118"/><circle cx="15.5" cy="12" r="2.2" fill="#111118"/><circle cx="8" cy="17" r="2.2" fill="#111118"/>',
  // a medal on its ribbon
  trophies: '<circle cx="12" cy="15" r="5.5"/><path d="M8.5 10.7 6 3h4l2 5M15.5 10.7 18 3h-4l-2 5"/><path d="m12 12.4 1 2 2.2.3-1.6 1.5.4 2.2-2-1.1-2 1.1.4-2.2-1.6-1.5 2.2-.3z" fill="currentColor" stroke="none"/>',
  // a shopping bag
  shop: '<path d="M5 8h14l-1 12H6zM9 8V6.5a3 3 0 0 1 6 0V8"/><path d="M9.5 12.5a2.5 2.5 0 0 0 5 0"/>',
  // play
  resume: '<circle cx="12" cy="12" r="9"/><path d="m10 8.5 6 3.5-6 3.5z" fill="currentColor"/>',
};

/** A tile's icon as an <svg>, decorative (the tile's name is its label). */
export function tileIcon(icon: TileIcon): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'tile-icon');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[icon];
  return svg;
}

/** Makes `b` a tile: its icon over `name`, `about` for a screen reader and a long press. */
export function makeTile(b: HTMLButtonElement, icon: TileIcon, name: string, about: string): void {
  b.classList.add('menu-tile');
  name = t(name);
  about = t(about);
  b.title = about;
  b.setAttribute('aria-label', `${name}: ${about}`);
  const label = document.createElement('strong');
  label.textContent = name;
  b.replaceChildren(tileIcon(icon), label);
}

/** Tiles to a row. */
export const TILE_COLUMNS = 3;

/**
 * Where up/down/left/right moves the highlight among `count` tiles in a grid of `cols` columns: left/right go to the
 * neighbour (wrapping at the ends), up/down a row (wrapping from the top row to the last tile in that column, and
 * from the bottom to the first). From none highlighted (-1), any key lands on the first tile (up and left, the last).
 */
export function gridStep(at: number, dx: number, dy: number, count: number, cols = TILE_COLUMNS): number {
  if (count <= 0) return -1;
  if (at < 0) return dx < 0 || dy < 0 ? count - 1 : 0;
  if (dx) return (at + dx + count) % count;
  if (!dy) return at;
  const to = at + dy * cols;
  if (to >= 0 && to < count) return to;
  // (off the top or bottom: round to the other end of the same column; a short last row's gap, its last tile)
  const col = at % cols;
  if (dy > 0) return col;
  return col + Math.floor((count - 1 - col) / cols) * cols;
}
