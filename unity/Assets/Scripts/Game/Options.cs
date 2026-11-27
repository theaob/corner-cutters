// The settings of feel, picture and access, kept in the save's settings section (the web game's names and values):
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
            get => Save.Bool("settings", "vibration", true);
            set => Save.Set("settings", "vibration", value);
        }

        /// <summary>SCREEN SHAKE: as set, else on unless less motion is wanted (the default follows MOTION as it changes)</summary>
        public static bool Shake
        {
            get => Save.Get("settings", "shake") is bool b ? b : !MotionReduced;
            set => Save.Set("settings", "shake", value);
        }

        public static MotionSetting Motion
        {
            get { string v = Save.String("settings", "motion"); return v == "reduced" ? MotionSetting.Reduced : v == "full" ? MotionSetting.Full : MotionSetting.Auto; }
            set => Save.Set("settings", "motion", value == MotionSetting.Reduced ? "reduced" : value == MotionSetting.Full ? "full" : "auto");
        }

        /// <summary>The device asks for less motion. (No engine-wide way to ask the system in Unity: none, until a platform reports it.)</summary>
        public static bool SystemMotionReduced;

        /// <summary>Less motion wanted: the setting if it's set, else the device's ask. No screen shake unless turned on, a gentler speed zoom.</summary>
        public static bool MotionReduced => Motion == MotionSetting.Auto ? SystemMotionReduced : Motion == MotionSetting.Reduced;

        public static bool LargeText
        {
            get => Save.Bool("settings", "largeText", false);
            set => Save.Set("settings", "largeText", value);
        }

        /// <summary>the size menus and messages are drawn at (LARGE: a fifth bigger)</summary>
        public static float TextScale => LargeText ? Access.LargeText : 1f;

        public static bool ColourSafe
        {
            get => Save.Bool("settings", "colourSafe", false);
            set => Save.Set("settings", "colourSafe", value);
        }

        public static GraphicsSetting Graphics
        {
            get { int i = System.Array.IndexOf(GraphicsIds, Save.String("settings", "graphics")); return i < 0 ? GraphicsSetting.Auto : (GraphicsSetting)i; }
            set { Save.Set("settings", "graphics", GraphicsIds[(int)value]); Picture.ApplyFrameCap(); }
        }

        /// <summary>GRAPHICS as the save holds it (f1/graphics.ts), in GraphicsSetting's order</summary>
        static readonly string[] GraphicsIds = { "auto", "high", "low", "saver" };

        /// <summary>WALK THE GRID (f1/gridPan.ts): on unless turned off</summary>
        public static bool GridWalk
        {
            get => Save.Bool("settings", "gridWalk", true);
            set => Save.Set("settings", "gridWalk", value);
        }

        /// <summary>A split's colour, as COLOURS says.</summary>
        public static Color SplitColor(SplitMark m) => TrackView.Hex(Access.SplitColor(m, ColourSafe));
        public static string SplitWord(SplitMark m) => Access.SplitWord(m, ColourSafe);
    }
}
