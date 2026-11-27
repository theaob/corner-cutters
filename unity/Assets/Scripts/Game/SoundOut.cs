// The game's sound out of the speakers (audio.ts's context, master gain and limiter): the synth (Core/Synth.cs) fed to
// Unity's audio thread from an AudioSource with no clip (OnAudioFilterRead fills its buffer), and the music
// (MusicPlayer) beside it. Both are kept for the whole session; their volumes are settings kept on the device
// (the save's settings.sound and settings.music, 0.7 unless changed: OFF, LOW, MEDIUM, HIGH). The game paused, or out
// of sight, is silent: the synth's one-shots aren't played then, and the music holds where it was.
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class SoundOut : MonoBehaviour
    {
        static SoundOut made;
        public static Synth Synth { get; private set; }
        public static MusicPlayer Music { get; private set; }
        static bool gamePaused, hidden;

        /// <summary>The sound out, made the first time it's asked for.</summary>
        public static SoundOut Make()
        {
            if (made != null) return made;
            var go = new GameObject("sound");
            DontDestroyOnLoad(go);
            var src = go.AddComponent<AudioSource>();
            src.playOnAwake = false;
            src.spatialBlend = 0;
            Synth = new Synth(AudioSettings.outputSampleRate, SoundVolume);
            made = go.AddComponent<SoundOut>();
            Music = go.AddComponent<MusicPlayer>();
            src.Play();
            return made;
        }

        // (Unity's audio thread: the synth's next buffer)
        void OnAudioFilterRead(float[] data, int channels) => Synth?.Render(data, channels);

        static void Settle()
        {
            bool quiet = gamePaused || hidden;
            if (Synth != null) Synth.Paused = quiet;
            if (Music != null) Music.Hold(quiet);
        }

        /// <summary>Silence everything (the pause screen), or bring it back.</summary>
        public static void SetPaused(bool paused)
        {
            gamePaused = paused;
            Settle();
        }

        /// <summary>The game out of sight (another window, the console's home menu), or back.</summary>
        public static void SetHidden(bool away)
        {
            hidden = away;
            Settle();
        }

        public static double SoundVolume
        {
            get => System.Math.Clamp(Save.Number("settings", "sound", 0.7), 0, 1);
            set
            {
                Save.Set("settings", "sound", value);
                Synth?.SetVolume(value);
            }
        }

        public static double MusicVolume
        {
            get => System.Math.Clamp(Save.Number("settings", "music", 0.7), 0, 1);
            set
            {
                Save.Set("settings", "music", value);
                Music?.VolumeChanged();
            }
        }

        /// <summary>The volume step nearest `v`, and the one `step` from it (no wrap).</summary>
        public static int StepOf(double v)
        {
            int best = 0;
            for (int i = 1; i < Synth.Volumes.Length; i++) if (System.Math.Abs(Synth.Volumes[i] - v) < System.Math.Abs(Synth.Volumes[best] - v)) best = i;
            return best;
        }

        public static double Turn(double v, int step) => Synth.Volumes[System.Math.Max(0, System.Math.Min(Synth.Volumes.Length - 1, StepOf(v) + step))];

        public static string VolumeName(double v) => new[] { "OFF", "LOW", "MEDIUM", "HIGH" }[StepOf(v)];

        /// <summary>A click for moving through a menu, and a brighter one for picking.</summary>
        public static void Tick() { if (Synth != null) RaceSounds.MenuTick(Synth); }
        public static void Pick() { if (Synth != null) RaceSounds.MenuPick(Synth); }
    }
}
