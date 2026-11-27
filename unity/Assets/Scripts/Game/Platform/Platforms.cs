// What differs by where the game runs: what the play stats call it, whether the Championship is sold (phones) or the
// game bought whole (computers, the Switch), where the save is kept, and the platform's own services, each behind a
// small interface so the game never names a store's SDK: achievements (Steam), the shop (Google Play, the App Store),
// the daily reminder (a phone's notifications), and the platform's overlay (Steam's: the race pauses under it). Each
// SDK's code is compiled only when its package is in the project (Steamworks.NET, Unity IAP, Mobile Notifications:
// the asmdef's versionDefines say STEAMWORKS_NET, UNITY_PURCHASING, UNITY_MOBILE_NOTIFICATIONS), so the project opens
// and builds without any of them; README "Platforms" says what to add for each store.
using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

namespace CornerCutters.Game
{
    /// <summary>Achievements on the platform's own list (Steam), beside the game's own cabinet.</summary>
    public interface IAchievementSink
    {
        /// <summary>these unlocked (the game's ids: "champion", "box"...); sent again at each start, so none is missed</summary>
        void Unlocked(IEnumerable<string> ids);
    }

    /// <summary>The store the Championship is bought in (purchase.ts Shop).</summary>
    public interface IShop
    {
        /// <summary>the store is up (reached, the product found)</summary>
        bool Ready { get; }
        /// <summary>its price as the store shows it, or null</summary>
        string Price { get; }
        /// <summary>why it can't be bought (no store here, offline), or null</summary>
        string Error { get; }
        /// <summary>buy it: `done` told once the store's finished (true: it's yours)</summary>
        void Buy(Action<bool> done);
        /// <summary>a purchase made before (another install) looked for: `done` true if it's yours</summary>
        void Restore(Action<bool> done);
    }

    /// <summary>A phone's notifications, for the daily reminder.</summary>
    public interface IReminderSink
    {
        /// <summary>the week's reminders, in place of those planned before (none: all cancelled)</summary>
        void Plan(List<Core.Reminders.Due> due);
        /// <summary>ask to show notifications (Android 13 and on, iOS): `done` true if allowed</summary>
        void Ask(Action<bool> done);
    }

    public static class Platforms
    {
        /// <summary>The platform as the play stats say it (supabase/schema.sql events_platform_check).</summary>
        public static string StatsName => NameOf(Application.platform);

        public static string NameOf(RuntimePlatform p) => p switch
        {
            RuntimePlatform.Android => "android",
            RuntimePlatform.IPhonePlayer => "ios",
            RuntimePlatform.Switch => "switch",
            RuntimePlatform.WindowsPlayer or RuntimePlatform.WindowsEditor => "windows",
            RuntimePlatform.OSXPlayer or RuntimePlatform.OSXEditor => "macos",
            RuntimePlatform.LinuxPlayer or RuntimePlatform.LinuxEditor => "linux",
            _ => null,
        };

        public static bool Phone => Application.platform == RuntimePlatform.Android || Application.platform == RuntimePlatform.IPhonePlayer;
        public static bool Switch => Application.platform == RuntimePlatform.Switch;

        /// <summary>Whether the Championship is sold in this build (the phones'); on a computer or the Switch the game's bought whole.</summary>
        public static bool Paywall => Phone || ForcePaywall;
        /// <summary>(the editor playing as a phone build does: a phone's paywall, to try the shop)</summary>
        public static bool ForcePaywall;

        /// <summary>Whether the Championship is yours (as saved; the store checks it at each start).</summary>
        public static bool Bought
        {
            get => Save.Bool("progress", "championship", false);
            set => Save.Set("progress", "championship", value ? (object)true : null);
        }

        public static bool OwnsChampionship => Core.Paywall.ChampionshipOpen(Paywall, Bought);

        /// <summary>The save's keeper here: the Switch's save data, a computer's files (Steam Cloud's folder), a phone's PlayerPrefs.</summary>
        public static ISaveStore SaveStore()
        {
#if UNITY_SWITCH && !UNITY_EDITOR
            return new SwitchSave();
#else
            if (Phone) return new PrefsStore();
            return new FileStore(Path.Combine(Application.persistentDataPath, "save"));
#endif
        }

        public static readonly List<IAchievementSink> Achievements = new List<IAchievementSink>();
        /// <summary>the store, on a phone build with one (null: none here)</summary>
        public static IShop Shop;
        public static IReminderSink Reminders;

        /// <summary>the platform's overlay is up (Steam's): the race pauses under it</summary>
        public static bool OverlayUp;
        /// <summary>told as the overlay comes up</summary>
        public static event Action OverlayOpened;
        internal static void SetOverlay(bool up)
        {
            bool was = OverlayUp;
            OverlayUp = up;
            if (up && !was) OverlayOpened?.Invoke();
        }

        /// <summary>The platform's services started (as the game starts), and the achievements won so far sent to them.</summary>
        public static void Start(IEnumerable<string> unlocked)
        {
#if STEAMWORKS_NET && (UNITY_STANDALONE || UNITY_EDITOR) && !DISABLESTEAMWORKS
            var steam = SteamPlatform.Start();
            if (steam != null) Achievements.Add(steam);
#endif
#if UNITY_PURCHASING
            if (Paywall) Shop = new StoreShop();
#endif
#if UNITY_MOBILE_NOTIFICATIONS && (UNITY_ANDROID || UNITY_IOS)
            Reminders = new PhoneReminders();
#endif
            Unlocked(unlocked);
        }

        /// <summary>Achievements unlocked: on to each platform list.</summary>
        public static void Unlocked(IEnumerable<string> ids)
        {
            var list = new List<string>(ids);
            if (list.Count == 0) return;
            foreach (var a in Achievements)
            {
                try { a.Unlocked(list); }
                catch (Exception e) { Debug.LogWarning($"achievements: {e.Message}"); }
            }
        }

        /// <summary>A frame (the platform's callbacks run).</summary>
        public static void Tick()
        {
#if UNITY_SWITCH && !UNITY_EDITOR
            SwitchSave.Tick();
#endif
#if UNITY_MOBILE_NOTIFICATIONS && (UNITY_ANDROID || UNITY_IOS)
            (Reminders as PhoneReminders)?.Tick();
#endif
#if STEAMWORKS_NET && (UNITY_STANDALONE || UNITY_EDITOR) && !DISABLESTEAMWORKS
            SteamPlatform.Tick();
#endif
        }

        public static void Stop()
        {
#if STEAMWORKS_NET && (UNITY_STANDALONE || UNITY_EDITOR) && !DISABLESTEAMWORKS
            SteamPlatform.Stop();
#endif
        }
    }
}
