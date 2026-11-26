// The pit buildings, placed as the web game's circuitScene places them (baked by tools/unity/bake.ts): a garage behind
// each box, 28 px deep and 22 high, its open front (dark) facing the lane and a white roof, the row under one long roof
// line; the pit wall as a run of pale concrete blocks along the lane, turned to it (not a square tile each, which
// stairs up and down a lane that runs across the map's grid); and on a circuit with a word across its roofs
// (Baku's AZERBAIJAN), each roof its share of the word. The lane itself, its boxes' yellow markings and the speed-limit
// lines are in the ground picture.
using CornerCutters.Core;
using UnityEngine;
using Grid = CornerCutters.Core.Grid;

namespace CornerCutters.Game
{
    public static class PitView
    {
        const double Deep = 28, High = 22, WallHigh = 8;

        public static void Build(GameObject root, CircuitData c)
        {
            var pits = c.pits;
            if (pits == null || pits.garages == null) return;
            var grid = c.ToGrid();
            var mat = MeshBuilder.VertexColorMaterial();
            var mb = new MeshBuilder();
            float P = Units.PerPx;

            Color grey = TrackView.Hex(0x8e929c), door = TrackView.Hex(0x23222e), roof = TrackView.Hex(0xf4f4f8), concrete = TrackView.Hex(0xc9ccd4);
            float len = (float)(pits.boxSpacing - 2) * P, deep = (float)Deep * P, high = (float)High * P;
            foreach (var g in pits.garages)
            {
                // (turned to the lane: local x across it, to the right of the way of the race; local z along it)
                double h = Sim.GroundAt(grid, g.x, g.y).H;
                mb.Xf = Matrix4x4.TRS(Units.ToWorld(g.x, g.y, h), Quaternion.Euler(0, Units.Yaw(g.dir), 0), Vector3.one);
                Garage(mb, deep, high, len, pits.side < 0, grey, door, roof);
            }

            // the pit wall: a block between each two points of the lane, wallAcross px out from them
            var w = pits.wall;
            if (w != null && w.x != null)
            {
                float thick = (float)pits.wallThick * P, wh = (float)WallHigh * P;
                for (int k = 0; k + 1 < w.x.Length; k++)
                {
                    double ax = w.x[k], ay = w.y[k], bx = w.x[k + 1], by = w.y[k + 1];
                    double x = (ax + bx) / 2 + System.Math.Cos(w.dir[k]) * pits.wallAcross;
                    double y = (ay + by) / 2 + System.Math.Sin(w.dir[k]) * pits.wallAcross;
                    double heading = System.Math.Atan2(bx - ax, -(by - ay));
                    float l = (float)(System.Math.Sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)) + 0.6) * P;
                    mb.Xf = Matrix4x4.TRS(Units.ToWorld(x, y, Sim.GroundAt(grid, x, y).H), Quaternion.Euler(0, Units.Yaw(heading), 0), Vector3.one);
                    mb.Box(new Vector3(0, wh / 2, 0), new Vector3(thick, wh, l), concrete);
                }
            }
            mb.Xf = Matrix4x4.identity;

            var go = new GameObject("pits");
            go.transform.SetParent(root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("pits");
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;

            Roofs(root, c, grid, high);
        }

        /// <summary>One garage at the local origin: grey walls, its front open (dark) on the lane's side, a white roof.</summary>
        static void Garage(MeshBuilder mb, float deep, float high, float len, bool doorOnRight, Color grey, Color door, Color roof)
        {
            float x = deep / 2, z = len / 2;
            Vector3 p(float sx, float y, float sz) => new Vector3(sx * x, y, sz * z);
            Color32 shade(Color c, float s) => (Color)new Color(c.r * s, c.g * s, c.b * s, 1f);
            mb.Quad(p(-1, high, 1), p(1, high, 1), p(1, high, -1), p(-1, high, -1), shade(roof, 1f));                       // roof
            mb.Quad(p(1, high, 1), p(1, high, -1), p(1, 0, -1), p(1, 0, 1), shade(doorOnRight ? door : grey, 0.8f));        // +x side
            mb.Quad(p(-1, high, -1), p(-1, high, 1), p(-1, 0, 1), p(-1, 0, -1), shade(doorOnRight ? grey : door, 0.8f));    // -x side
            mb.Quad(p(-1, high, 1), p(1, high, 1), p(1, 0, 1), p(-1, 0, 1), shade(grey, 0.9f));                            // ends
            mb.Quad(p(1, high, -1), p(-1, high, -1), p(-1, 0, -1), p(1, 0, -1), shade(grey, 0.7f));
        }

        /// <summary>The word across the roofs: each roof, in reading order, its share of the row's picture, just above it.</summary>
        static void Roofs(GameObject root, CircuitData c, Grid grid, float high)
        {
            var pits = c.pits;
            if (string.IsNullOrEmpty(pits.roof) || pits.roofs == null || pits.roofs.Length == 0) return;
            var tex = Resources.Load<Texture2D>("Grounds/" + c.id + "-roof");
            if (tex == null) return;
            var mat = new Material(MeshBuilder.VertexColorMaterial()) { name = "Roof " + c.id, mainTexture = tex };
            var mb = new MeshBuilder();
            int n = pits.roofs.Length;
            double halfL = (pits.boxSpacing - 2) / 2, halfD = Deep / 2;
            for (int k = 0; k < n; k++)
            {
                var r = pits.roofs[k];
                double h = Sim.GroundAt(grid, r.x, r.y).H + High + 0.3;
                // u along (tx, tz) in map px; the picture's top toward (tz, -tx)
                double ux = r.tx, uy = r.tz, vx = r.tz, vy = -r.tx;
                Vector3 Q(double a, double b) => Units.ToWorld(r.x + ux * a + vx * b, r.y + uy * a + vy * b, h);
                float u0 = (float)k / n, u1 = (float)(k + 1) / n;
                Color32 white = Color.white;
                mb.QuadUv(Q(-halfL, halfD), Q(halfL, halfD), Q(halfL, -halfD), Q(-halfL, -halfD),
                    new Vector2(u0, 1), new Vector2(u1, 1), new Vector2(u1, 0), new Vector2(u0, 0), white, white, white, white);
            }
            var go = new GameObject("pit roofs");
            go.transform.SetParent(root.transform, false);
            go.AddComponent<MeshFilter>().sharedMesh = mb.ToMesh("pit roofs");
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
        }
    }
}
