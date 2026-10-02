// Night races: the same circuit under floodlights. It's only how it looks (the
// grip, the tyres, the records and the ghosts are the day's): a dark blue sky,
// cold white light from high overhead as floodlights give (short shadows), the
// light a little dimmer in the rain; floodlight towers round the track, their
// lamps glowing, each throwing a pool of light on the track; and every car's
// rear light on. Picked on the menu (TIME: DAY or NIGHT); a Championship races
// its street circuit at night. The sky and the towers' places are worked out
// here, engine-free; circuitScene.ts builds them.

import type { SkyState } from '../engine/render/daylight';
import type { Weather } from './weather';
import type { Track } from './racing';

export type TimeOfDay = 'day' | 'night';
export const TIMES: TimeOfDay[] = ['day', 'night'];
export const timeById = (v: string | null | undefined): TimeOfDay => (v === 'night' ? 'night' : 'day');

/** The sky at night over `weather`: dark, lit from high overhead by the floodlights (dimmer in the rain). */
export function nightSky(weather: Weather): SkyState {
  const wet = weather.rain > 0 ? 1 : weather.spray ? 0.5 : 0;
  return {
    background: wet ? 0x0e1220 : 0x0a0f24,
    sky: 0x4a5890,
    ground: 0x141220,
    ambient: 0.55 - 0.1 * wet,
    key: 0xdce6ff,
    keyIntensity: 1.05 - 0.25 * wet,
    keyOffset: { x: 30, y: 320, z: 50 },
    moon: true,
    lights: 1,
  };
}

/** px between floodlight towers round the track, how far out from its middle they stand, and their pools of light. */
export const FLOODLIGHT = { every: 260, out: 120, height: 70, pool: 140 };

/**
 * Where the floodlight towers stand: every `FLOODLIGHT.every` px round `track`, alternately on its outside and inside,
 * `out` px from its middle; skipped where that's too near another part of the track (within `clear` px of its
 * middle). Each with the point on the track it lights (its pool).
 */
export function floodlights(track: Track, clear: number): { x: number; y: number; lit: { x: number; y: number } }[] {
  const n = track.samples.length;
  const step = Math.max(1, Math.round(FLOODLIGHT.every / track.spacing));
  const out: { x: number; y: number; lit: { x: number; y: number } }[] = [];
  for (let k = 0, side = 1; k < n; k += step, side = -side) {
    const s = track.samples[k];
    const x = s.x + Math.cos(s.dir) * FLOODLIGHT.out * side;
    const y = s.y + Math.sin(s.dir) * FLOODLIGHT.out * side;
    // (not on, or too near, another stretch of the track)
    let near = false;
    for (let j = 0; j < n && !near; j += 2) near = Math.hypot(track.samples[j].x - x, track.samples[j].y - y) < clear;
    if (!near) out.push({ x, y, lit: { x: s.x, y: s.y } });
  }
  return out;
}
