// The replays (a port of src/f1/replay.ts): every car on the track (and the safety car) recorded through the race, 20
// times a second, the last 15 seconds kept, in single floats as the web game keeps them. A few seconds after you take
// the flag the race holds and the 10 seconds up to just past your finish play again, slowing as you cross the line;
// and a moment after a big crash, the seconds round it, slowing through the impact. And the grid pan before a race
// (gridPan.ts): the camera gliding down the grid from pole to the last car, a moment on each.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    /// <summary>Where a car was: on the ground (X, Y), its height, its heading, and its state then.</summary>
    public struct ReplayPose
    {
        public double X, Y, Z, Heading;
        public CarCondition Condition;
    }

    public sealed class ReplayRecorder
    {
        public const int Hz = 20, Keep = 15;
        /// <summary>numbers per car per frame: x, y, z, heading, on the track (1) or not (0), condition</summary>
        const int Stride = 6;
        public const double Length = 10, After = 1.5, StartAt = 3.5, SlowWithin = 1, Slow = 0.4;

        public readonly int Cars;
        /// <summary>race time of the first frame kept</summary>
        public double Start;
        public readonly List<float[]> Frames = new List<float[]>();

        public ReplayRecorder(int cars) { Cars = cars; }

        /// <summary>Record the cars at race time `t` (a frame whenever one is due; a car null isn't on the track).</summary>
        public void Record(double t, IList<ReplayPose?> cars)
        {
            if (Frames.Count == 0) Start = t;
            while (Start + (double)Frames.Count / Hz <= t + 1e-6)
            {
                var f = new float[Cars * Stride];
                for (int i = 0; i < cars.Count && i < Cars; i++)
                {
                    if (cars[i] is not ReplayPose c) continue;
                    int o = i * Stride;
                    f[o] = (float)c.X; f[o + 1] = (float)c.Y; f[o + 2] = (float)c.Z; f[o + 3] = (float)c.Heading; f[o + 4] = 1; f[o + 5] = (int)c.Condition;
                }
                Frames.Add(f);
            }
            int over = Frames.Count - Keep * Hz;
            if (over > 0)
            {
                Frames.RemoveRange(0, over);
                Start += (double)over / Hz;
            }
        }

        /// <summary>Where car `i` was at race time `t` (between frames); null if it wasn't on the track, or `t` wasn't recorded.</summary>
        public ReplayPose? Pose(int i, double t)
        {
            double at = (t - Start) * Hz;
            if (at < 0 || at > Frames.Count - 1 || Frames.Count == 0) return null;
            int k = Math.Min(Frames.Count - 2, (int)Math.Floor(at));
            if (k < 0) return null;
            double f = at - k;
            var a = Frames[k];
            var b = Frames[k + 1];
            int o = i * Stride;
            if (a[o + 4] == 0 || b[o + 4] == 0) return null;
            double turn = JsMath.Atan2(JsMath.Sin((double)b[o + 3] - a[o + 3]), JsMath.Cos((double)b[o + 3] - a[o + 3]));
            int cond = (int)(f < 0.5 ? a : b)[o + 5];
            return new ReplayPose
            {
                X = a[o] + ((double)b[o] - a[o]) * f, Y = a[o + 1] + ((double)b[o + 1] - a[o + 1]) * f, Z = a[o + 2] + ((double)b[o + 2] - a[o + 2]) * f,
                Heading = a[o + 3] + turn * f, Condition = (CarCondition)Math.Max(0, Math.Min(3, cond)),
            };
        }

        double End => Start + (Frames.Count - 1.0) / Hz;

        /// <summary>The race times a replay of your finish at `finish` runs between, within what's recorded.</summary>
        public (double from, double to) FinishWindow(double finish)
        {
            double to = Math.Min(End, finish + After);
            return (Math.Max(Start, to - Length), to);
        }

        /// <summary>How fast the finish's replay plays at race time `t`.</summary>
        public static double FinishSpeed(double t, double finish) => Math.Abs(t - finish) <= SlowWithin ? Slow : 1;

        /// <summary>The race times a crash at `at` replays between, within what's recorded.</summary>
        public (double from, double to) CrashWindow(double at) => (Math.Max(Start, at - CrashReplay.Before), Math.Min(End, at + CrashReplay.After));
    }

    public static class CrashReplay
    {
        public const double Delay = 1.5, Before = 2.5, After = 1.5, SlowWithin = 0.6, Slow = 0.3, Speed = 0.8, Near = 400, Gap = 20;

        /// <summary>Whether a crash earns a replay: yours and big, or an AI car's wreck within sight of yours; none too soon after the last.</summary>
        public static bool Wants(bool mine, bool wrecked, double hit, double bigHit, double distance, double now, double last)
        {
            if (now - last < Gap) return false;
            return mine ? wrecked || hit >= bigHit : wrecked && distance <= Near;
        }

        /// <summary>How fast a crash replay plays at race time `t` (slow through the impact at `at`).</summary>
        public static double SpeedAt(double t, double at) => Math.Abs(t - at) <= SlowWithin ? Slow : Speed;
    }

    public static class GridPan
    {
        public const double Hold = 1, PerCar = 0.55, End = 0.6, Zoom = 1.6;

        /// <summary>Seconds a pan down a grid of `cars` takes.</summary>
        public static double LengthOf(int cars) => Hold + Math.Max(0, cars - 1) * PerCar + End;

        /// <summary>Where the pan is `t` s in, along slots (xs, ys; pole first): the point to look at and the car it's on.</summary>
        public static (double x, double y, int car) At(IList<double> xs, IList<double> ys, double t)
        {
            int last = xs.Count - 1;
            double along = Math.Max(0, Math.Min(last, (t - Hold) / PerCar));
            int k = Math.Min(last, (int)Math.Floor(along));
            double f = along - k;
            double e = f * f * (3 - 2 * f);
            int b = Math.Min(last, k + 1);
            return (xs[k] + (xs[b] - xs[k]) * e, ys[k] + (ys[b] - ys[k]) * e, (int)JsMath.Round(along));
        }
    }
}
