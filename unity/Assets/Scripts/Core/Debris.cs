// Debris: a part torn off a car in a big crash (a nose, a wheel), thrown clear and tumbling, bouncing on the ground (and
// up and down hills) until it comes to rest, then lying there a while before it's gone. Only for the picture: nothing
// hits it. A port of src/engine/debris.ts.
using System;

namespace CornerCutters.Core
{
    public sealed class Piece
    {
        /// <summary>where it is: X and Y on the ground plane, H up (px), and how fast it's going</summary>
        public double X, Y, H, Vx, Vy, Vh;
        /// <summary>its tumble (radians) about the ground's x, up and y axes, and how fast it turns (rad/s)</summary>
        public double[] Rot = new double[3], Spin = new double[3];
        public bool Rest;
        /// <summary>s since it came to rest</summary>
        public double Rested;

        public Piece Clone()
        {
            var p = (Piece)MemberwiseClone();
            p.Rot = (double[])Rot.Clone();
            p.Spin = (double[])Spin.Clone();
            return p;
        }
    }

    public static class Debris
    {
        public const double Gravity = 600, Bounce = 0.38, Scrub = 0.7, Settle = 30, Slide = 420, Lies = 8;

        /// <summary>A piece torn off at (x, y, h), thrown `out` (ox, oy: a unit direction on the ground) from a car moving at (vx, vy), harder the bigger `power` (0…1).</summary>
        public static Piece Fling(double x, double y, double h, double vx, double vy, double ox, double oy, double power, Func<double> rng)
        {
            double kick = 50 + 100 * power * (0.6 + 0.4 * rng());
            double keep = 0.55 + 0.2 * rng();
            double Spin() => (rng() - 0.5) * 24 * (0.5 + power);
            var p = new Piece
            {
                X = x, Y = y, H = h,
                Vx = vx * keep + ox * kick,
                Vy = vy * keep + oy * kick,
            };
            p.Vh = 90 + 120 * power * (0.6 + 0.4 * rng());
            p.Spin = new[] { Spin(), Spin(), Spin() };
            return p;
        }

        /// <summary>Move `p` on `dt` s over ground `ground(x, y)` px high.</summary>
        public static void Step(Piece p, double dt, Func<double, double, double> ground)
        {
            if (p.Rest)
            {
                p.Rested += dt;
                return;
            }
            p.X += p.Vx * dt;
            p.Y += p.Vy * dt;
            p.Vh -= Gravity * dt;
            p.H += p.Vh * dt;
            for (int k = 0; k < 3; k++) p.Rot[k] += p.Spin[k] * dt;
            double floor = ground(p.X, p.Y);
            if (p.H > floor) return;
            p.H = floor;
            if (-p.Vh > Settle)
            {
                p.Vh = -p.Vh * Bounce;
                p.Vx *= Scrub;
                p.Vy *= Scrub;
                for (int k = 0; k < 3; k++) p.Spin[k] *= Scrub;
                return;
            }
            p.Vh = 0;
            double v = JsMath.Hypot(p.Vx, p.Vy);
            double slower = Math.Max(0, v - Slide * dt);
            p.Vx = v != 0 ? p.Vx * slower / v : 0;
            p.Vy = v != 0 ? p.Vy * slower / v : 0;
            for (int k = 0; k < 3; k++) p.Spin[k] *= Math.Max(0, 1 - 6 * dt);
            double ease = Math.Min(1, 8 * dt);
            foreach (int k in new[] { 0, 2 }) p.Rot[k] += (JsMath.Round(p.Rot[k] / (2 * Math.PI)) * 2 * Math.PI - p.Rot[k]) * ease;
            if (slower == 0)
            {
                p.Rest = true;
                p.Rot[0] = p.Rot[2] = 0;
                p.Spin = new double[3];
            }
        }

        /// <summary>Whether a piece has lain long enough to go.</summary>
        public static bool Gone(Piece p) => p.Rest && p.Rested >= Lies;

        /// <summary>How far a piece at rest has sunk out of sight (0…1), over its last second.</summary>
        public static double Sunk(Piece p) => p.Rest ? Math.Min(1, Math.Max(0, p.Rested - (Lies - 1))) : 0;
    }
}
