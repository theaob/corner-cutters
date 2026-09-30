// Sound, synthesised with Web Audio (no sound files: nothing to download, and it
// works offline in the app): continuous voices (an engine note, filtered noise
// for tyres, rumble and rain) the game sets every frame, and one-shots (beeps,
// thumps, chimes). Browsers only let a page make sound after a tap or a key, so
// the context starts on the first one. The volume is a setting kept on the
// device; without Web Audio (tests, old browsers) everything here does nothing.

import { storeKey } from './storage';

/** The volume steps offered in the settings. */
export const VOLUMES = [0, 0.35, 0.7, 1] as const;
const VOLUME_KEY = () => storeKey('sound');

let ctx: AudioContext | undefined;
let master: GainNode | undefined;
let noiseBuffer: AudioBuffer | undefined;
let volume: number | undefined;

/** The sound volume, 0…1 (0.7 unless the player changed it). */
export function soundVolume(): number {
  if (volume === undefined) {
    try {
      const v = Number(localStorage.getItem(VOLUME_KEY()));
      volume = localStorage.getItem(VOLUME_KEY()) !== null && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.7;
    } catch {
      volume = 0.7;
    }
  }
  return volume;
}

/** Set the sound volume (0…1), and remember it. */
export function setSoundVolume(v: number): void {
  volume = Math.max(0, Math.min(1, v));
  if (master && ctx) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
  try {
    localStorage.setItem(VOLUME_KEY(), String(volume));
  } catch {
    // storage blocked: the choice lasts until the page closes
  }
}

/** The audio context, made (and resumed) on demand; undefined without Web Audio. */
function audio(): AudioContext | undefined {
  if (!ctx) {
    const Ctor = (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    try {
      ctx = new Ctor();
    } catch {
      return undefined;
    }
    master = ctx.createGain();
    master.gain.value = soundVolume();
    master.connect(ctx.destination);
    // two seconds of white noise, looped by the noise voices
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return ctx;
}

/** Start sound on the page's first tap or key (browsers require one), and whenever it comes back. */
export function unlockAudio(target: Window = window): void {
  const resume = () => {
    const c = audio();
    if (c && c.state !== 'running') void c.resume().catch(() => {});
  };
  target.addEventListener('pointerdown', resume, { capture: true });
  target.addEventListener('keydown', resume, { capture: true });
}

/** Silence everything (a pause, the app in the background), or bring it back. */
export function setAudioPaused(paused: boolean): void {
  if (!ctx) return;
  if (paused) void ctx.suspend().catch(() => {});
  else void ctx.resume().catch(() => {});
}

/** An engine note: a sawtooth and a square an octave apart through a low-pass filter; set its pitch, loudness and brightness every frame. */
export interface EngineVoice {
  set(freq: number, gain: number, brightness: number): void;
}

/** A filtered noise (tyres, rumble, rain); set its loudness every frame. */
export interface NoiseVoice {
  set(gain: number): void;
}

const SILENT = { set() {} };

export function engineVoice(): EngineVoice {
  const c = audio();
  if (!c || !master) return SILENT;
  const saw = c.createOscillator();
  saw.type = 'sawtooth';
  const sq = c.createOscillator();
  sq.type = 'square';
  const sqGain = c.createGain();
  sqGain.gain.value = 0.35;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 4;
  const out = c.createGain();
  out.gain.value = 0;
  saw.connect(filter);
  sq.connect(sqGain).connect(filter);
  filter.connect(out).connect(master);
  saw.start();
  sq.start();
  return {
    set(freq, gain, brightness) {
      const t = c.currentTime;
      saw.frequency.setTargetAtTime(freq, t, 0.03);
      sq.frequency.setTargetAtTime(freq / 2, t, 0.03);
      filter.frequency.setTargetAtTime(400 + brightness * 2600, t, 0.05);
      out.gain.setTargetAtTime(gain, t, 0.05);
    },
  };
}

export function noiseVoice(type: BiquadFilterType, freq: number, q = 1): NoiseVoice {
  const c = audio();
  if (!c || !master || !noiseBuffer) return SILENT;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer;
  src.loop = true;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  filter.Q.value = q;
  const out = c.createGain();
  out.gain.value = 0;
  src.connect(filter).connect(out).connect(master);
  src.start();
  return {
    set(gain) {
      out.gain.setTargetAtTime(gain, c.currentTime, 0.04);
    },
  };
}

/** A short tone: `freq` Hz for `seconds`, a quick attack and fade. */
export function beep(freq: number, seconds = 0.15, gain = 0.25, type: OscillatorType = 'square', delay = 0): void {
  const c = audio();
  if (!c || !master || c.state !== 'running') return;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + seconds);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + seconds + 0.05);
}

/** A hit: a low thud falling in pitch under a burst of noise, `strength` 0…1. */
export function thump(strength: number): void {
  const c = audio();
  if (!c || !master || !noiseBuffer || c.state !== 'running' || strength <= 0) return;
  const s = Math.min(1, strength);
  const t = c.currentTime;
  const osc = c.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.25);
  const g = c.createGain();
  g.gain.setValueAtTime(0.6 * s, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  osc.connect(g).connect(master);
  osc.start(t);
  osc.stop(t + 0.35);
  const noise = c.createBufferSource();
  noise.buffer = noiseBuffer;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1800;
  const ng = c.createGain();
  ng.gain.setValueAtTime(0.35 * s, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18 + 0.2 * s);
  noise.connect(bp).connect(ng).connect(master);
  noise.start(t, Math.random());
  noise.stop(t + 0.5);
}
