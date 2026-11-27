// Whether the device asks for less motion, for MOTION: AUTO (f1/access.ts reads prefers-reduced-motion; Unity has no
// such call, so each platform's own is asked): Android's "remove animations" (the animator duration scale at 0),
// iOS's Reduce Motion (Plugins/iOS/ReduceMotion.mm), Windows's "animation effects" off, macOS's Reduce Motion, and
// GNOME's animations off on Linux. Anywhere else, or if asking fails: no. Asked as the game starts and each time it
// comes back to the front (the setting may have changed meanwhile).
using System;
using System.Runtime.InteropServices;
using UnityEngine;

namespace CornerCutters.Game
{
    public static class SystemMotion
    {
        /// <summary>Ask the device again, into Options.SystemMotionReduced.</summary>
        public static void Read()
        {
            try { Options.SystemMotionReduced = Ask(); }
            catch (Exception e)
            {
                Debug.LogWarning($"reduce motion: couldn't ask ({e.Message})");
                Options.SystemMotionReduced = false;
            }
        }

#if UNITY_ANDROID && !UNITY_EDITOR
        static bool Ask()
        {
            using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
            using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
            using (var resolver = activity.Call<AndroidJavaObject>("getContentResolver"))
            using (var global = new AndroidJavaClass("android.provider.Settings$Global"))
                return global.CallStatic<float>("getFloat", resolver, "animator_duration_scale", 1f) == 0f;
        }
#elif UNITY_IOS && !UNITY_EDITOR
        [DllImport("__Internal")] static extern bool cc_reduceMotion();
        static bool Ask() => cc_reduceMotion();
#elif UNITY_STANDALONE_WIN || UNITY_EDITOR_WIN
        // (SPI_GETCLIENTAREAANIMATION: the "Animation effects" switch in Settings > Accessibility > Visual effects)
        [DllImport("user32.dll", SetLastError = true)] static extern bool SystemParametersInfo(uint action, uint param, ref bool value, uint ini);
        static bool Ask()
        {
            bool on = true;
            return SystemParametersInfo(0x1042, 0, ref on, 0) && !on;
        }
#elif UNITY_STANDALONE_OSX || UNITY_EDITOR_OSX
        // ([NSWorkspace sharedWorkspace].accessibilityDisplayShouldReduceMotion, through the Objective-C runtime)
        const string ObjC = "/usr/lib/libobjc.A.dylib";
        [DllImport(ObjC)] static extern IntPtr objc_getClass(string name);
        [DllImport(ObjC)] static extern IntPtr sel_registerName(string name);
        [DllImport(ObjC, EntryPoint = "objc_msgSend")] static extern IntPtr Send(IntPtr target, IntPtr selector);
        [DllImport(ObjC, EntryPoint = "objc_msgSend")] static extern bool SendBool(IntPtr target, IntPtr selector);
        [DllImport(ObjC, EntryPoint = "objc_msgSend")] static extern bool SendBool(IntPtr target, IntPtr selector, IntPtr arg);
        static bool Ask()
        {
            var workspace = Send(objc_getClass("NSWorkspace"), sel_registerName("sharedWorkspace"));
            var ask = sel_registerName("accessibilityDisplayShouldReduceMotion");
            return workspace != IntPtr.Zero && SendBool(workspace, sel_registerName("respondsToSelector:"), ask) && SendBool(workspace, ask);
        }
#elif UNITY_STANDALONE_LINUX || UNITY_EDITOR_LINUX
        // (GNOME's Settings > Accessibility > Reduce Animation: org.gnome.desktop.interface enable-animations)
        static bool Ask()
        {
            var p = new System.Diagnostics.ProcessStartInfo("gsettings", "get org.gnome.desktop.interface enable-animations")
            {
                RedirectStandardOutput = true, UseShellExecute = false, CreateNoWindow = true,
            };
            using (var run = System.Diagnostics.Process.Start(p))
            {
                if (run == null || !run.WaitForExit(500)) return false;
                return run.StandardOutput.ReadToEnd().Trim() == "false";
            }
        }
#else
        static bool Ask() => false;
#endif
    }
}
