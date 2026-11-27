// Daily missions, a port of src/f1/missions.ts: three small goals a day, drawn from the day's date (by this device's
// clock), so everyone has the same three as the web game: one easy, one harder, and one off the beaten track (another
// mode, a circuit, a win). Played towards in any mode; the progress kept for the day (the same JSON the web game keeps),
// a fresh three the next. And the launch off the lights (launch.ts): a jump start, or a great, good or slow getaway.
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public enum PlayKind { Race, Lap, Launch, Pit, TrialLap, Attack }

    /// <summary>Something done in a session, as missions count it.</summary>
    public sealed class PlayEvent
    {
        public PlayKind Kind;
        /// <summary>a race finished (your flag): where you finished, from where (1 the pole), of how many; the circuit</summary>
        public int Place, Grid, Field;
        public bool Fastest, Clean;
        /// <summary>'dry', 'damp' or 'wet'</summary>
        public string Weather = "dry";
        public string Circuit, Difficulty;
        /// <summary>a launch: a great one; a Time Trial lap: a new record; a Time Attack run: the Daily Challenge's</summary>
        public bool Great, Record, Daily;
        /// <summary>a Time Attack run: its sectors cleared</summary>
        public int Passed;
    }

    public sealed class Mission
    {
        public string Id, Text;
        public int Goal;
        /// <summary>the best in one go counts, not the total</summary>
        public bool Max;
        /// <summary>the circuit a mission names</summary>
        public string Circuit;
        public Func<PlayEvent, int> Count;
    }

    /// <summary>A day's progress: how far along each of its missions is.</summary>
    public sealed class DayProgress
    {
        public string Day;
        public Dictionary<string, int> Progress = new Dictionary<string, int>();
    }

    public static class Missions
    {
        /// <summary>The circuits a mission can send you to: the ones open to everyone (the first, and the free ones).</summary>
        public static readonly (string id, string name)[] Circuits = { ("crescent-park", "CRESCENT PARK"), ("glacier-pass", "GLACIER PASS"), ("dust-bowl", "DUST BOWL"), ("volcano-isle", "VOLCANO ISLE") };

        static Mission M(string id, string text, int goal, Func<PlayEvent, int> count, bool max = false) => new Mission { Id = id, Text = text, Goal = goal, Count = count, Max = max };
        static bool Race(PlayEvent e) => e.Kind == PlayKind.Race;

        static readonly Mission[] Easy =
        {
            M("races", "FINISH 2 RACES", 2, e => Race(e) ? 1 : 0),
            M("laps", "DRIVE 10 LAPS", 10, e => e.Kind == PlayKind.Lap ? 1 : 0),
            M("launches", "GET 2 GOOD LAUNCHES", 2, e => e.Kind == PlayKind.Launch ? 1 : 0),
            M("pit", "MAKE A PIT STOP", 1, e => e.Kind == PlayKind.Pit ? 1 : 0),
            M("top5", "FINISH IN THE TOP 5", 1, e => Race(e) && e.Place <= 5 ? 1 : 0),
        };

        static readonly Mission[] Medium =
        {
            M("podium", "FINISH ON THE PODIUM", 1, e => Race(e) && e.Place <= 3 ? 1 : 0),
            M("charge", "GAIN 3 PLACES IN A RACE", 3, e => Race(e) ? Math.Max(0, e.Grid - e.Place) : 0, max: true),
            M("fastest", "SET A RACE’S FASTEST LAP", 1, e => Race(e) && e.Fastest ? 1 : 0),
            M("clean", "FINISH A RACE WITHOUT A SCRATCH", 1, e => Race(e) && e.Clean ? 1 : 0),
            M("great", "GET A GREAT LAUNCH", 1, e => e.Kind == PlayKind.Launch && e.Great ? 1 : 0),
            M("rain", "FINISH A RACE IN THE RAIN", 1, e => Race(e) && e.Weather != "dry" ? 1 : 0),
        };

        static readonly Mission[] Far = new[]
        {
            M("daily", "RUN THE DAILY CHALLENGE", 1, e => e.Kind == PlayKind.Attack && e.Daily ? 1 : 0),
            M("trial", "SET 3 TIME TRIAL LAPS", 3, e => e.Kind == PlayKind.TrialLap ? 1 : 0),
            M("attack", "CLEAR 8 SECTORS IN A TIME ATTACK", 8, e => e.Kind == PlayKind.Attack ? e.Passed : 0, max: true),
            M("win", "WIN A RACE", 1, e => Race(e) && e.Place == 1 ? 1 : 0),
            M("record", "BEAT YOUR TIME TRIAL RECORD", 1, e => e.Kind == PlayKind.TrialLap && e.Record ? 1 : 0),
        }.Concat(Circuits.Select(c => new Mission { Id = $"at-{c.id}", Text = $"FINISH A RACE AT {c.name}", Goal = 1, Circuit = c.name, Count = e => Race(e) && e.Circuit == c.id ? 1 : 0 })).ToArray();

        /// <summary>Every mission there is.</summary>
        public static readonly Mission[] All = Easy.Concat(Medium).Concat(Far).ToArray();

        /// <summary>A mission's words for the screen (the pixel font has no curly quote).</summary>
        public static string TextOf(Mission m) => m.Text.Replace('’', '\'');

        /// <summary>A number from `text` (FNV-1a over its UTF-16 units), the same everywhere.</summary>
        static uint Hash(string text)
        {
            uint h = 2166136261;
            foreach (char ch in text)
            {
                h ^= ch;
                h = unchecked(h * 16777619);
            }
            return h;
        }

        /// <summary>`day`'s three missions: an easy one, a harder one, and one further afield.</summary>
        public static Mission[] On(string day)
        {
            var lots = new[] { Easy, Medium, Far };
            return lots.Select((lot, k) => lot[Hash($"mission:{k}:{day}") % (uint)lot.Length]).ToArray();
        }

        /// <summary>How far along `m` is (no further than its goal).</summary>
        public static int ProgressOf(DayProgress p, Mission m) => Math.Min(m.Goal, p.Progress.TryGetValue(m.Id, out int n) ? n : 0);

        public static bool IsDone(DayProgress p, Mission m) => ProgressOf(p, m) >= m.Goal;

        /// <summary>`e` counted towards the day's missions: those it finishes, and whether that makes all three.</summary>
        public static List<Mission> Count(DayProgress p, PlayEvent e, out bool all)
        {
            var today = On(p.Day);
            var done = new List<Mission>();
            foreach (var m in today)
            {
                if (IsDone(p, m)) continue;
                int n = m.Count(e);
                if (n == 0) continue;
                int had = p.Progress.TryGetValue(m.Id, out int h) ? h : 0;
                p.Progress[m.Id] = m.Max ? Math.Max(had, n) : had + n;
                if (IsDone(p, m)) done.Add(m);
            }
            all = done.Count > 0 && today.All(m => IsDone(p, m));
            return done;
        }

        /// <summary>The day's progress read back (the web game's save: {day, progress}); a fresh one for another day.</summary>
        public static DayProgress Parse(string text, string day)
        {
            var p = new DayProgress { Day = day };
            if (string.IsNullOrEmpty(text)) return p;
            object v;
            try { v = Json.Parse(text); } catch { return p; }
            if (!(v is Dictionary<string, object> o) || !(o.TryGetValue("day", out var d) && d as string == day) || !(o.TryGetValue("progress", out var pr) && pr is Dictionary<string, object> prog)) return p;
            foreach (var kv in prog) if (kv.Value is double n && n >= 0) p.Progress[kv.Key] = (int)n;
            return p;
        }

        public static string Write(DayProgress p)
        {
            var prog = new JsonObj();
            foreach (var kv in p.Progress) prog[kv.Key] = (double)kv.Value;
            return Json.Write(new JsonObj { { "day", p.Day }, { "progress", prog } });
        }
    }

    public enum LaunchVerdict { None, Jump, Great, Good, Slow }

    /// <summary>The start (launch.ts): your launch off the line, judged on your reaction to the lights.</summary>
    public sealed class Launch
    {
        /// <summary>throttle that counts as going; s of reaction for a great launch, a good one; s after which it's just slow</summary>
        public const double Gas = 0.4, GreatIn = 0.25, GoodIn = 0.45, Late = 1.5;
        /// <summary>px/s of speed a great launch, or a good one, gives you off the line; s added at the flag for a jump start</summary>
        public const double GreatKick = 25, GoodKick = 12, JumpPenalty = 5;

        public LaunchVerdict Verdict;
        public double? Reaction;
        bool? on;

        /// <summary>
        /// A frame of the start: `lit`, all five lights are on; `out`, s since they went out (null before); `gas`, your
        /// throttle. The verdict, on the frame it's reached (None otherwise).
        /// </summary>
        public LaunchVerdict Step(bool lit, double? @out, double gas)
        {
            bool now = gas >= Gas;
            // (a press is getting on the throttle: held from before the first frame, it isn't one)
            bool pressed = now && on == false;
            on = now;
            if (Verdict != LaunchVerdict.None) return LaunchVerdict.None;
            if (@out == null)
            {
                if (lit && pressed) return Verdict = LaunchVerdict.Jump;
                return LaunchVerdict.None;
            }
            if (now || @out.Value >= Late)
            {
                Reaction = @out.Value;
                Verdict = !pressed ? LaunchVerdict.Slow : @out.Value <= GreatIn ? LaunchVerdict.Great : @out.Value <= GoodIn ? LaunchVerdict.Good : LaunchVerdict.Slow;
                return Verdict;
            }
            return LaunchVerdict.None;
        }

        /// <summary>px/s of speed straight ahead a verdict gives you off the line.</summary>
        public static double KickOf(LaunchVerdict v) => v == LaunchVerdict.Great ? GreatKick : v == LaunchVerdict.Good ? GoodKick : 0;
    }
}
