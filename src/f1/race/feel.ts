// What your car's driving makes the player feel and hear each frame: the
// phone's vibration (crashes, landings, grass and gravel, kerbs), the camera's
// shake, and the race's sounds (the engine, tyres, ground, the nearest rival,
// and hits).

import { speedOf, type StepEvents } from '../../engine/driving';
import { vibrate } from '../../engine/haptics';
import type { Circuit } from '../circuit';
import { TILE } from '../circuit';
import { inLimitZone } from '../pits';
import { running, type Race } from '../raceControl';
import { rumble, type RumbleState } from '../rumble';
import { stepShake, type ShakeState } from '../shake';
import { crowdNear, type RaceSounds } from '../sounds';

/** The frame the player's car felt: its steps' events, and what it lost to them. */
export interface FeelFrame {
  dt: number;
  race: Race;
  you: number;
  circuit: Circuit;
  /** your car's events over the frame's steps */
  ev: StepEvents;
  /** your car's health before the frame's steps */
  healthBefore: number;
  replay: boolean;
  rumbleState: RumbleState;
  shake: ShakeState;
  sounds: RaceSounds;
  stands: Parameters<typeof crowdNear>[0];
}

/** Vibrates, shakes and sounds the frame; true if your car took damage in it. */
export function feelFrame(f: FeelFrame): boolean {
  const { dt, race, you, circuit, ev, healthBefore, replay, rumbleState, shake, sounds, stands } = f;
  const me = race.entrants[you];
  const cell = circuit.cells[Math.floor(me.car.y / TILE) * circuit.width + Math.floor(me.car.x / TILE)];
  const felt = {
    dt, speed: speedOf(me.car), topSpeed: me.car.cls.topSpeed, healthLost: healthBefore - me.car.health,
    wreckedNow: ev.wreckedNow, landed: ev.landed, onRough: ev.onRough, onKerb: cell === 'kerb',
  };
  vibrate(rumble(rumbleState, felt));
  // and the camera's shake (not in the replay, nor once you're out)
  stepShake(shake, replay || !running(me) ? { ...felt, healthLost: 0, wreckedNow: false, landed: 0, onRough: false, onKerb: false } : felt);
  // and its sounds: the engine, tyres, ground, the nearest rival, and hits
  const lost = healthBefore - me.car.health;
  if (ev.wreckedNow) sounds.hit(1);
  else if (lost > 0.5) sounds.hit(Math.min(1, 0.25 + lost / 15));
  // (and the scrape of metal with the sparks)
  if (!replay && (lost > 0.5 || ev.landed > 160)) sounds.scrape(Math.min(1, 0.3 + Math.max(lost, 0) / 10));
  else if (ev.landed > 160) sounds.hit(0.3);
  if (!running(me) || me.car.wrecked || replay) sounds.quiet();
  else {
    const f = { x: Math.sin(me.car.heading), y: -Math.cos(me.car.heading) };
    let rival: { speed: number; distance: number } | undefined;
    race.entrants.forEach((o, i) => {
      if (i === you || !running(o) || o.car.wrecked) return;
      const d = Math.hypot(o.car.x - me.car.x, o.car.y - me.car.y);
      if (!rival || d < rival.distance) rival = { speed: speedOf(o.car), distance: d };
    });
    sounds.update({
      dt, speed: speedOf(me.car), top: me.car.cls.topSpeed, slide: Math.abs(me.car.vx * -f.y + me.car.vy * f.x),
      onRough: ev.onRough, onKerb: cell === 'kerb', rival, tow: me.tow,
      onGravel: cell === 'gravel', crowd: crowdNear(stands, me.car.x, me.car.y),
      limiter: !!me.pit && inLimitZone(circuit.pit, circuit.pit.points[me.pit.at].s),
    });
  }
  return lost > 0;
}
