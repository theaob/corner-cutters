// The race's sounds: your engine (a note that climbs through the gears, the
// pitch dropping at each upshift, brighter on the throttle), the nearest rival's
// engine (quieter, louder as it closes), tyre squeal while sliding, a rumble on
// grass and gravel and a buzz over the kerbs, rain in the wet, and one-shots:
// hits, the start lights, the chequered flag and a lap record. The pitch model
// is pure and tested; the voices are engine/audio.ts.

import { beep, engineVoice, noiseVoice, thump } from '../engine/audio';

/** The gears an F1 car goes up through from a standstill to top speed. */
export const GEARS = 8;

/** The engine note at `speed` (of `top`) and `throttle` (0…1): its pitch (Hz), loudness and brightness (0…1). */
export function engineNote(speed: number, top: number, throttle: number): { freq: number; gain: number; brightness: number } {
  const share = Math.max(0, Math.min(1, speed / top));
  if (speed < 3) return { freq: 70, gain: 0.05, brightness: 0.15 };
  const gear = Math.min(GEARS - 1, Math.floor(share * GEARS));
  // how far through this gear's range the revs are: they drop back after each upshift
  const within = Math.min(1, share * GEARS - gear);
  const rpm = 0.45 + 0.55 * within;
  const freq = 80 + rpm * (240 + gear * 30);
  return { freq, gain: 0.06 + 0.08 * throttle + 0.04 * share, brightness: 0.25 + 0.75 * throttle * rpm };
}

export interface SoundFrame {
  dt: number;
  /** your car: speed and top speed (px/s), how fast it's sliding sideways (px/s), and what it's on */
  speed: number;
  top: number;
  slide: number;
  onRough: boolean;
  onKerb: boolean;
  /** the nearest other car: its speed and how far away it is (px); undefined for none */
  rival?: { speed: number; distance: number };
}

export class RaceSounds {
  private readonly engine = engineVoice();
  private readonly rival = engineVoice();
  private readonly tyres = noiseVoice('bandpass', 2400, 4);
  private readonly rumble = noiseVoice('lowpass', 160, 1);
  private readonly kerb = noiseVoice('bandpass', 650, 3);
  private readonly rain = noiseVoice('highpass', 3200, 0.7);
  private lastSpeed = 0;
  private throttle = 0;

  /** `rain`: how hard it's raining, 0…1 (a steady hiss). */
  constructor(rain: number) {
    this.rain.set(rain * 0.05);
  }

  update(f: SoundFrame): void {
    // on the throttle while the car is gaining speed (eased, so the note doesn't flutter)
    const gaining = f.dt > 0 && f.speed > this.lastSpeed + 2 * f.dt ? 1 : 0.2;
    this.throttle += (gaining - this.throttle) * Math.min(1, f.dt * 8);
    this.lastSpeed = f.speed;
    const note = engineNote(f.speed, f.top, this.throttle);
    this.engine.set(note.freq, note.gain, note.brightness);
    if (f.rival) {
      const r = engineNote(f.rival.speed, f.top, 0.7);
      const near = Math.max(0, 1 - f.rival.distance / 260);
      this.rival.set(r.freq * 1.03, r.gain * 0.6 * near * near, r.brightness * 0.8);
    } else this.rival.set(70, 0, 0);
    const moving = Math.min(1, f.speed / 120);
    this.tyres.set(Math.min(1, Math.max(0, f.slide - 40) / 160) * 0.12);
    this.rumble.set(f.onRough ? 0.25 * moving : 0);
    this.kerb.set(f.onKerb && !f.onRough ? 0.1 * moving : 0);
  }

  /** Engine and ground to silence (e.g. your car is out of the race). */
  quiet(): void {
    this.engine.set(70, 0, 0);
    this.rival.set(70, 0, 0);
    this.tyres.set(0);
    this.rumble.set(0);
    this.kerb.set(0);
  }

  /** A hit: `strength` 0…1. */
  hit(strength: number): void {
    thump(strength);
  }

  /** One of the five start lights coming on. */
  light(): void {
    beep(520, 0.18, 0.2);
  }

  /** Lights out. */
  go(): void {
    beep(880, 0.45, 0.22);
  }

  /** Your chequered flag: a rising arpeggio. */
  flag(): void {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 0.18, 'triangle', i * 0.12));
  }

  /** A new lap record (or the race's fastest lap). */
  record(): void {
    beep(988, 0.12, 0.16, 'triangle');
    beep(1319, 0.25, 0.16, 'triangle', 0.1);
  }
}

/** A click for moving through a menu, and a brighter one for picking. */
export const menuTick = () => beep(660, 0.05, 0.08, 'square');
export const menuPick = () => beep(990, 0.09, 0.1, 'square');
