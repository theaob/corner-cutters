// Builds the circuit's ground from the baked tiles: one flat-coloured, slope-shaded quad per tile at the baked corner
// heights, walls as raised blocks, in chunks (so the camera can cull them). Placeholder art: the aim of this phase is a
// readable, correctly-shaped circuit to drive; the web game's scenery (trees, stands, pits, night lights) is a later phase.
using CornerCutters.Core;
using UnityEngine;

namespace CornerCutters.Game
{
    public static class TrackView
    {
        const int Chunk = 48;
        const float WallHeight = 1.4f;
        static readonly Vector3 Sun = new Vector3(-0.45f, 0.8f, 0.4f).normalized;

        static Color Base(char c, int tx, int ty)
        {
            switch (c)
            {
                case 'T': return new Color(0.27f, 0.28f, 0.30f);
                case 'K': return ((tx / 2 + ty / 2) & 1) == 0 ? new Color(0.85f, 0.15f, 0.15f) : new Color(0.92f, 0.92f, 0.92f);
                case 'G': return new Color(0.22f, 0.45f, 0.20f);
                case 'V': return new Color(0.70f, 0.62f, 0.42f);
                case 'A': return new Color(0.50f, 0.50f, 0.52f);
                case 'P': return new Color(0.40f, 0.42f, 0.48f);
                case 'Q': case 'W': return new Color(0.78f, 0.78f, 0.80f);
                default: return Color.magenta;
            }
        }

        public static GameObject Build(CircuitData c)
        {
            var root = new GameObject("Circuit " + c.id);
            var mat = MeshBuilder.VertexColorMaterial();
            int row = c.width + 1;
            float H(int cx, int cy) => (float)(c.heights[cy * row + cx] * Units.PerPx);
            bool Wall(int tx, int ty)
            {
                if (tx < 0 || ty < 0 || tx >= c.width || ty >= c.height) return true;
                char k = c.cells[ty * c.width + tx];
                return k == 'W' || k == 'Q';
            }

            for (int cy0 = 0; cy0 < c.height; cy0 += Chunk)
            {
                for (int cx0 = 0; cx0 < c.width; cx0 += Chunk)
                {
                    var mb = new MeshBuilder();
                    for (int ty = cy0; ty < System.Math.Min(c.height, cy0 + Chunk); ty++)
                    {
                        for (int tx = cx0; tx < System.Math.Min(c.width, cx0 + Chunk); tx++)
                        {
                            char k = c.cells[ty * c.width + tx];
                            float h00 = H(tx, ty), h10 = H(tx + 1, ty), h01 = H(tx, ty + 1), h11 = H(tx + 1, ty + 1);
                            var nw = new Vector3(tx, h00, -ty);
                            var ne = new Vector3(tx + 1, h10, -ty);
                            var sw = new Vector3(tx, h01, -(ty + 1));
                            var se = new Vector3(tx + 1, h11, -(ty + 1));
                            var col = Base(k, tx, ty);
                            bool wall = k == 'W' || k == 'Q';
                            if (wall)
                            {
                                // a block standing on the ground at its lowest corner's height... up to a flat top
                                float top = (h00 + h10 + h01 + h11) * 0.25f + WallHeight;
                                var tnw = new Vector3(tx, top, -ty); var tne = new Vector3(tx + 1, top, -ty);
                                var tsw = new Vector3(tx, top, -(ty + 1)); var tse = new Vector3(tx + 1, top, -(ty + 1));
                                mb.Quad(tnw, tne, tse, tsw, Shade(col, 1.0f));
                                if (!Wall(tx, ty - 1)) mb.Quad(nw, ne, tne, tnw, Shade(col, 0.8f));
                                if (!Wall(tx, ty + 1)) mb.Quad(se, sw, tsw, tse, Shade(col, 0.7f));
                                if (!Wall(tx - 1, ty)) mb.Quad(sw, nw, tnw, tsw, Shade(col, 0.6f));
                                if (!Wall(tx + 1, ty)) mb.Quad(ne, se, tse, tne, Shade(col, 0.9f));
                                continue;
                            }
                            // shaded by the tile's slope against the sun
                            var n = Vector3.Cross(sw - nw, ne - nw).normalized;
                            if (n.y < 0) n = -n;
                            float shade = Mathf.Clamp(0.62f + 0.55f * Vector3.Dot(n, Sun), 0.35f, 1.15f);
                            mb.Quad(nw, ne, se, sw, Shade(col, shade));
                        }
                    }
                    if (mb.VertexCount == 0) continue;
                    var go = new GameObject($"ground {cx0 / Chunk},{cy0 / Chunk}");
                    go.transform.SetParent(root.transform, false);
                    go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh(go.name);
                    go.AddComponent<MeshRenderer>().sharedMaterial = mat;
                }
            }

            AddStartLine(root, c, mat);
            return root;
        }

        static Color Shade(Color c, float s) => new Color(Mathf.Clamp01(c.r * s), Mathf.Clamp01(c.g * s), Mathf.Clamp01(c.b * s), 1f);

        /// <summary>A white line across the track at sample 0.</summary>
        static void AddStartLine(GameObject root, CircuitData c, Material mat)
        {
            double x = c.samples.x[0], y = c.samples.y[0], dir = c.samples.dir[0];
            // across the track: perpendicular to the direction of travel
            double ax = System.Math.Cos(dir), ay = System.Math.Sin(dir);
            double z = Sim.GroundAt(c.ToGrid(), x, y).H;
            var mb = new MeshBuilder();
            var half = 40.0;
            var fwd = Driving.ForwardOf(dir);
            Vector3 P(double dx, double dy) => Units.ToWorld(x + dx, y + dy, z) + new Vector3(0, 0.04f, 0);
            for (int i = 0; i < 10; i++)
            {
                double a0 = -half + i * (2 * half / 10), a1 = a0 + 2 * half / 10;
                var col = i % 2 == 0 ? Color.white : new Color(0.1f, 0.1f, 0.1f);
                mb.Quad(P(ax * a0 - fwd.X * 3, ay * a0 - fwd.Y * 3), P(ax * a1 - fwd.X * 3, ay * a1 - fwd.Y * 3), P(ax * a1 + fwd.X * 3, ay * a1 + fwd.Y * 3), P(ax * a0 + fwd.X * 3, ay * a0 + fwd.Y * 3), col);
            }
            var go = new GameObject("start line");
            go.transform.SetParent(root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("start line");
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
        }
    }
}
