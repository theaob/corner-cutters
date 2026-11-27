// The AI drivers: a port of src/f1/racing.ts's aiInput and coolDownInput. They drive the racing line, aiming at a point
// ahead at their lane and holding the speed the line allows, and race the cars round them: passing on a straight long
// enough to finish the move, defending the inside of the next bend, leaving a car alongside room, giving way side by
// side into a bend, now and then getting a bend wrong (a lock-up, or running wide), and now and then misjudging a dive
// at the car ahead. Checked against the web game's own races (Tests~/Core.Tests, race.json).
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    public enum MoveKind { Pass, Defend }
    public enum Slip { None, Late, Wide }

    public sealed class AiMove
    {
        public MoveKind Kind;
        public int Side;
        public Car Car;
    }

    public sealed class AiDriver
    {
        /// <summary>px to the right of the centreline this driver aims for</summary>
        public double Lane;
        /// <summary>share of the line's speed it drives at (skill)</summary>
        public double Pace;
        /// <summary>0…1: its racecraft (0.6 unless given)</summary>
        public double? Craft;
        public AiMove Move;
        /// <summary>its chance of a mistake into each bend, and its dice (none: no mistakes)</summary>
        public double Mistakes;
        public SeededRandom Rng;
        public Slip Slip;
        public double SlipMin = double.PositiveInfinity;
        public int? SlipApex;
        public bool WasStraight;
        /// <summary>s after lights out before it gets going</summary>
        public double Reaction;
        /// <summary>its chance of misjudging a dive at the car ahead into a braking bend</summary>
        public double Incidents;
        public Car LungeCar;
        public int LungeFrom;

        public AiDriver Clone() => (AiDriver)MemberwiseClone();
    }

    /// <summary>Race control's orders for a driver.</summary>
    public sealed class Orders
    {
        public double? Limit;
        public bool NoOvertaking;
        public Car Blue;
        public List<Car> Lapping;
        public Car Spare;

        public Orders Clone() => new Orders { Limit = Limit, NoOvertaking = NoOvertaking, Blue = Blue, Lapping = Lapping, Spare = Spare };
    }

    public static class Ai
    {
        // RACECRAFT
        public const double LaneLimit = 28, InsideLimit = 14, TightBend = 1.0 / 260, PassGap = 23, PassRoom = 160, PassTime = 1.6;
        public const double Margin = 10, BoldMargin = 3, Cover = 20, DefendFrom = 0.45, DefendRange = 100, Room = 22;
        public const double LungeFrom = 90, LungeFor = 260, LungeBrake = 1;
        public const double BlueLane = 24, BlueLift = 0.9, BlueClose = 90;
        public const double LockUp = 1.05, Recover = 0.55, RecoverFor = 170, Wide = 22, WideSlow = 0.78;
        const double TowRoom = 120;
        const double Yield = 12;

        static bool StraightFor(Track track, int idx, double px, double top)
        {
            int n = track.Count;
            for (int k = 0; k * track.Spacing < px; k += 2) if (track.Speed[(idx + k) % n] < top - 1) return false;
            return true;
        }

        static double StraightAhead(Track track, int idx, double top, double max)
        {
            int n = track.Count;
            int k = 0;
            while (k * track.Spacing < max && track.Speed[(idx + k) % n] >= top - 1) k += 2;
            return k * track.Spacing;
        }

        static double NextBend(Track track, int idx, double px)
        {
            int n = track.Count;
            double best = 0;
            for (int k = 0; k * track.Spacing < px; k++)
            {
                double c = track.Curve[(idx + k) % n];
                if (Math.Abs(c) > Math.Abs(best)) best = c;
            }
            return best;
        }

        sealed class Seen
        {
            public Car O;
            public double Along, Theirs, Across, Speed;
        }

        static double JsSign(double v) => JsMath.Sign(v);

        public static DriveInput AiInput(Car car, Track track, int idx, AiDriver ai, IList<Car> others, Orders orders, double boost = 1)
        {
            orders ??= new Orders();
            int n = track.Count;
            double v = Driving.SpeedOf(car);
            double top = car.Cls.TopSpeed;
            double craft = ai.Craft ?? 0.6;
            int ahead = JsMath.RoundToInt((40 + v * 0.3) / track.Spacing);
            int ti = (idx + ahead) % n;
            double line = track.Speed[(idx + 2) % n];
            bool straight = line >= top - 1;
            double cornering = straight ? 1 : car.TyreGrip;
            double mine = Racing.LateralOffset(track, idx, car.X, car.Y);
            bool brakeRoom = straight && StraightFor(track, idx, TowRoom + v * 1.1, top);
            bool passRoom = brakeRoom && StraightFor(track, idx, PassRoom + v * PassTime, top);
            double free = line * ai.Pace * cornering * (brakeRoom ? boost : 1);
            int inside = NextBend(track, idx, 700) >= 0 ? 1 : -1;

            double hdir = track.Dir[idx];
            double fx = JsMath.Sin(hdir), fy = -JsMath.Cos(hdir);
            var seen = new List<Seen>(others.Count);
            foreach (var o in others)
            {
                double along = (o.X - car.X) * fx + (o.Y - car.Y) * fy;
                double theirs = Racing.LateralOffset(track, idx, o.X, o.Y);
                seen.Add(new Seen { O = o, Along = along, Theirs = theirs, Across = theirs - mine, Speed = Driving.SpeedOf(o) });
            }
            Seen Find(Car c) { foreach (var s in seen) if (s.O == c) return s; return null; }
            bool racing = !orders.NoOvertaking;
            double margin = Margin - (Margin - BoldMargin) * craft;
            // the car ahead in our way: the nearest
            Seen inWay = null;
            foreach (var c in seen)
                if (!c.O.Wrecked && c.Along > 0 && c.Along < 70 + Math.Max(0, v - c.Speed) * 0.9 && Math.Abs(c.Across) < 20 && (inWay == null || c.Along < inWay.Along)) inWay = c;
            var alongside = new List<Seen>();
            foreach (var c in seen) if (!c.O.Wrecked && Math.Abs(c.Along) < 34 && Math.Abs(c.Across) < 28) alongside.Add(c);

            var move = ai.Move;
            var other = move != null ? Find(ai.Move.Car) : null;
            var victim = move?.Kind == MoveKind.Pass ? other : null;
            var attacker = move?.Kind == MoveKind.Defend ? other : null;
            if (move?.Kind == MoveKind.Pass)
            {
                if (!racing || victim == null || victim.O.Wrecked || victim.Along < -45 || victim.Along > 120 || (!passRoom && victim.Along > 20)) move = null;
            }
            else if (move?.Kind == MoveKind.Defend)
            {
                if (!racing || !straight || attacker == null || attacker.O.Wrecked || attacker.Along > -10 || attacker.Along < -1.5 * DefendRange) move = null;
            }
            bool CanPass(Seen c)
            {
                double left = StraightAhead(track, idx, top, 2400) - (TowRoom + v * 1.1);
                double edge = 0.5 * Math.Max(0, v - c.Speed) + (line * ai.Pace - c.Speed);
                return left > 0 && edge >= margin * 0.5 && edge * (left / Math.Max(v, 1)) >= 1.3 * (c.Along + 45);
            }
            if (move == null && racing && inWay != null && inWay.Along < 45 + Math.Max(0, v - inWay.Speed) * 0.6 && passRoom && free > inWay.Speed + margin && CanPass(inWay))
            {
                bool l = inWay.Theirs - PassGap >= -LaneLimit;
                bool r = inWay.Theirs + PassGap <= LaneLimit;
                int side = l && (!r || inWay.Theirs >= 0) ? -1 : 1;
                move = new AiMove { Kind = MoveKind.Pass, Side = side, Car = inWay.O };
            }
            if (move == null && racing && straight && craft >= DefendFrom)
            {
                Seen closing = null;
                foreach (var c in seen)
                    if (!c.O.Wrecked && c.Along < -20 && c.Along > -DefendRange && Math.Abs(c.Across) < 8 && c.Speed > v + 3) { closing = c; break; }
                bool inTheWay = false;
                foreach (var c in alongside) if (JsSign(c.Across) == inside) inTheWay = true;
                if (closing != null && !inTheWay) move = new AiMove { Kind = MoveKind.Defend, Side = inside, Car = closing.O };
            }
            var lapper = orders.Blue != null ? Find(orders.Blue) : null;
            if (lapper != null) move = null;
            ai.Move = move;

            bool Braking()
            {
                double slowest = top;
                for (int k = 0; k * track.Spacing < 300; k += 2) slowest = Math.Min(slowest, track.Speed[(idx + k) % n]);
                return slowest < 0.8 * top;
            }
            if (ai.WasStraight && !straight && racing && ai.Rng != null && ai.Incidents > 0 && ai.LungeCar == null && ai.Slip == Slip.None)
            {
                Seen target = null;
                foreach (var c in seen)
                    if (!c.O.Wrecked && c.O != orders.Spare && c.Along > 8 && c.Along < LungeFrom && Math.Abs(c.Across) < 22) { target = c; break; }
                if (target != null && Braking() && ai.Rng.Next() < ai.Incidents) { ai.LungeCar = target.O; ai.LungeFrom = idx; }
            }
            // (found before the dive is called off below: the step it ends, it still aims and brakes as diving, as the web game does)
            var lungeAt = ai.LungeCar != null ? Find(ai.LungeCar) : null;
            if (ai.LungeCar != null && (!racing || lungeAt == null || lungeAt.Along < -10 || JsMath.Wrap(idx - ai.LungeFrom, n) * track.Spacing > LungeFor)) ai.LungeCar = null;
            if (ai.WasStraight && !straight && racing && ai.Rng != null && ai.Mistakes > 0 && Braking() && ai.Rng.Next() < ai.Mistakes)
            {
                ai.Slip = ai.Rng.Next() < 0.5 ? Slip.Late : Slip.Wide;
                ai.SlipMin = double.PositiveInfinity;
                ai.SlipApex = null;
            }
            bool gathering = false;
            if (ai.Slip != Slip.None)
            {
                if (!ai.SlipApex.HasValue)
                {
                    ai.SlipMin = Math.Min(ai.SlipMin, line);
                    if (line > 1.15 * ai.SlipMin) ai.SlipApex = idx;
                }
                double past = !ai.SlipApex.HasValue ? -1 : JsMath.Wrap(idx - ai.SlipApex.Value, n) * track.Spacing;
                gathering = past >= 0 && past < RecoverFor;
                if (past >= RecoverFor || (straight && !ai.SlipApex.HasValue)) ai.Slip = Slip.None;
            }
            if (!racing) ai.Slip = Slip.None;
            ai.WasStraight = straight;

            double lane = ai.Lane;
            var passing = move?.Kind == MoveKind.Pass ? Find(move.Car) : null;
            if (move?.Kind == MoveKind.Pass && passing != null) lane = passing.Theirs + move.Side * PassGap;
            else if (move?.Kind == MoveKind.Defend) lane = move.Side * Cover * Math.Min(1, (craft - DefendFrom) / (1 - DefendFrom) + 0.25);
            if (lungeAt != null) lane = lungeAt.Theirs;
            if (lapper != null)
            {
                lane = (lapper.Theirs >= mine ? -1 : 1) * BlueLane;
                if (straight && lapper.Along > -BlueClose) free *= BlueLift;
            }
            foreach (var c in seen) if (c.O.Wrecked && c.Along > 0 && c.Along < 40 + v * 0.8 && Math.Abs(c.Across) < 18) lane = c.Across > 0 ? mine - 26 : mine + 26;
            if ((ai.Slip == Slip.Wide && (gathering || !ai.SlipApex.HasValue)) || (ai.Slip == Slip.Late && gathering))
            {
                double b = NextBend(track, idx, 60 + v * 0.8);
                if (b == 0) b = track.Curve[idx];
                // (`|| ai.slipMin || 1`: Infinity counts, 0 and NaN don't)
                if (b == 0 || double.IsNaN(b)) b = ai.SlipMin != 0 && !double.IsNaN(ai.SlipMin) ? ai.SlipMin : 1;
                lane -= JsSign(b) * Wide;
            }
            lane = Math.Max(-LaneLimit, Math.Min(LaneLimit, lane));
            double bendAhead = NextBend(track, idx, 60 + v * 0.8);
            if (Math.Abs(bendAhead) > TightBend && lane * bendAhead > 0) lane = JsSign(lane) * Math.Min(Math.Abs(lane), InsideLimit);
            if (!straight) free *= Math.Min(1, Math.Sqrt(Math.Max(0.5, 1 - (lane - ai.Lane) * NextBend(track, idx, 60 + v * 0.8))));
            if (ai.Slip == Slip.Late) free = gathering ? free * Recover : Math.Min(top * boost, Math.Max(free, line * cornering * LockUp));
            else if (ai.Slip == Slip.Wide) free *= WideSlow;

            if (lungeAt != null) free = Math.Max(free, v * LungeBrake);
            double follow = double.PositiveInfinity;
            double band = move?.Kind == MoveKind.Pass ? 18 : 26;
            foreach (var c in seen)
            {
                if (orders.Lapping != null && orders.Lapping.Contains(c.O) && Math.Abs(c.Across) >= 16) continue;
                if (c.O == ai.LungeCar) continue;
                double closingV = v - c.Speed;
                if (!c.O.Wrecked && c.Along > 0 && c.Along < 44 + Math.Max(0, closingV) * 0.7 && Math.Abs(c.Across) < band) follow = Math.Min(follow, c.Speed);
            }
            if (!straight && !orders.Limit.HasValue && ai.LungeCar == null) foreach (var c in alongside) if (c.Along > 4) follow = Math.Min(follow, c.Speed - Yield);
            double tdir = track.Dir[ti];
            double tx = track.X[ti] + JsMath.Cos(tdir) * lane;
            double ty = track.Y[ti] + JsMath.Sin(tdir) * lane;
            double dx = tx - car.X, dy = ty - car.Y;
            double d = JsMath.Hypot(dx, dy);
            if (d == 0) d = 1;
            double want = Math.Min(free, Math.Min(follow, orders.Limit ?? double.PositiveInfinity));
            double mag = Math.Max(0.05, Math.Min(1, want / (top * boost)));
            return new DriveInput { Steer = new Vec2(dx / d * mag, dy / d * mag), Handbrake = false, Brake = v > want + 12, Limit = orders.Limit };
        }

        /// <summary>After the flag: pulled over, round at an easy pace, no hard braking.</summary>
        public static DriveInput CoolDownInput(Car car, Track track, int idx, IList<Car> others)
        {
            var input = AiInput(car, track, idx, new AiDriver { Lane = 30, Pace = 0.85 }, others, new Orders());
            input.Brake = false;
            return input;
        }
    }
}
