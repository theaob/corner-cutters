// Medals, achievements and the trophy cabinet's contents: a port of src/f1/medals.ts and src/f1/achievements.ts (and
// today.ts's streak achievements). On each circuit a Time Trial lap and a Time Attack run earn bronze, silver or gold:
// a lap as quick as the quickest AI on EASY is bronze, on NORMAL silver, on HARD gold; a Time Attack run as far as a
// driver at NORMAL's or HARD's pace gets is silver or gold, a lap at least bronze. The best medal on each circuit is
// kept, with the Championships won, the achievements unlocked and the circuits raced, in one document shaped as the
// web save's 'trophies' section ({medals, titles, achievements, raced}). Engine-free, checked against the web game
// (trophies.json).
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public enum Medal { None, Bronze, Silver, Gold }
    public enum MedalKind { Trial, Attack }

    public static class Medals
    {
        public static readonly Medal[] All = { Medal.Bronze, Medal.Silver, Medal.Gold };
        public static string NameOf(Medal m) => m == Medal.Gold ? "GOLD" : m == Medal.Silver ? "SILVER" : m == Medal.Bronze ? "BRONZE" : "";
        public static string IdOf(Medal m) => NameOf(m).ToLowerInvariant();
        public static Medal FromId(string id) => id == "gold" ? Medal.Gold : id == "silver" ? Medal.Silver : id == "bronze" ? Medal.Bronze : Medal.None;
        /// <summary>a medal's colour (0xrrggbb)</summary>
        public static int ColorOf(Medal m) => m == Medal.Gold ? 0xf2c14e : m == Medal.Silver ? 0xc9cfdc : 0xd08a4e;

        /// <summary>The pace (a share of the reference lap's speed) each medal asks for: the quickest AI's on EASY, NORMAL and HARD.</summary>
        public static double PaceOf(Medal m) => Field.Difficulties.First(d => d.Id == (m == Medal.Bronze ? "easy" : m == Medal.Silver ? "normal" : "hard")).AiPace;

        public static Medal Better(Medal a, Medal b) => a >= b ? a : b;

        /// <summary>The medal after `held` (bronze if none; none after gold).</summary>
        public static Medal Next(Medal held) => held == Medal.Gold ? Medal.None : held + 1;

        /// <summary>s: the lap medal `m` asks for, on a circuit whose reference lap is `reference`.</summary>
        public static double LapTarget(double reference, Medal m) => reference / PaceOf(m);

        /// <summary>The medal a lap of `time` s earns (none if slower than bronze).</summary>
        public static Medal LapMedal(double time, double reference)
        {
            for (int i = All.Length - 1; i >= 0; i--) if (time <= LapTarget(reference, All[i]) + 1e-9) return All[i];
            return Medal.None;
        }

        /// <summary>Checkpoints a driver lapping at `pace` gets past in a Time Attack before the clock runs out.</summary>
        public static int AttackReach(double pace, double generous = 1)
        {
            var a = new Attack(Racing.Sectors) { Generous = generous };
            double left = a.Par * Attack.Grace;
            int passed = 0;
            for (;;)
            {
                left -= a.Par / pace;
                if (left < 0 || passed > 999) return passed;
                left += a.Bonus(passed);
                passed++;
            }
        }

        /// <summary>Checkpoints medal `m` asks for in a Time Attack: silver and gold as far as a driver at their pace gets; bronze a lap at least.</summary>
        public static int AttackTarget(Medal m, double generous = 1)
        {
            int bronze = Math.Max(Racing.Sectors, AttackReach(PaceOf(Medal.Bronze), generous));
            if (m == Medal.Bronze) return bronze;
            int silver = Math.Max(bronze + 1, AttackReach(PaceOf(Medal.Silver), generous));
            if (m == Medal.Silver) return silver;
            return Math.Max(silver + 1, AttackReach(PaceOf(Medal.Gold), generous));
        }

        /// <summary>The medal a Time Attack run of `passed` checkpoints earns.</summary>
        public static Medal AttackMedal(int passed, double generous = 1)
        {
            for (int i = All.Length - 1; i >= 0; i--) if (passed >= AttackTarget(All[i], generous)) return All[i];
            return Medal.None;
        }
    }

    public sealed class Achievement
    {
        public string Id, Name, About;
    }

    /// <summary>How a race went for you, at your flag.</summary>
    public struct RaceSummary
    {
        public int Place, Field, Grid, Strikes, Laps;
        public bool Fastest, Damaged, Burning;
        public string Difficulty, Weather;
        /// <summary>% of your tyres left at the flag (null: not known), your pit stops (null: not known)</summary>
        public int? TyresLeft, Stops;
    }

    public sealed class Trophies
    {
        /// <summary>the best medal on each circuit (by id), in a Time Trial and a Time Attack</summary>
        public readonly Dictionary<string, (Medal trial, Medal attack)> Medals = new Dictionary<string, (Medal, Medal)>();
        /// <summary>Championships won</summary>
        public int Titles;
        /// <summary>the achievements unlocked, in the order they were</summary>
        public readonly List<string> Unlocked = new List<string>();
        /// <summary>the circuits raced on (for GLOBETROTTER)</summary>
        public readonly List<string> Raced = new List<string>();

        public static readonly Achievement[] Achievements =
        {
            A("finish", "CHEQUERED", "Finish a race"),
            A("podium", "PODIUM", "Finish a race in the top three"),
            A("win", "WINNER", "Win a race"),
            A("hard-win", "GIANT KILLER", "Win a race on HARD"),
            A("wet-win", "RAIN MASTER", "Win a race in the wet"),
            A("from-back", "FROM THE BACK", "Win from the back half of the grid"),
            A("charge", "CHARGE", "Gain five places in a race"),
            A("hat-trick", "HAT TRICK", "Pole, the win and the fastest lap in one race"),
            A("spotless", "SPOTLESS", "Finish a race with no damage and no track-limits warnings"),
            A("purple", "PURPLE PATCH", "Set a race's fastest lap"),
            A("endurance", "ENDURANCE", "Finish a race of 15 laps or more"),
            A("bald", "BALD", "Finish a race on tyres worn down to 0%"),
            A("torch", "TORCH", "Finish a race with your car on fire"),
            A("rocket", "ROCKET START", "Get a GREAT LAUNCH off the lights"),
            A("too-keen", "TOO KEEN", "Jump the start"),
            A("torpedo", "TORPEDO", "Hit three cars or more off the start at the Ardennes"),
            A("box", "BOX, BOX", "Make a pit stop"),
            A("no-stop", "CAN'T STOP WON'T STOP", "Finish a race without a pit stop"),
            A("lapped", "LAPPED", "Lap a car"),
            A("scrapheap", "SCRAPHEAP", "Wreck your car"),
            A("golden", "GOLDEN", "Win a gold medal"),
            A("gold-standard", "GOLD STANDARD", "A Time Trial gold on every circuit"),
            A("champion", "CHAMPION", "Win a Championship"),
            A("globetrotter", "GLOBETROTTER", "Race on every circuit"),
            A("regular", "REGULAR", "Play seven days running"),
            A("devoted", "EVERY DAY", "Play thirty days running"),
            A("busy-day", "BUSY DAY", "Finish all three of a day's missions"),
        };

        static Achievement A(string id, string name, string about) => new Achievement { Id = id, Name = name, About = about };
        public static Achievement ById(string id) => Achievements.FirstOrDefault(a => a.Id == id);

        /// <summary>TORPEDO: on this circuit, in the first `Window` s after the lights, `Cars` cars or more hit</summary>
        public const string TorpedoCircuit = "ardennes";
        public const double TorpedoWindow = 8;
        public const int TorpedoCars = 3;
        /// <summary>the streaks the achievements are for (today.ts)</summary>
        public const int RegularDays = 7, DevotedDays = 30;

        public Medal MedalOn(string id, MedalKind kind) => Medals.TryGetValue(id, out var m) ? (kind == MedalKind.Trial ? m.trial : m.attack) : Medal.None;

        /// <summary>Award `medal` for `kind` on circuit `id`: true if it's better than the one there.</summary>
        public bool Award(string id, MedalKind kind, Medal medal)
        {
            if (medal == Medal.None) return false;
            var was = MedalOn(id, kind);
            if (was >= medal) return false;
            Medals.TryGetValue(id, out var m);
            Medals[id] = kind == MedalKind.Trial ? (medal, m.attack) : (m.trial, medal);
            return true;
        }

        /// <summary>The achievements a finished race earns.</summary>
        public static List<string> RaceAchievements(RaceSummary r)
        {
            bool won = r.Place == 1;
            var o = new List<string> { "finish" };
            if (r.Place <= 3) o.Add("podium");
            if (won) o.Add("win");
            if (won && r.Difficulty == "hard") o.Add("hard-win");
            if (won && r.Weather == "wet") o.Add("wet-win");
            if (won && r.Grid > (int)Math.Ceiling(r.Field / 2.0)) o.Add("from-back");
            if (r.Grid - r.Place >= 5) o.Add("charge");
            if (won && r.Grid == 1 && r.Fastest) o.Add("hat-trick");
            if (!r.Damaged && r.Strikes == 0) o.Add("spotless");
            if (r.Fastest) o.Add("purple");
            if (r.Laps >= 15) o.Add("endurance");
            if (r.TyresLeft.HasValue && r.TyresLeft.Value <= 0) o.Add("bald");
            if (r.Burning) o.Add("torch");
            if (r.Stops == 0) o.Add("no-stop");
            return o;
        }

        /// <summary>The medals' achievements, from the cabinet: a gold anywhere, a Time Trial gold on every one of `circuits`, a title.</summary>
        public List<string> MedalAchievements(IList<string> circuits)
        {
            var o = new List<string>();
            if (Medals.Values.Any(m => m.trial == Medal.Gold || m.attack == Medal.Gold)) o.Add("golden");
            if (circuits.Count > 0 && circuits.All(id => MedalOn(id, MedalKind.Trial) == Medal.Gold)) o.Add("gold-standard");
            if (Titles > 0) o.Add("champion");
            return o;
        }

        /// <summary>Unlock `ids`: the ones that weren't already, in the list's (ACHIEVEMENTS') order.</summary>
        public List<Achievement> Unlock(IEnumerable<string> ids)
        {
            var want = new HashSet<string>(ids);
            var fresh = Achievements.Where(a => want.Contains(a.Id) && !Unlocked.Contains(a.Id)).ToList();
            foreach (var a in fresh) Unlocked.Add(a.Id);
            return fresh;
        }

        /// <summary>You raced on circuit `id`: true (GLOBETROTTER's due) once that makes every one of `circuits`.</summary>
        public bool RacedOn(string id, IEnumerable<string> circuits)
        {
            if (!Raced.Contains(id)) Raced.Add(id);
            return circuits.All(Raced.Contains);
        }

        /// <summary>The trophies from the saved document (anything odd left out).</summary>
        public static Trophies Parse(string text)
        {
            var t = new Trophies();
            if (string.IsNullOrEmpty(text)) return t;
            object v;
            try { v = Json.Parse(text); } catch { return t; }
            if (!(v is Dictionary<string, object> o)) return t;
            if (o.TryGetValue("titles", out var ti) && ti is double n && n > 0 && n == Math.Floor(n)) t.Titles = (int)n;
            if (o.TryGetValue("medals", out var me) && me is Dictionary<string, object> medals)
                foreach (var kv in medals)
                {
                    if (!(kv.Value is Dictionary<string, object> m)) continue;
                    var trial = m.TryGetValue("trial", out var a) ? Core.Medals.FromId(a as string) : Medal.None;
                    var attack = m.TryGetValue("attack", out var b) ? Core.Medals.FromId(b as string) : Medal.None;
                    if (trial != Medal.None || attack != Medal.None) t.Medals[kv.Key] = (trial, attack);
                }
            if (o.TryGetValue("achievements", out var ac) && ac is List<object> list)
                foreach (var x in list) if (x is string s && ById(s) != null && !t.Unlocked.Contains(s)) t.Unlocked.Add(s);
            if (o.TryGetValue("raced", out var ra) && ra is List<object> raced)
                foreach (var x in raced) if (x is string s && !t.Raced.Contains(s)) t.Raced.Add(s);
            return t;
        }

        public string Write()
        {
            var medals = new JsonObj();
            foreach (var kv in Medals)
            {
                var m = new JsonObj();
                if (kv.Value.trial != Medal.None) m["trial"] = Core.Medals.IdOf(kv.Value.trial);
                if (kv.Value.attack != Medal.None) m["attack"] = Core.Medals.IdOf(kv.Value.attack);
                medals[kv.Key] = m;
            }
            return Json.Write(new JsonObj { { "medals", medals }, { "titles", (double)Titles }, { "achievements", Unlocked.Cast<object>().ToList() }, { "raced", Raced.Cast<object>().ToList() } });
        }
    }
}
