// The game's music (a port of src/f1/music.ts and the placeholder half of src/engine/music.ts). The race, the theme
// and the podium march are composed files (the web game's public/music, in Resources/Music: Game/MusicPlayer.cs plays
// them); the menu's tune, played after your flag, has no file yet on the web either, so it's its placeholder: a chiptune
// loop written as notes (A minor, 96 bpm, 8 bars: arpeggios over Am F C G, a soft pad, a walking bass, off-beat hats),
// rendered on the device with the synth (Synth.cs) into a seamless loop, its notes' tails folded back over the start.
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public enum MusicVoice { Lead, Arp, Pad, Bass, Kick, Snare, Hat, Brass, Stab, Crash, Pulse }

    public struct MusicNote
    {
        /// <summary>start and length, in beats; MIDI note (drums: ignored); 0…1</summary>
        public double At, Len;
        public int Midi;
        public MusicVoice Voice;
        public double Vel;
    }

    public sealed class Song
    {
        public double Bpm;
        public int Bars;
        public List<MusicNote> Notes = new List<MusicNote>();
        public double Seconds => Bars * Music.Beats * 60 / Bpm;
    }

    /// <summary>A track: its file in Resources (none: the placeholder), its loop (s; NaN: the whole file), its loudness under the music volume.</summary>
    public sealed class MusicTrack
    {
        public string Id, File;
        public double LoopStart = double.NaN, LoopEnd = double.NaN, Gain = 1;
        public Song Placeholder;
    }

    public static class Music
    {
        public const int Beats = 4;
        /// <summary>s a change of track crossfades over; extra s rendered after a placeholder's loop for its tails</summary>
        public const double Fade = 1.2, Tail = 2;

        public static readonly MusicTrack Menu = new MusicTrack { Id = "menu", Placeholder = MenuSong(), Gain = 0.8 };
        public static readonly MusicTrack Race = new MusicTrack { Id = "race", File = "Music/race", LoopStart = 0.19, LoopEnd = 119.92, Gain = 0.5 };
        public static readonly MusicTrack Theme = new MusicTrack { Id = "theme", File = "Music/theme", Gain = 0.8 };
        public static readonly MusicTrack Podium = new MusicTrack { Id = "podium", File = "Music/podium", Gain = 0.95 };

        static int[] Chord(int root, bool minor) => new[] { root, root + (minor ? 3 : 4), root + 7 };

        /// <summary>The menu: four chords, two bars each.</summary>
        public static Song MenuSong()
        {
            var song = new Song { Bpm = 96, Bars = 8 };
            var notes = song.Notes;
            // Am F C G, from A3
            var chords = new[] { Chord(57, true), Chord(53, false), Chord(60, false), Chord(55, false) };
            int[] arp = { 0, 1, 2, 1, 2, 0, 1, 2 };
            for (int k = 0; k < chords.Length; k++)
            {
                var c = chords[k];
                double bar = k * 2 * Beats;
                // the pad: the chord held for both bars
                foreach (int m in c) notes.Add(new MusicNote { At = bar, Len = 2 * Beats, Midi = m, Voice = MusicVoice.Pad, Vel = 0.35 });
                // arpeggios in eighths, an octave up, rising on the second bar
                for (int i = 0; i < 16; i++) notes.Add(new MusicNote { At = bar + i / 2.0, Len = 0.45, Midi = c[arp[i % 8]] + (i >= 8 && i % 8 >= 4 ? 24 : 12), Voice = MusicVoice.Arp, Vel = i % 2 == 1 ? 0.45 : 0.6 });
                // a walking bass: root, fifth, root, and a step to the next chord's root
                int next = chords[(k + 1) % chords.Length][0];
                var walk = new[] { c[0], c[0] + 7, c[0], next - 1 };
                for (int i = 0; i < walk.Length; i++) notes.Add(new MusicNote { At = bar + i * 2, Len = 1.8, Midi = walk[i] - 24, Voice = MusicVoice.Bass, Vel = 0.7 });
                // soft off-beat hats
                for (int i = 0; i < 8; i++) notes.Add(new MusicNote { At = bar + i + 0.5, Len = 0.1, Midi = 0, Voice = MusicVoice.Hat, Vel = 0.25 });
            }
            return song;
        }

        public static double Hz(int midi) => 440 * Math.Pow(2, (midi - 69) / 12.0);

        /// <summary>A second of white noise for the drums, seeded (so the placeholder sounds the same every time).</summary>
        public static float[] DrumNoise(int rate)
        {
            var d = new float[rate];
            long seed = 7;
            for (int i = 0; i < d.Length; i++)
            {
                seed = seed * 16807 % 2147483647;
                d[i] = (float)(seed / 2147483647.0 * 2 - 1);
            }
            return d;
        }

        /// <summary>An envelope on a note: a quick attack, held, then released over `release` s.</summary>
        static Envelope Env(double len, double peak, double release, double attack = 0.005)
        {
            double hold = Math.Max(attack, len);
            return new Envelope { Attack = attack, Peak = peak, Hold = hold, End = hold + release, Floor = 0.0001 };
        }

        /// <summary>One note of its voice at `t` s for `len` s (the voices the placeholders use; a composed file has the rest).</summary>
        static void Voice(Synth s, MusicNote n, double t, double len, float[] noise)
        {
            void Tone(Wave w, double freq, double peak, double release, double cutoff = 0, double detune = 0) =>
                s.Add(new ToneShot(s, w, freq, Env(len, peak * n.Vel, release), cutoff: cutoff, detune: detune), t);
            void Hit(FilterKind k, double freq, double peak, double decay) =>
                s.Add(new NoiseShot(s, k, freq, 1, Envelope.Decay(peak * n.Vel, decay, 0.0001), 0, noise), t);
            switch (n.Voice)
            {
                case MusicVoice.Arp:
                    Tone(Wave.Triangle, Hz(n.Midi), 0.3, 0.25);
                    Tone(Wave.Square, Hz(n.Midi), 0.05, 0.1, 2400);
                    break;
                case MusicVoice.Pad:
                    Tone(Wave.Sawtooth, Hz(n.Midi), 0.07, 0.8, 900, -7);
                    Tone(Wave.Sawtooth, Hz(n.Midi), 0.07, 0.8, 900, 7);
                    break;
                case MusicVoice.Bass:
                    Tone(Wave.Triangle, Hz(n.Midi), 0.5, 0.06);
                    Tone(Wave.Square, Hz(n.Midi), 0.08, 0.05, 700);
                    break;
                case MusicVoice.Hat:
                    Hit(FilterKind.Highpass, 7500, 0.35, 0.05);
                    break;
                case MusicVoice.Snare:
                    Hit(FilterKind.Bandpass, 1800, 0.6, 0.16);
                    Tone(Wave.Triangle, 185, 0.3, 0.05);
                    break;
                case MusicVoice.Kick:
                    s.Add(new ToneShot(s, Wave.Sine, 150, Envelope.Decay(0.9 * n.Vel, 0.25, 0.0001), 45, 0.12), t);
                    break;
                default:
                    throw new NotSupportedException($"no placeholder voice {n.Voice}");
            }
        }

        /// <summary>Add the samples past `loop` back onto the start, so a loop's notes ring on across the join; the first `loop` samples.</summary>
        public static float[] FoldTail(float[] data, int loop)
        {
            var o = new float[loop];
            Array.Copy(data, o, Math.Min(loop, data.Length));
            for (int i = loop; i < data.Length; i++) o[(i - loop) % loop] += data[i];
            return o;
        }

        /// <summary>A song rendered into a seamless mono loop at `rate`, peaking at 0.9.</summary>
        public static float[] Render(Song song, int rate)
        {
            double beat = 60 / song.Bpm;
            int loop = (int)Math.Round(song.Seconds * rate);
            var s = new Synth(rate, 1, limited: false, seed: 1);
            var noise = DrumNoise(rate);
            foreach (var n in song.Notes) Voice(s, n, n.At * beat, n.Len * beat, noise);
            var d = FoldTail(s.Render(loop + (int)(Tail * rate)), loop);
            double peak = Math.Max(1e-6, d.Max(x => Math.Abs(x)));
            for (int i = 0; i < d.Length; i++) d[i] = (float)(d[i] * 0.9 / peak);
            return d;
        }
    }
}
