// The Championship won (screens/titleWin.ts): a celebration over the whole screen before the standings. A dark
// curtain with gold rays turning behind the trophy, which drops in; WORLD CHAMPION stamped letter by letter; your team
// on a band in its colours and your season in numbers; fireworks all over and three waves of confetti; a fanfare and
// a buzz; then TAP TO CONTINUE, which closes it once it's been up 1.5 s. With less motion asked for it's a still card
// (the fanfare still plays). Here: what it says and plays, its timings, the trophy's pixels, and the fireworks and
// confetti as particles (celebrate.ts), stepped by the screen that draws them. Engine-free.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    public static class TitleWin
    {
        /// <summary>s the fireworks keep going; s before a tap can close it (so the tap that got you here doesn't)</summary>
        public const double FireworksS = 7, HoldS = 1.5;
        /// <summary>when each wave of confetti starts, and how long one lasts (s)</summary>
        public static readonly double[] ConfettiAt = { 0.3, 2.6, 4.9 };
        public const double ConfettiS = 4.2;
        /// <summary>s the rays take to turn once (rays-turn)</summary>
        public const double RaysTurnS = 18;

        /// <summary>The numbers under the team: points, wins and the margin (the WINS and CLEAR singular as they must be).</summary>
        public static string Line(int points, int wins, int clear) =>
            $"{Lang.T("{n} POINTS", "n", points)} · {Lang.T(wins == 1 ? "{n} WIN" : "{n} WINS", "n", wins)} · {(clear > 0 ? Lang.T("{n} CLEAR", "n", clear) : Lang.T("ON COUNTBACK"))}";

        /// <summary>The fanfare: a rising call, then the held chord (Hz, s from now, s long), as square waves at 0.07.</summary>
        public static readonly (double hz, double at, double len)[] Fanfare =
        {
            (523, 0, 0.14), (659, 0.15, 0.14), (784, 0.3, 0.14), (1047, 0.45, 0.32),
            (784, 0.8, 0.12), (1047, 0.95, 0.7), (1319, 0.95, 0.7), (1568, 0.95, 0.7),
        };

        /// <summary>the buzzes: (s from now, ms long), with the trophy's landing and with the chord</summary>
        public static readonly (double at, double ms)[] Buzzes = { (0, 60), (0.95, 120) };

        /// <summary>The trophy (celebrate.ts trophy()): pixel blocks on a 32 x 36 grid, (x, y, w, h, colour).</summary>
        public static readonly (int x, int y, int w, int h, int rgb)[] Trophy =
        {
            (7, 2, 18, 3, 0xf2c14e), (8, 5, 16, 9, 0xf2c14e), (10, 14, 12, 3, 0xf2c14e), (13, 17, 6, 5, 0xd9a63a),
            (2, 5, 6, 2, 0xd9a63a), (2, 7, 2, 5, 0xd9a63a), (4, 11, 4, 2, 0xd9a63a),
            (24, 5, 6, 2, 0xd9a63a), (28, 7, 2, 5, 0xd9a63a), (24, 11, 4, 2, 0xd9a63a),
            (10, 22, 12, 3, 0xd9a63a), (7, 25, 18, 8, 0x3a3858), (9, 27, 14, 2, 0xf2c14e), (10, 6, 2, 7, 0xfff2c4),
        };

        public static readonly int[] Sparks = { 0xf2c14e, 0xff4fd8, 0x5fe0d0, 0x4fa3ff, 0xf4f2fa, 0xff7a3c };
        public static readonly int[] Confetti = { 0xf2c14e, 0x5fe0d0, 0xff4fd8, 0x4fa3ff, 0xf4f2fa, 0xd8323c };

        /// <summary>
        /// The trophy's drop (trophy-drop: 0.8 s, overshooting) and then its bob (title-cup: 1.4 s each way): its y offset
        /// in px and its scale, `t` s after it opened.
        /// </summary>
        public static (double dy, double scale, double alpha) Cup(double t)
        {
            if (t < 0.8)
            {
                double p = t / 0.8;
                // (cubic-bezier(0.2, 1.5, 0.4, 1): past its place a little, then back)
                double e = 1 - Math.Pow(1 - p, 3) + Math.Sin(p * Math.PI) * 0.18;
                return (-160 * (1 - e), 1, Math.Min(1, p * 2));
            }
            double b = (t - 0.8) / 1.4;
            double phase = b % 2;
            double s = phase < 1 ? phase : 2 - phase;
            s = 0.5 - 0.5 * Math.Cos(s * Math.PI);
            return (-6 * s, 1 + 0.04 * s, 1);
        }

        /// <summary>A letter stamped in (letter-stamp: from three times its size, faded, to its place), `t` s into its own 0.35 s.</summary>
        public static (double scale, double dy, double alpha) Stamp(double t, double len = 0.35)
        {
            if (t <= 0) return (3, -12, 0);
            if (t >= len) return (1, 0, 1);
            double p = t / len;
            double e = 1 - Math.Pow(1 - p, 3) + Math.Sin(p * Math.PI) * 0.12;
            return (3 - 2 * e, -12 * (1 - e), Math.Min(1, p * 1.6));
        }
    }

    /// <summary>The fireworks and the confetti over the title card, in px of a w x h screen (fireworks(), confetti()).</summary>
    public sealed class TitleSky
    {
        public struct Spark { public double X, Y, Vx, Vy, Life; public int Color; }
        public struct Bit { public double X, Y, Vx, Vy, Spin, Rate, Size, Born; public int Color; }

        public readonly List<Spark> Sparks = new List<Spark>();
        public readonly List<Bit> Bits = new List<Bit>();
        readonly SeededRandom rng;
        readonly double w, h;
        double t, next;
        int wave;

        public TitleSky(double w, double h, uint seed)
        {
            this.w = w;
            this.h = h;
            rng = new SeededRandom(seed);
        }

        public double T => t;

        void Burst()
        {
            double cx = w * (0.12 + rng.Next() * 0.76), cy = h * (0.08 + rng.Next() * 0.5);
            int color = TitleWin.Sparks[(int)(rng.Next() * TitleWin.Sparks.Length)];
            const int n = 36;
            double speed = (0.18 + rng.Next() * 0.1) * w;
            for (int k = 0; k < n; k++)
            {
                double a = (double)k / n * Math.PI * 2, v = speed * (0.7 + rng.Next() * 0.3);
                Sparks.Add(new Spark { X = cx, Y = cy, Vx = Math.Cos(a) * v, Vy = Math.Sin(a) * v, Life = 1, Color = rng.Next() < 0.2 ? 0xf4f2fa : color });
            }
        }

        void Wave()
        {
            for (int i = 0; i < 90; i++)
                Bits.Add(new Bit
                {
                    X = w * (0.2 + rng.Next() * 0.6), Y = -10 - rng.Next() * h * 0.2, Vx = (rng.Next() - 0.5) * w * 0.9, Vy = rng.Next() * h * 0.3,
                    Spin = rng.Next() * Math.PI * 2, Rate = 4 + rng.Next() * 8, Size = 4 + rng.Next() * 4, Born = t,
                    Color = TitleWin.Confetti[(int)(rng.Next() * TitleWin.Confetti.Length)],
                });
        }

        /// <summary>The confetti's fade: a wave fades out over its last 0.6 s.</summary>
        public static double BitAlpha(double age) => Math.Min(1, Math.Max(0, (TitleWin.ConfettiS - age) / 0.6));

        /// <summary>On `dt` s (at most 0.05 a step, as a frame there).</summary>
        public void Step(double dt)
        {
            dt = Math.Min(0.05, dt);
            t += dt;
            if (t < TitleWin.FireworksS && t >= next)
            {
                Burst();
                // (now and then two at once)
                if (rng.Next() < 0.3) Burst();
                next = t + 0.35 + rng.Next() * 0.35;
            }
            while (wave < TitleWin.ConfettiAt.Length && t >= TitleWin.ConfettiAt[wave]) { Wave(); wave++; }
            for (int i = Sparks.Count - 1; i >= 0; i--)
            {
                var s = Sparks[i];
                s.Vx *= 1 - 1.8 * dt;
                s.Vy = s.Vy * (1 - 1.8 * dt) + h * 0.12 * dt;
                s.X += s.Vx * dt;
                s.Y += s.Vy * dt;
                s.Life -= dt * 0.9;
                if (s.Life <= 0) Sparks.RemoveAt(i);
                else Sparks[i] = s;
            }
            for (int i = Bits.Count - 1; i >= 0; i--)
            {
                var b = Bits[i];
                if (t - b.Born > TitleWin.ConfettiS) { Bits.RemoveAt(i); continue; }
                b.Vx *= 1 - 1.6 * dt;
                b.Vy += (h * 0.5 - b.Vy) * 1.2 * dt;
                b.X += (b.Vx + Math.Sin((t - b.Born) / 0.3 + b.Spin) * w * 0.05) * dt;
                b.Y += b.Vy * dt;
                b.Spin += b.Rate * dt;
                Bits[i] = b;
            }
        }
    }
}
