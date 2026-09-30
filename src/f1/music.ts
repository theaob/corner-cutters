// The game's music. Each track is a composed file once it's in (put it in
// public/music/ and set `file`); until then a placeholder plays: a chiptune
// loop to suit the pixel look, written here as notes and synthesised on the
// device (engine/music.ts renders and loops it).
//
//   menu  A minor, 96 bpm, 8 bars: arpeggios over Am F C G, a soft pad, a walking bass
//   race  E minor, 150 bpm, 8 bars: a driving octave bass, drums, a lead riff over Em C G D
//         (under the engines: it plays quieter)
//
// The notes are plain data (tested: in key, inside the loop); `voice` plays one.

import type { Placeholder, Track } from '../engine/music';

export type Voice = 'lead' | 'arp' | 'pad' | 'bass' | 'kick' | 'snare' | 'hat';

export interface Note {
  /** start and length, in beats */
  at: number;
  len: number;
  /** MIDI note number (drums: ignored) */
  midi: number;
  voice: Voice;
  /** 0…1 */
  vel: number;
}

export interface Song {
  bpm: number;
  bars: number;
  notes: Note[];
}

const BEATS = 4;

/** A chord as MIDI notes, root first. */
const chord = (root: number, minor: boolean) => [root, root + (minor ? 3 : 4), root + 7];

/** The menu: four chords, two bars each. */
export function menuSong(): Song {
  const notes: Note[] = [];
  // Am F C G, from A3
  const chords = [chord(57, true), chord(53, false), chord(60, false), chord(55, false)];
  const arp = [0, 1, 2, 1, 2, 0, 1, 2];
  chords.forEach((c, k) => {
    const bar = k * 2 * BEATS;
    // the pad: the chord held for both bars
    for (const m of c) notes.push({ at: bar, len: 2 * BEATS, midi: m, voice: 'pad', vel: 0.35 });
    // arpeggios in eighths, an octave up, rising on the second bar
    for (let i = 0; i < 16; i++) notes.push({ at: bar + i / 2, len: 0.45, midi: c[arp[i % 8]] + (i >= 8 && i % 8 >= 4 ? 24 : 12), voice: 'arp', vel: i % 2 ? 0.45 : 0.6 });
    // a walking bass: root, fifth, root, and a step to the next chord's root
    const next = chords[(k + 1) % chords.length][0];
    [c[0], c[0] + 7, c[0], next - 1].forEach((m, i) => notes.push({ at: bar + i * 2, len: 1.8, midi: m - 24, voice: 'bass', vel: 0.7 }));
    // soft off-beat hats
    for (let i = 0; i < 8; i++) notes.push({ at: bar + i + 0.5, len: 0.1, midi: 0, voice: 'hat', vel: 0.25 });
  });
  return { bpm: 96, bars: 8, notes };
}

/** The race: four chords, two bars each, with a riff. */
export function raceSong(): Song {
  const notes: Note[] = [];
  // Em C G D, from E3
  const chords = [chord(52, true), chord(48, false), chord(55, false), chord(50, false)];
  chords.forEach((c, k) => {
    const bar = k * 2 * BEATS;
    for (let b = 0; b < 2; b++) {
      const at = bar + b * BEATS;
      // the bass: driving eighths, jumping the octave
      [0, 0, 12, 0, 0, 12, 0, 7].forEach((step, i) => notes.push({ at: at + i / 2, len: 0.4, midi: c[0] - 12 + step, voice: 'bass', vel: i % 2 ? 0.6 : 0.8 }));
      // drums: kick on 1, the and of 2, and 3; snare on 2 and 4; hats in eighths
      for (const t of [0, 1.5, 2]) notes.push({ at: at + t, len: 0.2, midi: 0, voice: 'kick', vel: 0.9 });
      for (const t of [1, 3]) notes.push({ at: at + t, len: 0.2, midi: 0, voice: 'snare', vel: 0.7 });
      for (let i = 0; i < 8; i++) notes.push({ at: at + i / 2, len: 0.05, midi: 0, voice: 'hat', vel: i % 2 ? 0.25 : 0.4 });
    }
    // the riff, on the chord's notes an octave up: a run up in the first bar, a held note and a fall in the second
    const [r, third, fifth] = c.map((m) => m + 12);
    [r, fifth, third, fifth, r + 12, fifth, third, fifth].forEach((m, i) => notes.push({ at: bar + i / 2, len: 0.45, midi: m, voice: 'lead', vel: 0.55 }));
    notes.push({ at: bar + BEATS, len: 1.9, midi: fifth, voice: 'lead', vel: 0.6 });
    notes.push({ at: bar + BEATS + 2, len: 0.9, midi: third, voice: 'lead', vel: 0.5 });
    notes.push({ at: bar + BEATS + 3, len: 0.9, midi: r, voice: 'lead', vel: 0.5 });
  });
  return { bpm: 150, bars: 8, notes };
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** A second of white noise for the drums, in `ctx`. */
function noise(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = b.getChannelData(0);
  let seed = 7;
  // (seeded, so the placeholder sounds the same every time)
  for (let i = 0; i < d.length; i++) {
    seed = (seed * 16807) % 2147483647;
    d[i] = (seed / 2147483647) * 2 - 1;
  }
  return b;
}

/** An envelope on a new gain: a quick attack, held, then released over `release` s. */
function envelope(ctx: BaseAudioContext, t: number, len: number, peak: number, release: number, attack = 0.005): GainNode {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setValueAtTime(peak, t + Math.max(attack, len));
  g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(attack, len) + release);
  return g;
}

/** Play one note of `voice` at `t` (s) for `len` (s) into `out`. */
function voice(ctx: BaseAudioContext, out: AudioNode, n: Note, t: number, len: number, noiseBuf: AudioBuffer): void {
  const tone = (type: OscillatorType, freq: number, peak: number, release: number, cutoff?: number, detune = 0) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    const g = envelope(ctx, t, len, peak * n.vel, release);
    let node: AudioNode = o;
    if (cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      node = o.connect(f);
    }
    node.connect(g).connect(out);
    o.start(t);
    o.stop(t + len + release + 0.05);
    return o;
  };
  const hit = (type: BiquadFilterType, freq: number, peak: number, decay: number) => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak * n.vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    s.connect(f).connect(g).connect(out);
    s.start(t);
    s.stop(t + decay + 0.02);
  };
  switch (n.voice) {
    case 'lead': {
      // a square with a little vibrato, as a chip lead
      const o = tone('square', hz(n.midi), 0.16, 0.12, 3200);
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.value = 9;
      lfo.connect(depth).connect(o.detune);
      lfo.start(t);
      lfo.stop(t + len + 0.2);
      break;
    }
    case 'arp':
      tone('triangle', hz(n.midi), 0.3, 0.25);
      tone('square', hz(n.midi), 0.05, 0.1, 2400);
      break;
    case 'pad':
      tone('sawtooth', hz(n.midi), 0.07, 0.8, 900, -7);
      tone('sawtooth', hz(n.midi), 0.07, 0.8, 900, 7);
      break;
    case 'bass':
      tone('triangle', hz(n.midi), 0.5, 0.06);
      tone('square', hz(n.midi), 0.08, 0.05, 700);
      break;
    case 'kick': {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9 * n.vel, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.3);
      break;
    }
    case 'snare':
      hit('bandpass', 1800, 0.6, 0.16);
      tone('triangle', 185, 0.3, 0.05);
      break;
    case 'hat':
      hit('highpass', 7500, 0.35, 0.05);
      break;
  }
}

/** A song as a placeholder loop. */
export function placeholder(song: Song): Placeholder {
  const beat = 60 / song.bpm;
  return {
    seconds: song.bars * BEATS * beat,
    build(ctx) {
      const buf = noise(ctx);
      const out = ctx.createGain();
      out.connect(ctx.destination);
      for (const n of song.notes) voice(ctx, out, n, n.at * beat, n.len * beat, buf);
    },
  };
}

export const MENU_MUSIC: Track = { id: 'menu', placeholder: placeholder(menuSong()), gain: 0.8 };
export const RACE_MUSIC: Track = { id: 'race', placeholder: placeholder(raceSong()), gain: 0.45 };
