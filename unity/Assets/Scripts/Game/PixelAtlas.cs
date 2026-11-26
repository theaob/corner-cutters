// The pixel-art look, drawn in code: one small point-filtered texture (8 x 4 cells of 16 px) with the ground
// materials of the web game's circuits: mown grass in two greens, gravel, dark asphalt with its white edge lines
// on every side a track tile meets something else, red and white kerbs, concrete, tyre walls, the chequered line,
// the crowd. Drawing it in code means no art files to import (and none to keep in step with the web game's
// colours, which are read off its screenshots). Cell UVs are looked up by index.
using UnityEngine;

namespace CornerCutters.Game
{
    public static class PixelAtlas
    {
        public const int Cell = 16, Cols = 8, Rows = 4;

        // cell indexes
        public const int GrassA = 0, GrassB = 1, Gravel = 2, Asphalt = 3, KerbRed = 4, KerbWhite = 5, Apron = 6, Pit = 7;
        /// <summary>asphalt with white edge lines: AsphaltEdges + mask (1 north, 2 east, 4 south, 8 west)</summary>
        public const int AsphaltEdges = 8;
        public const int Chequer = 24, BarrierRed = 25, BarrierWhite = 26, Beyond = 27, Crowd = 28, Concrete = 29, White = 31;

        static Texture2D texture;
        public static Texture2D Texture
        {
            get { if (texture == null) texture = Build(); return texture; }
        }

        public static Vector4 Uv(int index)
        {
            int cx = index % Cols, cy = index / Cols;
            float w = Cols * Cell, h = Rows * Cell;
            return new Vector4((cx * Cell + 0.25f) / w, (cy * Cell + 0.25f) / h, ((cx + 1) * Cell - 0.25f) / w, ((cy + 1) * Cell - 0.25f) / h);
        }

        /// <summary>The middle of a cell: a flat colour from the vertex colours alone (the "white" cell).</summary>
        public static Vector2 Centre(int index)
        {
            var u = Uv(index);
            return new Vector2((u.x + u.z) * 0.5f, (u.y + u.w) * 0.5f);
        }

        static Color32 C(int r, int g, int b) => new Color32((byte)r, (byte)g, (byte)b, 255);

        static Texture2D Build()
        {
            int W = Cols * Cell, H = Rows * Cell;
            var px = new Color32[W * H];
            var rnd = new System.Random(7);

            void Put(int cell, int x, int y, Color32 c) => px[((cell / Cols) * Cell + y) * W + (cell % Cols) * Cell + x] = c;
            void Fill(int cell, Color32 baseC, Color32 specA, double densA, Color32 specB, double densB)
            {
                for (int y = 0; y < Cell; y++)
                    for (int x = 0; x < Cell; x++)
                    {
                        double r = rnd.NextDouble();
                        Put(cell, x, y, r < densA ? specA : r < densA + densB ? specB : baseC);
                    }
            }

            // grass (the web game's mown stripes alternate these two), speckled
            Fill(GrassA, C(56, 146, 38), C(40, 112, 30), 0.10, C(74, 170, 52), 0.05);
            Fill(GrassB, C(48, 130, 32), C(36, 100, 26), 0.10, C(62, 150, 42), 0.05);
            Fill(Gravel, C(168, 150, 104), C(130, 114, 80), 0.20, C(196, 180, 134), 0.12);
            Fill(Asphalt, C(26, 22, 32), C(20, 17, 26), 0.12, C(38, 33, 46), 0.08);
            Fill(Apron, C(96, 94, 100), C(80, 78, 86), 0.12, C(112, 110, 118), 0.08);
            Fill(Pit, C(48, 44, 56), C(38, 34, 46), 0.12, C(60, 56, 70), 0.08);
            Fill(Beyond, C(38, 96, 32), C(28, 76, 26), 0.12, C(48, 114, 38), 0.06);
            Fill(Concrete, C(150, 146, 140), C(128, 124, 118), 0.15, C(170, 166, 160), 0.08);
            Fill(White, C(255, 255, 255), C(255, 255, 255), 0, C(255, 255, 255), 0);

            // kerbs: solid red / white with a lighter top edge
            for (int k = 0; k < 2; k++)
            {
                int cell = k == 0 ? KerbRed : KerbWhite;
                var main = k == 0 ? C(206, 22, 30) : C(236, 232, 226);
                var edge = k == 0 ? C(150, 14, 22) : C(196, 192, 186);
                for (int y = 0; y < Cell; y++) for (int x = 0; x < Cell; x++) Put(cell, x, y, (y < 2 || y > 13) ? edge : main);
            }

            // asphalt with white edge lines on the sides that border something else
            var line = C(214, 206, 196);
            for (int mask = 0; mask < 16; mask++)
            {
                int cell = AsphaltEdges + mask;
                for (int y = 0; y < Cell; y++)
                    for (int x = 0; x < Cell; x++)
                    {
                        var c = px[(0 + (Asphalt / Cols) * Cell + y) * W + (Asphalt % Cols) * Cell + x];
                        bool on = ((mask & 1) != 0 && y >= Cell - 2) || ((mask & 4) != 0 && y < 2) || ((mask & 2) != 0 && x >= Cell - 2) || ((mask & 8) != 0 && x < 2);
                        Put(cell, x, y, on ? line : c);
                    }
            }

            // chequered line (4 px squares), tyre barriers (red and white drums with a dark band), the crowd
            for (int y = 0; y < Cell; y++)
                for (int x = 0; x < Cell; x++)
                {
                    Put(Chequer, x, y, ((x / 4 + y / 4) & 1) == 0 ? C(240, 240, 240) : C(20, 20, 24));
                    bool band = y % 8 >= 6;
                    Put(BarrierRed, x, y, band ? C(120, 10, 16) : C(214, 20, 28));
                    Put(BarrierWhite, x, y, band ? C(170, 166, 160) : C(238, 234, 228));
                }
            Color32[] crowd = { C(214, 60, 70), C(240, 200, 80), C(70, 130, 200), C(240, 240, 244), C(90, 210, 200), C(255, 110, 190), C(70, 160, 90) };
            for (int y = 0; y < Cell; y++)
                for (int x = 0; x < Cell; x++)
                    Put(Crowd, x, y, (x % 2 == 0 && y % 3 != 2) ? crowd[rnd.Next(crowd.Length)] : C(48, 40, 56));

            var t = new Texture2D(W, H, TextureFormat.RGBA32, false) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Clamp, name = "PixelAtlas" };
            t.SetPixels32(px);
            t.Apply(false, false);
            return t;
        }
    }
}
