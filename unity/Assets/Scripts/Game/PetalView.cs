// The cherry blossom's petals, drawn as the web game draws them (circuitScene.ts's buildPetals): Core's PetalField, from
// the web game's cherry trees (Resources/Scenery/<id>-blossoms.json: npm run unity:scenery), each petal a 5 x 3.4 px
// pink, lying flat on the ground turned its own way, or tumbling in the air. One mesh, made again each frame.
using System.Collections.Generic;
using CornerCutters.Core;
using UnityEngine;
using UnityEngine.Rendering;

namespace CornerCutters.Game
{
    public sealed class PetalView
    {
        static readonly int[] Pinks = { 0xfbd3de, 0xf7c6d4, 0xffe4ec, 0xf4b6c8, 0xfadbe4 };
        const float W = 5, H = 3.4f;

        readonly PetalField field;
        readonly Mesh mesh;
        readonly Vector3[] verts = new Vector3[PetalTuning.Max * 4];
        readonly Color32[] colors = new Color32[PetalTuning.Max * 4];
        readonly int[] tris = new int[PetalTuning.Max * 6];
        readonly Color32[] pinks = new Color32[Pinks.Length];
        readonly List<PetalCar> cars = new List<PetalCar>();

        PetalView(GameObject parent, CircuitData c, BlossomTree[] trees)
        {
            field = new PetalField(c.ToGrid(), c.ToTrack(), trees);
            for (int i = 0; i < Pinks.Length; i++) pinks[i] = TrackView.Hex(Pinks[i]);
            for (int b = 0; b < PetalTuning.Max; b++)
            {
                int v = b * 4, t = b * 6;
                tris[t] = v; tris[t + 1] = v + 1; tris[t + 2] = v + 2;
                tris[t + 3] = v; tris[t + 4] = v + 2; tris[t + 5] = v + 3;
            }
            mesh = new Mesh { name = "petals", indexFormat = IndexFormat.UInt32 };
            mesh.MarkDynamic();
            Draw();
            var go = new GameObject("petals");
            go.transform.SetParent(parent.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = MeshBuilder.PlainMaterial();
        }

        /// <summary>The circuit's petals, or null where there's no blossom.</summary>
        public static PetalView Load(GameObject parent, CircuitData c)
        {
            var asset = Resources.Load<TextAsset>($"Scenery/{c.id}-blossoms");
            if (asset == null) return null;
            var trees = JsonUtility.FromJson<BlossomTrees>(asset.text)?.trees;
            return trees == null || trees.Length == 0 ? null : new PetalView(parent, c, trees);
        }

        /// <summary>dt s on, near the camera's focus (fx, fy), with these cars to kick them up (none in a replay).</summary>
        public void Step(float dt, IReadOnlyList<Entrant> entrants, double fx, double fy)
        {
            cars.Clear();
            if (entrants != null)
                foreach (var e in entrants)
                    cars.Add(new PetalCar { X = e.Car.X, Y = e.Car.Y, Vx = e.Car.Vx, Vy = e.Car.Vy, Z = e.Car.Z, Airborne = e.Car.Airborne });
            if (dt <= 0) return;
            field.Step(dt, cars, fx, fy);
            Draw();
        }

        void Draw()
        {
            var ps = field.Petals;
            int n = System.Math.Min(ps.Count, PetalTuning.Max);
            for (int i = 0; i < n; i++)
            {
                var p = ps[i];
                // (three.js's Euler, XYZ: lying flat (-90° about x, then its spin about its own z), or tumbling)
                double ax, ay, az;
                if (p.Resting) { ax = -System.Math.PI / 2; ay = 0; az = p.Spin; }
                else { ax = p.Spin; ay = p.Spin * 0.7; az = p.Spin * 0.3; }
                Euler(ax, ay, az, out var right, out var up);
                var at = new Vector3((float)p.X, (float)p.Z + 0.4f, (float)p.Y);
                var r = right * (W / 2);
                var u = up * (H / 2);
                verts[i * 4] = Unity(at - r - u);
                verts[i * 4 + 1] = Unity(at + r - u);
                verts[i * 4 + 2] = Unity(at + r + u);
                verts[i * 4 + 3] = Unity(at - r + u);
                var col = pinks[p.Shade % pinks.Length];
                for (int k = 0; k < 4; k++) colors[i * 4 + k] = col;
            }
            // (the rest folded away to nothing)
            for (int i = n; i < PetalTuning.Max; i++)
                for (int k = 0; k < 4; k++) verts[i * 4 + k] = Vector3.zero;
            mesh.vertices = verts;
            mesh.colors32 = colors;
            if (mesh.triangles.Length == 0) mesh.triangles = tris;
            mesh.RecalculateBounds();
        }

        /// <summary>A point in the web game's px and three.js axes, in Unity's (z mirrored).</summary>
        static Vector3 Unity(Vector3 v) => new Vector3(v.x * Units.PerPx, v.y * Units.PerPx, -v.z * Units.PerPx);

        /// <summary>The plane's own x and y axes, turned by three.js's Euler (a, b, c) in XYZ order (Rx Ry Rz).</summary>
        static void Euler(double a, double b, double c, out Vector3 x, out Vector3 y)
        {
            double ca = System.Math.Cos(a), sa = System.Math.Sin(a), cb = System.Math.Cos(b), sb = System.Math.Sin(b), cc = System.Math.Cos(c), sc = System.Math.Sin(c);
            // columns 0 and 1 of Rx(a) Ry(b) Rz(c)
            x = new Vector3((float)(cb * cc), (float)(ca * sc + sa * sb * cc), (float)(sa * sc - ca * sb * cc));
            y = new Vector3((float)(-cb * sc), (float)(ca * cc - sa * sb * sc), (float)(sa * cc + ca * sb * sc));
        }
    }
}
