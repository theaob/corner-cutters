// What moves in the web game's scenery (planes, boats, birds, animals, the tramway, petals...), played back from the
// tracks BakedScenery read: where each thing is, 5 times a second over a 40 s loop recorded from the web game's own
// animation. Each track's parts are one mesh per material, drawn each frame where the track is (blended between frames).
using System.Collections.Generic;
using UnityEngine;

namespace CornerCutters.Game
{
    public sealed class SceneryMovers
    {
        public sealed class Track
        {
            /// <summary>Where it is at each frame (Unity's axes and units), and whether it's seen then.</summary>
            public Matrix4x4[] At;
            public bool[] Shown;
        }

        /// <summary>A move of more than this (units) between two frames is a jump (back to the start of a run), not blended.</summary>
        const float Jump = 40;

        readonly float dt;
        readonly int frames;
        readonly Track[] tracks;
        readonly List<(int track, Mesh mesh, Material mat)> draws = new List<(int, Mesh, Material)>();
        float time;

        public SceneryMovers(float dt, int frames, Track[] tracks)
        {
            this.dt = dt;
            this.frames = frames;
            this.tracks = tracks;
        }

        public bool Any => draws.Count > 0;

        public void Add(int track, Mesh mesh, Material mat) => draws.Add((track, mesh, mat));

        /// <summary>On by dt seconds, and draws everything where it is (call every rendered frame).</summary>
        public void Step(float seconds)
        {
            if (draws.Count == 0 || frames == 0) return;
            time = (time + seconds) % (dt * frames);
            float f = time / dt;
            int a = Mathf.FloorToInt(f) % frames, b = (a + 1) % frames;
            float k = f - Mathf.FloorToInt(f);
            foreach (var (t, mesh, mat) in draws)
            {
                var tr = tracks[t];
                Matrix4x4 m;
                if (tr.Shown[a] && tr.Shown[b]) m = Blend(tr.At[a], tr.At[b], k);
                else if (k < 0.5f ? tr.Shown[a] : tr.Shown[b]) m = k < 0.5f ? tr.At[a] : tr.At[b];
                else continue;
                Graphics.DrawMesh(mesh, m, mat, 0);
            }
        }

        static Matrix4x4 Blend(Matrix4x4 a, Matrix4x4 b, float k)
        {
            float dx = b[0, 3] - a[0, 3], dy = b[1, 3] - a[1, 3], dz = b[2, 3] - a[2, 3];
            if (dx * dx + dy * dy + dz * dz > Jump * Jump) return k < 0.5f ? a : b;
            var m = Matrix4x4.identity;
            for (int row = 0; row < 3; row++)
                for (int col = 0; col < 4; col++) m[row, col] = a[row, col] + (b[row, col] - a[row, col]) * k;
            return m;
        }
    }
}
