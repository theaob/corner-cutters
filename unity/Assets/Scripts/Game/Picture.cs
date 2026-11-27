// The picture's quality (engine/render/quality.ts, f1/race/qualityWatch.ts, f1/graphics.ts): GRAPHICS AUTO lets the
// governor step down (high, medium, low, minimum) when the frames run slow, HIGH and LOW hold a level, BATTERY SAVER is
// LOW at 30 frames a second. A level here is the finish pass's: bloom on or off, the tilt-shift's blur on or off, and
// the passes drawn at full or half the screen's size (the Switch's budget); the ground's shadows are baked, so the web
// game's shadow map sizes have nothing to do. Where AUTO settled is kept on the device (three days, this version), so
// the next race starts there. And the warm-up (engine/render/warm.ts): the circuit drawn once whole, nothing culled,
// while it loads, so nothing compiles its shaders or sends its meshes the first time it comes into sight mid-race.
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public static class Picture
    {
        static QualityGovernor governor;
        static int keptLevel = -1;
        static bool keptLocked, wasHeld;
        /// <summary>frames to leave out after a pause or a load (the first frame back measures the wait)</summary>
        public static int Settle;

        /// <summary>the level now (an index of QualityGovernor.Levels)</summary>
        public static int Level => governor?.Level ?? 0;
        public static QualityLevel Now => QualityGovernor.Levels[Level];

        static string Version => Application.version ?? "";

        static double NowMs => System.DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

        static void Start()
        {
            // (kept: "level,locked,at,version")
            int level = 0;
            bool locked = false;
            var parts = PlayerPrefs.GetString("device.quality", "").Split(',');
            if (parts.Length == 4 && int.TryParse(parts[0], out int l) && double.TryParse(parts[2], System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out double at)
                && QualityGovernor.Kept(l, parts[1] == "1", at, parts[3], NowMs, Version, out int kl, out bool kk))
            {
                level = kl;
                locked = kk;
            }
            governor = new QualityGovernor(level, locked);
            keptLevel = level;
            keptLocked = locked;
        }

        /// <summary>One frame's watch, `real` seconds long (the frame's real length); the level now.</summary>
        public static int Step(float real)
        {
            if (governor == null) Start();
            int held = QualityGovernor.HeldLevel(Options.Graphics);
            if (held >= 0)
            {
                governor.Level = held;
                governor.Locked = true;
            }
            else if (wasHeld)
            {
                // (back to AUTO: the governor watches again, from full quality)
                governor = new QualityGovernor();
            }
            wasHeld = held >= 0;
            if (held < 0)
            {
                if (Settle > 0) Settle--;
                else governor.Sample(Mathf.Min(real, 0.25f));
                if (governor.Level != keptLevel || governor.Locked != keptLocked)
                {
                    keptLevel = governor.Level;
                    keptLocked = governor.Locked;
                    PlayerPrefs.SetString("device.quality", string.Join(",", keptLevel, keptLocked ? "1" : "0", NowMs.ToString(System.Globalization.CultureInfo.InvariantCulture), Version));
                }
            }
            var q = Now;
            TiltShiftEffect.BloomOn = q.Bloom;
            TiltShiftEffect.BlurOn = q.Blur;
            TiltShiftEffect.HalfSize = q.Res < 2;
            return governor.Level;
        }

        /// <summary>The frame rate GRAPHICS asks for: BATTERY SAVER 30 a second; else the screen's (desktop: vsync; a phone: 60).</summary>
        public static void ApplyFrameCap()
        {
            // (the project's own vsync, put back when BATTERY SAVER is left)
            if (vSync < 0) vSync = QualitySettings.vSyncCount;
            int cap = QualityGovernor.FrameCap(Options.Graphics);
            if (cap > 0)
            {
                QualitySettings.vSyncCount = 0;
                Application.targetFrameRate = cap;
            }
            else
            {
                QualitySettings.vSyncCount = vSync;
                Application.targetFrameRate = Application.isMobilePlatform ? 60 : -1;
            }
        }

        static int vSync = -1;

        /// <summary>Draw the scene once with everything in it, nothing culled (behind the loading): the shaders compiled and the meshes sent now.</summary>
        public static void WarmUp(Camera cam)
        {
            if (cam == null) return;
            try
            {
                cam.cullingMatrix = Matrix4x4.Ortho(-4000, 4000, -4000, 4000, -4000, 4000) * cam.worldToCameraMatrix;
                cam.Render();
            }
            finally
            {
                cam.ResetCullingMatrix();
            }
            // (the first frames after it measure the load, not the picture)
            Settle = 3;
        }
    }
}
