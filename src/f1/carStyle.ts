// Your car's look: your team's livery as it is (STANDARD), or a look a streak has earned (streak.ts): a silver or
// neon helmet, gold wings, or black and gold all over. Picked in the settings (CAR STYLE), kept on the device; one
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

export const setCarStyle = (s: CarStyle): void => save('choices', 'carStyle', s.id);

/** Your car's look: `look` (your team's livery) with your style over it. */
export const styled = <T extends Partial<CarLook>>(look: T, style: CarStyle): T => ({ ...look, ...style.look });
