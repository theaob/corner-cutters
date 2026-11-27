// DAILY REMINDER in the settings, on a phone (reminder.ts): OFF, or an hour (09:00, 12:00, 18:00, 20:00) at which a
// notification comes on a day you haven't played yet, with the day's challenge and your streak; kept as the web
// game keeps it (settings.reminder: "off" or the hour). The week ahead is planned afresh as the game starts and as
// it's put away (played today: today's dropped).
using System.Collections.Generic;
using CornerCutters.Core;

namespace CornerCutters.Game
{
    public static class DailyReminder
    {
        /// <summary>whether this build can remind (a phone, with the notifications package)</summary>
        public static bool Here => Platforms.Reminders != null;

        /// <summary>the hour, or 0: off (or never asked)</summary>
        public static int Hour
        {
            get
            {
                var v = Save.Get("settings", "reminder");
                return v is double d && System.Array.IndexOf(Reminders.Hours, (int)d) >= 0 ? (int)d : 0;
            }
        }

        public static string NameOf(int hour) => hour == 0 ? "OFF" : $"{hour:00}:00";

        /// <summary>The next setting along (or back), asked for if it's on: kept, and the week planned.</summary>
        public static void Turn(int step)
        {
            var all = new List<int> { 0 };
            all.AddRange(Reminders.Hours);
            int at = System.Math.Max(0, all.IndexOf(Hour));
            int next = all[((at + step) % all.Count + all.Count) % all.Count];
            if (next == 0) { Set(0); return; }
            Platforms.Reminders.Ask(ok => Set(ok ? next : 0));
        }

        static void Set(int hour)
        {
            Save.Set("settings", "reminder", hour == 0 ? (object)"off" : (double)hour);
            Plan();
        }

        /// <summary>The week's reminders planned afresh, as the setting has them (cancelled when it's off).</summary>
        public static void Plan()
        {
            if (!Here) return;
            int hour = Hour;
            var due = hour == 0 ? new List<Reminders.Due>() : Reminders.Plan(System.DateTime.Now, hour, RaceController.LoadStreak(), Menu.CircuitName);
            try { Platforms.Reminders.Plan(due); }
            catch (System.Exception e) { UnityEngine.Debug.LogWarning($"reminders: {e.Message}"); }
        }
    }
}
