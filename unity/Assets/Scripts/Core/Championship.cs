// The Championship: a port of src/f1/championship.ts. A season of rounds, one on each circuit in turn (all but the free
// ones), against the same field all season (your team and the others, one car each, drawn when the season starts, each
// driver with the same pace all season). Points as in F1 for the top ten; the drivers' standings by points, then by the
// best results (most wins, then most seconds...). The season is kept on the device (as the web game keeps it, the same
// JSON) after every round, so it can be left and picked up again.
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public sealed class SeasonDriver
    {
        /// <summary>'YOU' for you</summary>
        public string Name;
        /// <summary>the team's id</summary>
        public string Team;
        /// <summary>pace rank, 0 the quickest</summary>
        public int Rank;
    }

    public sealed class Standing
    {
        public int Driver, Points, Wins;
    }

    public sealed class Season
    {
        /// <summary>the season's own seed: its field, and each round's seed from it</summary>
        public uint Seed;
        public string Difficulty;
        public bool Qualifying;
        /// <summary>the circuits (by id), in order</summary>
        public List<string> Rounds = new List<string>();
        /// <summary>the next round to race (Rounds.Count: the season's over)</summary>
        public int Round;
        public List<SeasonDriver> Drivers = new List<SeasonDriver>();
        public int You;
        /// <summary>each round's laps (null: a SPRINT, as a season saved before there was a choice)</summary>
        public int? Laps;
        public int Seat;
        /// <summary>each round raced so far: each driver's place (0 = won), or -1 if they didn't finish</summary>
        public List<int[]> Places = new List<int[]>();

        public bool Over => Round >= Rounds.Count;
        public int RoundLaps => Laps ?? Championship.SprintLaps;
    }

    public static class Championship
    {
        /// <summary>Points for 1st to 10th.</summary>
        public static readonly int[] Points = { 25, 18, 15, 12, 10, 8, 6, 4, 2, 1 };
        /// <summary>laps.ts SEASON_LENGTHS: a SPRINT's laps (RACE_LAPS), a GRAND PRIX's</summary>
        public const int SprintLaps = 5, GrandPrixLaps = 10;
        public static readonly (int laps, string name)[] Lengths = { (SprintLaps, "SPRINT"), (GrandPrixLaps, "GRAND PRIX") };
        public static string LengthName(int? laps) => laps == GrandPrixLaps ? "GRAND PRIX" : "SPRINT";

        /// <summary>Points for a place (0 = a win; -1, a DNF, scores none).</summary>
        public static int PointsFor(int place) => place >= 0 && place < Points.Length ? Points[place] : 0;

        /// <summary>A new season on `rounds` for `team`: the field drawn from `seed`, `total` drivers in all, you mid-field.</summary>
        public static Season NewSeason(uint seed, Team team, int seat, string difficulty, bool qualifying, IList<string> rounds, int total, int? laps)
        {
            var rng = new SeededRandom(seed);
            int you = total / 2;
            var teams = Field.TeamGrid(team, total, you, rng);
            var seats = Field.DriverSeats(teams, you, seat);
            var ranks = Field.PaceRanks(total, rng);
            var s = new Season { Seed = seed, Difficulty = difficulty, Qualifying = qualifying, Rounds = rounds.ToList(), You = you, Seat = seat };
            for (int k = 0; k < total; k++) s.Drivers.Add(new SeasonDriver { Name = k == you ? "YOU" : teams[k].Drivers[seats[k]], Team = teams[k].Id, Rank = ranks[k] });
            if (laps.HasValue) s.Laps = laps == GrandPrixLaps ? GrandPrixLaps : SprintLaps;
            return s;
        }

        /// <summary>The seed of round k: its start, the AI's dice (the field stays the season's).</summary>
        public static uint RoundSeed(Season s, int k)
        {
            uint v = unchecked((uint)((long)s.Seed * 31 + (long)(k + 1) * 7919));
            return v == 0 ? 1 : v;
        }

        /// <summary>Record the round just raced: `finish` the drivers (indexes) in finishing order; `out` those who didn't finish.</summary>
        public static void RecordRound(Season s, IList<int> finish, ISet<int> @out = null)
        {
            if (s.Over) return;
            var places = Enumerable.Repeat(-1, s.Drivers.Count).ToArray();
            int place = 0;
            foreach (int k in finish) if (@out == null || !@out.Contains(k)) places[k] = place++;
            s.Places.Add(places);
            s.Round++;
        }

        /// <summary>Each driver's points so far.</summary>
        public static int[] PointsOf(Season s) => Enumerable.Range(0, s.Drivers.Count).Select(k => s.Places.Sum(r => PointsFor(r[k]))).ToArray();

        /// <summary>The drivers' standings: most points first; level on points, more wins, then more seconds, and so on.</summary>
        public static List<Standing> Standings(Season s)
        {
            var points = PointsOf(s);
            int n = s.Drivers.Count;
            var counts = new int[n][];
            for (int k = 0; k < n; k++)
            {
                counts[k] = new int[n];
                foreach (var r in s.Places) if (r[k] >= 0) counts[k][r[k]]++;
            }
            var list = Enumerable.Range(0, n).Select(k => new Standing { Driver = k, Points = points[k], Wins = counts[k][0] }).ToList();
            list.Sort((a, b) =>
            {
                if (b.Points != a.Points) return b.Points - a.Points;
                for (int p = 0; p < n; p++) if (counts[b.Driver][p] != counts[a.Driver][p]) return counts[b.Driver][p] - counts[a.Driver][p];
                return a.Driver - b.Driver;
            });
            return list;
        }

        /// <summary>The team a season driver drives for.</summary>
        public static Team TeamOf(SeasonDriver d) => Field.TeamById(d.Team) ?? Field.Teams[0];

        /// <summary>The season as the web game saves it.</summary>
        public static string Write(Season s)
        {
            var o = new JsonObj
            {
                { "seed", (double)s.Seed }, { "difficulty", s.Difficulty }, { "qualifying", s.Qualifying },
                { "rounds", s.Rounds.Cast<object>().ToList() }, { "round", (double)s.Round },
                { "drivers", s.Drivers.Select(d => (object)new JsonObj { { "name", d.Name }, { "team", d.Team }, { "rank", (double)d.Rank } }).ToList() },
                { "you", (double)s.You }, { "seat", (double)s.Seat },
                { "places", s.Places.Select(r => (object)r.Select(x => (object)(double)x).ToList()).ToList() },
            };
            if (s.Laps.HasValue) o["laps"] = (double)s.Laps.Value;
            return Json.Write(o);
        }

        /// <summary>A season read back, if it's a sound one (parseSeason's checks).</summary>
        public static Season Parse(string text)
        {
            if (string.IsNullOrEmpty(text)) return null;
            object v;
            try { v = Json.Parse(text); } catch { return null; }
            if (!(v is Dictionary<string, object> o)) return null;
            bool Int(object x, out int i) { i = 0; if (x is double d && d == Math.Floor(d) && Math.Abs(d) < 4294967296.0) { i = (int)(long)d; return true; } return false; }
            object G(string k) => o.TryGetValue(k, out var x) ? x : null;
            if (!(G("seed") is double seed) || seed != Math.Floor(seed) || !Int(G("round"), out int round) || !Int(G("you"), out int you)) return null;
            if (!(G("rounds") is List<object> rounds) || !(G("drivers") is List<object> drivers) || !(G("places") is List<object> places)) return null;
            if (!(G("difficulty") is string diff) || !new[] { "easy", "normal", "hard" }.Contains(diff) || !(G("qualifying") is bool quali)) return null;
            int n = drivers.Count;
            if (n == 0 || you < 0 || you >= n || round < 0 || round > rounds.Count || places.Count != round) return null;
            if (!rounds.All(r => r is string)) return null;
            var s = new Season { Seed = (uint)(long)seed, Difficulty = diff, Qualifying = quali, Rounds = rounds.Cast<string>().ToList(), Round = round, You = you };
            foreach (var d in drivers)
            {
                if (!(d is Dictionary<string, object> dd) || !(dd.TryGetValue("name", out var nm) && nm is string name) || !(dd.TryGetValue("team", out var tm) && tm is string team) || !(dd.TryGetValue("rank", out var rk) && Int(rk, out int rank))) return null;
                s.Drivers.Add(new SeasonDriver { Name = name, Team = team, Rank = rank });
            }
            foreach (var r in places)
            {
                if (!(r is List<object> row) || row.Count != n) return null;
                var a = new int[n];
                for (int i = 0; i < n; i++) if (!Int(row[i], out a[i]) || a[i] < -1 || a[i] >= n) return null;
                s.Places.Add(a);
            }
            // (a length that isn't one: a SPRINT)
            if (Int(G("laps"), out int laps) && (laps == SprintLaps || laps == GrandPrixLaps)) s.Laps = laps;
            s.Seat = Int(G("seat"), out int seat) && (seat == 0 || seat == 1) ? seat : 0;
            return OneCarPerTeam(s);
        }

        /// <summary>A season saved when teams ran two cars: each repeat takes a team not yet in the field.</summary>
        static Season OneCarPerTeam(Season s)
        {
            var used = new HashSet<string> { s.Drivers[s.You].Team };
            var spare = new Queue<Team>(Field.Teams.Where(t => !s.Drivers.Any(d => d.Team == t.Id)));
            for (int k = 0; k < s.Drivers.Count; k++)
            {
                var d = s.Drivers[k];
                if (k == s.You || !used.Contains(d.Team)) { used.Add(d.Team); continue; }
                if (spare.Count == 0) continue;
                var t = spare.Dequeue();
                used.Add(t.Id);
                s.Drivers[k] = new SeasonDriver { Name = t.Drivers[0], Team = t.Id, Rank = d.Rank };
            }
            return s;
        }
    }
}
