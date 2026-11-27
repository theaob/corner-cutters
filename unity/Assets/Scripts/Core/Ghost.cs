// A run as driven, to be driven again as a see-through car: a port of src/f1/timeTrial.ts's ghosts (recordFrame,
// ghostPose, parseGhost) and boards.ts packGhost. Where the car is 20 times a second (x, y, heading, nearest sample),
// and its split at each sector's end; made small to send to the Daily Challenge's board (10 a second, to the px).
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public sealed class Ghost
    {
        /// <summary>Ghost frames a second (a run sent to the board has fewer: Hz says).</summary>
        public const double DefaultHz = 20;
        /// <summary>numbers per frame: x, y, heading, nearest sample</summary>
        public const int Stride = 4;
        /// <summary>frames a second a Daily Challenge run is sent with, and the longest sent (s)</summary>
        public const double DailyHz = 10, DailyMaxS = 600;

        public double Time;
        public List<double> Splits = new List<double>();
        /// <summary>frame k (at k / hz s in) is x, y, heading, idx at [k * 4 …]</summary>
        public List<double> Frames = new List<double>();
        public double? Hz;

        /// <summary>Where the ghost is `t` s in (between its frames); null once its run is over, or before it starts.</summary>
        public (double x, double y, double heading)? Pose(double t)
        {
            int count = Frames.Count / Stride;
            double at = t * (Hz ?? DefaultHz);
            if (t < 0 || t > Time || count < 2) return null;
            int k = (int)Math.Min(count - 2, Math.Floor(at));
            double f = Math.Min(1, at - k);
            int a = k * Stride, b = a + Stride;
            double turn = Frames[b + 2] - Frames[a + 2];
            turn = JsMath.Atan2(JsMath.Sin(turn), JsMath.Cos(turn));
            return (Frames[a] + (Frames[b] - Frames[a]) * f, Frames[a + 1] + (Frames[b + 1] - Frames[a + 1]) * f, Frames[a + 2] + turn * f);
        }

        /// <summary>This ghost made small to send, recorded at `hz`: every hz/10th frame, to the px and the hundredth of a radian (null: too long, or too short).</summary>
        public Ghost Pack(double hz)
        {
            if (!(Time >= 1) || Time > DailyMaxS) return null;
            int every = (int)Math.Max(1, JsMath.Round(hz / DailyHz));
            var frames = new List<double>();
            for (int k = 0; k * Stride < Frames.Count; k += every)
            {
                int i = k * Stride;
                double F(int j) => i + j < Frames.Count ? Frames[i + j] : double.NaN;
                frames.Add(JsMath.Round(F(0)));
                frames.Add(JsMath.Round(F(1)));
                frames.Add(JsMath.Round(F(2) * 100) / 100);
                frames.Add(F(3));
            }
            if (frames.Count < 8) return null;
            return new Ghost { Time = JsMath.Round(Time * 100) / 100, Frames = frames, Hz = hz / every };
        }

        public JsonObj ToJson()
        {
            var o = new JsonObj { { "time", Time }, { "splits", Splits }, { "frames", Frames } };
            if (Hz.HasValue) o["hz"] = Hz.Value;
            return o;
        }

        /// <summary>A ghost as read back (from the device, or the board), if it's a sound one.</summary>
        public static Ghost Parse(object v)
        {
            if (!(v is Dictionary<string, object> g)) return null;
            if (!(g.TryGetValue("time", out var t) && t is double time && time > 0)) return null;
            if (!(g.TryGetValue("splits", out var s) && s is List<object> splits) || !(g.TryGetValue("frames", out var f) && f is List<object> frames)) return null;
            if (frames.Count < Stride * 2 || frames.Count % Stride != 0 || !frames.All(x => x is double d && !double.IsNaN(d) && !double.IsInfinity(d))) return null;
            if (!splits.All(x => x is double d && !double.IsNaN(d) && !double.IsInfinity(d))) return null;
            double? hz = null;
            if (g.TryGetValue("hz", out var h) && h != null)
            {
                if (!(h is double hd && hd > 0 && hd <= 60)) return null;
                hz = hd;
            }
            return new Ghost { Time = time, Splits = splits.Cast<double>().ToList(), Frames = frames.Cast<double>().ToList(), Hz = hz };
        }
    }

    /// <summary>How a split (or a lap) compares: Record (quicker than your best ever), Better (than the ghost you're chasing), or Worse.</summary>
    public enum SplitMark { Record, Better, Worse }

    public static class Splits
    {
        /// <summary>A split of `t` s at sector k against the ghost's (and against your record's, if that's a different lap): timeTrial.ts markSplit.</summary>
        public static SplitMark Mark(double t, int k, Ghost ghost, Ghost record, out double? delta)
        {
            double? theirs = ghost != null && k < ghost.Splits.Count ? ghost.Splits[k] : (double?)null;
            double? best = record != null && k < record.Splits.Count ? record.Splits[k] : (double?)null;
            delta = theirs.HasValue ? t - theirs.Value : (double?)null;
            if (!best.HasValue || t < best.Value) return SplitMark.Record;
            return delta.HasValue && delta.Value < 0 ? SplitMark.Better : SplitMark.Worse;
        }
    }

    /// <summary>A run being recorded.</summary>
    public sealed class GhostRecorder
    {
        public readonly List<double> Splits = new List<double>();
        public readonly List<double> Frames = new List<double>();

        /// <summary>The car at `t` s in (a frame whenever one is due, `hz` a second), at nearest sample `idx`.</summary>
        public void Frame(double t, Car car, int idx, double hz = Ghost.DefaultHz)
        {
            // (a frame per 1/20 s: the sim steps at 60 Hz, so every third step; a step late is caught up on the next)
            while (Frames.Count / Ghost.Stride <= t * hz + 1e-6)
            {
                Frames.Add(JsMath.Round(car.X * 10) / 10);
                Frames.Add(JsMath.Round(car.Y * 10) / 10);
                Frames.Add(JsMath.Round(car.Heading * 1000) / 1000);
                Frames.Add(idx);
            }
        }

        public Ghost ToGhost(double time) => new Ghost { Time = time, Splits = Splits.ToList(), Frames = Frames.ToList() };
    }
}
