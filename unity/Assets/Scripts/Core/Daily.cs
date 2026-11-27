// The Daily Challenge: a port of src/f1/daily.ts. One Time Attack a day, the same for everyone in the world (a circuit
// and weather drawn from the day's date, UTC; NORMAL; any team, they're all the same car), as many runs as you like,
// your best on the day's online board by your initials. Kept on the device: your best on each day, your streak of
// days played, and a best not yet sent (sent next time there's a connection).
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CornerCutters.Core
{
    /// <summary>A run: checkpoints passed, and s from the clock starting to the last of them.</summary>
    public struct DailyRun
    {
        public int Score;
        public double Time;
    }

    public sealed class DailyPending
    {
        public string Day;
        public DailyRun Run;
        public Ghost Ghost;
    }

    /// <summary>What's kept: the last day you played and your streak of days running, your best on each day lately, and a best not yet on the board.</summary>
    public sealed class DailyLog
    {
        public string Last;
        public int Streak;
        public SortedDictionary<string, DailyRun> Best = new SortedDictionary<string, DailyRun>(StringComparer.Ordinal);
        public DailyPending Pending;
    }

    public struct DailyEntry
    {
        public int Place, Score;
        public string Name;
        public double Time;
        public bool You;
    }

    /// <summary>A day's board: how many have run it, its top, and your place (if you have one).</summary>
    public sealed class DailyBoard
    {
        public int Entries;
        public List<DailyEntry> Top = new List<DailyEntry>();
        public DailyEntry? You;
    }

    /// <summary>The day's leading run to chase: whose, how far they got, and their ghost.</summary>
    public sealed class DailyRival
    {
        public string Name;
        public int Score;
        public double Time;
        public Ghost Ghost;
    }

    public struct Challenge
    {
        public string Day, Circuit;
        public Weather Weather;
    }

    public static class Daily
    {
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;

        /// <summary>The web game's circuits in its own order (layouts.ts LAYOUTS): the rotation is by their places in it.</summary>
        public static readonly string[] Layouts =
        {
            "crescent-park", "southern-lake", "jade-spiral", "silver-heath", "harbour", "maple-island", "royal-park", "ardennes", "alpine-ring",
            "twin-lakes", "oasis", "pearl-sands", "baku", "suzuka", "dune-coast", "vegas", "glacier-pass", "dust-bowl", "volcano-isle",
        };

        /// <summary>A circuit added since the Daily Challenge began joins its rotation from this day (UTC).</summary>
        public static readonly Dictionary<string, string> From = new Dictionary<string, string>
        {
            { "glacier-pass", "2026-10-06" }, { "dust-bowl", "2026-10-07" }, { "dune-coast", "2026-10-08" }, { "volcano-isle", "2026-10-09" },
            { "vegas", "2026-10-10" }, { "southern-lake", "2026-10-14" }, { "jade-spiral", "2026-10-14" }, { "maple-island", "2026-10-14" },
        };

        /// <summary>From this day a day drawing yesterday's circuit is judged by the circuit yesterday actually had.</summary>
        public const string RotationFix = "2026-10-06";

        /// <summary>The day (UTC) as YYYY-MM-DD.</summary>
        public static string DayOf(DateTime utc) => utc.ToUniversalTime().ToString("yyyy-MM-dd", Inv);

        static DateTime Noon(string day) => DateTime.ParseExact(day, "yyyy-MM-dd", Inv, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal).AddHours(12);

        public static string DayBefore(string day) => Noon(day).AddDays(-1).ToString("yyyy-MM-dd", Inv);

        /// <summary>A number from `text` (FNV-1a), the same everywhere.</summary>
        public static uint Hash(string text)
        {
            uint h = 2166136261;
            foreach (char c in text)
            {
                h ^= c;
                h = unchecked(h * 16777619);
            }
            return h;
        }

        static int Cmp(string a, string b) => string.CompareOrdinal(a, b);

        /// <summary>The circuits in the rotation on `day`.</summary>
        public static List<string> LayoutsOn(string day) => Layouts.Where(id => !From.TryGetValue(id, out var from) || Cmp(day, from) >= 0).ToList();

        static string CircuitOn(string day, Func<string, List<string>> poolOn, int depth = 0)
        {
            var layouts = poolOn(day);
            string raw = layouts[(int)(Hash($"circuit:{day}") % (uint)layouts.Count)];
            string Next() => layouts[(layouts.IndexOf(raw) + 1) % layouts.Count];
            if (Cmp(day, RotationFix) < 0)
            {
                if (depth > 0) return raw;
                var drew = poolOn(DayBefore(day));
                return drew[(int)(Hash($"circuit:{DayBefore(day)}") % (uint)drew.Count)] == raw ? Next() : raw;
            }
            if (depth >= 40) return raw;
            return CircuitOn(DayBefore(day), poolOn, depth + 1) == raw ? Next() : raw;
        }

        /// <summary>`day`'s challenge: its circuit (out of `layouts`, else the day's rotation) and weather (dry most days, damp some, wet now and then).</summary>
        public static Challenge On(string day, IList<string> layouts = null)
        {
            double roll = (Hash($"weather:{day}") % 100) / 100.0;
            var w = roll < 0.65 ? Weather.Dry : roll < 0.85 ? Weather.Damp : Weather.Wet;
            var fixedPool = layouts?.ToList();
            return new Challenge { Day = day, Circuit = CircuitOn(day, fixedPool != null ? (Func<string, List<string>>)(_ => fixedPool) : LayoutsOn), Weather = w };
        }

        /// <summary>Time until the next day's challenge (midnight UTC).</summary>
        public static TimeSpan UntilNext(DateTime utc)
        {
            var u = utc.ToUniversalTime();
            return u.Date.AddDays(1) - u;
        }

        /// <summary>Whether `a` beats `b`: further, or as far sooner.</summary>
        public static bool Beats(DailyRun a, DailyRun? b) => b == null || a.Score > b.Value.Score || (a.Score == b.Value.Score && a.Time < b.Value.Time);

        /// <summary>Your streak as of `today`: days played running, up to today or yesterday (0 once a day's been missed).</summary>
        public static int StreakOn(DailyLog log, string today) => log.Last == today || log.Last == DayBefore(today) ? log.Streak : 0;

        /// <summary>A run of `day`'s challenge (and its `ghost`), into `log`: the streak, your best on the day (and, if better, to send). True if it's your best.</summary>
        public static bool LogRun(DailyLog log, string day, DailyRun run, Ghost ghost = null)
        {
            if (log.Last != day) log.Streak = log.Last == DayBefore(day) ? log.Streak + 1 : 1;
            log.Last = day;
            bool better = Beats(run, log.Best.TryGetValue(day, out var had) ? had : (DailyRun?)null);
            if (better)
            {
                log.Best[day] = run;
                // (a run that passed no checkpoint isn't one for the board)
                if (run.Score > 0) log.Pending = new DailyPending { Day = day, Run = run, Ghost = ghost };
            }
            // (a fortnight's bests are plenty)
            foreach (var d in log.Best.Keys.ToList().Take(Math.Max(0, log.Best.Count - 14))) log.Best.Remove(d);
            return better;
        }

        // ---- kept on the device (JSON) ----

        static JsonObj RunJson(DailyRun r) => new JsonObj { { "score", r.Score }, { "time", r.Time } };

        static DailyRun? RunOf(object v) =>
            v is Dictionary<string, object> d && d.TryGetValue("score", out var s) && s is double score && d.TryGetValue("time", out var t) && t is double time
                ? new DailyRun { Score = (int)score, Time = time } : (DailyRun?)null;

        public static string Write(DailyLog log)
        {
            var best = new JsonObj();
            foreach (var kv in log.Best) best[kv.Key] = RunJson(kv.Value);
            var o = new JsonObj { { "last", log.Last }, { "streak", log.Streak }, { "best", best } };
            if (log.Pending != null)
            {
                var p = new JsonObj { { "day", log.Pending.Day }, { "score", log.Pending.Run.Score }, { "time", log.Pending.Run.Time } };
                if (log.Pending.Ghost != null) p["ghost"] = log.Pending.Ghost.ToJson();
                o["pending"] = p;
            }
            return Json.Write(o);
        }

        public static DailyLog Parse(string kept)
        {
            var log = new DailyLog();
            if (!(Json.Parse(kept) is Dictionary<string, object> d)) return log;
            if (d.TryGetValue("last", out var l) && l is string last) log.Last = last;
            if (d.TryGetValue("streak", out var s) && s is double streak && streak > 0) log.Streak = (int)Math.Floor(streak);
            if (d.TryGetValue("best", out var b) && b is Dictionary<string, object> best)
                foreach (var kv in best) if (RunOf(kv.Value) is DailyRun r) log.Best[kv.Key] = r;
            if (d.TryGetValue("pending", out var p) && p is Dictionary<string, object> pd && RunOf(pd) is DailyRun pr && pd.TryGetValue("day", out var dd) && dd is string day)
                log.Pending = new DailyPending { Day = day, Run = pr, Ghost = pd.TryGetValue("ghost", out var g) ? Ghost.Parse(g) : null };
            return log;
        }

        // ---- the board's calls ----

        /// <summary>submit_daily's arguments for the best not yet sent (with its ghost, or without: a backend whose schema is older refuses one).</summary>
        public static JsonObj SubmitArgs(DailyPending run, string player, string name, bool withGhost)
        {
            var args = new JsonObj { { "p_day", run.Day }, { "p_player", player }, { "p_name", name }, { "p_score", run.Run.Score }, { "p_time", JsMath.Round(run.Run.Time * 100) / 100 } };
            if (withGhost && run.Ghost != null) args["p_ghost"] = run.Ghost.ToJson();
            return args;
        }

        public static JsonObj BoardArgs(string day, string player, int top) => new JsonObj { { "p_day", day }, { "p_player", player }, { "p_top", top } };

        public static DailyBoard ParseBoard(object v)
        {
            if (!(v is Dictionary<string, object> d) || !(d.TryGetValue("entries", out var n) && n is double entries)) return null;
            var board = new DailyBoard { Entries = (int)entries };
            if (d.TryGetValue("top", out var top) && top is List<object> list)
                foreach (var x in list) if (Entry(x) is DailyEntry e) board.Top.Add(e);
            if (d.TryGetValue("you", out var you)) board.You = Entry(you);
            return board;
        }

        static DailyEntry? Entry(object v)
        {
            if (!(v is Dictionary<string, object> d)) return null;
            if (!(d.TryGetValue("place", out var p) && p is double place && d.TryGetValue("name", out var nm) && nm is string name
                && d.TryGetValue("score", out var s) && s is double score && d.TryGetValue("time", out var t) && t is double time)) return null;
            return new DailyEntry { Place = (int)place, Name = name, Score = (int)score, Time = time, You = d.TryGetValue("you", out var y) && y is bool b && b };
        }

        /// <summary>daily_ghost's answer: the day's leading run with a sound ghost (null if there's none).</summary>
        public static DailyRival ParseRival(object v)
        {
            if (!(v is Dictionary<string, object> d)) return null;
            if (!(d.TryGetValue("name", out var nm) && nm is string name && d.TryGetValue("score", out var s) && s is double score && d.TryGetValue("time", out var t) && t is double time)) return null;
            var ghost = d.TryGetValue("ghost", out var g) ? Ghost.Parse(g) : null;
            return ghost == null ? null : new DailyRival { Name = name, Score = (int)score, Time = time, Ghost = ghost };
        }
    }
}
