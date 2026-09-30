// The weather for a race, picked on the menu: a dry track, a damp one (no
// rain falling, but wet in places) or a wet one (raining). It sets which tyres
// work (tyres.ts), and how the circuit looks: the sky and light, how dark the
// track is, falling rain and the spray the cars throw up.

import type { SkyState } from '../engine/render/daylight';

export type WeatherId = 'dry' | 'damp' | 'wet';

export interface Weather {
  id: WeatherId;
  name: string;
  /** a line about it, for the menu */
  about: string;
  /** the sky and light over the circuit */
  sky: SkyState;
  /** multiplied into the ground's colours: a wet track (and grass) is darker */
  groundTint: number;
  /** how hard it's raining: 0 = not at all … 1 = heavily */
  rain: number;
  /** cars throw up spray */
  spray: boolean;
}

const SUN = { x: 140, y: 260, z: 170 };

export const WEATHERS: Weather[] = [
  {
    id: 'dry', name: 'DRY', about: 'slicks · full grip', rain: 0, spray: false, groundTint: 0xffffff,
    sky: { background: 0x8fb8e8, sky: 0xb8d4ff, ground: 0x5a4f48, ambient: 1.35, key: 0xffe0b0, keyIntensity: 2.6, keyOffset: SUN, moon: false, lights: 0 },
  },
  {
    id: 'damp', name: 'DAMP', about: 'intermediates · drying track', rain: 0, spray: true, groundTint: 0xc8c8d0,
    sky: { background: 0x9aa6b4, sky: 0xc0c8d4, ground: 0x4c4a4c, ambient: 1.45, key: 0xe8e4dc, keyIntensity: 1.5, keyOffset: SUN, moon: false, lights: 0 },
  },
  {
    id: 'wet', name: 'WET', about: 'full wets · rain, spray, less grip', rain: 1, spray: true, groundTint: 0xa4a4b0,
    sky: { background: 0x6e7684, sky: 0xa8b0bc, ground: 0x3c3a3e, ambient: 1.5, key: 0xd0d4dc, keyIntensity: 0.8, keyOffset: SUN, moon: false, lights: 0 },
  },
];

export const DRY = WEATHERS[0];

/** The weather with this id, or undefined. */
export const weatherById = (id: string | null | undefined) => WEATHERS.find((w) => w.id === id);
