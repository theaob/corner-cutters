// Sound, synthesised (a port of src/engine/audio.ts, Web Audio's graph done by hand): continuous voices (an engine
// note, a tyre's squeal, filtered noise for the ground, the rain, the crowd) the game sets every frame, and one-shots
// (beeps, bursts, pops, thumps), mixed sample by sample into a master gain and a limiter. No sound files: as on the
// web, it's all made on the device. The pieces behave as Web Audio's do (setTargetAtTime's glide, the biquads'
// formulas, a periodic wave normalised to a peak of 1, the waveshaper's curve, the compressor's make-up gain), so
// the race sounds as the web game does. Engine-free: the game feeds it to Unity's audio thread (Game/SoundOut.cs),
// and the menu music's placeholder is rendered with it offline (Music.cs). Every call locks: the game sets voices on
// its thread while the audio thread renders.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    public enum Wave { Sine, Square, Sawtooth, Triangle, Table }
    public enum FilterKind { Lowpass, Highpass, Bandpass }

    /// <summary>A value gliding to its target as Web Audio's setTargetAtTime does (a time constant, in s).</summary>
    public struct Glide
    {
        public double Value, Target, K;

        public Glide(double v) { Value = Target = v; K = 1; }

        public void To(double target, double tau, double sr)
        {
            Target = target;
            K = tau <= 0 ? 1 : 1 - Math.Exp(-1 / (tau * sr));
        }

        public double Next() => Value += (Target - Value) * K;
    }

    /// <summary>Web Audio's BiquadFilterNode (the Audio EQ Cookbook's, as the spec has it: lowpass and highpass Q in dB, bandpass Q plain).</summary>
    public sealed class Biquad
    {
        public FilterKind Kind;
        public double Freq, Q;
        double b0, b1, b2, a1, a2, x1, x2, y1, y2;
        readonly double sr;
        double setFreq = -1, setQ = -1;

        public Biquad(FilterKind kind, double freq, double q, double sampleRate)
        {
            Kind = kind;
            Freq = freq;
            Q = q;
            sr = sampleRate;
            Update();
        }

        /// <summary>The coefficients again, if the frequency or Q has moved.</summary>
        public void Update()
        {
            if (Freq == setFreq && Q == setQ) return;
            setFreq = Freq;
            setQ = Q;
            double f = Math.Max(1, Math.Min(sr / 2 * 0.999, Freq));
            double w0 = 2 * Math.PI * f / sr, cos = Math.Cos(w0), sin = Math.Sin(w0);
            double alpha, a0;
            switch (Kind)
            {
                case FilterKind.Lowpass:
                    alpha = sin / (2 * Math.Pow(10, Q / 20));
                    b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2;
                    break;
                case FilterKind.Highpass:
                    alpha = sin / (2 * Math.Pow(10, Q / 20));
                    b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2;
                    break;
                default:
                    alpha = sin / (2 * Math.Max(1e-4, Q));
                    b0 = alpha; b1 = 0; b2 = -alpha;
                    break;
            }
            a0 = 1 + alpha;
            a1 = -2 * cos / a0;
            a2 = (1 - alpha) / a0;
            b0 /= a0; b1 /= a0; b2 /= a0;
        }

        public double Next(double x)
        {
            double y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            x2 = x1; x1 = x;
            y2 = y1; y1 = y;
            return y;
        }
    }

    /// <summary>An oscillator: a phase run round at a frequency (Hz), its wave band-limited at the edges (PolyBLEP) as Web Audio's are.</summary>
    public sealed class Osc
    {
        public Wave Wave;
        public double Phase;
        public float[] Table;

        public Osc(Wave wave, double phase = 0) { Wave = wave; Phase = phase; }

        static double Blep(double t, double dt)
        {
            if (t < dt) { t /= dt; return t + t - t * t - 1; }
            if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
            return 0;
        }

        public double Next(double freq, double sr)
        {
            double dt = Math.Max(0, Math.Min(0.5, freq / sr)), t = Phase, v;
            switch (Wave)
            {
                case Wave.Sine: v = Math.Sin(2 * Math.PI * t); break;
                case Wave.Square: v = (t < 0.5 ? 1 : -1) + Blep(t, dt) - Blep((t + 0.5) % 1, dt); break;
                case Wave.Sawtooth: v = 2 * t - 1 - Blep(t, dt); break;
                case Wave.Triangle: v = t < 0.25 ? 4 * t : t < 0.75 ? 2 - 4 * t : 4 * t - 4; break;
                default:
                    {
                        double at = t * Table.Length;
                        int i = (int)at;
                        double fr = at - i;
                        v = Table[i % Table.Length] * (1 - fr) + Table[(i + 1) % Table.Length] * fr;
                        break;
                    }
            }
            Phase += dt;
            if (Phase >= 1) Phase -= Math.Floor(Phase);
            return v;
        }
    }

    /// <summary>
    /// A gain over time, as a one-shot's: silent until `start`, then linearly up to `peak` over `attack` s (none: straight
    /// at it), held until `hold`, then exponentially down to `floor` by `end` (s from the start); silent after.
    /// </summary>
    public struct Envelope
    {
        public double Attack, Peak, Hold, End, Floor;

        public double At(double t)
        {
            if (t < 0 || t > End) return 0;
            if (t < Attack) return Peak * t / Attack;
            if (t <= Hold) return Peak;
            double span = End - Hold;
            return span <= 0 ? 0 : Peak * Math.Pow(Floor / Math.Max(1e-9, Peak), (t - Hold) / span);
        }

        /// <summary>audio.ts's beep and burst: up over `attack`, then down to 0.001 at `seconds`.</summary>
        public static Envelope Shot(double peak, double attack, double seconds) => new Envelope { Attack = attack, Peak = peak, Hold = attack, End = seconds, Floor = 0.001 };
        /// <summary>A hit: at `peak` from the start, down to `floor` at `seconds`.</summary>
        public static Envelope Decay(double peak, double seconds, double floor = 0.001) => new Envelope { Attack = 0, Peak = peak, Hold = 0, End = seconds, Floor = floor };
    }

    public abstract class Voice
    {
        /// <summary>the sample it starts on (one-shots after a delay)</summary>
        public long Start;
        public bool Done;
        /// <summary>The next sample (at `t` s since it started).</summary>
        public abstract double Next(double t);
    }

    public sealed class Synth
    {
        /// <summary>The volume steps offered in the settings (audio.ts VOLUMES).</summary>
        public static readonly double[] Volumes = { 0, 0.35, 0.7, 1 };

        public readonly double Rate;
        public readonly object Gate = new object();
        /// <summary>two seconds of white noise, looped by the noise voices</summary>
        public readonly float[] Noise;
        readonly Random rng;
        readonly List<Voice> voices = new List<Voice>();
        readonly List<Voice> adding = new List<Voice>();
        Glide master;
        /// <summary>the limiter at the end (none for an offline render)</summary>
        readonly Limiter limiter;
        long now;
        /// <summary>the game paused (or out of sight): silent, and its one-shots not played</summary>
        public bool Paused;

        public Synth(double sampleRate, double volume = 0.7, bool limited = true, int seed = 0)
        {
            Rate = sampleRate;
            rng = seed == 0 ? new Random() : new Random(seed);
            Noise = new float[(int)(sampleRate * 2)];
            for (int i = 0; i < Noise.Length; i++) Noise[i] = (float)(rng.NextDouble() * 2 - 1);
            master = new Glide(volume);
            if (limited) limiter = new Limiter(sampleRate);
        }

        public double Random() { lock (Gate) return rng.NextDouble(); }

        public long Now { get { lock (Gate) return now; } }

        /// <summary>The master volume (0…1), glided to.</summary>
        public void SetVolume(double v) { lock (Gate) master.To(Math.Max(0, Math.Min(1, v)), 0.05, Rate); }

        /// <summary>Play `v` (`delay` s from now). Not while paused for a one-shot: the web game's context is suspended then.</summary>
        public T Add<T>(T v, double delay = 0) where T : Voice
        {
            lock (Gate)
            {
                v.Start = now + (long)Math.Round(Math.Max(0, delay) * Rate);
                adding.Add(v);
            }
            return v;
        }

        public bool Running { get { lock (Gate) return !Paused; } }

        /// <summary>The voices playing (or waiting to), for tests.</summary>
        public int Count { get { lock (Gate) return voices.Count + adding.Count; } }

        /// <summary>Mix the next frames into `data` (interleaved, `channels` to a frame; the same sound in each).</summary>
        public void Render(float[] data, int channels)
        {
            lock (Gate)
            {
                if (adding.Count > 0)
                {
                    voices.AddRange(adding);
                    adding.Clear();
                }
                int frames = data.Length / Math.Max(1, channels);
                if (Paused)
                {
                    Array.Clear(data, 0, data.Length);
                    return;
                }
                for (int f = 0; f < frames; f++)
                {
                    double sum = 0;
                    for (int i = 0; i < voices.Count; i++)
                    {
                        var v = voices[i];
                        if (v.Done || now < v.Start) continue;
                        sum += v.Next((now - v.Start) / Rate);
                    }
                    double s = sum * master.Next();
                    if (limiter != null) s = limiter.Next(s);
                    // (clipped at the end, live; an offline render is left as it is, to be scaled)
                    float o = limiter != null ? (float)Math.Max(-1, Math.Min(1, s)) : (float)s;
                    for (int c = 0; c < channels; c++) data[f * channels + c] = o;
                    now++;
                }
                voices.RemoveAll(v => v.Done);
            }
        }

        /// <summary>`samples` of sound into a new buffer, mono.</summary>
        public float[] Render(int samples)
        {
            var d = new float[samples];
            Render(d, 1);
            return d;
        }

        // ---- noise: a looped read of the buffer, from where it was started ----

        public sealed class NoiseRead
        {
            readonly float[] buf;
            int at;
            public NoiseRead(Synth s, double offset) : this(s.Noise, (int)(offset * s.Rate)) { }
            public NoiseRead(float[] buffer, int from) { buf = buffer; at = from % buf.Length; }
            public double Next() { double v = buf[at]; at = (at + 1) % buf.Length; return v; }
        }
    }

    /// <summary>Web Audio's DynamicsCompressorNode as audio.ts sets it (-10 dB, a 6 dB knee, 8:1, 3 ms and 150 ms), with its make-up gain.</summary>
    public sealed class Limiter
    {
        const double Threshold = -10, Knee = 6, Ratio = 8;
        readonly double attack, release, makeup;
        double env;

        public Limiter(double sr)
        {
            attack = 1 - Math.Exp(-1 / (0.003 * sr));
            release = 1 - Math.Exp(-1 / (0.15 * sr));
            // (the spec's make-up: the curve's gain at full scale, inverted, to the 0.6)
            makeup = Math.Pow(1 / Math.Pow(10, Curve(0) / 20), 0.6);
        }

        /// <summary>dB out for dB in.</summary>
        public static double Curve(double x)
        {
            double lo = Threshold - Knee / 2, hi = Threshold + Knee / 2;
            if (x <= lo) return x;
            if (x >= hi) return Threshold + (x - Threshold) / Ratio;
            double over = x - lo;
            return x + (1 / Ratio - 1) * over * over / (2 * Knee);
        }

        public double Next(double x)
        {
            double a = Math.Abs(x);
            env += (a - env) * (a > env ? attack : release);
            double db = 20 * Math.Log10(Math.Max(1e-6, env));
            double gain = Math.Pow(10, (Curve(db) - db) / 20);
            return x * gain * makeup;
        }
    }

    // ---- the voices ----

    /// <summary>
    /// An engine note (audio.ts engineVoice): one turn of a six's crank as a waveform (ENGINE_ORDERS), two banks a touch
    /// apart, a fast wobble in the pitch, driven into a soft clip for grit, a lowpass, and the exhaust's breath (noise round
    /// the note's second harmonic). Set every frame: the firing frequency (Hz), loudness and brightness (0…1).
    /// </summary>
    public sealed class EngineVoice : Voice
    {
        public static readonly double[] Orders = OrdersOf();
        static float[] table;

        static double[] OrdersOf()
        {
            var o = new double[36];
            for (int i = 0; i < 36; i++)
            {
                int k = i + 1;
                o[i] = (k % 3 == 0 ? 1 : k % 3 == 1 ? 0.3 : 0.18) / Math.Pow(k, 0.75);
            }
            return o;
        }

        /// <summary>The orders as a cycle of samples (sines, as a PeriodicWave of them), normalised to a peak of 1 as Web Audio's is.</summary>
        public static float[] Table()
        {
            if (table != null) return table;
            const int n = 4096;
            var t = new double[n];
            double peak = 0;
            for (int i = 0; i < n; i++)
            {
                double v = 0;
                for (int k = 0; k < Orders.Length; k++) v += Orders[k] * Math.Sin(2 * Math.PI * (k + 1) * i / n);
                t[i] = v;
                peak = Math.Max(peak, Math.Abs(v));
            }
            var f = new float[n];
            for (int i = 0; i < n; i++) f[i] = (float)(t[i] / peak);
            return table = f;
        }

        readonly Synth s;
        readonly Osc a = new Osc(Wave.Table), b = new Osc(Wave.Table), jitter = new Osc(Wave.Triangle);
        readonly Biquad filter, breathBand;
        readonly Synth.NoiseRead breath;
        Glide crank = new Glide(70), drive = new Glide(1), cutoff = new Glide(350), band = new Glide(420), breathGain = new Glide(0), gain = new Glide(0);
        /// <summary>s into a gearshift's cut, and its length (none: -1)</summary>
        double cutAt = -1, cutLen;
        double t, retiredAt = -1;

        public EngineVoice(Synth synth)
        {
            s = synth;
            a.Table = b.Table = Table();
            filter = new Biquad(FilterKind.Lowpass, 350, 1.2, s.Rate);
            breathBand = new Biquad(FilterKind.Bandpass, 420, 1.5, s.Rate);
            breath = new Synth.NoiseRead(s, s.Random() * 2);
        }

        public void Set(double freq, double loud, double brightness)
        {
            lock (s.Gate)
            {
                crank.To(freq / 3, 0.025, s.Rate);
                drive.To(0.6 + brightness * 2.4, 0.05, s.Rate);
                cutoff.To(Math.Min(9000, freq * (2 + brightness * 7)), 0.04, s.Rate);
                band.To(freq * 2, 0.04, s.Rate);
                breathGain.To(0.25 + brightness * 0.9, 0.05, s.Rate);
                if (retiredAt < 0) gain.To(loud * 0.55, 0.05, s.Rate);
            }
        }

        /// <summary>The ignition cut of a gearshift: down to a quarter for `seconds`.</summary>
        public void Cut(double seconds)
        {
            lock (s.Gate)
            {
                cutAt = 0;
                cutLen = seconds;
            }
        }

        /// <summary>Fade out and stop for good.</summary>
        public void Stop()
        {
            lock (s.Gate)
            {
                gain.To(0, 0.02, s.Rate);
                retiredAt = t;
            }
        }

        double Gate()
        {
            if (cutAt < 0) return 1;
            double c = cutAt;
            cutAt += 1 / s.Rate;
            if (c < 0.012) return 1 - 0.75 * c / 0.012;
            if (c < 0.012 + cutLen) return 0.25;
            if (c < 0.012 + cutLen + 0.03) return 0.25 + 0.75 * (c - 0.012 - cutLen) / 0.03;
            cutAt = -1;
            return 1;
        }

        int since;

        public override double Next(double at)
        {
            t = at;
            if (retiredAt >= 0 && t > retiredAt + 0.25) { Done = true; return 0; }
            double c = crank.Next();
            double wob = Math.Pow(2, jitter.Next(23, s.Rate) * 6 / 1200);
            double x = a.Next(c * wob, s.Rate) + 0.55 * b.Next(c * 1.006 * wob, s.Rate);
            double shaped = Math.Tanh(2 * Math.Max(-1, Math.Min(1, x * drive.Next())));
            // (the filters' coefficients again every 32 samples, as they glide)
            filter.Freq = cutoff.Next();
            breathBand.Freq = band.Next();
            if (++since >= 32)
            {
                since = 0;
                filter.Update();
                breathBand.Update();
            }
            double v = filter.Next(shaped) + breathBand.Next(breath.Next()) * breathGain.Next();
            return v * gain.Next() * Gate();
        }
    }

    /// <summary>A tyre's squeal (audio.ts squealVoice): a wavering triangle over a band of hiss; set its loudness and how hard it's sliding.</summary>
    public sealed class SquealVoice : Voice
    {
        readonly Synth s;
        readonly Osc tone = new Osc(Wave.Triangle), wobble = new Osc(Wave.Sine);
        readonly Biquad band;
        readonly Synth.NoiseRead hiss;
        Glide pitch = new Glide(1050), gain = new Glide(0);
        double t, retiredAt = -1;

        public SquealVoice(Synth synth)
        {
            s = synth;
            band = new Biquad(FilterKind.Bandpass, 2200, 3, s.Rate);
            hiss = new Synth.NoiseRead(s, s.Random() * 2);
        }

        public void Set(double loud, double slide)
        {
            lock (s.Gate)
            {
                pitch.To(900 + slide * 350, 0.08, s.Rate);
                if (retiredAt < 0) gain.To(loud, 0.04, s.Rate);
            }
        }

        public void Stop()
        {
            lock (s.Gate)
            {
                gain.To(0, 0.02, s.Rate);
                retiredAt = t;
            }
        }

        public override double Next(double at)
        {
            t = at;
            if (retiredAt >= 0 && t > retiredAt + 0.25) { Done = true; return 0; }
            double f = pitch.Next() + 70 * wobble.Next(11, s.Rate);
            return (0.5 * tone.Next(f, s.Rate) + band.Next(hiss.Next())) * gain.Next();
        }
    }

    /// <summary>A filtered noise (audio.ts noiseVoice: tyres on the ground, rain, wind, the crowd); set its loudness every frame.</summary>
    public sealed class NoiseVoice : Voice
    {
        readonly Synth s;
        readonly Biquad filter;
        readonly Synth.NoiseRead src;
        Glide gain = new Glide(0);
        double t, retiredAt = -1;

        public NoiseVoice(Synth synth, FilterKind kind, double freq, double q = 1)
        {
            s = synth;
            filter = new Biquad(kind, freq, q, s.Rate);
            src = new Synth.NoiseRead(s, 0);
        }

        public void Set(double loud)
        {
            lock (s.Gate) if (retiredAt < 0) gain.To(loud, 0.04, s.Rate);
        }

        public void Stop()
        {
            lock (s.Gate)
            {
                gain.To(0, 0.02, s.Rate);
                retiredAt = t;
            }
        }

        public override double Next(double at)
        {
            t = at;
            if (retiredAt >= 0 && t > retiredAt + 0.25) { Done = true; return 0; }
            return filter.Next(src.Next()) * gain.Next();
        }
    }

    /// <summary>A tone for a while: a wave at a frequency (or falling exponentially from one to another over `sweep` s), under an envelope.</summary>
    public sealed class ToneShot : Voice
    {
        readonly Synth s;
        readonly Osc osc;
        readonly double from, to, sweep, length, cents;
        readonly Envelope env;
        readonly Biquad filter;
        /// <summary>a vibrato: Hz and depth (cents)</summary>
        public double VibratoHz, VibratoCents;
        readonly Osc lfo = new Osc(Wave.Sine);

        public ToneShot(Synth synth, Wave wave, double freq, Envelope envelope, double freqTo = 0, double sweepSecs = 0, double cutoff = 0, double detune = 0, double cutoffQ = 1)
        {
            s = synth;
            osc = new Osc(wave);
            from = freq;
            to = freqTo > 0 ? freqTo : freq;
            sweep = sweepSecs;
            env = envelope;
            length = envelope.End + 0.05;
            cents = detune;
            if (cutoff > 0) filter = new Biquad(FilterKind.Lowpass, cutoff, cutoffQ, s.Rate);
        }

        public override double Next(double t)
        {
            if (t > length) { Done = true; return 0; }
            double f = sweep > 0 && t < sweep ? from * Math.Pow(to / from, t / sweep) : sweep > 0 ? to : from;
            double c = cents + (VibratoCents != 0 ? VibratoCents * lfo.Next(VibratoHz, s.Rate) : 0);
            if (c != 0) f *= Math.Pow(2, c / 1200);
            double v = osc.Next(f, s.Rate);
            if (filter != null) v = filter.Next(v);
            return v * env.At(t);
        }
    }

    /// <summary>A burst of filtered noise under an envelope (a scrape, a squelch, a crunch, a drum).</summary>
    public sealed class NoiseShot : Voice
    {
        readonly Biquad filter;
        readonly Synth.NoiseRead src;
        readonly Envelope env;
        readonly double length;

        public NoiseShot(Synth s, FilterKind kind, double freq, double q, Envelope envelope, double offset, float[] buffer = null)
        {
            filter = new Biquad(kind, freq, q, s.Rate);
            src = buffer != null ? new Synth.NoiseRead(buffer, (int)(offset * s.Rate)) : new Synth.NoiseRead(s, offset);
            env = envelope;
            length = envelope.End + 0.05;
        }

        public override double Next(double t)
        {
            if (t > length) { Done = true; return 0; }
            return filter.Next(src.Next()) * env.At(t);
        }
    }

    /// <summary>audio.ts's one-shots, made of the voices above.</summary>
    public static class Shots
    {
        /// <summary>A short tone: `freq` Hz for `seconds`, a quick attack and fade (after `delay` s).</summary>
        public static void Beep(Synth s, double freq, double seconds = 0.15, double gain = 0.25, Wave wave = Wave.Square, double delay = 0)
        {
            if (!s.Running) return;
            s.Add(new ToneShot(s, wave, freq, Envelope.Shot(gain, 0.01, seconds)), delay);
        }

        /// <summary>A burst of filtered noise: `seconds` long through a filter at `freq`, peaking at `gain` and fading.</summary>
        public static void Burst(Synth s, FilterKind kind, double freq, double q, double seconds, double gain, double delay = 0)
        {
            if (!s.Running || gain <= 0) return;
            s.Add(new NoiseShot(s, kind, freq, q, Envelope.Shot(gain, 0.008, seconds), s.Random() * 1.5), delay);
        }

        /// <summary>An exhaust pop or a gearshift's crack: a very short burst of band-passed noise over a low click.</summary>
        public static void Pop(Synth s, double strength, double freq = 900)
        {
            if (!s.Running || strength <= 0) return;
            s.Add(new NoiseShot(s, FilterKind.Bandpass, freq, 1.2, Envelope.Decay(0.3 * strength, 0.05), s.Random() * 1.9));
            s.Add(new ToneShot(s, Wave.Sine, 180, Envelope.Decay(0.25 * strength, 0.05), 60, 0.04));
        }

        /// <summary>A hit: a low thud falling in pitch under a burst of noise.</summary>
        public static void Thump(Synth s, double strength)
        {
            if (!s.Running || strength <= 0) return;
            double k = Math.Min(1, strength);
            s.Add(new ToneShot(s, Wave.Sine, 140, Envelope.Decay(0.6 * k, 0.3), 40, 0.25));
            s.Add(new NoiseShot(s, FilterKind.Bandpass, 1800, 1, Envelope.Decay(0.35 * k, 0.18 + 0.2 * k), s.Random()));
        }
    }
}
