// The gopher (Maple Island) and the yeti (Glacier Pass): ports of the web game's GopherRun (src/f1/gopher.ts) and
// YetiRun (src/f1/yeti.ts). The gopher now and then pops up beside the track up the road and scurries across; caught by
// a car it freezes, then bolts; hit, it's flung tumbling, sits dazed, and runs for a hole. The yeti lies in wait up the
// road, roars as the car comes by and gives chase beside the track until it's left behind. Scenery only: neither
// touches the car. Their numbers come from the web game (Resources/Scenery/<id>-gopher.bytes, -yeti.bytes).
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    [Serializable] public class Span { public double from, to; }

    /// <summary>gopher.ts's GOPHER.</summary>
    [Serializable]
    public class GopherTuning
    {
        public double wait, waitMore;
        public Span ahead;
        public double holeOut, speed, bolt, peek, duck, clear, danger, freeze, hit, hitSpeed, fling, lift, liftMore, gravity, tumble, dazed, home, size;
    }

    /// <summary>yeti.ts's YETI.</summary>
    [Serializable]
    public class YetiTuning
    {
        public double wait, waitMore;
        public Span ahead;
        public double @out, sees, roar, speed, chase, lose, patience, leave, leaveFor, size;
    }

    [Serializable] public class Avoid { public double x, y, r; }

    /// <summary>The numbers baked beside a critter's model.</summary>
    [Serializable]
    public class CritterNumbers
    {
        /// <summary>"gopher" or "yeti"</summary>
        public string kind;
        public GopherTuning gopher;
        public YetiTuning yeti;
        public double halfWidth;
        public Avoid[] avoid;
    }

    /// <summary>The web game's random numbers (an LCG), so the critters come when they do there.</summary>
    sealed class Lcg
    {
        uint seed;
        public Lcg(uint seed) { this.seed = seed; }
        public double Next()
        {
            unchecked { seed = seed * 1664525u + 1013904223u; }
            return seed / 4294967296.0;
        }
    }

    public struct CritterCar
    {
        public double X, Y, Vx, Vy;
    }

    public struct GopherPose
    {
        public double X, Y, Z, Heading, Up, Step, Tumble;
        public bool Running, Dazed;
    }

    public sealed class GopherRun
    {
        public enum Phase { Peek, Run, Freeze, Bolt, Flung, Dazed, Duck }

        public sealed class Air { public double X, Y, Z, Vx, Vy, Vz, Tumble, Heading; }

        public sealed class Crossing
        {
            public double FromX, FromY, ToX, ToY, Done, T;
            public Phase Phase;
            public bool Back;
            public List<(double x, double y)> Holes = new List<(double, double)>();
            public Air Air;
        }

        public Crossing Current;
        public int Crossings, Bolts, Hits;
        readonly GopherTuning G;
        readonly double halfWidth;
        readonly Track track;
        readonly Lcg r;
        double wait, stride;

        public GopherRun(Track track, GopherTuning g, double halfWidth, uint seed = 5)
        {
            this.track = track;
            G = g;
            this.halfWidth = halfWidth;
            r = new Lcg(seed);
            wait = G.wait * 0.5 + r.Next() * G.waitMore;
        }

        static double Hyp(double x, double y) => Math.Sqrt(x * x + y * y);
        double Lateral(int i, double x, double y) => (x - track.X[i]) * Math.Cos(track.Dir[i]) + (y - track.Y[i]) * Math.Sin(track.Dir[i]);

        /// <summary>dt s on, near focus (the camera's), with cars about.</summary>
        public void Step(double dt, IList<CritterCar> cars, double fx, double fy)
        {
            if (dt <= 0) return;
            var c = Current;
            if (c == null)
            {
                wait -= dt;
                if (wait > 0) return;
                Start(cars, fx, fy);
                return;
            }
            c.T += dt;
            if (c.Phase == Phase.Flung) { Fly(dt); return; }
            var (ax, ay) = Where();
            // hit: a car going by over it (not as it ducks into its hole)
            if (c.Phase != Phase.Duck)
                foreach (var k in cars)
                    if (Hyp(k.X - ax, k.Y - ay) < G.hit && Hyp(k.Vx, k.Vy) > G.hitSpeed) { Flung(ax, ay, k); return; }
            if (c.Phase == Phase.Peek)
            {
                if (c.T >= G.peek) { c.Phase = Phase.Run; c.T = 0; }
                return;
            }
            if (c.Phase == Phase.Dazed)
            {
                if (c.T >= G.dazed) { c.Phase = Phase.Bolt; c.T = 0; }
                return;
            }
            bool danger = false;
            foreach (var k in cars) danger |= Hyp(k.X - ax, k.Y - ay) < G.danger;
            if (c.Phase == Phase.Run && danger)
            {
                c.Phase = Phase.Freeze; c.T = 0; c.Back = c.Done < 0.5;
                return;
            }
            if (c.Phase == Phase.Freeze)
            {
                if (c.T >= G.freeze) { c.Phase = Phase.Bolt; c.T = 0; Bolts++; }
                return;
            }
            if (c.Phase == Phase.Run || c.Phase == Phase.Bolt)
            {
                double length = Math.Max(1, Hyp(c.ToX - c.FromX, c.ToY - c.FromY));
                double speed = G.speed * (c.Phase == Phase.Bolt ? G.bolt : 1);
                stride += speed * dt;
                c.Done += (c.Back ? -1 : 1) * speed * dt / length;
                if (c.Done >= 1 || c.Done <= 0)
                {
                    c.Done = Math.Max(0, Math.Min(1, c.Done));
                    c.Phase = Phase.Duck; c.T = 0;
                }
                return;
            }
            if (c.T >= G.duck) End();
        }

        void Flung(double x, double y, CritterCar car)
        {
            var c = Current;
            double speed = Hyp(car.Vx, car.Vy);
            double aside = (r.Next() - 0.5) * 0.5;
            double dir = Math.Atan2(car.Vy, car.Vx) + aside;
            double v = speed * G.fling;
            c.Air = new Air { X = x, Y = y, Z = 0, Vx = Math.Cos(dir) * v, Vy = Math.Sin(dir) * v, Vz = G.lift + speed * G.liftMore, Tumble = 0, Heading = dir };
            c.Phase = Phase.Flung; c.T = 0;
            Hits++;
        }

        void Fly(double dt)
        {
            var c = Current;
            var a = c.Air;
            a.X += a.Vx * dt;
            a.Y += a.Vy * dt;
            a.Vz -= G.gravity * dt;
            a.Z += a.Vz * dt;
            a.Tumble += G.tumble * dt;
            if (a.Z > 0) return;
            double lx = a.X, ly = a.Y;
            var near = c.Holes[0];
            foreach (var h in c.Holes) if (Hyp(h.x - lx, h.y - ly) < Hyp(near.x - lx, near.y - ly)) near = h;
            var to = near;
            if (Hyp(near.x - lx, near.y - ly) > G.home)
            {
                int k = Racing.NearestSample(track, lx, ly);
                double side = Math.Sign(Lateral(k, lx, ly));
                if (side == 0) side = 1;
                double o = halfWidth + G.holeOut;
                to = (track.X[k] + Math.Cos(track.Dir[k]) * o * side, track.Y[k] + Math.Sin(track.Dir[k]) * o * side);
                c.Holes.Add(to);
            }
            c.FromX = lx; c.FromY = ly; c.ToX = to.x; c.ToY = to.y;
            c.Done = 0; c.Back = false; c.Phase = Phase.Dazed; c.T = 0; c.Air = null;
        }

        void Start(IList<CritterCar> cars, double fx, double fy)
        {
            int n = track.Count;
            double spacing = track.S[1] - track.S[0];
            int at = Racing.NearestSample(track, fx, fy);
            var clear = new List<int>();
            for (int k = (int)Math.Ceiling(G.ahead.from / spacing); k <= G.ahead.to / spacing && k < n; k++)
            {
                int i = (at + k) % n;
                bool ok = true;
                foreach (var car in cars) ok &= Hyp(car.X - track.X[i], car.Y - track.Y[i]) > G.clear;
                if (ok) clear.Add(i);
            }
            if (clear.Count == 0) { wait = 1.5; return; }
            double o = halfWidth + G.holeOut;
            (double x, double y) Hole(int p, double s, double along) => (
                track.X[p] + Math.Cos(track.Dir[p]) * o * s + Math.Sin(track.Dir[p]) * along,
                track.Y[p] + Math.Sin(track.Dir[p]) * o * s - Math.Cos(track.Dir[p]) * along);
            bool OffTrack((double x, double y) h) => Math.Abs(Lateral(Racing.NearestSample(track, h.x, h.y), h.x, h.y)) > halfWidth + G.holeOut / 2;
            int q = clear[(int)Math.Floor(r.Next() * clear.Count)];
            double side = r.Next() < 0.5 ? 1 : -1;
            double lean = (r.Next() - 0.5) * 30;
            var from = Hole(q, side, -lean);
            var to = Hole(q, -side, lean);
            if (!OffTrack(from) || !OffTrack(to)) { wait = 1.5; return; }
            Current = new Crossing { FromX = from.x, FromY = from.y, ToX = to.x, ToY = to.y, Phase = Phase.Peek };
            Current.Holes.Add(from);
            Current.Holes.Add(to);
        }

        void End()
        {
            var c = Current;
            if (c != null && c.Phase == Phase.Duck && (c.Done >= 1 || c.Done <= 0)) Crossings++;
            Current = null;
            wait = G.wait + r.Next() * G.waitMore;
        }

        (double x, double y) Where()
        {
            var c = Current;
            return (c.FromX + (c.ToX - c.FromX) * c.Done, c.FromY + (c.ToY - c.FromY) * c.Done);
        }

        /// <summary>How it looks now; false: it's in its hole.</summary>
        public bool Pose(out GopherPose pose)
        {
            pose = default;
            var c = Current;
            if (c == null) return false;
            if (c.Air != null)
            {
                pose = new GopherPose { X = c.Air.X, Y = c.Air.Y, Z = c.Air.Z, Heading = c.Air.Heading, Up = 1, Tumble = c.Air.Tumble };
                return true;
            }
            var (x, y) = Where();
            double dir = Math.Atan2(c.ToY - c.FromY, c.ToX - c.FromX) + (c.Back ? Math.PI : 0);
            double up = c.Phase == Phase.Peek ? Math.Min(1, c.T / (G.peek * 0.4)) : c.Phase == Phase.Duck ? Math.Max(0, 1 - c.T / G.duck) : 1;
            pose = new GopherPose { X = x, Y = y, Heading = dir, Up = up, Step = stride / 5, Running = c.Phase == Phase.Run || c.Phase == Phase.Bolt, Dazed = c.Phase == Phase.Dazed };
            return true;
        }
    }

    public sealed class YetiRun
    {
        public enum Phase { Wait, Roar, Chase, Leave }

        public sealed class YetiPose
        {
            public double X, Y, Heading, T, Step;
            public Phase Phase;
        }

        /// <summary>out in the open (null: off out of sight)</summary>
        public YetiPose Pose;
        public int Chases;
        readonly YetiTuning Y;
        readonly Track track;
        readonly Avoid[] avoid;
        readonly Lcg r;
        readonly double keep;
        double side = 1, wait;

        public YetiRun(Track track, YetiTuning y, double halfWidth, Avoid[] avoid, uint seed = 3)
        {
            this.track = track;
            Y = y;
            this.avoid = avoid ?? new Avoid[0];
            keep = halfWidth + Y.@out;
            r = new Lcg(seed);
            wait = Y.wait * 0.4 + r.Next() * Y.waitMore * 0.5;
        }

        static double Hyp(double x, double y) => Math.Sqrt(x * x + y * y);
        double Lateral(int i, double x, double y) => (x - track.X[i]) * Math.Cos(track.Dir[i]) + (y - track.Y[i]) * Math.Sin(track.Dir[i]);

        /// <summary>dt s on, the camera on (fx, fy): the car it's after.</summary>
        public void Step(double dt, double fx, double fy)
        {
            if (dt <= 0) return;
            var p = Pose;
            if (p == null)
            {
                wait -= dt;
                if (wait <= 0) Appear(fx, fy);
                return;
            }
            p.T += dt;
            double far = Hyp(fx - p.X, fy - p.Y);
            if (p.Phase == Phase.Wait)
            {
                p.Heading = Math.Atan2(fy - p.Y, fx - p.X);
                if (far < Y.sees) { p.Phase = Phase.Roar; p.T = 0; }
                else if (p.T > Y.patience) Gone();
                return;
            }
            if (p.Phase == Phase.Roar)
            {
                p.Heading = Math.Atan2(fy - p.Y, fx - p.X);
                if (p.T >= Y.roar) { p.Phase = Phase.Chase; p.T = 0; Chases++; }
                return;
            }
            if (p.Phase == Phase.Chase)
            {
                if (far > Y.lose || p.T > Y.chase || Blocked(p.X, p.Y))
                {
                    int i = Racing.NearestSample(track, p.X, p.Y);
                    double d = track.Dir[i];
                    p.Phase = Phase.Leave; p.T = 0; p.Heading = Math.Atan2(Math.Sin(d) * side, Math.Cos(d) * side);
                    return;
                }
                int k = Racing.NearestSample(track, fx, fy);
                double tx = track.X[k] + Math.Cos(track.Dir[k]) * keep * side;
                double ty = track.Y[k] + Math.Sin(track.Dir[k]) * keep * side;
                double dx = tx - p.X, dy = ty - p.Y, dist = Hyp(dx, dy);
                double go = Math.Min(dist, Y.speed * dt);
                if (dist > 0.5)
                {
                    p.Heading = Math.Atan2(dy, dx);
                    p.X += dx / dist * go;
                    p.Y += dy / dist * go;
                    p.Step += go;
                }
                KeepOff(p);
                return;
            }
            p.X += Math.Cos(p.Heading) * Y.leave * dt;
            p.Y += Math.Sin(p.Heading) * Y.leave * dt;
            p.Step += Y.leave * dt;
            if (p.T >= Y.leaveFor) Gone();
        }

        void Appear(double fx, double fy)
        {
            int n = track.Count;
            double spacing = track.S[1] - track.S[0];
            int at = Racing.NearestSample(track, fx, fy);
            int k = (int)Math.Round((Y.ahead.from + r.Next() * (Y.ahead.to - Y.ahead.from)) / spacing, MidpointRounding.AwayFromZero);
            int q = (at + k) % n;
            double south = Math.Sin(track.Dir[q]);
            side = Math.Abs(south) > 0.3 ? Math.Sign(south) : r.Next() < 0.5 ? 1 : -1;
            double x = track.X[q] + Math.Cos(track.Dir[q]) * keep * side;
            double y = track.Y[q] + Math.Sin(track.Dir[q]) * keep * side;
            if (Math.Abs(Lateral(Racing.NearestSample(track, x, y), x, y)) < keep - 1 || Blocked(x, y)) { wait = 1.5; return; }
            Pose = new YetiPose { X = x, Y = y, Heading = Math.Atan2(fy - y, fx - x), Phase = Phase.Wait };
        }

        bool Blocked(double x, double y)
        {
            foreach (var a in avoid) if (Hyp(a.x - x, a.y - y) < a.r) return true;
            return false;
        }

        void KeepOff(YetiPose p)
        {
            int i = Racing.NearestSample(track, p.X, p.Y);
            double off = Lateral(i, p.X, p.Y);
            if (Math.Abs(off) >= keep) return;
            double s = Math.Sign(off);
            double to = (s != 0 ? s : side) * keep;
            p.X += Math.Cos(track.Dir[i]) * (to - off);
            p.Y += Math.Sin(track.Dir[i]) * (to - off);
        }

        void Gone()
        {
            Pose = null;
            wait = Y.wait + r.Next() * Y.waitMore;
        }
    }
}
