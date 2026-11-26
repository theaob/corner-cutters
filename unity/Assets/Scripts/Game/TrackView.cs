// Builds the circuit's ground from the baked tiles with the pixel atlas: mown grass in two greens, gravel, dark asphalt
// with white edge lines where it meets something else, red and white kerbs, tyre barriers where the run-off ends,
// and the flat ground beyond them; shaded by slope against a sun, in chunks so the camera can cull them.
// Scenery (trees, stands) is SceneryView.
using CornerCutters.Core;
using UnityEngine;
using Grid = CornerCutters.Core.Grid;

namespace CornerCutters.Game
{
    public static class TrackView
    {
        const int Chunk = 48;
        const float BarrierHeight = 0.9f;
        static readonly Vector3 Sun = new Vector3(-0.45f, 0.8f, 0.4f).normalized;

        public static GameObject Build(CircuitData c)
        {
            var root = new GameObject("Circuit " + c.id);
            var mat = MeshBuilder.VertexColorMaterial();
            int row = c.width + 1;
            float H(int cx, int cy) => (float)(c.heights[cy * row + cx] * Units.PerPx);
            char At(int tx, int ty) => tx < 0 || ty < 0 || tx >= c.width || ty >= c.height ? 'W' : c.cells[ty * c.width + tx];
            bool IsWall(char k) => k == 'W' || k == 'Q';
            bool TrackLike(char k) => k == 'T' || k == 'K';
            // a wall tile is a barrier only where the open ground meets it: the rest, out beyond, is flat ground
            bool Barrier(int tx, int ty)
            {
                char k = At(tx, ty);
                if (k == 'Q') return true;
                if (k != 'W') return false;
                return !IsWall(At(tx - 1, ty)) || !IsWall(At(tx + 1, ty)) || !IsWall(At(tx, ty - 1)) || !IsWall(At(tx, ty + 1));
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
                            char k = At(tx, ty);
                            float h00 = H(tx, ty), h10 = H(tx + 1, ty), h01 = H(tx, ty + 1), h11 = H(tx + 1, ty + 1);
                            var nw = new Vector3(tx, h00, -ty);
                            var ne = new Vector3(tx + 1, h10, -ty);
                            var sw = new Vector3(tx, h01, -(ty + 1));
                            var se = new Vector3(tx + 1, h11, -(ty + 1));

                            int cell;
                            switch (k)
                            {
                                case 'T':
                                    int mask = (TrackLike(At(tx, ty - 1)) ? 0 : 1) | (TrackLike(At(tx + 1, ty)) ? 0 : 2) | (TrackLike(At(tx, ty + 1)) ? 0 : 4) | (TrackLike(At(tx - 1, ty)) ? 0 : 8);
                                    cell = PixelAtlas.AsphaltEdges + mask;
                                    break;
                                case 'K': cell = ((tx + ty) & 1) == 0 ? PixelAtlas.KerbRed : PixelAtlas.KerbWhite; break;
                                case 'G': cell = (((tx >> 2) + (ty >> 2)) & 1) == 0 ? PixelAtlas.GrassA : PixelAtlas.GrassB; break;
                                case 'V': cell = PixelAtlas.Gravel; break;
                                case 'A': cell = PixelAtlas.Apron; break;
                                case 'P': cell = PixelAtlas.Pit; break;
                                default: cell = PixelAtlas.Beyond; break;
                            }

                            if (Barrier(tx, ty))
                            {
                                // a tyre barrier: a low block of red and white drums standing on the ground
                                float top = (h00 + h10 + h01 + h11) * 0.25f + BarrierHeight;
                                int bc = ((tx + ty) & 1) == 0 ? PixelAtlas.BarrierRed : PixelAtlas.BarrierWhite;
                                var tnw = new Vector3(tx, top, -ty); var tne = new Vector3(tx + 1, top, -ty);
                                var tsw = new Vector3(tx, top, -(ty + 1)); var tse = new Vector3(tx + 1, top, -(ty + 1));
                                mb.Quad(tnw, tne, tse, tsw, (Color32)new Color(0.8f, 0.8f, 0.8f), bc);
                                if (!IsWall(At(tx, ty - 1))) mb.Quad(tnw, tne, ne, nw, (Color32)new Color(0.85f, 0.85f, 0.85f), bc);
                                if (!IsWall(At(tx, ty + 1))) mb.Quad(tse, tsw, sw, se, (Color32)new Color(0.7f, 0.7f, 0.7f), bc);
                                if (!IsWall(At(tx - 1, ty))) mb.Quad(tsw, tnw, nw, sw, (Color32)new Color(0.75f, 0.75f, 0.75f), bc);
                                if (!IsWall(At(tx + 1, ty))) mb.Quad(tne, tse, se, ne, (Color32)new Color(0.9f, 0.9f, 0.9f), bc);
                                continue;
                            }

                            // shaded by the tile's slope against the sun
                            var n = Vector3.Cross(sw - nw, ne - nw).normalized;
                            if (n.y < 0) n = -n;
                            float shade = Mathf.Clamp(0.74f + 0.4f * Vector3.Dot(n, Sun), 0.55f, 1.1f);
                            mb.Quad(nw, ne, se, sw, (Color32)new Color(Mathf.Clamp01(shade), Mathf.Clamp01(shade), Mathf.Clamp01(shade), 1f), cell);
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

        /// <summary>A chequered line across the track at sample 0, and the grid slots' marks behind it.</summary>
        static void AddStartLine(GameObject root, CircuitData c, Material mat)
        {
            double x = c.samples.x[0], y = c.samples.y[0], dir = c.samples.dir[0];
            double ax = System.Math.Cos(dir), ay = System.Math.Sin(dir);
            var grid = c.ToGrid();
            double z = Sim.GroundAt(grid, x, y).H;
            var mb = new MeshBuilder();
            var half = 40.0;
            var fwd = Driving.ForwardOf(dir);
            Vector3 P(double dx, double dy) => Units.ToWorld(x + dx, y + dy, z) + new Vector3(0, 0.03f, 0);
            for (int i = 0; i < 10; i++)
            {
                double a0 = -half + i * (2 * half / 10), a1 = a0 + 2 * half / 10;
                // two rows of squares: the chequer cell is 4 px squares, so each 8 x 8 px patch is 2 x 2 of them
                mb.Quad(P(ax * a0 - fwd.X * 4, ay * a0 - fwd.Y * 4), P(ax * a1 - fwd.X * 4, ay * a1 - fwd.Y * 4), P(ax * a1 + fwd.X * 4, ay * a1 + fwd.Y * 4), P(ax * a0 + fwd.X * 4, ay * a0 + fwd.Y * 4), Color.white, PixelAtlas.Chequer);
            }
            // grid boxes: a pale slot mark behind the line for each starting position
            foreach (var s in c.slots)
            {
                double sz = Sim.GroundAt(grid, s.x, s.y).H;
                var f = Driving.ForwardOf(s.heading);
                double rx = System.Math.Cos(s.heading), ry = System.Math.Sin(s.heading);
                Vector3 Q(double along, double across) => Units.ToWorld(s.x + f.X * along + rx * across, s.y + f.Y * along + ry * across, sz) + new Vector3(0, 0.03f, 0);
                var pale = new Color32(214, 206, 196, 255);
                mb.Quad(Q(17, -9), Q(17, 9), Q(15, 9), Q(15, -9), pale);   // the box's front line
                mb.Quad(Q(17, -9), Q(17, -8), Q(5, -8), Q(5, -9), pale);   // its sides
                mb.Quad(Q(17, 8), Q(17, 9), Q(5, 9), Q(5, 8), pale);
            }
            var go = new GameObject("start line");
            go.transform.SetParent(root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("start line");
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
        }
    }
}
