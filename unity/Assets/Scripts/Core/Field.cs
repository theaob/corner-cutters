// The field: the teams and their drivers (src/f1/teams.ts, drivers.ts), the difficulties (difficulty.ts), the AI off
// the lights (launch.ts's aiReaction), and a weekend's field drawn from its seed as the web game draws it (race.ts's
// drawWeekend): the same seed, the same rivals, paces, dice and start-light wait.
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public sealed class Team
    {
        public string Id, Code, Name;
        /// <summary>colours, 0xRRGGBB (Accent -1: none)</summary>
        public int Body, Trim, Accent = -1;
        public string Pattern;
        public string[] Drivers;
    }

    public sealed class DriverStyle
    {
        public string Id, Name;
        public double Aggression, Consistency;
    }

    public sealed class Difficulty
    {
        public string Id, Name, About;
        public double AiPace, AiSpread, CrashDamage, DamageSlow, AiCraft, AiMistakes, AiIncidents;

        public HandlingParams Handling() => HandlingParams.Race(CrashDamage, DamageSlow);
        public double CraftFor(SeededRandom rng, double aggression = 0) => Math.Max(0, Math.Min(1, AiCraft + aggression + (rng.Next() * 2 - 1) * 0.15));
        public double IncidentsFor(double aggression = 0) => AiIncidents * Math.Max(0.3, 1 + 2 * aggression);
        public double MistakesFor(double consistency = 0) => AiMistakes * (1 - 0.6 * consistency);
        public double PaceFor(int rank, int total, double adjust = 1) => AiPace * adjust * (1 - ((double)rank / total) * AiSpread);
    }

    public sealed class WeekendDriver
    {
        public Team Team;
        public int Seat;
        public AiDriver Ai;
        public int Box;
        public string Code => Team.Drivers[Seat];
    }

    public sealed class Weekend
    {
        public int YouDriver;
        public List<WeekendDriver> Drivers;
        public double LightsOut;
    }

    public static class Field
    {
        static Team T(string id, string code, string name, int body, int trim, string pattern, string a, string b, int accent = -1) =>
            new Team { Id = id, Code = code, Name = name, Body = body, Trim = trim, Accent = accent, Pattern = pattern, Drivers = new[] { a, b } };

        public static readonly Team[] Teams =
        {
            T("milk-energy", "MLK", "Milk Energy", 0x1e2b5c, 0xf2c14e, "nose", "VER", "HAD"),
            T("prancing-monkey", "PRM", "Prancing Monkey", 0xdc0000, 0xfff200, "stripe", "HAM", "LEC"),
            T("golden-arrows", "GOA", "Golden Arrows", 0xc6c9d0, 0x00d2be, "twin", "RUS", "ANT"),
            T("calrissian", "CAL", "Calrissian Racing", 0xff8000, 0x1b1b26, "halves", "NOR", "PIA"),
            T("british-lime", "BLI", "British Lime", 0x00594f, 0xcedc00, "chevron", "ALO", "STR"),
            T("renee", "REN", "Reneé", 0xf7d117, 0x1b1b26, "band", "GAS", "COL"),
            T("frankies-groove", "FRG", "Frankie's Groove", 0x1868db, 0xf4f4f8, "split", "ALB", "SAI"),
            T("cheaper-milk", "CHM", "Cheaper Milk", 0xf4f4f8, 0x1634cc, "stripe", "LAW", "LIN"),
            T("dmw", "DMW", "Deutche Motor Werke", 0x1c69d4, 0xf4f4f8, "chevron", "HUL", "BOR"),
            T("maas", "MAS", "MaaS", 0xf4f4f8, 0xd8323c, "halves", "OCO", "BEA", 0x8a8d94),
            T("grandmas-fave", "GMF", "Grandma's Fave", 0x1b1b26, 0xf4f4f8, "twin", "BOT", "PER"),
        };

        public static Team TeamById(string id) => Teams.FirstOrDefault(t => t.Id == id);

        static readonly Dictionary<string, DriverStyle> Styles = new Dictionary<string, DriverStyle>
        {
            ["charger"] = new DriverStyle { Id = "charger", Name = "CHARGER", Aggression = 0.2, Consistency = -0.3 },
            ["metronome"] = new DriverStyle { Id = "metronome", Name = "METRONOME", Aggression = -0.1, Consistency = 0.6 },
            ["veteran"] = new DriverStyle { Id = "veteran", Name = "VETERAN", Aggression = 0.1, Consistency = 0.4 },
            ["defender"] = new DriverStyle { Id = "defender", Name = "DEFENDER", Aggression = 0.15, Consistency = 0.1 },
            ["rookie"] = new DriverStyle { Id = "rookie", Name = "ROOKIE", Aggression = 0.05, Consistency = -0.5 },
        };

        static readonly Dictionary<string, string> DriverStyles = new Dictionary<string, string>
        {
            ["VER"] = "charger", ["HAD"] = "rookie", ["HAM"] = "veteran", ["LEC"] = "charger", ["RUS"] = "metronome", ["ANT"] = "rookie",
            ["NOR"] = "metronome", ["PIA"] = "metronome", ["ALO"] = "veteran", ["STR"] = "defender", ["GAS"] = "charger", ["COL"] = "rookie",
            ["ALB"] = "defender", ["SAI"] = "metronome", ["LAW"] = "charger", ["LIN"] = "rookie", ["HUL"] = "veteran", ["BOR"] = "rookie",
            ["OCO"] = "defender", ["BEA"] = "rookie", ["BOT"] = "veteran", ["PER"] = "defender",
        };

        public static DriverStyle StyleOf(string code) => Styles[DriverStyles.TryGetValue(code, out var s) ? s : "metronome"];

        public static readonly Difficulty[] Difficulties =
        {
            new Difficulty { Id = "easy", Name = "EASY", About = "slower AI · crashes forgiven", AiPace = 0.86, AiSpread = 0.08, CrashDamage = 0.1, DamageSlow = 0.15, AiCraft = 0.3, AiMistakes = 0.08, AiIncidents = 0.06 },
            new Difficulty { Id = "normal", Name = "NORMAL", About = "a fair fight", AiPace = 0.94, AiSpread = 0.05, CrashDamage = 0.2, DamageSlow = 0.3, AiCraft = 0.6, AiMistakes = 0.05, AiIncidents = 0.045 },
            new Difficulty { Id = "hard", Name = "HARD", About = "flat-out AI · crashes cost you", AiPace = 0.985, AiSpread = 0.02, CrashDamage = 0.35, DamageSlow = 0.4, AiCraft = 0.9, AiMistakes = 0.025, AiIncidents = 0.03 },
        };

        public static Difficulty Normal => Difficulties[1];
        public static Difficulty DifficultyById(string id) => Difficulties.FirstOrDefault(d => d.Id == id);

        /// <summary>Each grid slot's pace rank (0 = the quickest): mostly in grid order, each moved up to `mix` places either way.</summary>
        public static int[] PaceRanks(int total, SeededRandom rng, double mix = 3)
        {
            var keyed = Enumerable.Range(0, total).Select(i => (i, k: i + (rng.Next() * 2 - 1) * mix)).ToList();
            JsMath.StableSort(keyed, (a, b) => Math.Sign(a.k - b.k));
            var ranks = new int[total];
            for (int r = 0; r < keyed.Count; r++) ranks[keyed[r].i] = r;
            return ranks;
        }

        static List<T> Shuffled<T>(IList<T> list, SeededRandom rng)
        {
            var output = new List<T>(list);
            for (int i = output.Count - 1; i > 0; i--)
            {
                int j = (int)Math.Floor(rng.Next() * (i + 1));
                (output[i], output[j]) = (output[j], output[i]);
            }
            return output;
        }

        /// <summary>Each grid slot's team: yours in slot `you`, the rest drawn at random, each once, shuffled.</summary>
        public static List<Team> TeamGrid(Team yours, int total, int you, SeededRandom rng)
        {
            var rivals = Shuffled(Teams.Where(t => t != yours).ToList(), rng);
            var others = Enumerable.Range(0, Math.Max(0, total - 1)).Select(k => rivals[k % rivals.Count]).ToList();
            return Enumerable.Range(0, total).Select(i => i == you ? yours : others[i < you ? i : i - 1]).ToList();
        }

        /// <summary>Each slot's seat in its team (0 the first driver, 1 the second).</summary>
        public static int[] DriverSeats(List<Team> grid, int you, int yours = 0)
        {
            var seats = new int[grid.Count];
            for (int i = 0; i < grid.Count; i++)
            {
                if (i == you) seats[i] = yours;
                else if (grid[i] == grid[you]) seats[i] = yours == 0 ? 1 : 0;
                else seats[i] = grid.Take(i).Contains(grid[i]) ? 1 : 0;
            }
            return seats;
        }

        // AI_LAUNCH
        public const double LaunchQuick = 0.16, LaunchSlow = 0.42, LaunchBog = 0.06, BogFrom = 0.7, BogTo = 1.2;

        public static double AiReaction(SeededRandom rng, double craft, double consistency = 0)
        {
            if (rng.Next() < LaunchBog * (1 - 0.6 * consistency)) return BogFrom + rng.Next() * (BogTo - BogFrom);
            return LaunchQuick + (LaunchSlow - LaunchQuick) * (0.6 * rng.Next() + 0.4 * (1 - Math.Max(0, Math.Min(1, craft))));
        }

        /// <summary>
        /// A weekend's field from its seed, as the web game draws it: your team and the rest at random, each AI driver's
        /// pace, line, racecraft and dice, and the start lights' wait. Driver k's grid slot is k unless qualifying sets
        /// another; you're mid-grid. `slots`: the circuit's grid slots; `opponents`: the AI cars (the web game's 10).
        /// </summary>
        public static Weekend DrawWeekend(uint seed, int slots, Team yours, Difficulty difficulty, int yourSeat = 0, int opponents = 10, double paceAdjust = 1)
        {
            var rng = new SeededRandom(seed);
            int total = Math.Min(slots, 1 + opponents);
            int you = total / 2;
            var teams = TeamGrid(yours, total, you, rng);
            var seats = DriverSeats(teams, you, yourSeat);
            var ranks = PaceRanks(total, rng);
            return Draw(seed, rng, teams, seats, ranks, you, difficulty, paceAdjust);
        }

        /// <summary>A Championship round's field: the season's drivers, their teams and each one's pace all season (race.ts
        /// drawWeekend with a season), the AI's dice and the lights from the round's seed.</summary>
        public static Weekend SeasonWeekend(uint seed, Season season, Difficulty difficulty, double paceAdjust = 1)
        {
            var rng = new SeededRandom(seed);
            var teams = season.Drivers.Select(Championship.TeamOf).ToList();
            var seats = DriverSeats(teams, season.You, season.Seat);
            var ranks = season.Drivers.Select(d => d.Rank).ToArray();
            return Draw(seed, rng, teams, seats, ranks, season.You, difficulty, paceAdjust);
        }

        static Weekend Draw(uint seed, SeededRandom rng, List<Team> teams, int[] seats, int[] ranks, int you, Difficulty difficulty, double paceAdjust)
        {
            int total = teams.Count;
            var boxes = teams.Distinct().ToList();
            var drivers = new List<WeekendDriver>();
            for (int k = 0; k < total; k++)
            {
                var team = teams[k];
                var style = StyleOf(team.Drivers[seats[k]]);
                AiDriver ai = null;
                if (k != you)
                {
                    ai = new AiDriver { Lane = ((k * 7) % 11) - 5, Pace = difficulty.PaceFor(ranks[k], total, paceAdjust) };
                    ai.Craft = difficulty.CraftFor(rng, style.Aggression);
                    ai.Mistakes = difficulty.MistakesFor(style.Consistency);
                    ai.Rng = new SeededRandom((uint)Math.Floor(rng.Next() * 4294967296.0));
                    ai.Incidents = difficulty.IncidentsFor(style.Aggression);
                    uint r = SeededRandom.ToUint32((double)seed * 2654435761.0) ^ SeededRandom.ToUint32((k + 1) * 40503.0);
                    ai.Reaction = AiReaction(new SeededRandom(r == 0 ? 1 : r), ai.Craft ?? 0.6, style.Consistency);
                }
                drivers.Add(new WeekendDriver { Team = team, Seat = seats[k], Ai = ai, Box = boxes.IndexOf(team) });
            }
            return new Weekend { YouDriver = you, Drivers = drivers, LightsOut = 0.3 + rng.Next() * 0.7 };
        }
    }
}
