// The capture build (npm run capture:build, VITE_CAPTURE=1): the web game for recording footage by hand. Everything is
// open (every circuit, every team, every look in the shop), there's no controls lap and no backend, and the pause
// screen gains CHAMPAGNE (the podium ceremony at once) and a jump to each of the circuit's set pieces (its tunnel, its
// pit lane, its castle walls, ...). Stores' builds and the ordinary web game are built without the flag: it's a build
// constant, so none of this is in them.

import type { CircuitLayout } from './layouts';

/** Whether this is the capture build. */
export const CAPTURE: boolean = import.meta.env.VITE_CAPTURE === '1';

/** A spot to jump to: its name on the pause screen, and the track sample to be put at (a run-up before the feature). */
export interface CapturePlace {
  label: string;
  idx: number;
}

/** px of run-up before a feature, so the camera has it in view as the car arrives */
const RUN_UP = 600;

/**
 * The set pieces of a circuit worth a take, as track samples: where each starts, a run-up before it. `n` samples of
 * `spacing` px make the lap; `pitEntry` is the pit lane's entry sample.
 */
export function capturePlaces(layout: CircuitLayout, n: number, spacing: number, pitEntry: number): CapturePlace[] {
  const at = (px: number): number => (((Math.round((px - RUN_UP) / spacing) % n) + n) % n);
  const places: CapturePlace[] = [{ label: 'START / FINISH', idx: at(0) }, { label: 'PIT LANE', idx: (((pitEntry - 10) % n) + n) % n }];
  const tunnel = layout.street?.tunnel;
  if (tunnel) places.push({ label: 'TUNNEL', idx: at(tunnel[0]) });
  const castle = layout.street?.castle;
  if (castle) places.push({ label: 'CASTLE WALLS', idx: at(castle.from * n * spacing) });
  if (layout.championsWall) places.push({ label: 'WALL OF CHAMPIONS', idx: at(layout.championsWall.from) });
  if (layout.bridge) places.push({ label: 'BRIDGE', idx: at(layout.bridge.over) });
  (layout.jumps ?? []).forEach((j, k, all) => places.push({ label: all.length > 1 ? `JUMP ${k + 1}` : 'JUMP', idx: at(j.at) }));
  const banks = layout.banking === undefined ? [] : Array.isArray(layout.banking) ? layout.banking : [layout.banking];
  banks.forEach((b, k) => places.push({ label: banks.length > 1 ? `BANKING ${k + 1}` : 'BANKING', idx: at(b.from) }));
  return places;
}
