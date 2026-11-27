// The settings of feel, picture and access, kept on the device (PlayerPrefs, the web game's settings.* keys):
// VIBRATION (engine/haptics.ts), SCREEN SHAKE (f1/shake.ts: on unless turned off, off to start with under less motion),
// MOTION (f1/access.ts: AUTO follows the device, REDUCED or FULL over it), TEXT (LARGE: menus and messages a fifth
// bigger), COLOURS (COLOUR-SAFE splits) and GRAPHICS (f1/graphics.ts: AUTO, HIGH, LOW, BATTERY SAVER).
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public enum MotionSetting { Auto, Reduced, Full }

    public static class Options
    {
        public static bool Vibration
        {
            get => PlayerPrefs.GetInt("settings.vibration", 1) != 0;
            set => PlayerPrefs.SetInt("settings.vibration", value ? 1 : 0);
        }

        /// <summary>SCREEN SHAKE: as set, else on unless less motion is wanted (the default follows MOTION as it changes)</summary>
        public static bool Shake
        {
            get { int v = PlayerPrefs.GetInt("settings.shake", -1); return v < 0 ? !MotionReduced : v != 0; }
            set => PlayerPrefs.SetInt("settings.shake", value ? 1 : 0);
        }

        public static MotionSetting Motion
        {
            get { int v = PlayerPrefs.GetInt("settings.motion", 0); return v >= 0 && v <= 2 ? (MotionSetting)v : MotionSetting.Auto; }
            set => PlayerPrefs.SetInt("settings.motion", (int)value);
        }

        /// <summary>The device asks for less motion. (No engine-wide way to ask the system in Unity: none, until a platform reports it.)</summary>
        public static bool SystemMotionReduced;

        /// <summary>Less motion wanted: the setting if it's set, else the device's ask. No screen shake unless turned on, a gentler speed zoom.</summary>
        public static bool MotionReduced => Motion == MotionSetting.Auto ? SystemMotionReduced : Motion == MotionSetting.Reduced;

        public static bool LargeText
        {
            get => PlayerPrefs.GetInt("settings.largeText", 0) != 0;
            set => PlayerPrefs.SetInt("settings.largeText", value ? 1 : 0);
        }

        /// <summary>the size menus and messages are drawn at (LARGE: a fifth bigger)</summary>
        public static float TextScale => LargeText ? Access.LargeText : 1f;

        public static bool ColourSafe
        {
            get => PlayerPrefs.GetInt("settings.colourSafe", 0) != 0;
            set => PlayerPrefs.SetInt("settings.colourSafe", value ? 1 : 0);
        }

        public static GraphicsSetting Graphics
        {
            get { int v = PlayerPrefs.GetInt("settings.graphics", 0); return v >= 0 && v <= 3 ? (GraphicsSetting)v : GraphicsSetting.Auto; }
            set { PlayerPrefs.SetInt("settings.graphics", (int)value); Picture.ApplyFrameCap(); }
        }

        /// <summary>A split's colour, as COLOURS says.</summary>
        public static Color SplitColor(SplitMark m) => TrackView.Hex(Access.SplitColor(m, ColourSafe));
        public static string SplitWord(SplitMark m) => Access.SplitWord(m, ColourSafe);
    }
}
