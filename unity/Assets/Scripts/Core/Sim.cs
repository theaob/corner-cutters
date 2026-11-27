// Tile collision and ground height. Port of src/engine/sim.ts (the web game); engine-free, no UnityEngine.
// Units are the web game's own: px, px/s, radians (0 = north, clockwise), y pointing down the map.
using System;

namespace CornerCutters.Core
{
    public sealed class Grid
    {
        public int Width;
        public int Height;
        public double Tile;
        public bool[] Solid;
        /// <summary>Ground that slows road vehicles (grass, gravel); null = all smooth.</summary>
        public bool[] Rough;
        /// <summary>Ground height in px at each tile corner, (Width+1) x (Height+1), row by row; null = flat.</summary>
        public double[] Heights;
    }

    public struct Ground
    {
        public double H;
        /// <summary>height change per px moved east</summary>
        public double Gx;
        /// <summary>height change per px moved south</summary>
        public double Gy;
    }

    public struct MoveResult
    {
        public double X, Y;
        public bool HitX, HitY;
    }

    public static class Sim
    {
        public static Ground GroundAt(Grid g, double x, double y)
        {
            if (g.Heights == null) return default;
            double t = g.Tile;
            double fx = Math.Min(g.Width - 1e-6, Math.Max(0, x / t));
            double fy = Math.Min(g.Height - 1e-6, Math.Max(0, y / t));
            int tx = (int)Math.Floor(fx);
            int ty = (int)Math.Floor(fy);
            double u = fx - tx;
            double v = fy - ty;
            int row = g.Width + 1;
            double h00 = g.Heights[ty * row + tx];
            double h10 = g.Heights[ty * row + tx + 1];
            double h01 = g.Heights[(ty + 1) * row + tx];
            double h11 = g.Heights[(ty + 1) * row + tx + 1];
            return new Ground
            {
                H = h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v,
                Gx = ((h10 - h00) * (1 - v) + (h11 - h01) * v) / t,
                Gy = ((h01 - h00) * (1 - u) + (h11 - h10) * u) / t,
            };
        }

        /// <summary>Is the ground under (x, y) rough? Outside the map counts as smooth.</summary>
        public static bool IsRough(Grid g, double x, double y)
        {
            if (g.Rough == null) return false;
            int tx = (int)Math.Floor(x / g.Tile);
            int ty = (int)Math.Floor(y / g.Tile);
            if (tx < 0 || ty < 0 || tx >= g.Width || ty >= g.Height) return false;
            return g.Rough[ty * g.Width + tx];
        }

        /// <summary>Outside the map counts as solid.</summary>
        public static bool IsSolidTile(Grid g, int tx, int ty)
        {
            if (tx < 0 || ty < 0 || tx >= g.Width || ty >= g.Height) return true;
            return g.Solid[ty * g.Width + tx];
        }

        /// <summary>Does a circle at (x, y) with radius r overlap any solid tile?</summary>
        public static bool CircleBlocked(Grid g, double x, double y, double r)
        {
            double t = g.Tile;
            int y0 = (int)Math.Floor((y - r) / t), y1 = (int)Math.Floor((y + r) / t);
            int x0 = (int)Math.Floor((x - r) / t), x1 = (int)Math.Floor((x + r) / t);
            for (int ty = y0; ty <= y1; ty++)
            {
                for (int tx = x0; tx <= x1; tx++)
                {
                    if (!IsSolidTile(g, tx, ty)) continue;
                    double nx = Math.Max(tx * t, Math.Min(x, tx * t + t));
                    double ny = Math.Max(ty * t, Math.Min(y, ty * t + t));
                    double dx = x - nx, dy = y - ny;
                    if (dx * dx + dy * dy < r * r) return true;
                }
            }
            return false;
        }

        /// <summary>Move a circle by (dx, dy), sliding along walls. Sub-steps so fast movers can't tunnel.</summary>
        public static MoveResult MoveCircle(Grid g, double x, double y, double dx, double dy, double r)
        {
            int steps = (int)Math.Max(1, Math.Ceiling(Math.Max(Math.Abs(dx), Math.Abs(dy)) / (r * 0.5)));
            bool hitX = false, hitY = false;
            for (int i = 0; i < steps; i++)
            {
                if (!hitX)
                {
                    double nx = x + dx / steps;
                    if (CircleBlocked(g, nx, y, r)) hitX = true; else x = nx;
                }
                if (!hitY)
                {
                    double ny = y + dy / steps;
                    if (CircleBlocked(g, x, ny, r)) hitY = true; else y = ny;
                }
            }
            return new MoveResult { X = x, Y = y, HitX = hitX, HitY = hitY };
        }
    }
}
