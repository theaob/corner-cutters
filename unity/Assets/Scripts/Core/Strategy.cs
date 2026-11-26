// A race's strategy: a port of src/f1/strategy.ts. Every plan with up to three stops (each stint on the SOFT or the
// HARD) timed from the tyre model and the cost of a stop, the quickest first; the AI takes one of the plans close to
// the quickest (each its own, so the field splits), you the quickest.
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public sealed class StrategyInput
    {
        public double Laps, LapTime, PerLap, StopCost;
        /// <summary>the set on now (mid-race); none at the start</summary>
        public Compound? Current;
        public double CurrentWear;
    }

    public struct Stint
    {
        public Compound Compound;
        public double Laps;
        public Stint(Compound c, double laps) { Compound = c; Laps = laps; }
    }

    public sealed class Plan
    {
        public List<Stint> Stints;
        public double Time;
    }

    public static class Strategy
    {
        public const int MaxStops = 3;
        public const double MaxPlanLaps = 40;
        public const double SpreadSeconds = 2.5, SpreadShare = 0.006;

        static double WearShare(Compound c) => Tyres.DryFit(c).Wear / Tyres.DryFit(Compound.Slick).Wear;

        public static double StintTime(Compound c, double laps, double wear, double perLap, double lapTime)
        {
            double speed = Tyres.DryFit(c).Speed;
            double rate = perLap * WearShare(c);
            double loss = 0;
            for (int i = 0; i < laps; i++)
            {
                double part = Math.Min(1, laps - i);
                double w = Math.Min(1, wear + rate * (i + part / 2));
                loss += lapTime * (1 / (Tyres.TyreSpeed(w) * speed) - 1) * part;
            }
            return loss;
        }

        public static List<Plan> Plans(StrategyInput input)
        {
            double laps = input.Laps;
            var output = new List<Plan>();
            double whole = Math.Floor(laps);
            double Time(List<Stint> stints)
            {
                double t = 0;
                for (int k = 0; k < stints.Count; k++)
                    t += StintTime(stints[k].Compound, stints[k].Laps, k == 0 && input.Current.HasValue ? input.CurrentWear : 0, input.PerLap, input.LapTime);
                return t + (stints.Count - 1) * input.StopCost;
            }
            var firsts = input.Current.HasValue ? new[] { input.Current.Value } : Tyres.DryCompounds;
            List<List<double>> Splits(int n)
            {
                if (n == 1) return new List<List<double>> { new List<double> { laps } };
                var res = new List<List<double>>();
                void Go(double left, List<double> parts)
                {
                    if (parts.Count == n - 1)
                    {
                        if (left > 0) res.Add(new List<double>(parts) { left });
                        return;
                    }
                    for (int k = 1; k <= Math.Floor(left) - (n - 1 - parts.Count); k++) Go(left - k, new List<double>(parts) { k });
                }
                Go(laps, new List<double>());
                return res;
            }
            int most = laps > MaxPlanLaps ? 1 : MaxStops + 1;
            for (int n = 1; n <= most && n <= Math.Max(1, whole); n++)
            {
                foreach (var lengths in Splits(n))
                {
                    var combos = new List<List<Compound>> { new List<Compound>() };
                    for (int k = 0; k < n; k++)
                    {
                        var choices = k == 0 ? firsts : Tyres.DryCompounds;
                        combos = combos.SelectMany(c => choices.Select(x => new List<Compound>(c) { x })).ToList();
                    }
                    foreach (var cs in combos)
                    {
                        var stints = lengths.Select((l, k) => new Stint(cs[k], l)).ToList();
                        output.Add(new Plan { Stints = stints, Time = Time(stints) });
                    }
                }
            }
            double Later(Plan a, Plan b)
            {
                for (int k = 0; k < Math.Min(a.Stints.Count, b.Stints.Count); k++)
                    if (a.Stints[k].Laps != b.Stints[k].Laps) return b.Stints[k].Laps - a.Stints[k].Laps;
                return 0;
            }
            JsMath.StableSort(output, (a, b) => Math.Sign(Math.Abs(a.Time - b.Time) > 1e-6 ? a.Time - b.Time : Later(a, b)));
            return output;
        }

        public static Plan BestPlan(StrategyInput input) => Plans(input)[0];

        public static List<Plan> Choices(StrategyInput input)
        {
            var all = Plans(input);
            double best = all[0].Time;
            double within = Math.Max(SpreadSeconds, SpreadShare * input.LapTime * input.Laps);
            var seen = new HashSet<string>();
            var output = new List<Plan>();
            foreach (var p in all)
            {
                if (p.Time - best > within) break;
                string kind = $"{p.Stints.Count}:{p.Stints[0].Compound}";
                if (!seen.Add(kind)) continue;
                output.Add(p);
            }
            return output;
        }

        public static Plan PickFor(List<Plan> options, int k)
        {
            if (options.Count == 1) return options[0];
            uint h = SeededRandom.ToUint32(k * 2654435761.0);
            return h % 2 == 0 ? options[0] : options[1 + (int)((h >> 1) % (uint)(options.Count - 1))];
        }

        /// <summary>How a plan reads: SFT → HRD · 1 STOP (or NO STOP).</summary>
        public static string Text(Plan p)
        {
            int stops = p.Stints.Count - 1;
            return string.Join(" → ", p.Stints.Select(s => Tyres.Short(s.Compound))) + " · " + (stops == 0 ? "NO STOP" : stops > 1 ? $"{stops} STOPS" : $"{stops} STOP");
        }
    }
}
