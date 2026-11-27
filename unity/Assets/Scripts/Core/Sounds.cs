// The race's sounds, a port of src/f1/sounds.ts: your engine (a V6's note climbing through the gears, dropping a little
// at each upshift with the crack of the ignition cut, gritty on the throttle, popping on the overrun when you lift),
// the nearest rival's engine (quieter, louder as it closes, its pitch bent as it comes and goes), tyre squeal while
// sliding, a rumble on grass and gravel and a buzz over the kerbs and a crunch on the gravel, rain in the wet, a rush
// of air in another car's slipstream, the crowd (a murmur by the grandstands, swelling into a cheer at the start, an
// overtake, a crash, the flag), a plane's roar overhead, the pit limiter's beep, and one-shots: hits and the scrape of
// metal, the start lights, the chequered flag, the last lap's bell, track limits, a lap record, a champagne cork, a
// firework, and the team radio's click and squelch. The pitch and crowd models are pure (and checked against the web
// game's); the voices are Synth.cs.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    /// <summary>A frame of your car, as the sounds hear it.</summary>
    public struct SoundFrame
    {
        public double Dt;
        /// <summary>your car: its speed and top speed (px/s), how fast it's sliding sideways (px/s), and what it's on</summary>
        public double Speed, Top, Slide;
        public bool OnRough, OnKerb, OnGravel;
        /// <summary>the nearest other car (RivalDistance NaN: none)</summary>
        public double RivalSpeed, RivalDistance;
        /// <summary>how much you're in another car's slipstream, and how near the grandstands are (0…1)</summary>
        public double Tow, Crowd;
        /// <summary>the pit limiter's on</summary>
        public bool Limiter;
    }

    public static class EngineSound
    {
        /// <summary>The gears an F1 car goes up through from a standstill to top speed.</summary>
        public const int Gears = 8;
        /// <summary>Firing frequency (Hz) at idle, and at the rev limiter (a V6 at about 12,500 rpm).</summary>
        public const double IdleHz = 210, LimitHz = 630;

        /// <summary>The engine note at `speed` (of `top`) and `throttle` (0…1): its pitch (Hz), loudness, brightness and gear.</summary>
        public static (double freq, double gain, double brightness, int gear) Note(double speed, double top, double throttle)
        {
            double share = Math.Max(0, Math.Min(1, speed / top));
            if (speed < 3) return (IdleHz, 0.05 + 0.04 * throttle, 0.1 + 0.3 * throttle, 0);
            int gear = Math.Min(Gears - 1, (int)Math.Floor(share * Gears));
            // how far through this gear's range the revs are
            double within = Math.Min(1, share * Gears - gear);
            double from = 0.5 + (0.3 * gear) / (Gears - 1);
            double rpm = from + (1 - from) * within;
            double freq = IdleHz * 0.4 + rpm * (LimitHz - IdleHz * 0.4);
            return (freq, 0.06 + 0.08 * throttle + 0.04 * share, 0.2 + 0.8 * throttle * rpm, gear);
        }

        /// <summary>The pitch shift of a car closing at `closing` px/s (negative: going away), as a factor.</summary>
        public static double Doppler(double closing) => Math.Max(0.82, Math.Min(1.2, 1 / (1 - closing / 1100)));
    }

    public static class Crowd
    {
        public const double Murmur = 0.03, Cheer = 0.11, Close = 90, Reach = 520, Everywhere = 0.3, Fade = 0.4;

        /// <summary>How near the crowd is (0…1) at (x, y): 1 by a grandstand, 0 out of earshot of them all.</summary>
        public static double Near(IEnumerable<(double x, double y)> stands, double x, double y)
        {
            double near = 0;
            foreach (var st in stands)
            {
                double d = JsMath.Hypot(st.x - x, st.y - y);
                near = Math.Max(near, Math.Min(1, Math.Max(0, 1 - (d - Close) / (Reach - Close))));
            }
            return near;
        }

        /// <summary>The crowd's loudness: its murmur where you are, and a cheer heard everywhere, loudest by the stands.</summary>
        public static double Gain(double near, double cheer) => near * Murmur + cheer * Cheer * (Everywhere + (1 - Everywhere) * near);
    }

    public sealed class RaceSounds
    {
        /// <summary>The pit limiter's beep: every this many s while it's on.</summary>
        public const double LimiterBeep = 0.55;

        readonly Synth s;
        readonly EngineVoice engine, rival;
        readonly SquealVoice tyres;
        readonly NoiseVoice rumble, kerb, rain, wind, gravel, crowd, roar, jet;
        double cheering, limiterIn, lastSpeed, throttle, lifted = double.PositiveInfinity, bend = 1;
        double? rivalDistance;
        int gear;

        public RaceSounds(Synth synth, double rainNow)
        {
            s = synth;
            engine = s.Add(new EngineVoice(s));
            rival = s.Add(new EngineVoice(s));
            tyres = s.Add(new SquealVoice(s));
            rumble = s.Add(new NoiseVoice(s, FilterKind.Lowpass, 160, 1));
            kerb = s.Add(new NoiseVoice(s, FilterKind.Bandpass, 650, 3));
            rain = s.Add(new NoiseVoice(s, FilterKind.Highpass, 3200, 0.7));
            wind = s.Add(new NoiseVoice(s, FilterKind.Bandpass, 1100, 0.9));
            gravel = s.Add(new NoiseVoice(s, FilterKind.Bandpass, 2400, 1.4));
            crowd = s.Add(new NoiseVoice(s, FilterKind.Bandpass, 800, 0.35));
            roar = s.Add(new NoiseVoice(s, FilterKind.Bandpass, 1700, 0.6));
            jet = s.Add(new NoiseVoice(s, FilterKind.Lowpass, 240, 0.8));
            SetRain(rainNow);
        }

        /// <summary>A plane flying over: its low roar, as near as it is (0 none … 1 right overhead).</summary>
        public void SetJet(double near) => jet.Set(near * near * 0.16);

        /// <summary>The rain's hiss as hard as it's raining now, 0…1.</summary>
        public void SetRain(double r) => rain.Set(r * 0.05);

        public void Update(SoundFrame f)
        {
            // on the throttle while the car is gaining speed, or flat out at the top (eased, so the note doesn't flutter)
            double gaining = f.Dt > 0 && (f.Speed > lastSpeed + 2 * f.Dt || f.Speed > f.Top * 0.97) ? 1 : 0.2;
            bool slowing = f.Dt > 0 && f.Speed < lastSpeed - 25 * f.Dt;
            throttle += (gaining - throttle) * Math.Min(1, f.Dt * 8);
            lastSpeed = f.Speed;
            var note = EngineSound.Note(f.Speed, f.Top, throttle);
            // an upshift: the ignition cut, and its crack
            if (note.gear > gear && throttle > 0.5)
            {
                engine.Cut(0.045);
                Shots.Pop(s, 0.45, 1500);
            }
            gear = note.gear;
            // lifting at high revs: the exhaust pops and crackles for a moment
            if (slowing && throttle < 0.5 && note.freq > 420 && f.Speed > 90) lifted = Math.Min(lifted, 0);
            else if (!slowing) lifted = double.PositiveInfinity;
            if (lifted < 1.4)
            {
                lifted += f.Dt;
                if (s.Random() < 9 * f.Dt) Shots.Pop(s, 0.2 + s.Random() * 0.35, 500 + s.Random() * 700);
            }
            engine.Set(note.freq, note.gain, note.brightness);
            if (!double.IsNaN(f.RivalDistance))
            {
                var r = EngineSound.Note(f.RivalSpeed, f.Top, 0.7);
                double near = Math.Max(0, 1 - f.RivalDistance / 260);
                // its pitch bent by how fast it's closing (a jump means a different car: no bend from that)
                double closing = rivalDistance.HasValue && f.Dt > 0 ? (rivalDistance.Value - f.RivalDistance) / f.Dt : 0;
                double b = Math.Abs(closing) < 600 ? EngineSound.Doppler(closing) : bend;
                bend += (b - bend) * Math.Min(1, f.Dt * 6);
                rivalDistance = f.RivalDistance;
                rival.Set(r.freq * 1.03 * bend, r.gain * 0.6 * near * near, r.brightness * 0.8);
            }
            else
            {
                rivalDistance = null;
                rival.Set(EngineSound.IdleHz, 0, 0);
            }
            double moving = Math.Min(1, f.Speed / 120);
            double slide = Math.Min(1, Math.Max(0, f.Slide - 40) / 160);
            tyres.Set(slide * 0.1, slide);
            rumble.Set(f.OnRough ? 0.25 * moving : 0);
            kerb.Set(f.OnKerb && !f.OnRough ? 0.1 * moving : 0);
            wind.Set(f.Tow * 0.07);
            // the gravel's crunch: grainy, a stone at a time
            gravel.Set(f.OnGravel ? 0.12 * moving * (0.35 + 0.65 * s.Random()) : 0);
            // the crowd: a murmur by the stands, a cheer dying away
            cheering = Math.Max(0, cheering - Crowd.Fade * f.Dt);
            double c = Crowd.Gain(f.Crowd, cheering);
            crowd.Set(c);
            roar.Set(c * cheering * 0.8);
            // the pit limiter's beep
            if (f.Limiter)
            {
                limiterIn -= f.Dt;
                if (limiterIn <= 0)
                {
                    Shots.Beep(s, 1450, 0.06, 0.07, Wave.Square);
                    limiterIn = LimiterBeep;
                }
            }
            else limiterIn = 0;
        }

        /// <summary>The crowd cheers: `how` loud (0…1; a start, an overtake, a crash, the flag).</summary>
        public void Cheer(double how) => cheering = Math.Min(1, cheering + how);

        /// <summary>Metal on tarmac or on a wall, sparks flying.</summary>
        public void Scrape(double strength)
        {
            double k = Math.Min(1, strength);
            Shots.Burst(s, FilterKind.Highpass, 2600, 0.8, 0.12 + 0.2 * k, 0.12 * k);
            Shots.Burst(s, FilterKind.Bandpass, 4200, 2, 0.08 + 0.12 * k, 0.08 * k, 0.02);
        }

        /// <summary>The team radio keyed: a click and a burst of squelch (and again, softer, as it closes after `talk` s).</summary>
        public void Radio(double talk = 1.6)
        {
            Shots.Beep(s, 1900, 0.03, 0.08, Wave.Square);
            Shots.Burst(s, FilterKind.Bandpass, 1800, 2.5, 0.16, 0.09);
            Shots.Burst(s, FilterKind.Bandpass, 1800, 2.5, 0.1, 0.05, talk);
            Shots.Beep(s, 1500, 0.03, 0.05, Wave.Square, talk + 0.08);
        }

        /// <summary>Engine and ground to silence (your car's out, the session's held, a replay).</summary>
        public void Quiet()
        {
            engine.Set(EngineSound.IdleHz, 0, 0);
            rival.Set(EngineSound.IdleHz, 0, 0);
            tyres.Set(0, 0);
            foreach (var v in new[] { rumble, kerb, wind, gravel, crowd, roar, jet }) v.Set(0);
        }

        /// <summary>Silence and stop every voice for good.</summary>
        public void Dispose()
        {
            engine.Stop();
            rival.Stop();
            tyres.Stop();
            foreach (var v in new[] { rumble, kerb, rain, wind, gravel, crowd, roar, jet }) v.Stop();
        }

        public void Hit(double strength) => Shots.Thump(s, strength);

        /// <summary>The gopher hit, sent flying: a soft bump and a cartoon boing.</summary>
        public void Boing()
        {
            Shots.Thump(s, 0.15);
            double[] fs = { 330, 494, 659 };
            for (int i = 0; i < fs.Length; i++) Shots.Beep(s, fs[i], 0.09, 0.12, Wave.Triangle, i * 0.05);
        }

        /// <summary>One of the five start lights coming on.</summary>
        public void Light() => Shots.Beep(s, 520, 0.18, 0.2);

        /// <summary>Lights out.</summary>
        public void Go() => Shots.Beep(s, 880, 0.45, 0.22);

        /// <summary>Your chequered flag: a rising arpeggio.</summary>
        public void Flag()
        {
            double[] fs = { 523, 659, 784, 1047 };
            for (int i = 0; i < fs.Length; i++) Shots.Beep(s, fs[i], 0.22, 0.18, Wave.Triangle, i * 0.12);
        }

        /// <summary>Your last lap: two strikes of a bell.</summary>
        public void FinalLap()
        {
            foreach (double at in new[] { 0, 0.28 })
            {
                Shots.Beep(s, 1568, 0.5, 0.14, Wave.Sine, at);
                Shots.Beep(s, 3136, 0.25, 0.05, Wave.Sine, at);
            }
        }

        /// <summary>Your cut across a corner: a low double buzz, harsher when it's a penalty.</summary>
        public void TrackLimits(bool penalty)
        {
            foreach (double at in new[] { 0, 0.16 }) Shots.Beep(s, penalty ? 147 : 196, 0.12, penalty ? 0.2 : 0.14, Wave.Sawtooth, at);
        }

        /// <summary>A champagne cork: the pop, then the fizz.</summary>
        public void Cork()
        {
            Shots.Pop(s, 1, 700);
            Shots.Burst(s, FilterKind.Highpass, 3200, 0.7, 0.9, 0.06, 0.04);
        }

        /// <summary>A firework far off: a soft thud and a crackle.</summary>
        public void Firework()
        {
            Shots.Pop(s, 0.35, 240);
            Shots.Burst(s, FilterKind.Highpass, 2400, 0.9, 0.35, 0.03, 0.12);
        }

        /// <summary>A new lap record (or the race's fastest lap).</summary>
        public void Record()
        {
            Shots.Beep(s, 988, 0.12, 0.16, Wave.Triangle);
            Shots.Beep(s, 1319, 0.25, 0.16, Wave.Triangle, 0.1);
        }

        /// <summary>A click for moving through a menu, and a brighter one for picking.</summary>
        public static void MenuTick(Synth s) => Shots.Beep(s, 660, 0.05, 0.08, Wave.Square);
        public static void MenuPick(Synth s) => Shots.Beep(s, 990, 0.09, 0.1, Wave.Square);
    }
}
