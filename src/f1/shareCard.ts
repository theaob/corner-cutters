// The result card to share: a square picture of how you did (your place, or a
// Time Attack's distance and medal), the circuit (its map), the mode, your team
// in its colours and a few numbers, under the game's name; and the line of text
// that goes with it. Everything on the card is centred. The card's content is
// worked out engine-free (`raceCard`, `attackCard`, `shareText`); `drawCard`
// paints it.

import { MEDAL_COLOR, MEDAL_NAME, type Medal } from './medals';

/** Where the game is played (on the card and in the text). */
export const SHARE_URL = (import.meta.env?.VITE_SHARE_URL as string | undefined) || 'theaob.itch.io/corner-cutters';

export interface ShareCard {
  circuit: string;
  /** the mode and how it was run (QUICK RACE · NORMAL · DRY) */
  mode: string;
  /** big in the middle (P1, 12 SECTORS), in `color` */
  headline: string;
  color: string;
  /** under it (WINNER, PODIUM, +3.21 S, GOLD MEDAL) */
  sub: string;
  medal?: Medal;
  /** your team: its name and colours */
  team: { name: string; body: string; trim: string };
  /** a few numbers, side by side (label, value) */
  stats: [string, string][];
  /** the day (YYYY-MM-DD) */
  date: string;
}

const PLACE_COLOR = ['#f2c14e', '#c9ccd6', '#c8803a'];

/** A race's card: finishing `place` of `field` (undefined: DNF), from grid slot `grid`. */
export function raceCard(r: {
  circuit: string; mode: string; place?: number; field: number; grid: number; gap?: number; best?: string; fastest: boolean;
  team: ShareCard['team']; date: string;
}): ShareCard {
  const p = r.place;
  const moved = p === undefined ? 0 : r.grid - p;
  return {
    circuit: r.circuit, mode: r.mode, team: r.team, date: r.date,
    headline: p === undefined ? 'DNF' : `P${p}`,
    color: p === undefined ? '#d8323c' : PLACE_COLOR[p - 1] ?? '#f4f4f8',
    sub: p === undefined ? 'OUT OF THE RACE' : p === 1 ? 'WINNER' : p <= 3 ? `PODIUM · +${(r.gap ?? 0).toFixed(2)} S` : `+${(r.gap ?? 0).toFixed(2)} S`,
    stats: [
      ['GRID', `P${r.grid}`],
      ['PLACES', p === undefined ? '–' : moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : '–'],
      [r.fastest ? 'FASTEST LAP' : 'BEST LAP', r.best ?? '–'],
    ],
  };
}

/** A Time Attack's card: `distance` reached (its words), the medal, and whether it's a record. */
export function attackCard(a: { circuit: string; mode: string; distance: string; medal?: Medal; record: boolean; best?: string; place?: string; team: ShareCard['team']; date: string }): ShareCard {
  return {
    circuit: a.circuit, mode: a.mode, team: a.team, date: a.date, medal: a.medal,
    headline: a.distance, color: a.medal ? MEDAL_COLOR[a.medal] : '#f4f4f8',
    sub: a.medal ? `${MEDAL_NAME[a.medal]} MEDAL${a.record ? ' · NEW RECORD' : ''}` : a.record ? 'NEW RECORD' : 'TIME UP',
    stats: [['REACHED', a.distance], ['BEST', a.best ?? a.distance], ...(a.place ? [['TODAY', a.place] as [string, string]] : [])],
  };
}

/** The text that goes with the card. */
export function shareText(c: ShareCard): string {
  const how = c.headline === 'DNF' ? 'crashed out' : /^P\d+$/.test(c.headline) ? `finished ${c.headline}` : `reached ${c.headline.toLowerCase()}`;
  return `I ${how} at ${titleCase(c.circuit)} in Corner Cutters 🏁 ${c.sub === 'WINNER' ? '🏆 ' : ''}Can you beat it? https://${SHARE_URL}`;
}
const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (m) => m.toUpperCase());

/** The card's file name. */
export const cardFile = (c: ShareCard) => `corner-cutters-${c.circuit.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${c.date}.png`;

/** px: the card's size (square, for any feed) */
export const CARD = 1080;

/** Paint `c` on `ctx` (CARD × CARD), the circuit's `map` in the middle when given. */
export function drawCard(ctx: CanvasRenderingContext2D, c: ShareCard, map?: CanvasImageSource & { width: number; height: number }): void {
  const W = CARD;
  const mid = W / 2;
  const font = (px: number) => `${px}px Silkscreen, monospace`;
  const text = (s: string, y: number, px: number, color: string, maxW = W - 120) => {
    let size = px;
    ctx.font = font(size);
    while (size > 16 && ctx.measureText(s).width > maxW) ctx.font = font((size -= 2));
    ctx.fillStyle = color;
    ctx.fillText(s, mid, y);
  };
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.imageSmoothingEnabled = false;
  // the night-blue ground, a band of your team's colours across the top and the bottom, a frame round it all
  ctx.fillStyle = '#0e0d16';
  ctx.fillRect(0, 0, W, W);
  for (const [y, h] of [[0, 28], [W - 28, 28]] as const) {
    ctx.fillStyle = c.team.body;
    ctx.fillRect(0, y, W, h);
    ctx.fillStyle = c.team.trim;
    ctx.fillRect(0, y === 0 ? 28 : W - 36, W, 8);
  }
  ctx.strokeStyle = '#2a2840';
  ctx.lineWidth = 4;
  ctx.strokeRect(36, 60, W - 72, W - 120);
  // the chequers either side of the game's name
  const chequer = (x: number) => {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      ctx.fillStyle = (i + j) % 2 ? '#f4f4f8' : '#1b1b26';
      ctx.fillRect(x + i * 14, 102 + j * 14, 14, 14);
    }
  };
  ctx.font = font(48);
  const nameW = ctx.measureText('CORNER CUTTERS').width;
  chequer(mid - nameW / 2 - 84);
  chequer(mid + nameW / 2 + 28);
  text('CORNER CUTTERS', 116, 48, '#f2c14e');
  text(c.circuit, 200, 56, '#f4f4f8');
  text(c.mode, 258, 26, '#9d9ab8');
  // the circuit's map, faint, behind your result
  if (map && map.width && map.height) {
    const fit = Math.min(560 / map.width, 360 / map.height);
    const w = map.width * fit;
    const h = map.height * fit;
    ctx.globalAlpha = 0.45;
    ctx.drawImage(map, mid - w / 2, 470 - h / 2, w, h);
    ctx.globalAlpha = 1;
  }
  // your result, big, with its medal round it
  if (c.medal) {
    ctx.beginPath();
    ctx.arc(mid, 470, 180, 0, Math.PI * 2);
    ctx.lineWidth = 14;
    ctx.strokeStyle = MEDAL_COLOR[c.medal];
    ctx.stroke();
  }
  ctx.fillStyle = '#1b1b26';
  text(c.headline, 478, /^P\d+$/.test(c.headline) || c.headline === 'DNF' ? 200 : 96, '#1b1b26');
  text(c.headline, 470, /^P\d+$/.test(c.headline) || c.headline === 'DNF' ? 200 : 96, c.color);
  text(c.sub, 680, 40, c.color);
  // the numbers, in boxes side by side
  const n = c.stats.length;
  const boxW = 280;
  const gap = 24;
  const left = mid - (n * boxW + (n - 1) * gap) / 2;
  c.stats.forEach(([label, value], k) => {
    const x = left + k * (boxW + gap);
    ctx.fillStyle = '#1b1a2b';
    ctx.fillRect(x, 750, boxW, 120);
    ctx.fillStyle = c.team.body;
    ctx.fillRect(x, 750, boxW, 6);
    const cx = x + boxW / 2;
    ctx.font = font(22);
    ctx.fillStyle = '#9d9ab8';
    ctx.fillText(label, cx, 792);
    let size = 38;
    ctx.font = font(size);
    while (size > 16 && ctx.measureText(value).width > boxW - 24) ctx.font = font((size -= 2));
    ctx.fillStyle = '#f4f4f8';
    ctx.fillText(value, cx, 836);
  });
  text(c.team.name.toUpperCase(), 925, 28, '#f4f4f8');
  text(`${c.date} · ${SHARE_URL.toUpperCase()}`, 975, 22, '#6c6a88');
}

/** The card as a PNG. */
export async function cardPng(c: ShareCard, map?: CanvasImageSource & { width: number; height: number }): Promise<Blob> {
  // (the pixel font, before drawing with it)
  try {
    await document.fonts?.load('48px Silkscreen');
  } catch {
    // (the fallback font then)
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = CARD;
  drawCard(canvas.getContext('2d')!, c, map);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('no picture'))), 'image/png'));
}
