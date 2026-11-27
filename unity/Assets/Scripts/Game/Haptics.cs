// Vibration (engine/haptics.ts, f1/rumble.ts's lengths): the pad's motors when you drive with a pad, the phone's
// vibrator on a phone. A pad can't buzz a length on its own, so its motors run at a strength chosen by the length (the
// web game's iPhone taps: the kerbs' and grass's short pulses light, a crash medium, a wreck heavy) until the time is up.
// Off in the settings (VIBRATION), paused, or out of sight: still.
using UnityEngine;
using UnityEngine.InputSystem;

namespace CornerCutters.Game
{
    public static class Haptics
    {
        static Gamepad buzzing;
        static float until;

        /// <summary>How hard a buzz of `ms` is (0…1): light under 20 ms, medium under 100, heavy past it.</summary>
        public static float StrengthFor(double ms) => ms < 20 ? 0.25f : ms < 100 ? 0.55f : 1f;

        /// <summary>Vibrate for `ms` milliseconds on what you're driving with, if vibration is on and it can.</summary>
        public static void Vibrate(double ms, InputSource source)
        {
            if (ms <= 0 || !Options.Vibration) return;
            if (source == InputSource.Gamepad)
            {
                var g = Gamepad.current;
                if (g == null) return;
                float s = StrengthFor(ms);
                // (the low motor rumbles, the high one buzzes: a kerb's patter on the high one alone)
                g.SetMotorSpeeds(ms < 20 ? 0 : s, s);
                buzzing = g;
                until = Mathf.Max(until, Time.unscaledTime + (float)ms / 1000f);
            }
            else if (source == InputSource.Touch) Phone((long)System.Math.Round(ms));
        }

        /// <summary>Each frame: the pad's motors stop when the buzz is over.</summary>
        public static void Tick()
        {
            if (buzzing != null && Time.unscaledTime >= until) Stop();
        }

        /// <summary>Stop now (paused, out of sight, the race over).</summary>
        public static void Stop()
        {
            if (buzzing != null) buzzing.ResetHaptics();
            buzzing = null;
            until = 0;
        }

#if UNITY_ANDROID
        // (never called: Unity adds the VIBRATE permission to the manifest when it sees this)
        static void KeepPermission() => Handheld.Vibrate();
#endif

        static void Phone(long ms)
        {
#if UNITY_ANDROID && !UNITY_EDITOR
            try
            {
                using (var player = new AndroidJavaClass("com.unity3d.player.UnityPlayer"))
                using (var activity = player.GetStatic<AndroidJavaObject>("currentActivity"))
                using (var vibrator = activity.Call<AndroidJavaObject>("getSystemService", "vibrator"))
                    vibrator?.Call("vibrate", ms);
            }
            catch (System.Exception) { }
#elif UNITY_IOS && !UNITY_EDITOR
            // (an iPhone can't buzz a length either, and Unity offers only the one long buzz: kept for a crash)
            if (ms >= 100) Handheld.Vibrate();
#endif
        }
    }
}
