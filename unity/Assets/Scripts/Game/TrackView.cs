// Builds the circuit's ground, in chunks so the camera can cull them, shaded by slope against a sun.
// The ground's picture is the web game's own (Resources/Grounds/<id>.png, from `npm run unity:grounds`): its painter's
// asphalt, white edge lines, red and white kerbs, mown grass, gravel, pit lane, grid boxes and chequered line, one texel
// per map pixel, nearest-neighbour, draped over the height field the way the web game drapes it. Tyre barriers stand
// on the wall tiles that meet the run-off. Without a baked picture, the tiles are drawn from the pixel atlas instead
// (coarse: a tile per cell, so curves step).
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

        /// <summary>The ground; with barriers false, no barriers (the baked scenery has them).</summary>
        public static GameObject Build(CircuitData c, bool barriers = true)
        {
            var root = new GameObject("Circuit " + c.id);
            var mat = MeshBuilder.VertexColorMaterial();
            var picture = Resources.Load<Texture2D>("Grounds/" + c.id);
            Material groundMat = null;
            if (picture != null)
            {
                picture.filterMode = FilterMode.Point;
                picture.wrapMode = TextureWrapMode.Clamp;
                groundMat = new Material(mat) { name = "Ground " + c.id, mainTexture = picture };
            }
            int row = c.width + 1;
            float H(int cx, int cy) => (float)(c.heights[cy * row + cx] * Units.PerPx);
            char At(int tx, int ty) => tx < 0 || ty < 0 || tx >= c.width || ty >= c.height ? 'W' : c.cells[ty * c.width + tx];
            bool IsWall(char k) => k == 'W' || k == 'Q';
            bool TrackLike(char k) => k == 'T' || k == 'K';
            // a wall tile is a barrier only where the open ground meets it: the rest, out beyond, is flat ground
            bool baked = c.barriers != null && c.barriers.walls != null;
            bool Barrier(int tx, int ty)
            {
                if (baked) return false;   // (stood by BuildBarriers instead, where the web game stands them)
                char k = At(tx, ty);
                if (k == 'Q') return true;
                if (k != 'W') return false;
                return !IsWall(At(tx - 1, ty)) || !IsWall(At(tx + 1, ty)) || !IsWall(At(tx, ty - 1)) || !IsWall(At(tx, ty + 1));
            }

            // the light at a tile corner, from the ground's slope there (smooth across tiles, so the picture shows no seams)
            Color32 Light(int cx, int cy)
            {
                int x0 = System.Math.Max(0, cx - 1), x1 = System.Math.Min(c.width, cx + 1);
                int y0 = System.Math.Max(0, cy - 1), y1 = System.Math.Min(c.height, cy + 1);
                float dx = (H(x1, cy) - H(x0, cy)) / (x1 - x0), dy = (H(cx, y1) - H(cx, y0)) / (y1 - y0);
                var n = new Vector3(-dx, 1f, dy).normalized;
                float shade = Mathf.Clamp01(Mathf.Clamp(0.74f + 0.4f * Vector3.Dot(n, Sun), 0.55f, 1.1f));
                return new Color(shade, shade, shade, 1f);
            }

            for (int cy0 = 0; cy0 < c.height; cy0 += Chunk)
            {
                for (int cx0 = 0; cx0 < c.width; cx0 += Chunk)
                {
                    var mb = new MeshBuilder();
                    var gb = new MeshBuilder();
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

                            if (picture != null)
                            {
                                // the baked picture: (0,0) is its top left, the map's top left; texture v runs up
                                float u0 = (float)tx / c.width, u1 = (float)(tx + 1) / c.width;
                                float v0 = 1f - (float)ty / c.height, v1 = 1f - (float)(ty + 1) / c.height;
                                gb.QuadUv(nw, ne, se, sw, new Vector2(u0, v0), new Vector2(u1, v0), new Vector2(u1, v1), new Vector2(u0, v1),
                                    Light(tx, ty), Light(tx + 1, ty), Light(tx + 1, ty + 1), Light(tx, ty + 1));
                            }

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
                            if (picture != null) continue;

                            // shaded by the tile's slope against the sun
                            var n = Vector3.Cross(sw - nw, ne - nw).normalized;
                            if (n.y < 0) n = -n;
                            float shade = Mathf.Clamp(0.74f + 0.4f * Vector3.Dot(n, Sun), 0.55f, 1.1f);
                            mb.Quad(nw, ne, se, sw, (Color32)new Color(Mathf.Clamp01(shade), Mathf.Clamp01(shade), Mathf.Clamp01(shade), 1f), cell);
                        }
                    }
                    void Emit(MeshBuilder b, string name, Material m)
                    {
                        if (b.VertexCount == 0) return;
                        var go = new GameObject($"{name} {cx0 / Chunk},{cy0 / Chunk}");
                        go.transform.SetParent(root.transform, false);
                        go.AddComponent<MeshFilter>().sharedMesh = b.ToMesh(go.name);
                        go.AddComponent<MeshRenderer>().sharedMaterial = m;
                    }
                    Emit(gb, "ground", groundMat);
                    Emit(mb, picture != null ? "barriers" : "ground", mat);
                }
            }

            if (baked && barriers) BuildBarriers(root, c, mat);
            // (the baked picture has the line and the grid boxes painted on)
            if (picture == null) AddStartLine(root, c, mat);
            return root;
        }

        /// <summary>
        /// The barriers where the web game stands them (barrierTiles): a tyre stack on each wall tile that meets the run-off
        /// (red and white, 14 px across and 7 high; a street circuit's grey steel with red and white bands, 9 high; hay bales
        /// on dirt), but none behind the garages or on the pit wall's tiles (PitView builds that wall); concrete beside a
        /// banking (its see-through catch fence not yet); the Wall of Champions in green and white.
        /// </summary>
        static void BuildBarriers(GameObject root, CircuitData c, Material mat)
        {
            var grid = c.ToGrid();
            var b = c.barriers;
            bool steel = c.barrierKind == "steel", bales = c.barrierKind == "bales";
            Color red = bales ? Hex(0xd9b25a) : Hex(0xd8323c), white = bales ? Hex(0xc39a40) : Hex(0xf4f4f8), grey = Hex(0xb8bcc6);
            var mb = new MeshBuilder();
            float T = (float)c.tile * Units.PerPx;
            Vector3 Foot(int k, out int i, out int j)
            {
                i = k % c.width; j = k / c.width;
                double x = (i + 0.5) * c.tile, y = (j + 0.5) * c.tile;
                return Units.ToWorld(x, y, Sim.GroundAt(grid, x, y).H);
            }
            foreach (int k in b.walls)
            {
                var foot = Foot(k, out int i, out int j);
                if (steel)
                {
                    int m = (i + j) % 6;
                    mb.Box(foot + new Vector3(0, 9 * Units.PerPx / 2, 0), new Vector3(T, 9 * Units.PerPx, T), m == 0 ? red : m == 3 ? white : grey);
                }
                else mb.CylinderY(foot, 7 * Units.PerPx, 7 * Units.PerPx, 8, (i + j) % 2 == 0 ? red : white);
            }
            foreach (int k in b.bank ?? new int[0])
            {
                var foot = Foot(k, out _, out _);
                mb.Box(foot + new Vector3(0, 6 * Units.PerPx, 0), new Vector3(T, 12 * Units.PerPx, T), Hex(0xd4d2cc));
            }
            foreach (int k in b.champions ?? new int[0])
            {
                var foot = Foot(k, out int i, out int j);
                mb.Box(foot + new Vector3(0, 6 * Units.PerPx, 0), new Vector3(T, 12 * Units.PerPx, T), (i + j) % 4 < 2 ? Hex(0x2fbf3f) : Hex(0xf4f6f2));
            }
            if (mb.VertexCount == 0) return;
            var go = new GameObject("barriers");
            go.transform.SetParent(root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("barriers");
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
        }

        public static Color Hex(int rgb) => new Color(((rgb >> 16) & 255) / 255f, ((rgb >> 8) & 255) / 255f, (rgb & 255) / 255f, 1f);

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
