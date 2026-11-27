// Cherry blossom petals (a circuit with its cherry trees in blossom: Nippon): a port of the web game's PetalField
// (src/f1/petals.ts). They fall from the trees near the camera, drift on the breeze as they sink, and settle on the grass
// and on the track. A car driving over petals on the ground kicks them up: thrown out from under it and along in its
// wake, the faster it goes the higher, tumbling back down to settle again. Some lie on the track from the start, under
// the trees that line it. One on the track lies there till a car kicks it off; one on the grass lies a while, then goes.
// The trees come from the web game (Resources/Scenery/<id>-blossoms.json); PetalView draws them.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    /// <summary>petals.ts's PETALS.</summary>
    public static class PetalTuning
    {
        public const int Max = 1400, OnTrack = 600;
        public const double FallRate = 45, Near = 520, WindX = 16, WindY = 6, Sink = 10, Sway = 12, Drag = 1.6;
        public const double Reach = 22, KickSpeed = 70, Carry = 0.45, Out = 70, Up = 70, Level = 14, Life = 50;
    }

    public sealed class Petal
    {
        public double X, Y, Z, Vx, Vy, Vz;
        /// <summary>turned about its own axis (radians), and how fast it tumbles in the air (rad/s)</summary>
        public double Spin, Tumble;
        public bool Resting;
        /// <summary>s left lying (it goes at 0; infinity on the track)</summary>
        public double Life;
        public bool OnTrack;
        /// <summary>its pink (an index into the palette), and its own sway's phase</summary>
        public int Shade;
        public double Phase;
    }

    /// <summary>A car, as the petals feel it.</summary>
    public struct PetalCar
    {
        public double X, Y, Vx, Vy, Z;
        public bool Airborne;
    }

    /// <summary>A cherry tree: where it stands and how tall.</summary>
    [Serializable] public class BlossomTree { public double x, y, h; }
    [Serializable] public class BlossomTrees { public BlossomTree[] trees; }

    public sealed class PetalField
    {
        public readonly List<Petal> Petals = new List<Petal>();
        readonly Grid grid;
        readonly Track track;
        readonly BlossomTree[] trees;
        readonly Lcg r;
        readonly List<BlossomTree> near = new List<BlossomTree>();
        double due, time, focusX, focusY;

        public PetalField(Grid grid, Track track, BlossomTree[] trees, uint seed = 7)
        {
            this.grid = grid;
            this.track = track;
            this.trees = trees;
            r = new Lcg(seed);
            int n = track.Count;
            var lv = track.Levels;
            bool OnBridge(int i) => lv != null && (lv.From <= lv.To ? i >= lv.From && i <= lv.To : i >= lv.From || i <= lv.To);
            // (none on a bridge's stretch, nor on the road under its deck)
            var deck = new List<int>();
            for (int i = 0; i < n; i++) if (OnBridge(i)) deck.Add(i);
            const double hw = TrackLimits.HalfWidth;
            bool UnderDeck(double x, double y)
            {
                foreach (int q in deck)
                    if (Math.Abs(track.X[q] - x) < hw * 2.5 && JsMath.Hypot(track.X[q] - x, track.Y[q] - y) < hw * 2.5) return true;
                return false;
            }
            var lined = new List<int>();
            for (int i = 0; i < n; i++)
            {
                if (OnBridge(i % n) || UnderDeck(track.X[i], track.Y[i])) continue;
                foreach (var t in trees)
                    if (JsMath.Hypot(t.x - track.X[i], t.y - track.Y[i]) < hw + 200) { lined.Add(i); break; }
            }
            for (int k = 0; k < PetalTuning.OnTrack && lined.Count > 0; k++)
            {
                int p = lined[(int)Math.Floor(r.Next() * lined.Count)];
                double across = (r.Next() * 2 - 1) * hw;
                double along = (r.Next() - 0.5) * 16;
                double dir = track.Dir[p];
                double x = track.X[p] + JsMath.Cos(dir) * across + JsMath.Sin(dir) * along;
                double y = track.Y[p] + JsMath.Sin(dir) * across - JsMath.Cos(dir) * along;
                Add(x, y, Sim.GroundAt(grid, x, y).H, true);
                Settle(Petals[Petals.Count - 1]);
            }
        }

        void Add(double x, double y, double z, bool resting)
        {
            if (Petals.Count >= PetalTuning.Max)
            {
                // (too many: one lying on the grass goes, the farthest from the camera; failing that, one on the track)
                int gone = -1;
                double far = -1;
                foreach (bool grass in new[] { true, false })
                {
                    for (int i = 0; i < Petals.Count; i++)
                    {
                        var q = Petals[i];
                        if (!q.Resting || q.OnTrack == grass) continue;
                        double d = (q.X - focusX) * (q.X - focusX) + (q.Y - focusY) * (q.Y - focusY);
                        if (d > far) { gone = i; far = d; }
                    }
                    if (gone >= 0) break;
                }
                if (gone < 0) return;
                Petals.RemoveAt(gone);
            }
            var p = new Petal
            {
                X = x, Y = y, Z = z,
                Vx = resting ? 0 : PetalTuning.WindX, Vy = resting ? 0 : PetalTuning.WindY, Vz = resting ? 0 : -PetalTuning.Sink,
                Resting = resting, Life = PetalTuning.Life,
            };
            p.Spin = r.Next() * Math.PI * 2;
            p.Tumble = (r.Next() * 2 - 1) * 6;
            p.Shade = (int)Math.Floor(r.Next() * 5);
            p.Phase = r.Next() * Math.PI * 2;
            Petals.Add(p);
        }

        void Settle(Petal p)
        {
            int i = Racing.NearestSample(track, p.X, p.Y);
            p.OnTrack = Math.Abs(Racing.LateralOffset(track, i, p.X, p.Y)) <= TrackLimits.HalfWidth;
            p.Life = p.OnTrack ? double.PositiveInfinity : PetalTuning.Life;
        }

        /// <summary>dt s on: petals falling from the trees near the focus (the camera's), drifting and settling; any cars
        /// driving over them kick them up.</summary>
        public void Step(double dt, IReadOnlyList<PetalCar> cars, double fx, double fy)
        {
            if (dt <= 0) return;
            time += dt;
            focusX = fx;
            focusY = fy;
            due += PetalTuning.FallRate * dt;
            near.Clear();
            foreach (var t in trees) if (Math.Abs(t.x - fx) < PetalTuning.Near && Math.Abs(t.y - fy) < PetalTuning.Near) near.Add(t);
            while (due >= 1)
            {
                due -= 1;
                if (near.Count == 0) continue;
                var t = near[(int)Math.Floor(r.Next() * near.Count)];
                double a = r.Next() * Math.PI * 2;
                double d = r.Next() * t.h * 0.35;
                Add(t.x + JsMath.Cos(a) * d, t.y + JsMath.Sin(a) * d, Sim.GroundAt(grid, t.x, t.y).H + t.h * (0.55 + 0.4 * r.Next()), false);
            }
            // the breeze, gusting and veering a little
            double gust = 1 + 0.5 * JsMath.Sin(time * 0.7) + 0.25 * JsMath.Sin(time * 2.3);
            double wx = PetalTuning.WindX * gust + 4 * JsMath.Sin(time * 0.4);
            double wy = PetalTuning.WindY * gust;
            for (int i = Petals.Count - 1; i >= 0; i--)
            {
                var p = Petals[i];
                if (p.Resting)
                {
                    p.Life -= dt;
                    if (p.Life <= 0)
                    {
                        Petals.RemoveAt(i);
                        continue;
                    }
                    // a car over it: kicked up
                    for (int c = 0; c < cars.Count; c++)
                    {
                        var car = cars[c];
                        if (car.Airborne || Math.Abs(car.Z - p.Z) > PetalTuning.Level) continue;
                        double dx = p.X - car.X, dy = p.Y - car.Y;
                        if (Math.Abs(dx) > PetalTuning.Reach || Math.Abs(dy) > PetalTuning.Reach) continue;
                        double d = JsMath.Hypot(dx, dy);
                        double v = JsMath.Hypot(car.Vx, car.Vy);
                        if (d > PetalTuning.Reach || v < PetalTuning.KickSpeed) continue;
                        double pace = Math.Min(1, v / 300);
                        double ox = d > 0.01 ? dx / d : r.Next() - 0.5;
                        double oy = d > 0.01 ? dy / d : r.Next() - 0.5;
                        double push = PetalTuning.Out * (1 - d / PetalTuning.Reach) * (0.6 + 0.4 * r.Next()) * pace;
                        p.Vx = car.Vx * PetalTuning.Carry * (0.6 + 0.4 * r.Next()) + ox * push;
                        p.Vy = car.Vy * PetalTuning.Carry * (0.6 + 0.4 * r.Next()) + oy * push;
                        p.Vz = PetalTuning.Up * pace * (0.5 + 0.5 * r.Next());
                        p.Tumble = (r.Next() * 2 - 1) * 14;
                        p.Resting = false;
                        p.OnTrack = false;
                        break;
                    }
                    continue;
                }
                // in the air: brought to the breeze, swaying, sinking
                double k = Math.Min(1, PetalTuning.Drag * dt);
                p.Vx += (wx - p.Vx) * k;
                p.Vy += (wy - p.Vy) * k;
                p.Vz += (-PetalTuning.Sink - p.Vz) * Math.Min(1, 2.5 * dt);
                p.X += (p.Vx + JsMath.Sin(time * 2.1 + p.Phase) * PetalTuning.Sway) * dt;
                p.Y += (p.Vy + JsMath.Cos(time * 1.7 + p.Phase) * PetalTuning.Sway * 0.5) * dt;
                p.Z += p.Vz * dt;
                p.Spin += p.Tumble * dt;
                double ground = Sim.GroundAt(grid, p.X, p.Y).H;
                if (p.Z <= ground)
                {
                    p.Z = ground;
                    p.Vx = p.Vy = p.Vz = 0;
                    p.Resting = true;
                    Settle(p);
                }
            }
        }

        /// <summary>How many lie on the ground, and how many are in the air.</summary>
        public void Counts(out int resting, out int flying)
        {
            resting = 0;
            foreach (var p in Petals) if (p.Resting) resting++;
            flying = Petals.Count - resting;
        }
    }
}
