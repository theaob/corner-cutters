// Qualifying: a port of src/f1/qualifying.ts. One flying lap, on your own, sets your place on the grid. You start
// standing on the straight before the line; the lap is timed from the line back round to it, and track limits delete
// it (the next one is timed afresh). The AI's times come from a reference lap (one AI car on the racing line, alone,
// in this weather) scaled by each driver's pace, with a little spread either way. The grid is everyone in order of
// their times; no time starts at the back.
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    /// <summary>Your session so far: laps completed, and whether the lap you're on has been deleted.</summary>
    public sealed class QualiLap
    {
        public int Laps;
        public bool Deleted;
    }

    public enum QualiCall { None, Deleted, Void, Time }

    public static class Qualifying
    {
        /// <summary>px before the line a session starts, standing</summary>
        public const double RunUp = 1200;
        /// <summary>an AI time's spread either way, as a share of it</summary>
        public const double Spread = 0.008;
        /// <summary>laps of the session at most (it's over with your first good one)</summary>
        public const int Laps = 99;

        /// <summary>Put entrant `i` on the run-up to a flying lap, standing; the session under way.</summary>
        public static void FlyingStart(Race race, int i)
        {
            var track = race.Track;
            int n = track.Count;
            int idx = n - JsMath.RoundToInt(RunUp / track.Spacing);
            while (idx < n - 1 && Math.Abs(track.Curve[idx]) >= 1.0 / 500) idx++;
            var c = race.Entrants[i].Car;
            c.X = track.X[idx]; c.Y = track.Y[idx]; c.Heading = track.Dir[idx]; c.Vx = 0; c.Vy = 0;
            race.Entrants[i].Progress = Racing.NewProgress(idx);
            race.Phase = RacePhase.Racing;
            race.Clock = 0;
        }

        /// <summary>A session on your own: just you (no pit stops), on the run-up to a flying lap.</summary>
        public static Race NewQualifying(Track track, Grid grid, HandlingParams handling, Weather weather, Car car = null)
        {
            var race = RaceControl.NewRace(track, grid, handling, Laps, new List<FieldEntry> { new FieldEntry { Car = car ?? new Car(CarClass.F1(), 0, 0, 0) } }, 0, null, weather);
            FlyingStart(race, 0);
            return race;
        }

        /// <summary>The reference lap (s): one AI car, flat out on the racing line on its own, a flying lap.</summary>
        public static double ReferenceLap(Track track, Grid grid, HandlingParams handling, Weather weather)
        {
            var race = RaceControl.NewRace(track, grid, handling, Laps,
                new List<FieldEntry> { new FieldEntry { Car = new Car(CarClass.F1(), 0, 0, 0), Ai = new AiDriver { Lane = 0, Pace = 1 } } }, 0, null, weather);
            FlyingStart(race, 0);
            for (double t = 0; t < 300 && race.Entrants[0].Progress.LapTimes.Count == 0; t += RaceControl.SimDt) RaceControl.StepRace(race, RaceControl.SimDt);
            var times = race.Entrants[0].Progress.LapTimes;
            return times.Count > 0 ? times[0] : track.Length / 250;
        }

        /// <summary>Each AI driver's time from its pace (null for you: yours is driven), off the reference lap, spread by `rng`.</summary>
        public static double?[] AiTimes(IList<double?> paces, double reference, SeededRandom rng) =>
            paces.Select(pace => pace == null ? (double?)null : reference / pace.Value * (1 + (rng.Next() * 2 - 1) * Spread)).ToArray();

        /// <summary>The grid: drivers in order of their times, quickest first; no time at the back, in the order they came.</summary>
        public static List<int> GridOrder(IList<double?> times)
        {
            var order = Enumerable.Range(0, times.Count).ToList();
            JsMath.StableSort(order, (a, b) =>
            {
                double ta = times[a] ?? double.PositiveInfinity, tb = times[b] ?? double.PositiveInfinity;
                double d = ta - tb;
                // (Infinity - Infinity is NaN in JS, so falls to the index, as here)
                return double.IsNaN(d) || d == 0 ? a.CompareTo(b) : Math.Sign(d);
            });
            return order;
        }

        /// <summary>
        /// Judge your session this step (`cut`: you broke track limits): Deleted the moment a timed lap is cut, Void as
        /// a deleted lap ends (the next one is timed afresh), Time (with `time`) as a good one ends.
        /// </summary>
        public static QualiCall JudgeLap(QualiLap q, RaceProgress p, bool cut, out double time)
        {
            time = 0;
            if (p.LapTimes.Count > q.Laps)
            {
                q.Laps = p.LapTimes.Count;
                time = p.LapTimes[p.LapTimes.Count - 1];
                if (q.Deleted)
                {
                    q.Deleted = false;
                    return QualiCall.Void;
                }
                if (cut) return QualiCall.Deleted;
                return QualiCall.Time;
            }
            if (cut && p.LapStart != null && !q.Deleted)
            {
                q.Deleted = true;
                return QualiCall.Deleted;
            }
            return QualiCall.None;
        }
    }
}
