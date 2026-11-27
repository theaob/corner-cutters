// What's open, by where the game's sold (purchase.ts, unlocks.ts), and the daily reminder's plan (reminder.ts).
// On a phone the game is free with Crescent Park open in every mode; the Championship, and with it every other circuit
// (each reached in a Championship, as before), is one purchase ("championship"), kept in the save as
// progress.championship. On a computer and the Switch the game is bought, so everything is open from the start. A
// circuit is open once a Championship has reached it, or once it has a record (a save from before), or it's free.
// Engine-free.
using System;
using System.Collections.Generic;
using System.Linq;

namespace CornerCutters.Core
{
    public static class Paywall
    {
        /// <summary>the product in the Play Console and App Store Connect: one-time ("managed" / non-consumable)</summary>
        public const string ChampionshipProduct = "championship";

        /// <summary>Whether the Championship is open: without a paywall, always; else once bought.</summary>
        public static bool ChampionshipOpen(bool paywall, bool bought) => !paywall || bought;

        /// <summary>
        /// The circuits open by what's been reached (unlocks.ts openCircuits): the first of `circuits`, the `free` ones,
        /// those `unlocked` so far, and any with a record (ids like "silver-heath:wet" included).
        /// </summary>
        public static HashSet<string> Reached(IList<string> circuits, IEnumerable<string> unlocked, IEnumerable<string> recordIds, IEnumerable<string> free)
        {
            var known = new HashSet<string>(circuits);
            var open = new HashSet<string>();
            if (circuits.Count > 0) open.Add(circuits[0]);
            foreach (var f in free) if (known.Contains(f)) open.Add(f);
            foreach (var id in unlocked.Concat(recordIds.Select(r => r.Split(':')[0]))) if (known.Contains(id)) open.Add(id);
            return open;
        }

        /// <summary>
        /// The circuits open for a Quick Race, a Time Attack or a Time Trial (purchase.ts circuitsOpen): those `reached`
        /// with the Championship `owned`, else the first only; the `free` ones either way.
        /// </summary>
        public static HashSet<string> CircuitsOpen(bool owned, string first, IEnumerable<string> reached, IEnumerable<string> free)
        {
            var open = owned ? new HashSet<string>(reached) : new HashSet<string> { first };
            foreach (var f in free) open.Add(f);
            return open;
        }

        /// <summary>A locked circuit's line (circuitSelect.ts).</summary>
        public static string LockedLine(bool owned) => owned ? "LOCKED · REACH IT IN A CHAMPIONSHIP" : "LOCKED · COMES WITH THE CHAMPIONSHIP";
    }

    /// <summary>The daily reminder (reminder.ts): at an hour picked, on a day not yet played, the day's challenge in it.</summary>
    public static class Reminders
    {
        /// <summary>the hours it can come at (local time); 0 is OFF</summary>
        public static readonly int[] Hours = { 9, 12, 18, 20 };
        public const int PlanDays = 7, FirstId = 4100;

        public struct Due { public int Id; public DateTime At; public string Title, Body; }

        /// <summary>A reminder's words: `circuit` (its name) and `weather` (DRY, DAMP, WET) the day's challenge, `streak` your streak as it would stand then.</summary>
        public static (string title, string body) Text(string circuit, string weather, int streak)
        {
            string what = $"{circuit} · {Lang.Lower(Lang.T(weather))}";
            return streak > 0
                ? (Lang.T("Keep your {n}-day streak going", "n", streak), Lang.T("Today's Daily Challenge: {what}. Three new missions too.", "what", what))
                : (Lang.T("Today's Daily Challenge"), Lang.T("{what}. Three new missions, and a streak to start.", "what", what));
        }

        /// <summary>
        /// The reminders due from `now` (local time): one a day at `hour` for PlanDays days, from tomorrow if you've played
        /// today; `nameOf` a circuit's name.
        /// </summary>
        public static List<Due> Plan(DateTime now, int hour, Streak s, Func<string, string> nameOf)
        {
            string today = Streaks.LocalDay(now);
            var out_ = new List<Due>();
            for (int k = s.Last == today ? 1 : 0; k < PlanDays; k++)
            {
                string day = Streaks.AddDays(today, k);
                var parts = day.Split('-');
                var at = new DateTime(int.Parse(parts[0]), int.Parse(parts[1]), int.Parse(parts[2]), hour, 0, 0, DateTimeKind.Local);
                if (at <= now.AddMinutes(1)) continue;
                var c = Daily.On(Daily.DayOf(at.ToUniversalTime()));
                var (title, body) = Text(nameOf(c.Circuit), c.Weather == Weather.Wet ? "WET" : c.Weather == Weather.Damp ? "DAMP" : "DRY", Streaks.Now(s, day));
                out_.Add(new Due { Id = FirstId + k, At = at, Title = title, Body = body });
            }
            return out_;
        }
    }
}
