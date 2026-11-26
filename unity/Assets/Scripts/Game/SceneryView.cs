// Baked scenery in the web game's blocky style: trees (spruce tiers, broadleaf cubes, palms, rocks, blossom) with a soft
// shadow each, and grandstands with terraced seats, a crowd, a back wall and flags. Only circuits given their look pass
// have any (see tools/unity/bake.ts SCENERY); the others show the ground alone.
using CornerCutters.Core;
using UnityEngine;
using Grid = CornerCutters.Core.Grid;

namespace CornerCutters.Game
{
    public static class SceneryView
    {
        static Color Hex(int rgb) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f);

        public static void Build(GameObject parent, CircuitData c)
        {
            var grid = c.ToGrid();
            var mat = MeshBuilder.VertexColorMaterial();
            var mb = new MeshBuilder();
            var shadows = new MeshBuilder();
            if (c.trees != null && c.trees.x != null)
            {
                for (int i = 0; i < c.trees.x.Length; i++) Tree(mb, shadows, grid, c.trees.x[i], c.trees.y[i], c.trees.h[i], c.trees.kind[i], Hex(c.trees.color[i]));
            }
            if (c.stands != null) foreach (var s in c.stands) Stand(mb, grid, s);
            Emit(parent, mb, "scenery", mat);
            Emit(parent, shadows, "shadows", MeshBuilder.ShadowMaterial());
        }

        static void Emit(GameObject parent, MeshBuilder mb, string name, Material mat)
        {
            if (mb.VertexCount == 0) return;
            var go = new GameObject(name);
            go.transform.SetParent(parent.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh(name);
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
        }

        static void Tree(MeshBuilder mb, MeshBuilder shadows, Grid grid, double x, double y, double hpx, int kind, Color crown)
        {
            float H = (float)(hpx * Units.PerPx);
            var foot = Units.ToWorld(x, y, Sim.GroundAt(grid, x, y).H);
            float r = H * 0.38f;
            var trunk = new Color(0.36f, 0.25f, 0.16f);
            // a soft shadow thrown to the lower right (the web game's sun is up and to the left)
            var sh = new Color(0, 0, 0, 0.28f);
            float sr = Mathf.Max(0.5f, r * 1.1f);
            var sc = foot + new Vector3(r * 0.55f, 0.04f, -r * 0.45f);
            shadows.Quad(sc + new Vector3(-sr, 0, sr), sc + new Vector3(sr, 0, sr), sc + new Vector3(sr, 0, -sr), sc + new Vector3(-sr, 0, -sr), sh);
            switch (kind)
            {
                case 0: // spruce: three tiers narrowing upward on a short trunk
                    mb.Box(foot + new Vector3(0, H * 0.1f, 0), new Vector3(r * 0.35f, H * 0.2f, r * 0.35f), trunk);
                    for (int t = 0; t < 3; t++)
                    {
                        float w = 2f * r * (1f - t * 0.3f);
                        mb.Box(foot + new Vector3(0, H * (0.3f + t * 0.24f), 0), new Vector3(w, H * 0.26f, w), Tint(crown, 1f + t * 0.06f));
                    }
                    break;
                case 2: // palm: a tall thin trunk and a flat crown of fronds
                    mb.Box(foot + new Vector3(0, H * 0.4f, 0), new Vector3(r * 0.3f, H * 0.8f, r * 0.3f), trunk);
                    mb.Box(foot + new Vector3(0, H * 0.85f, 0), new Vector3(r * 2.4f, H * 0.1f, r * 0.5f), crown);
                    mb.Box(foot + new Vector3(0, H * 0.85f, 0), new Vector3(r * 0.5f, H * 0.1f, r * 2.4f), crown);
                    break;
                case 3: // rock
                    mb.Box(foot + new Vector3(0, H * 0.3f, 0), new Vector3(r * 1.6f, H * 0.6f, r * 1.4f), new Color(0.5f, 0.5f, 0.52f));
                    break;
                default: // broadleaf and blossom: a trunk and a blocky crown with a smaller block on top
                    mb.Box(foot + new Vector3(0, H * 0.2f, 0), new Vector3(r * 0.4f, H * 0.4f, r * 0.4f), trunk);
                    mb.Box(foot + new Vector3(0, H * 0.58f, 0), new Vector3(2f * r, H * 0.42f, 2f * r), crown);
                    mb.Box(foot + new Vector3(0, H * 0.88f, 0), new Vector3(1.2f * r, H * 0.2f, 1.2f * r), Tint(crown, 1.12f));
                    break;
            }
        }

        static Color Tint(Color c, float k) => new Color(Mathf.Clamp01(c.r * k), Mathf.Clamp01(c.g * k), Mathf.Clamp01(c.b * k), 1f);

        // a stand's measures (web game: src/f1/stands.ts STAND), in px
        const float DepthPx = 56, HeightPx = 46, WallPx = 14;

        /// <summary>A grandstand: terraces rising away from the track, a crowd on each, a back wall, and flags. Built in its own
        /// frame (+Z along the track, +X across to the right of it) and placed with the mesh builder's transform.</summary>
        static void Stand(MeshBuilder mb, Grid grid, BakedStand s)
        {
            float z = (float)(Sim.GroundAt(grid, s.x, s.y).H * Units.PerPx);
            var origin = Units.ToWorld(s.x, s.y, 0);
            origin.y = z;
            mb.Xf = Matrix4x4.TRS(origin, Quaternion.Euler(0, Units.Yaw(s.dir), 0), Vector3.one);
            float len = (float)(s.len * Units.PerPx), depth = DepthPx * Units.PerPx, height = HeightPx * Units.PerPx, wall = WallPx * Units.PerPx;
            // the stand is on side `side` of the track: its back is further along `side` across, its front faces the track
            float side = s.side;
            int steps = 4;
            float terrace = (depth - wall) / steps;
            var concrete = new Color(0.72f, 0.70f, 0.66f);
            // the back wall
            mb.Box(new Vector3(side * (depth / 2 - wall / 2), height / 2, 0), new Vector3(wall, height, len), new Color(0.55f, 0.55f, 0.6f));
            for (int i = 0; i < steps; i++)
            {
                // step i, nearest the track first: each higher than the last
                float across = side * (-depth / 2 + terrace * (i + 0.5f));
                float top = height * (i + 1) / (steps + 0.5f);
                mb.Box(new Vector3(across, top / 2, 0), new Vector3(terrace, top, len), concrete);
                // the crowd on its seats: a textured strip of the crowd cell, one cell per unit along
                int cells = Mathf.Max(1, Mathf.RoundToInt(len));
                for (int k = 0; k < cells; k++)
                {
                    float z0 = -len / 2 + len * k / cells, z1 = -len / 2 + len * (k + 1) / cells;
                    float x0 = across - terrace * 0.5f, x1 = across + terrace * 0.5f;
                    mb.Quad(new Vector3(x0, top + 0.02f, z0), new Vector3(x0, top + 0.02f, z1), new Vector3(x1, top + 0.02f, z1), new Vector3(x1, top + 0.02f, z0), Color.white, PixelAtlas.Crowd);
                }
            }
            // flags on the back wall
            Color[] flags = { new Color(0.85f, 0.2f, 0.24f), new Color(0.95f, 0.76f, 0.3f), new Color(0.24f, 0.5f, 0.77f), new Color(0.96f, 0.96f, 0.97f) };
            for (int f = 0; f < 5; f++)
            {
                float zf = -len / 2 + len * (f + 0.5f) / 5f;
                mb.Box(new Vector3(side * (depth / 2 - wall / 2), height + 0.4f, zf), new Vector3(0.06f, 0.8f, 0.06f), new Color(0.3f, 0.3f, 0.34f));
                mb.Box(new Vector3(side * (depth / 2 - wall / 2) - side * 0.2f, height + 0.62f, zf), new Vector3(0.4f, 0.28f, 0.04f), flags[f % flags.Length]);
            }
            mb.Xf = Matrix4x4.identity;
        }
    }
}
