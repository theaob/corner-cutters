// Steam (Steamworks.NET, only when it's in the project: README "Platforms"). Started with the game: if it wasn't
// started from Steam it's started again from there (RestartAppIfNecessary, once the app id is set below), the
// achievements set on Steam's list as the game unlocks them (their API names the game's ids in capitals, "-" as "_":
// HARD_WIN for hard-win; the list to make in Steamworks is unity/Platform/steam-achievements.csv), stored at once; the overlay (Shift+Tab, the Steam button)
// pauses the race. The save's folder is kept in step by Steam Auto-Cloud (set in Steamworks, no code).
#if STEAMWORKS_NET && (UNITY_STANDALONE || UNITY_EDITOR) && !DISABLESTEAMWORKS
using System.Collections.Generic;
using Steamworks;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class SteamPlatform : IAchievementSink
    {
        /// <summary>The game's Steam app id (Steamworks > App Admin): 0 until it has one (then it's never restarted through Steam).</summary>
        public const uint AppId = 0;

        static SteamPlatform on;
        static Callback<GameOverlayActivated_t> overlay;

        public static SteamPlatform Start()
        {
            if (on != null) return on;
            if (!Packsize.Test() || !DllCheck.Test()) { Debug.LogWarning("steam: Steamworks.NET's libraries don't match"); return null; }
            try
            {
                if (AppId != 0 && !Application.isEditor && SteamAPI.RestartAppIfNecessary(new AppId_t(AppId))) { Application.Quit(); return null; }
            }
            catch (System.DllNotFoundException e) { Debug.LogWarning($"steam: no steam_api library ({e.Message})"); return null; }
            if (!SteamAPI.Init()) { Debug.Log("steam: not running under Steam"); return null; }
            overlay = Callback<GameOverlayActivated_t>.Create(cb => Platforms.SetOverlay(cb.m_bActive != 0));
            return on = new SteamPlatform();
        }

        public static void Tick()
        {
            if (on != null) SteamAPI.RunCallbacks();
        }

        public static void Stop()
        {
            if (on == null) return;
            SteamAPI.Shutdown();
            on = null;
        }

        /// <summary>An achievement's API name in Steamworks: "hard-win" is HARD_WIN.</summary>
        public static string ApiName(string id) => id.ToUpperInvariant().Replace('-', '_');

        public void Unlocked(IEnumerable<string> ids)
        {
            bool any = false;
            foreach (var id in ids)
            {
                string name = ApiName(id);
                if (SteamUserStats.GetAchievement(name, out bool got) && !got) any |= SteamUserStats.SetAchievement(name);
            }
            if (any) SteamUserStats.StoreStats();
        }
    }
}
#endif
