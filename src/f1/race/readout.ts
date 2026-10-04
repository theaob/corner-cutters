// The readout's lines (the panel top left on a wide screen, down the left on a
// phone): your lap times and records (or a Time Attack's clock), the gaps to
// the cars either side (wide screen only), your car's health and tyres as five
// blocks each, the tow, track-limits strikes, the gap to your ghost. Engine-free.

import { formatTime as fmt } from '../records';
import { shortDistance } from '../timeAttack';
import { LIMITS } from '../trackLimits';

/** Five blocks, `share` (0…1) of them filled. */
export const blocks = (share: number) => {
  const n = Math.ceil(share * 5);
  return '■'.repeat(n) + '□'.repeat(5 - n);
};

/** The readout's main lines: a Time Attack's (`attack`), or the lap times'. */
export function readoutText(r: {
  lapTime?: number;
  last?: number;
  best?: number;
  record?: number;
  /** the cars either side: names and gaps (s, undefined: no shared timing point yet) */
  ahead?: { name: string; gap?: number };
  behind?: { name: string; gap?: number };
  /** your car: its health's share, or wrecked */
  health: number;
  wrecked: boolean;
  attack?: { left?: number; passed: number; best?: number };
}): string {
  const car = r.wrecked ? 'WRECKED' : blocks(r.health);
  if (r.attack) {
    const a = r.attack;
    // (the distances short, so they fit the panel: 5L 1S)
    return `TIME ${a.left === undefined ? '–' : a.left.toFixed(1)}\nGOT  ${shortDistance(a.passed)}\nBEST ${a.best ? shortDistance(a.best) : '–'}\nLAP  ${fmt(r.lapTime)}\nCAR  ${car}\n`;
  }
  // (just after a pass the last shared timing point can put the gap the wrong way round: 0 then)
  const gap = (o: { name: string; gap?: number } | undefined, mark: '▲' | '▼') =>
    o ? `\n${mark} ${o.name.padEnd(6)}${o.gap === undefined ? '–' : `${mark === '▲' ? '+' : '−'}${Math.max(0, o.gap).toFixed(2)}`}` : '';
  return `LAP  ${fmt(r.lapTime)}\nLAST ${fmt(r.last)}\nBEST ${fmt(r.best)}\nREC  ${fmt(r.record)}${gap(r.ahead, '▲')}${gap(r.behind, '▼')}\nCAR  ${car}\n`;
}

/**
 * The tyre line: the compound, five blocks (and the share left, on the wide screen); past their best, WORN on a line of
 * its own, lined up with the labels (beside the blocks it widened the readout); and the crew's call when they're the wrong ones.
 */
export function tyreText(short: string, wear: number, showShare: boolean, boxFor?: string): string {
  const left = 1 - wear;
  return `TYRE ${short} ${blocks(left)}${showShare ? ` ${Math.round(left * 100)}%` : ''}\n${wear >= 0.7 ? 'WORN\n' : ''}${boxFor ? `BOX  FOR ${boxFor}\n` : ''}`;
}

/** The tow line: TOW and a bar that fills as it builds (0…1). */
export const towText = (tow: number) => (tow > 0.1 ? `TOW  ${'▶'.repeat(Math.ceil(tow * 5))}\n` : '');

/** Track limits: your strikes while they're warnings, then the seconds they've cost. */
export const limitsText = (strikes: number) =>
  strikes ? `LIMITS ${strikes > LIMITS.warnings ? `+${(strikes - LIMITS.warnings) * LIMITS.penalty}S` : `${strikes}/${LIMITS.warnings}`}\n` : '';

/** The gap to your ghost (s: − ahead of it). */
export const ghostText = (gap: number | undefined) => (gap === undefined ? '' : `GAP  ${gap < 0 ? '−' : '+'}${Math.abs(gap).toFixed(2)}\n`);
