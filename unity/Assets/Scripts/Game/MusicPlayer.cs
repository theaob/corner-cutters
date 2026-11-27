// Music (src/engine/music.ts): one track at a time, looping, crossfading when it changes. The composed tracks are the
// web game's files (Resources/Music, imported to stream from the disk, as the web game streams them, not decoded
// whole); a track with an intro and an ending loops between its loop points, sent back to the loop's start as it
// passes the end (near seamless, as on the web, not sample-exact). The menu's tune has no file: its placeholder is
// rendered once (Core/Music.cs) off the main thread, and plays when it's ready if it's still wanted. With MUSIC off
// nothing plays (or is rendered); the track wanted is remembered, to start if it's turned up.
using System.Collections.Generic;
using System.Threading.Tasks;
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class MusicPlayer : MonoBehaviour
    {
        sealed class Playing
        {
            public MusicTrack Track;
            public AudioSource Src;
            /// <summary>the fade: from, to, s into it, s it takes</summary>
            public float From, To, T, Len;
        }

        readonly List<Playing> playing = new List<Playing>();
        MusicTrack wanted;
        float fadeWanted = (float)Music.Fade;
        bool held;
        static AudioClip menuClip;
        static Task<float[]> rendering;
        static int renderRate;

        /// <summary>Play `track` (looping), crossfading over `fade` s from what's playing; the same track carries on.</summary>
        public void Play(MusicTrack track, double fade = Music.Fade)
        {
            if (wanted == track) return;
            wanted = track;
            fadeWanted = (float)fade;
            FadeOut((float)fade);
            if (SoundOut.MusicVolume > 0) Begin(track, (float)fade);
        }

        /// <summary>Fade the music out.</summary>
        public void Stop(double fade = Music.Fade)
        {
            wanted = null;
            FadeOut((float)fade);
        }

        public string Now => wanted?.Id;

        /// <summary>The game paused or out of sight: the music holds where it is; back, it goes on.</summary>
        public void Hold(bool on)
        {
            held = on;
            foreach (var p in playing)
            {
                if (on) p.Src.Pause();
                else p.Src.UnPause();
            }
        }

        /// <summary>The MUSIC setting moved: off, what's playing goes; up from off, the track wanted starts.</summary>
        public void VolumeChanged()
        {
            if (SoundOut.MusicVolume <= 0) FadeOut(0.2f);
            else if (wanted != null && !playing.Exists(p => p.Track == wanted && p.To > 0)) Begin(wanted, fadeWanted);
        }

        void FadeOut(float fade)
        {
            foreach (var p in playing)
            {
                if (p.To == 0) continue;
                p.From = Level(p);
                p.To = 0;
                p.T = 0;
                p.Len = fade;
            }
        }

        static float Level(Playing p) => p.Len <= 0 ? p.To : Mathf.Lerp(p.From, p.To, Mathf.Clamp01(p.T / p.Len));

        AudioClip ClipOf(MusicTrack t)
        {
            if (t.File != null) return Resources.Load<AudioClip>(t.File);
            if (menuClip != null) return menuClip;
            if (rendering == null && t.Placeholder != null)
            {
                var song = t.Placeholder;
                renderRate = AudioSettings.outputSampleRate;
                int rate = renderRate;
                rendering = Task.Run(() => CornerCutters.Core.Music.Render(song, rate));
            }
            return null;
        }

        void Begin(MusicTrack t, float fade)
        {
            var clip = ClipOf(t);
            if (clip == null) return;
            var src = gameObject.AddComponent<AudioSource>();
            src.clip = clip;
            src.playOnAwake = false;
            src.spatialBlend = 0;
            src.loop = true;
            src.volume = 0;
            // (from the loop's start the first time round too: what's before it is the file's lead-in)
            if (!double.IsNaN(t.LoopStart)) src.time = (float)t.LoopStart;
            src.Play();
            if (held) src.Pause();
            playing.Add(new Playing { Track = t, Src = src, From = 0, To = 1, T = 0, Len = fade });
        }

        void Update()
        {
            // the menu's tune rendered: made into a clip, and played if it's still wanted
            if (rendering != null && rendering.IsCompleted && menuClip == null)
            {
                if (rendering.Status == TaskStatus.RanToCompletion)
                {
                    var data = rendering.Result;
                    menuClip = AudioClip.Create("menu", data.Length, 1, renderRate, false);
                    menuClip.SetData(data, 0);
                    if (wanted != null && wanted.File == null && SoundOut.MusicVolume > 0) Begin(wanted, fadeWanted);
                }
                else rendering = null;
            }
            float dt = held ? 0 : Time.unscaledDeltaTime;
            float vol = (float)SoundOut.MusicVolume;
            for (int i = playing.Count - 1; i >= 0; i--)
            {
                var p = playing[i];
                p.T += dt;
                float level = Level(p);
                p.Src.volume = level * (float)p.Track.Gain * vol;
                if (!double.IsNaN(p.Track.LoopEnd) && p.Src.time >= p.Track.LoopEnd) p.Src.time = (float)p.Track.LoopStart;
                if (p.To == 0 && p.T >= p.Len)
                {
                    p.Src.Stop();
                    Destroy(p.Src);
                    playing.RemoveAt(i);
                }
            }
        }
    }
}
