// The smaller race rules, each a port of its web game file: the slipstream (src/f1/slipstream.ts), blue flags
// (blueFlags.ts), track limits (trackLimits.ts), the weather through a race (forecast.ts) and a bridge's two levels
// (bridge.ts).
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    public static class Slipstream
    {
        public const double Range = 170, Near = 45, Width = 18, Core = 6, NearWidth = 32, NearCore = 16, MinSpeed = 150;
        public const double Gain = 0.06, Build = 2, Fade = 2;

        /// <summary>How strongly (0…1) `car` is in `ahead`'s wake.</summary>
        public static double Wake(Car car, Car ahead)
        {
            if (car == ahead || car.Wrecked || ahead.Wrecked || car.Airborne) return 0;
            if (Driving.SpeedOf(car) < MinSpeed || Driving.SpeedOf(ahead) < MinSpeed) return 0;
            double fx = JsMath.Sin(ahead.Heading), fy = -JsMath.Cos(ahead.Heading);
            double dx = car.X - ahead.X, dy = car.Y - ahead.Y;
            double behind = -(dx * fx + dy * fy);
            double off = Math.Abs(dx * fy - dy * fx);
            double far = Math.Min(1, Math.Max(0, (behind - Near) / (Range - Near)));
            double width = NearWidth + (Width - NearWidth) * far;
            double core = NearCore + (Core - NearCore) * far;
            if (behind <= 0 || behind >= Range || off >= width) return 0;
            if (JsMath.Cos(car.Heading - ahead.Heading) < 0.9) return 0;
            double along = 1 - far;
            double across = 1 - Math.Max(0, off - core) / (width - core);
            return Math.Max(0, along) * Math.Max(0, across);
        }

        public static double TowFrom(Car car, IEnumerable<Car> others)
        {
            double best = 0;
            foreach (var o in others) best = Math.Max(best, Wake(car, o));
            return best;
        }

        public static double StepTow(double tow, double target, double dt) =>
            target > tow ? Math.Min(target, tow + Build * dt) : Math.Max(target, tow - Fade * dt);

        public static double TowBoost(double tow) => 1 + Gain * tow;
    }

    public static class BlueFlags
    {
        public const double Range = 140, Keep = 200, Ahead = 0.6;

        public static double RaceDistance(RaceProgress p, int n) => p.LapStart == null ? p.Idx - n : (double)p.Lap * n + p.Idx;

        public static int?[] Flags(IList<RaceProgress> racers, bool[] eligible, int?[] was, int n, double spacing)
        {
            var output = new int?[racers.Count];
            for (int i = 0; i < racers.Count; i++)
            {
                if (!eligible[i]) continue;
                var p = racers[i];
                int bestJ = -1;
                double bestD = 0;
                for (int j = 0; j < racers.Count; j++)
                {
                    var q = racers[j];
                    if (j == i || !eligible[j]) continue;
                    if (RaceDistance(q, n) - RaceDistance(p, n) < Ahead * n) continue;
                    double d = JsMath.Wrap(p.Idx - q.Idx, n) * spacing;
                    if (d > (was[i] == j ? Keep : Range)) continue;
                    if (bestJ < 0 || d < bestD) { bestJ = j; bestD = d; }
                }
                if (bestJ >= 0) output[i] = bestJ;
            }
            return output;
        }
    }

    public sealed class Corner
    {
        public int From, To, Apex, Side;
    }

    public sealed class Limits
    {
        public int Strikes;
        public int? Corner;
        public bool Off;
    }

    public struct Strike
    {
        public int Number;
        public double Seconds;
    }

    public static class TrackLimits
    {
        public const double Reach = 48, Penalty = 5;
        public const int Warnings = 2;
        public const double HalfWidth = 44, Tight = 1.0 / 260;

        static bool InRange(int i, int from, int to) => from <= to ? i >= from && i <= to : i >= from || i <= to;

        public static List<Corner> MarkCorners(Track track)
        {
            int n = track.Count;
            int Side(int i)
            {
                double c = track.Curve[JsMath.Wrap(i, n)];
                return Math.Abs(c) < Tight ? 0 : c > 0 ? 1 : -1;
            }
            int start = 0;
            while (start < n && Side(start) != 0) start++;
            var runs = new List<Corner>();
            if (start == n) return runs;
            int reach = JsMath.RoundToInt(Reach / track.Spacing);
            for (int k = 1; k <= n; k++)
            {
                int s = Side(start + k);
                if (s == 0 || s == Side(start + k - 1)) continue;
                int end = k;
                while (end + 1 <= n && Side(start + end + 1) == s) end++;
                int apex = start + k;
                for (int j = k; j <= end; j++) if (Math.Abs(track.Curve[(start + j) % n]) > Math.Abs(track.Curve[apex % n])) apex = start + j;
                int from = start + k - reach;
                int to = start + end + reach;
                var last = runs.Count > 0 ? runs[runs.Count - 1] : null;
                if (last != null && last.Side == s && from <= last.To)
                {
                    last.To = to;
                    if (Math.Abs(track.Curve[apex % n]) > Math.Abs(track.Curve[last.Apex % n])) last.Apex = apex;
                }
                else runs.Add(new Corner { From = from, To = to, Apex = apex, Side = s });
                k = end;
            }
            foreach (var r in runs) { r.From = JsMath.Wrap(r.From, n); r.To = JsMath.Wrap(r.To, n); r.Apex = JsMath.Wrap(r.Apex, n); }
            return runs;
        }

        public static int? Cutting(Track track, List<Corner> corners, int idx, double x, double y, double width)
        {
            double lat = Racing.LateralOffset(track, idx, x, y);
            for (int c = 0; c < corners.Count; c++)
            {
                var k = corners[c];
                if (InRange(idx, k.From, k.To) && lat * k.Side > HalfWidth + width / 2) return c;
            }
            return null;
        }

        public static Strike? Judge(Limits limits, Track track, List<Corner> corners, int idx, double x, double y, double width)
        {
            if (limits.Corner.HasValue)
            {
                int ci = limits.Corner.Value;
                if (ci >= corners.Count || !InRange(idx, corners[ci].From, corners[ci].To)) limits.Corner = null;
            }
            var c = Cutting(track, corners, idx, x, y, width);
            if (c == null || c == limits.Corner) return null;
            limits.Corner = c;
            limits.Strikes++;
            return new Strike { Number = limits.Strikes, Seconds = limits.Strikes > Warnings ? Penalty : 0 };
        }

        public static bool WholeCarOff(Track track, int idx, double x, double y, double width) =>
            Math.Abs(Racing.LateralOffset(track, idx, x, y)) > HalfWidth + width / 2;

        public static bool OffTrack(Limits limits, Track track, int idx, double x, double y, double width, bool excused = false)
        {
            bool off = WholeCarOff(track, idx, x, y, width);
            if (excused) return false;
            bool went = off && !limits.Off;
            limits.Off = off;
            return went;
        }
    }

    public struct Shower
    {
        public double From, To, Rain;
        public Shower(double from, double to, double rain) { From = from; To = to; Rain = rain; }
    }

    public sealed class ForecastPlan
    {
        public string Name;
        public double Start;
        public List<Shower> Showers = new List<Shower>();
        public bool Fixed;
    }

    public struct WeatherState
    {
        public double Wetness, Rain;
    }

    public static class Forecast
    {
        public const double Wetten = 0.08, Dry = 0.02, FadeTime = 8;

        public static Weather ConditionOf(double wetness) => wetness < 0.5 ? Weather.Dry : wetness < 1.5 ? Weather.Damp : Weather.Wet;

        public static ForecastPlan Fixed(Weather w)
        {
            var f = new ForecastPlan { Name = w.ToString().ToUpperInvariant(), Start = Tyres.WetnessOf(w), Fixed = true };
            if (w == Weather.Wet) f.Showers.Add(new Shower(double.NegativeInfinity, double.PositiveInfinity, 1));
            return f;
        }

        public static double RainAt(ForecastPlan f, double t)
        {
            double rain = 0;
            foreach (var s in f.Showers)
            {
                if (t < s.From || t >= s.To) continue;
                double ramp = Math.Min(1, Math.Min((t - s.From) / FadeTime, (s.To - t) / FadeTime));
                rain = Math.Max(rain, s.Rain * ramp);
            }
            return rain;
        }

        public static WeatherState Start(ForecastPlan f) => new WeatherState { Wetness = f.Start, Rain = RainAt(f, 0) };

        public static void Step(ref WeatherState s, ForecastPlan f, double t, double dt)
        {
            s.Rain = RainAt(f, t);
            if (f.Fixed) return;
            double target = 2 * s.Rain;
            if (s.Wetness < target) s.Wetness = Math.Min(target, s.Wetness + Wetten * Math.Max(0.3, s.Rain) * dt);
            else s.Wetness = Math.Max(target, s.Wetness - Dry * dt);
        }

        public static WeatherState Ahead(WeatherState s, ForecastPlan f, double t, double ahead)
        {
            var next = s;
            const double dt = 0.5;
            for (double k = 0; k < ahead; k += dt) Step(ref next, f, t + k, dt);
            return next;
        }

        public static ForecastPlan Changeable(uint seed, double seconds)
        {
            var rng = new SeededRandom(seed == 0 ? 1 : seed);
            double At(double a, double b) => seconds * (a + rng.Next() * (b - a));
            double kind = rng.Next();
            if (kind < 0.45)
            {
                double from = At(0.2, 0.45);
                double to = from + At(0.25, 0.4);
                return new ForecastPlan { Name = "SHOWERS", Start = 0, Showers = { new Shower(from, to, 0.75 + rng.Next() * 0.25) } };
            }
            if (kind < 0.75) return new ForecastPlan { Name = "DRYING", Start = 2, Showers = { new Shower(double.NegativeInfinity, At(0.05, 0.25), 1) } };
            return new ForecastPlan { Name = "LIGHT RAIN", Start = 0, Showers = { new Shower(At(0.25, 0.5), double.PositiveInfinity, 0.5) } };
        }

        public static ForecastPlan Round(uint seed, double seconds)
        {
            uint s = SeededRandom.ToUint32((double)seed * 7919);
            double r = new SeededRandom(s == 0 ? 1 : s).Next();
            if (r < 0.55) return Fixed(Weather.Dry);
            if (r < 0.65) return Fixed(Weather.Damp);
            if (r < 0.75) return Fixed(Weather.Wet);
            return Changeable(seed, seconds);
        }
    }

    /// <summary>A bridge on a track (bridge.ts): the deck's grid, the samples on it, where the two stretches cross.</summary>
    public sealed class Levels
    {
        public Grid Upper;
        public int From, To, Over, Under;
        public double Height;
    }

    public static class Bridge
    {
        /// <summary>px apart in height beyond which two cars are on different levels</summary>
        public const double LevelGap = 12;

        static bool Within(int i, int from, int to) => from <= to ? i >= from && i <= to : i >= from || i <= to;

        public static Grid GridFor(Track track, Grid grid, int idx)
        {
            var l = track.Levels;
            return l != null && Within(idx, l.From, l.To) ? l.Upper : grid;
        }

        public static bool SameLevel(Car a, Car b) => Math.Abs(a.Z - b.Z) < LevelGap;
    }
}
