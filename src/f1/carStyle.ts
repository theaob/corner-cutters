// Your car's look: your team's livery as it is (STANDARD, with a white helmet), or a look a streak has earned (streak.ts): a silver or
// neon helmet, gold wings, black and gold all over, or a whole-car livery (night racer, retro racer, chequered). Picked in the settings (CAR STYLE), kept on the device; one
// not earned (yet) can't be picked. Engine-free but for the save.

import { save, saved } from '../engine/save';
import type { CarLook } from '../engine/render/vehicles3d';
import { REWARDS, earned } from './streak';

export interface CarStyle {
  id: string;
  name: string;
  /** the streak's days that earn it (0: always yours) */
  days: number;
  /** what it changes on your car */
  look: Partial<CarLook>;
}

const GOLD = '#f2c14e';

export const CAR_STYLES: CarStyle[] = [
  { id: 'standard', name: 'STANDARD', days: 0, look: {} },
  ...REWARDS.map((r): CarStyle => ({
    id: r.id,
    name: r.name,
    days: r.days,
    look:
      r.id === 'silver-helmet' ? { helmet: '#c9cdd8' }
      : r.id === 'neon-helmet' ? { helmet: '#39ff14' }
      // (the shiny metallic gold one)
      : r.id === 'golden-helmet' ? { helmet: 'gold' }
      // (a ball of swirling lights, as the Neon City's sphere)
      : r.id === 'led-helmet' ? { helmet: 'led' }
      // (whole-car liveries, replacing your team's paint)
      : r.id === 'night-racer' ? { body: '#0b1026', stripe: '#00e5ff', accent: '#ff2bd6', pattern: 'chevron' }
      : r.id === 'retro-racer' ? { body: '#f2e6c8', stripe: '#c8372d', accent: '#1f4e79', pattern: 'twin' }
      : r.id === 'chequered' ? { body: '#f4f4f8', stripe: '#15151c', accent: '#15151c', pattern: 'band' }
      : r.id === 'gold-wings' ? { stripe: GOLD }
      : { body: '#17161f', stripe: GOLD, accent: '#17161f' },
  })),
];

/** The styles a best streak of `best` has earned (STANDARD always). */
export const stylesFor = (best: number): CarStyle[] => {
  const got = new Set(earned(best).map((r) => r.id));
  return CAR_STYLES.filter((s) => s.days === 0 || got.has(s.id));
};

/** The style picked (STANDARD when none is, or the one picked isn't earned: `best`, the best streak). */
export function carStyle(best: number): CarStyle {
  const id = saved('choices', 'carStyle');
  return stylesFor(best).find((s) => s.id === id) ?? CAR_STYLES[0];
}

/** Every style for the shop (carShop.ts): the ones `best` has earned open, the rest shown locked. */
export const shopStyles = (best: number): { style: CarStyle; owned: boolean }[] => {
  const got = new Set(stylesFor(best).map((s) => s.id));
  return CAR_STYLES.map((style) => ({ style, owned: got.has(style.id) }));
};

export const setCarStyle = (s: CarStyle): void => save('choices', 'carStyle', s.id);

/** Your car's look: `look` (your team's livery) with your style over it. */
export const styled = <T extends Partial<CarLook>>(look: T, style: CarStyle): T => ({ ...look, ...style.look });
