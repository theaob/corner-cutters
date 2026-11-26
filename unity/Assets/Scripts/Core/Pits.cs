// The pit lane and pit stops: a port of src/f1/pits.ts. A car that leaves the track at the pit entry is committed, and
// from there it drives itself: down the lane on the limiter, into its team's box, stopped while the crew fits new tyres
// and repairs it, and back out at the exit. After the race it goes home to its garage, pushed in by the crew. The lane
// itself is baked from the web game's (tools/unity/bake.ts: pitLane).
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    public struct PitLanePoint
    {
        public double X, Y, S, Dir, Off;
        public int Idx;
    }

    public sealed class PitLane
    {
        public struct Spot { public int Idx; public double Lane; }

        public int Side;
        public PitLanePoint[] Points;
        public double Length;
        public int Entry, Exit, WallFrom, WallTo;
        public double[] Boxes;
        public double LimitFrom, LimitTo;
        /// <summary>after the race: the top three's parking spots on the main straight (P1 furthest on)</summary>
        public Spot[] Podium;
    }

    public enum PitPhase { In, Stopped, Out, Garage }

    public sealed class PitPush
    {
        public double X, Y, Heading, Done;
    }

    public sealed class PitStop
    {
        public PitPhase Phase;
        public int At;
        public int Box;
        public double Left, Time;
        /// <summary>after the race: px along from the garage's middle it ends up (null: a race stop)</summary>
        public double? Home;
        public PitPush Push;
    }

    public struct PitStepResult
    {
        public DriveInput Input;
        public bool Done, Stopped, Repaired;
    }

    public static class Pits
    {
        public const double Offset = 130, Taper = 360, JoinAt = 32, Limit = 120, Road = 160, OnTrack = 54;
        public const double FastLane = -20, BoxLane = 24, BoxSpacing = 60, Stop = 1.2, Repair = 3, Commit = 52, Decel = 300;
        public const int BoxCount = 5;
        public const double GarageWait = 0.6, GaragePush = 2.2, PodiumAcross = 30;
        public static readonly double[] GarageSlots = { 10, -10 };
        public static readonly double[] PodiumAt = { 170, 115, 60 };
        public const double GarageAcross = 74;
        const double LaneReach = 50;

        static double Ease(double t) => (1 - JsMath.Cos(Math.Max(0, Math.Min(1, t)) * Math.PI)) * 0.5;

        public static bool InLimitZone(PitLane pit, double s) => s >= pit.LimitFrom && s <= pit.LimitTo;

        /// <summary>Whether track sample idx is between from and to (inclusive), going the way of the race.</summary>
        public static bool Between(int idx, int from, int to, int n) => JsMath.Wrap(idx - from, n) <= JsMath.Wrap(to - from, n);

        public static int NearestLanePoint(PitLane pit, double x, double y, int? hint = null)
        {
            int best = hint ?? 0;
            double bestD = double.PositiveInfinity;
            int from = hint == null ? 0 : Math.Max(0, hint.Value - 12);
            int to = hint == null ? pit.Points.Length - 1 : Math.Min(pit.Points.Length - 1, hint.Value + 12);
            for (int k = from; k <= to; k++)
            {
                var p = pit.Points[k];
                double d = (p.X - x) * (p.X - x) + (p.Y - y) * (p.Y - y);
                if (d < bestD) { best = k; bestD = d; }
            }
            return best;
        }

        public static double StopTime(Car car) => Stop + Repair * (1 - car.Health / car.Cls.Health);

        public static bool EntersPit(PitLane pit, Track track, Car car, int idx)
        {
            if (car.Wrecked || !Between(idx, pit.Entry, pit.WallTo, track.Count)) return false;
            return Racing.LateralOffset(track, idx, car.X, car.Y) * pit.Side > Commit;
        }

        public static PitStop NewPitStop(PitLane pit, Car car, int box, double? home = null) => new PitStop
        {
            Phase = PitPhase.In, At = NearestLanePoint(pit, car.X, car.Y), Box = Math.Max(0, Math.Min(pit.Boxes.Length - 1, box)), Home = home,
        };

        /// <summary>The lane point at (or just past) the box's place along the lane.</summary>
        public static PitLanePoint BoxPoint(PitLane pit, int box)
        {
            foreach (var p in pit.Points) if (p.S >= pit.Boxes[box]) return p;
            return pit.Points[pit.Points.Length - 1];
        }

        public static void PushIntoGarage(PitLane pit, PitStop stop, Car car)
        {
            var push = stop.Push;
            var q = BoxPoint(pit, stop.Box);
            double across = GarageAcross * pit.Side;
            double along = stop.Home ?? 0;
            double toX = q.X + JsMath.Cos(q.Dir) * across + JsMath.Sin(q.Dir) * along;
            double toY = q.Y + JsMath.Sin(q.Dir) * across - JsMath.Cos(q.Dir) * along;
            double toHeading = q.Dir - (pit.Side * Math.PI) / 2;
            double t = Ease(push.Done / GaragePush);
            double turn = Ease(Math.Min(1, (push.Done / GaragePush) * 1.6));
            double d = JsMath.Atan2(JsMath.Sin(toHeading - push.Heading), JsMath.Cos(toHeading - push.Heading));
            car.X = push.X + (toX - push.X) * t;
            car.Y = push.Y + (toY - push.Y) * t;
            car.Heading = push.Heading + d * turn;
            car.Vx = car.Vy = 0;
        }

        public static bool WantsPit(Car car, TyreSet tyres, double lapsLeft, double lapTime, double damageSlow, double trackLength)
        {
            if (car.Wrecked) return false;
            return Tyres.StopNow(new StopPlan
            {
                LapsLeft = lapsLeft, LapTime = lapTime, Wear = tyres.Wear, PerLap = Tyres.WearPerLap(tyres, trackLength),
                Damage = 1 - car.Health / car.Cls.Health, DamageSlow = damageSlow, StopTime = StopTime(car),
            });
        }

        static double LaneTarget(PitLane pit, PitStop stop, double s)
        {
            double box = pit.Boxes[stop.Box];
            if (s < pit.LimitFrom - 40 || s > pit.LimitTo + 40) return 0;
            if (stop.Phase == PitPhase.Out && s > box + 60) return FastLane;
            if (stop.Phase == PitPhase.Stopped) return BoxLane;
            double t = stop.Phase == PitPhase.In ? 1 - (box - s - 40) / 80 : 1 - (s - box) / 60;
            return FastLane + (BoxLane - FastLane) * Ease(t);
        }

        static DriveInput Held() => new DriveInput { Handbrake = true, Brake = true };

        public static PitStepResult PitStep(PitLane pit, PitStop stop, Car car, IList<Car> others, double dt)
        {
            stop.At = NearestLanePoint(pit, car.X, car.Y, stop.At);
            var here = pit.Points[stop.At];
            double v = Driving.SpeedOf(car);
            double box = pit.Boxes[stop.Box];
            bool stopped = false, repaired = false;
            if (stop.Home != null && stop.Phase == PitPhase.In && here.S >= box - 6 && v < 8)
            {
                stop.Phase = PitPhase.Stopped;
                stop.Time = stop.Left = GarageWait;
            }
            if (stop.Home != null && stop.Phase == PitPhase.Stopped)
            {
                stop.Left -= dt;
                if (stop.Left <= 0)
                {
                    stop.Phase = PitPhase.Garage;
                    stop.Push = new PitPush { X = car.X, Y = car.Y, Heading = car.Heading, Done = 0 };
                }
                return new PitStepResult { Input = Held() };
            }
            if (stop.Phase == PitPhase.Garage)
            {
                stop.Push.Done = Math.Min(GaragePush, stop.Push.Done + dt);
                PushIntoGarage(pit, stop, car);
                return new PitStepResult { Input = Held() };
            }
            if (stop.Phase == PitPhase.In && here.S >= box - 6 && v < 8)
            {
                stop.Phase = PitPhase.Stopped;
                stop.Time = stop.Left = StopTime(car);
                stopped = true;
                car.Burn = null;
            }
            if (stop.Phase == PitPhase.Stopped)
            {
                double rate = car.Cls.Health / Repair;
                car.Health = Math.Min(car.Cls.Health, car.Health + rate * dt);
                stop.Left -= dt;
                if (stop.Left > 0) return new PitStepResult { Input = Held(), Stopped = stopped };
                car.Health = car.Cls.Health;
                stop.Phase = PitPhase.Out;
                repaired = true;
            }
            if (stop.At >= pit.Points.Length - 1 || (stop.Phase == PitPhase.Out && here.S >= pit.Length - 4))
                return new PitStepResult { Input = new DriveInput { Handbrake = false }, Done = true, Stopped = stopped, Repaired = repaired };

            var ahead = pit.Points[Math.Min(pit.Points.Length - 1, stop.At + Math.Max(2, JsMath.RoundToInt((20 + v * 0.25) / 8)))];
            double across = LaneTarget(pit, stop, ahead.S) * pit.Side;
            double tx = ahead.X + JsMath.Cos(ahead.Dir) * across;
            double ty = ahead.Y + JsMath.Sin(ahead.Dir) * across;
            bool zone = InLimitZone(pit, here.S);
            double want = zone ? Limit : here.S < pit.LimitFrom ? Math.Min(Road, Math.Sqrt(Limit * Limit + 2 * Decel * (pit.LimitFrom - here.S))) : car.Cls.TopSpeed;
            if (stop.Phase == PitPhase.In) want = Math.Min(want, Math.Sqrt(2 * Decel * Math.Max(0, box - here.S)) + 4);
            if (stop.Phase == PitPhase.In && here.S < pit.LimitFrom && here.Off < OnTrack) want = Math.Max(want, v);
            double mine = LaneTarget(pit, stop, here.S);
            foreach (var o in others)
            {
                int k = NearestLanePoint(pit, o.X, o.Y, stop.At);
                var q = pit.Points[k];
                double along = q.S - here.S;
                if (along <= 0 || along > 60 + (v * v) / (2 * Decel)) continue;
                double theirs = ((o.X - q.X) * JsMath.Cos(q.Dir) + (o.Y - q.Y) * JsMath.Sin(q.Dir)) * pit.Side;
                if (Math.Abs(theirs) > LaneReach || Math.Abs(theirs - mine) > 26) continue;
                double so = Driving.SpeedOf(o);
                want = Math.Min(want, along < 34 ? (so < 1 ? 0 : so * 0.7) : Math.Sqrt(so * so + 2 * Decel * (along - 34)));
            }
            double dx = tx - car.X, dy = ty - car.Y;
            double d = JsMath.Hypot(dx, dy);
            if (d == 0) d = 1;
            double mag = Math.Max(0.05, Math.Min(1, want / car.Cls.TopSpeed));
            return new PitStepResult
            {
                Input = new DriveInput
                {
                    Steer = new Vec2(dx / d * mag, dy / d * mag), Handbrake = false, Brake = v > want + 6 || want == 0,
                    Limit = zone ? Limit : here.S < pit.LimitFrom ? Road : (double?)null,
                },
                Stopped = stopped, Repaired = repaired,
            };
        }
    }
}
