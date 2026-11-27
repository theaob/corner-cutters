// The results at the flag and qualifying's times, as rows: a port of the engine-free half of
// src/f1/race/resultsView.ts (resultRows, raceSummary, qualifyingRows) and records.ts formatTime.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CornerCutters.Core
{
    /// <summary>One row of the results: place, places gained from the grid, name, team, time, best lap, notes.</summary>
    public sealed class ResultRow
    {
        public int Place;
        /// <summary>places gained (+) or lost (−) from the grid slot</summary>
        public int Moved;
        public string Name, Team;
        /// <summary>the winner's time, the gap to it, laps done, or DNF</summary>
        public string Time;
        public string Best;
        /// <summary>the race's fastest lap (in purple)</summary>
        public bool Fastest;
        public string Notes;
        public int Stops;
        public double Penalty;
        public bool Out, Finished, You;
    }

    /// <summary>A box of your race at a glance: its icon, label, value and colour (-1: white).</summary>
    public struct SummaryBox
    {
        public string Icon, Label, Value;
        public int Color;
    }

    public sealed class QualifyingRow
    {
        public int Place;
        public string Name, Team, Time, Gap;
        public bool You;
    }

    public static class Results
    {
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        /// <summary>m:ss.ss, as the web game's formatTime (– for none).</summary>
        public static string FormatTime(double? s)
        {
            if (s == null || double.IsNaN(s.Value)) return "–";
            double t = s.Value;
            return $"{Math.Floor(t / 60).ToString(Inv)}:{(t % 60).ToString("0.00", Inv).PadLeft(5, '0')}";
        }

        /// <summary>The results' rows in finishing `order` (the entrants in grid order; names and team codes by entrant).</summary>
        public static List<ResultRow> ResultRows(Race race, IList<int> order, IList<string> names, IList<string> teams, int you, int? fastestWho)
        {
            var first = race.Entrants[order[0]].Progress;
            double winner = (first.Finished ?? 0) + first.Penalty;
            return order.Select((i, pos) =>
            {
                var e = race.Entrants[i];
                var p = e.Progress;
                string time = p.Retired ? "DNF"
                    : p.Finished != null ? (pos == 0 ? FormatTime(p.Finished.Value + p.Penalty) : "+" + (p.Finished.Value + p.Penalty - winner).ToString("0.00", Inv))
                    : $"{p.Lap}/{race.Laps} LAPS";
                var notes = new[] { p.Penalty != 0 ? $"+{p.Penalty.ToString(Inv)}S" : "", e.Stops != 0 ? $"{e.Stops}P" : "" }.Where(x => x != "");
                return new ResultRow
                {
                    Place = pos + 1, Moved = i - pos, Name = names[i], Team = teams[i], Time = time,
                    Best = p.LapTimes.Count > 0 ? FormatTime(p.LapTimes.Min()) : "–", Fastest = fastestWho == i,
                    Notes = string.Join(" ", notes), Stops = e.Stops, Penalty = p.Penalty,
                    Out = p.Retired, Finished = p.Retired || p.Finished != null, You = i == you,
                };
            }).ToList();
        }

        /// <summary>gold, silver and bronze for the podium's places</summary>
        static readonly int[] Podium = { 0xf2c14e, 0xc9ccd6, 0xc8803a };
        public const int Red = 0xd8323c, Cyan = 0x5fe0d0, Purple = 0xb36bff;

        /// <summary>Your race at a glance: finish, grid (and places made), time or gap, best lap, stops (and penalty).</summary>
        public static List<SummaryBox> RaceSummary(IList<ResultRow> rows)
        {
            var r = rows.FirstOrDefault(x => x.You);
            if (r == null) return new List<SummaryBox>();
            int grid = r.Place + r.Moved;
            string moved = r.Moved > 0 ? $" ▲{r.Moved}" : r.Moved < 0 ? $" ▼{-r.Moved}" : "";
            SummaryBox Box(string icon, string label, string value, int color = -1) => new SummaryBox { Icon = icon, Label = label, Value = value, Color = color };
            return new List<SummaryBox>
            {
                r.Out ? Box("flag", "FINISH", "OUT", Red) : Box("flag", r.Finished ? "FINISH" : "PLACE", $"P{r.Place}", r.Place <= 3 ? Podium[r.Place - 1] : -1),
                Box("car", "GRID", $"P{grid}{(r.Out ? "" : moved)}", r.Out ? -1 : r.Moved > 0 ? Cyan : r.Moved < 0 ? Red : -1),
                r.Place == 1 && !r.Out ? Box("watch", "TIME", r.Time) : Box("watch", "GAP", r.Time),
                Box("star", r.Fastest ? "FASTEST" : "BEST", r.Best, r.Fastest ? Purple : -1),
                r.Penalty != 0 ? Box("warn", "STOPS", $"{r.Stops} +{r.Penalty.ToString(Inv)}S", Red) : Box("wrench", "STOPS", $"{r.Stops}"),
            };
        }

        /// <summary>Qualifying's rows: the grid (drivers by slot), each driver's time (none: NO TIME), the gap to pole.</summary>
        public static List<QualifyingRow> QualifyingRows(IList<int> grid, IList<double?> times, IList<string> names, IList<string> teams, int you)
        {
            var pole = times[grid[0]];
            return grid.Select((k, pos) =>
            {
                var time = times[k];
                return new QualifyingRow
                {
                    Place = pos + 1, Name = names[k], Team = teams[k], Time = time == null ? "NO TIME" : FormatTime(time),
                    Gap = time == null || pole == null || pos == 0 ? "" : "+" + (time.Value - pole.Value).ToString("0.000", Inv), You = k == you,
                };
            }).ToList();
        }
    }
}
