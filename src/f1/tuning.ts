import type { ParamSpec } from '../engine/tuning';

// Kept separate from race.ts so the page can mount the TUNE panel without
// pulling three.js into the main bundle.
// Defaults locked from on-phone tuning: a full grid of 10 at 94% AI pace.
export const F1_TUNING = {
  laps: { label: 'Laps', value: 3, min: 1, max: 10, step: 1 },
  opponents: { label: 'AI opponents', value: 9, min: 0, max: 9, step: 1 },
  aiPace: { label: 'AI pace (share of the racing line’s speed)', value: 0.94, min: 0.7, max: 1.1, step: 0.01 },
  zoom: { label: 'Camera zoom (×)', value: 0.8, min: 0.5, max: 1.5, step: 0.05 },
  lead: { label: 'Camera look-ahead (px)', value: 90, min: 0, max: 160, step: 5 },
  tags: { label: 'Team tags over the cars (0 off, 1 on)', value: 1, min: 0, max: 1, step: 1 },
  pedalSteer: { label: 'Pedals: steering at full lock (share of the car’s turn rate)', value: 0.55, min: 0.25, max: 1, step: 0.05 },
} satisfies ParamSpec;
