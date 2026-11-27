// Your streak and the looks it earns: a port of src/f1/streak.ts and carStyle.ts. The days running you've played (a
// race finished, a Daily Challenge run over), by your own clock's days; one day missed a week is forgiven (the streak
// saved, not grown), a second ends it. Reaching 3, 7, 14, 21, 30, 45, 60, 90 and 120 days earns a look for your car,
// yours for good, picked in the shop.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace CornerCutters.Core
{
    public sealed class Streak
    {
        /// <summary>the last day played; days running up to it; the longest ever (what the rewards go by); the last day a miss was forgiven</summary>
        public string Last;
        public int Days, Best;
        public string Forgiven;
    }

    /// <summary>A look for your car, earned by a streak of `Days`.</summary>
    public sealed class Reward
    {
        public string Id, Name;
        public int Days;
    }

    /// <summary>What playing on a day did: the days now, a new day for it, a miss forgiven, the rewards reached for the first time.</summary>
    public struct StreakStep
    {
        public int Days;
        public bool Grew, Forgave;
        public List<Reward> Rewards;
    }

    /// <summary>A car's look: your team's livery as it is, or one a streak has earned (a helmet, or paint over the team's).</summary>
    public sealed class CarStyle
    {
        public string Id, Name;
        /// <summary>the streak's days that earn it (0: always yours)</summary>
        public int Days;
        /// <summary>the helmet: a colour (0xRRGGBB), -1 the team's white; Gold and Led the special ones</summary>
        public int Helmet = -1;
        public bool Gold, Led;
        /// <summary>paint over the team's (-1: the team's own); Pattern null: the team's</summary>
        public int Body = -1, Stripe = -1, Accent = -1;
        public string Pattern;
    }

    public static class Streaks
    {
        static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
        /// <summary>days between two forgiven misses, at the least</summary>
        public const int ForgiveEvery = 7;

        public static readonly Reward[] Rewards =
        {
            new Reward { Id = "silver-helmet", Days = 3, Name = "SILVER HELMET" },
            new Reward { Id = "neon-helmet", Days = 7, Name = "NEON HELMET" },
            new Reward { Id = "gold-wings", Days = 14, Name = "GOLD WINGS" },
            new Reward { Id = "golden-helmet", Days = 21, Name = "GOLDEN HELMET" },
            new Reward { Id = "black-gold", Days = 30, Name = "BLACK & GOLD" },
            new Reward { Id = "led-helmet", Days = 45, Name = "LED HELMET" },
            new Reward { Id = "night-racer", Days = 60, Name = "NIGHT RACER" },
            new Reward { Id = "retro-racer", Days = 90, Name = "RETRO RACER" },
            new Reward { Id = "chequered", Days = 120, Name = "CHEQUERED" },
        };

        /// <summary>The day by this device's clock, YYYY-MM-DD.</summary>
        public static string LocalDay(DateTime local) => local.ToString("yyyy-MM-dd", Inv);

        static DateTime Noon(string day) => DateTime.ParseExact(day, "yyyy-MM-dd", Inv, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal).AddHours(12);

        /// <summary>Whole days from day `a` to day `b`.</summary>
        public static int DaysBetween(string a, string b) => (int)Math.Round((Noon(b) - Noon(a)).TotalDays);

        public static string AddDays(string day, int n) => Noon(day).AddDays(n).ToString("yyyy-MM-dd", Inv);

        static bool CanForgive(Streak s, string today) => s.Forgiven == null || DaysBetween(s.Forgiven, today) >= ForgiveEvery;

        /// <summary>The streak as of `today`: its days if it's still alive, else 0.</summary>
        public static int Now(Streak s, string today)
        {
            if (s.Last == null) return 0;
            int gap = DaysBetween(s.Last, today);
            return gap <= 1 || (gap == 2 && CanForgive(s, today)) ? s.Days : 0;
        }

        /// <summary>Whether today's still to play for the streak to go on.</summary>
        public static bool Due(Streak s, string today) => Now(s, today) > 0 && s.Last != today;

        /// <summary>Played on `today`: the streak grown (once a day), a missed day forgiven if it can be; the rewards newly reached.</summary>
        public static StreakStep PlayedOn(Streak s, string today)
        {
            if (s.Last == today) return new StreakStep { Days = s.Days, Rewards = new List<Reward>() };
            int gap = s.Last != null ? DaysBetween(s.Last, today) : int.MaxValue;
            bool forgave = false;
            if (gap == 1) s.Days += 1;
            else if (gap == 2 && CanForgive(s, today))
            {
                s.Days += 1;
                s.Forgiven = today;
                forgave = true;
            }
            else s.Days = 1;
            s.Last = today;
            int before = s.Best;
            s.Best = Math.Max(s.Best, s.Days);
            return new StreakStep { Days = s.Days, Grew = true, Forgave = forgave, Rewards = Rewards.Where(r => r.Days > before && r.Days <= s.Best).ToList() };
        }

        public static List<Reward> Earned(int best) => Rewards.Where(r => best >= r.Days).ToList();
        public static Reward NextReward(int days) => Rewards.FirstOrDefault(r => r.Days > days);

        public static string Write(Streak s)
        {
            var o = new JsonObj { { "days", s.Days }, { "best", s.Best } };
            if (s.Last != null) o["last"] = s.Last;
            if (s.Forgiven != null) o["forgiven"] = s.Forgiven;
            return Json.Write(o);
        }

        /// <summary>The streak as kept (a Daily Challenge streak from before it carries over: its last day and length).</summary>
        public static Streak Parse(string kept, DailyLog daily = null)
        {
            if (Json.Parse(kept) is Dictionary<string, object> v && v.TryGetValue("days", out var d) && d is double days)
            {
                int D = Math.Max(0, (int)Math.Floor(days));
                return new Streak
                {
                    Last = v.TryGetValue("last", out var l) ? l as string : null, Days = D,
                    Best = Math.Max(0, v.TryGetValue("best", out var b) && b is double best ? (int)Math.Floor(best) : D),
                    Forgiven = v.TryGetValue("forgiven", out var f) ? f as string : null,
                };
            }
            return daily?.Last != null && daily.Streak > 0 ? new Streak { Last = daily.Last, Days = daily.Streak, Best = daily.Streak } : new Streak();
        }

        // ---- the looks (carStyle.ts) ----

        const int GoldPaint = 0xf2c14e;

        public static readonly CarStyle[] Styles = new[] { new CarStyle { Id = "standard", Name = "NO CUSTOMIZATION" } }.Concat(Rewards.Select(r =>
        {
            var s = new CarStyle { Id = r.Id, Name = r.Name, Days = r.Days };
            switch (r.Id)
            {
                case "silver-helmet": s.Helmet = 0xc9cdd8; break;
                case "neon-helmet": s.Helmet = 0x39ff14; break;
                case "golden-helmet": s.Gold = true; break;
                case "led-helmet": s.Led = true; break;
                case "night-racer": s.Body = 0x0b1026; s.Stripe = 0x00e5ff; s.Accent = 0xff2bd6; s.Pattern = "chevron"; break;
                case "retro-racer": s.Body = 0xf2e6c8; s.Stripe = 0xc8372d; s.Accent = 0x1f4e79; s.Pattern = "twin"; break;
                case "chequered": s.Body = 0xf4f4f8; s.Stripe = 0x15151c; s.Accent = 0x15151c; s.Pattern = "band"; break;
                case "gold-wings": s.Stripe = GoldPaint; break;
                default: s.Body = 0x17161f; s.Stripe = GoldPaint; s.Accent = 0x17161f; break;
            }
            return s;
        })).ToArray();

        /// <summary>The looks a best streak of `best` has earned (NO CUSTOMIZATION always).</summary>
        public static List<CarStyle> StylesFor(int best)
        {
            var got = new HashSet<string>(Earned(best).Select(r => r.Id));
            return Styles.Where(s => s.Days == 0 || got.Contains(s.Id)).ToList();
        }

        /// <summary>The look picked (`id`), if `best` has earned it; else NO CUSTOMIZATION.</summary>
        public static CarStyle StyleOf(string id, int best) => StylesFor(best).FirstOrDefault(s => s.Id == id) ?? Styles[0];
    }
}
