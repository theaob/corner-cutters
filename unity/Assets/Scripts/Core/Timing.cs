// The broadcast touches of a race: time gaps between cars as timing loops measure them (src/f1/gaps.ts), and the
// timing tower's rows, the top three then the cars round you (src/f1/tower.ts).
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public sealed class GapTimer
    {
        /// <summary>track samples between timing points</summary>
        public const int Every = 20;
        const int Keep = 200;

        readonly Dictionary<int, double>[] passed;
        readonly Queue<int>[] order;
        readonly double[] last;

        public GapTimer(int cars)
        {
            passed = Enumerable.Range(0, cars).Select(_ => new Dictionary<int, double>()).ToArray();
            order = Enumerable.Range(0, cars).Select(_ => new Queue<int>()).ToArray();
            last = Enumerable.Repeat(double.NegativeInfinity, cars).ToArray();
        }

        public static double RaceDistance(RaceProgress p, int n) => p.LapStart == null ? p.Idx - n : (double)p.Lap * n + p.Idx;

        /// <summary>Note the timing points each car has passed by race time `clock`.</summary>
        public void Step(IList<RaceProgress> racers, Track track, double clock)
        {
            int n = track.Count;
            for (int i = 0; i < racers.Count; i++)
            {
                var p = racers[i];
                if (p.Retired) continue;
                int point = (int)Math.Floor(RaceDistance(p, n) / Every);
                if (point <= last[i]) continue;
                int from = double.IsInfinity(last[i]) ? point : (int)last[i] + 1;
                for (int k = from; k <= point; k++)
                {
                    if (!passed[i].ContainsKey(k)) order[i].Enqueue(k);
                    passed[i][k] = clock;
                }
                last[i] = point;
                while (passed[i].Count > Keep) passed[i].Remove(order[i].Dequeue());
            }
        }

        /// <summary>Seconds `behind` is behind `ahead` at the last timing point both have passed (null if none yet).</summary>
        public double? Between(int ahead, int behind)
        {
            double point = Math.Min(last[ahead], last[behind]);
            if (double.IsInfinity(point)) return null;
            if (!passed[ahead].TryGetValue((int)point, out double a) || !passed[behind].TryGetValue((int)point, out double b)) return null;
            return b - a;
        }
    }

    public static class Tower
    {
        /// <summary>The places the tower shows (-1: a gap): the top `top`, then, if you're further back, the car either side of you.</summary>
        public static List<int> Rows(List<int> order, int you, int top = 3)
        {
            int at = order.IndexOf(you);
            if (at < top + 2) return order.Take(Math.Max(top, at + 2)).ToList();
            var rows = order.Take(top).ToList();
            rows.Add(-1);
            rows.AddRange(order.Skip(at - 1).Take(3));
            return rows;
        }

        /// <summary>A tower gap: the leader, a gap in s, laps behind, or none yet.</summary>
        public static string Gap(int place, double? gap, int lapsDown)
        {
            if (place == 1) return "LEAD";
            if (lapsDown > 0) return $"+{lapsDown}L";
            return gap == null ? "" : "+" + gap.Value.ToString("0.0", System.Globalization.CultureInfo.InvariantCulture);
        }
    }
}
