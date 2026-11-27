// Driving rules: the F1 car's numbers, loose arcade handling (heading and velocity differ while sliding), wall
// collisions, damage, fire and wrecks. Port of src/engine/driving.ts, checked against golden traces from it
// (unity/Tests~/Core.Tests). Engine-free. Not yet ported: car-vs-car collisions (collideCars), for the AI phase.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    public struct Vec2
    {
        public double X, Y;
        public Vec2(double x, double y) { X = x; Y = y; }
    }

    public sealed class VehicleStats
    {
        public double TopSpeed, Torque, Power, BrakeTime, TurnRate, Grip, Health, Mass, Width, Length, OffRoad;
    }

    public sealed class CarClass
    {
        public string Id = "f1";
        public string Name = "F1 car";
        public double TopSpeed, Torque, Power, BrakeTime, TurnRate, Grip, Health, Mass, Width, Length, OffRoad;

        /// <summary>The web game's F1 car at the reference tuning (src/engine/driving.ts CLASS_TABLE.f1).</summary>
        public static CarClass F1() => new CarClass
        {
            // (the turn rate as the web game's carClass works it out, scaled to its reference and back: a last bit under 3.8)
            TopSpeed = 320, Torque = 161, Power = 37000, BrakeTime = 0.35, TurnRate = 3.7999999999999994, Grip = 10,
            Health = 60, Mass = 0.7, Width = 14, Length = 30, OffRoad = 0.25,
        };
    }

    public sealed class HandlingParams
    {
        public double HandbrakeGrip = 0.35;
        public double HandbrakeTurn = 1.5;
        public double Drag = 90;
        public double CrashThreshold = 60;
        public double CrashDamage = 0.5;
        public double BurnTime = 8;
        public bool AllowReverse = false;
        public double Gravity = 320;
        public double SlopeGravity = 1;
        public double BankGravity = 1;
        public double LateralGrip = double.PositiveInfinity;
        public double SlideScrub = 0;
        public double LandThreshold = 200;
        public double DamageSlow = 0;

        /// <summary>Race handling at the NORMAL difficulty (src/f1/racing.ts RACE_HANDLING + difficulty.ts).</summary>
        public HandlingParams Clone() => (HandlingParams)MemberwiseClone();

        public static HandlingParams Race(double crashDamage = 0.2, double damageSlow = 0.3)
        {
            return new HandlingParams { AllowReverse = true, CrashDamage = crashDamage, DamageSlow = damageSlow };
        }
    }

    public sealed class Car
    {
        public CarClass Cls;
        public double X, Y;
        /// <summary>radians; 0 = north (up the map), clockwise positive</summary>
        public double Heading;
        public double Vx, Vy;
        public double Health;
        /// <summary>seconds left until a burning car is wrecked; null when not burning</summary>
        public double? Burn;
        public bool Wrecked;
        public double Z, Vz;
        public bool Airborne;
        public double TyreGrip = 1;
        public double SpeedScale = 1;

        public Car(CarClass cls, double x, double y, double heading = 0)
        {
            Cls = cls; X = x; Y = y; Heading = heading; Health = cls.Health;
        }
    }

    public enum CarCondition { Ok, Smoking, Burning, Wrecked }

    public struct WheelCmd
    {
        /// <summary>-1 full left … 1 full right, relative to the car</summary>
        public double Turn;
        public double Gas;
        public bool Reverse;
    }

    public sealed class DriveInput
    {
        /// <summary>Where the player wants to go, in map space (y down); length 0…1 is the throttle. null = none.</summary>
        public Vec2? Steer;
        public bool Handbrake;
        public bool Brake;
        public double? Limit;
        /// <summary>Drive it like a car (keys and gamepads), in place of Steer.</summary>
        public WheelCmd? Wheel;
    }

    public struct StepEvents
    {
        public double Damage;
        public bool Skidding;
        public bool WreckedNow;
        public bool OnRough;
        public bool Airborne;
        public double Landed;
    }

    public static class Driving
    {
        public const double SkidSpeed = 30;
        const double TakeoffMargin = 30;
        const double MaxLaunchGrade = 0.7;
        public const double SmokeAt = 0.5;
        public const double FireAt = 0.2;

        public static Vec2 ForwardOf(double h) => new Vec2(JsMath.Sin(h), -JsMath.Cos(h));
        static Vec2 RightOf(double h) => new Vec2(JsMath.Cos(h), JsMath.Sin(h));
        public static double SpeedOf(Car c) => JsMath.Hypot(c.Vx, c.Vy);

        public static CarCondition Condition(Car car)
        {
            if (car.Wrecked) return CarCondition.Wrecked;
            if (car.Burn.HasValue) return CarCondition.Burning;
            if (car.Health <= car.Cls.Health * SmokeAt) return CarCondition.Smoking;
            return CarCondition.Ok;
        }

        /// <summary>Engine pull in px/s² at speed v: all the torque at low speed, then what the power allows.</summary>
        public static double EnginePull(CarClass c, double v) => Math.Min(c.Torque, c.Power / Math.Max(1, Math.Abs(v))) / c.Mass;

        public static double AngleDiff(double target, double current)
        {
            double d = (target - current) % (Math.PI * 2);
            if (d > Math.PI) d -= Math.PI * 2;
            if (d <= -Math.PI) d += Math.PI * 2;
            return d;
        }

        /// <summary>The body as a row of circles along its length (radius = half its width); offsets along the heading, nose positive.</summary>
        public static double[] BodyOffsets(CarClass cls)
        {
            double r = cls.Width / 2;
            double span = Math.Max(0, cls.Length / 2 - r);
            int n = (int)Math.Ceiling((span * 2) / r);
            if (n == 0) return new[] { 0.0 };
            var o = new double[n + 1];
            for (int i = 0; i <= n; i++) o[i] = -span + (i * 2 * span) / n;
            return o;
        }

        public struct Circle { public double X, Y, R; }

        public static List<Circle> BodyCircles(Car car, double heading, double x, double y)
        {
            var f = ForwardOf(heading);
            double r = car.Cls.Width / 2;
            var list = new List<Circle>();
            foreach (double o in BodyOffsets(car.Cls)) list.Add(new Circle { X = x + f.X * o, Y = y + f.Y * o, R = r });
            return list;
        }

        static bool BodyBlocked(Grid grid, Car car, double heading)
        {
            foreach (var c in BodyCircles(car, heading, car.X, car.Y)) if (Sim.CircleBlocked(grid, c.X, c.Y, c.R)) return true;
            return false;
        }

        struct BodyMove { public double X, Y; public bool HitX, HitY; }

        static BodyMove MoveBody(Grid grid, Car car, double dx, double dy)
        {
            double mx = dx, my = dy;
            bool hitX = false, hitY = false;
            foreach (var c in BodyCircles(car, car.Heading, car.X, car.Y))
            {
                // a circle already overlapping a wall (spawned or pushed there) doesn't hold the body back
                if (Sim.CircleBlocked(grid, c.X, c.Y, c.R)) continue;
                var m = Sim.MoveCircle(grid, c.X, c.Y, dx, dy, c.R);
                double ox = m.X - c.X, oy = m.Y - c.Y;
                if (Math.Abs(ox) < Math.Abs(mx)) mx = ox;
                if (Math.Abs(oy) < Math.Abs(my)) my = oy;
                hitX |= m.HitX;
                hitY |= m.HitY;
            }
            return new BodyMove { X = car.X + mx, Y = car.Y + my, HitX = hitX, HitY = hitY };
        }

        /// <summary>Apply damage and move the car through smoking → burning → wrecked. True on the step it became wrecked.</summary>
        public static bool ApplyDamage(Car car, double amount, HandlingParams p)
        {
            if (car.Wrecked || amount <= 0) return false;
            car.Health = Math.Max(0, car.Health - amount);
            if (car.Health <= 0)
            {
                car.Wrecked = true;
                car.Burn = null;
                return true;
            }
            if (!car.Burn.HasValue && car.Health <= car.Cls.Health * FireAt) car.Burn = p.BurnTime;
            return false;
        }

        static double Toward(double v, double target, double rate, double dt)
            => v < target ? Math.Min(target, v + rate * dt) : Math.Max(target, v - rate * dt);

        /// <summary>One driving step. Mutates and returns the step's events. Input is ignored for wrecked cars.</summary>
        public static StepEvents StepCar(Car car, DriveInput input, HandlingParams p, double dt, Grid grid)
        {
            bool onRough = !car.Airborne && Sim.IsRough(grid, car.X, car.Y);
            var events = new StepEvents { OnRough = onRough, Airborne = car.Airborne };
            if (!(dt > 0)) return events;
            var cls = car.Cls;
            double rough = onRough ? cls.OffRoad : 1;
            double hurt = p.DamageSlow * (1 - car.Health / cls.Health);
            double top = cls.TopSpeed * rough * (1 - hurt) * car.SpeedScale;
            double limit = input.Limit ?? double.PositiveInfinity;
            double brake = cls.TopSpeed / cls.BrakeTime;
            double drag = onRough ? Math.Max(p.Drag, brake * 0.5) : p.Drag;
            var slope = Sim.GroundAt(grid, car.X, car.Y);

            var f = ForwardOf(car.Heading);
            var r = RightOf(car.Heading);
            double fwd = car.Vx * f.X + car.Vy * f.Y;
            double side = car.Vx * r.X + car.Vy * r.Y;

            bool grounded = !car.Airborne;
            Vec2? steer = car.Wrecked || !grounded ? null : input.Steer;
            double mag = steer.HasValue ? Math.Min(1, JsMath.Hypot(steer.Value.X, steer.Value.Y)) : 0;
            bool handbrake = !car.Wrecked && grounded && input.Handbrake;
            bool braking = !car.Wrecked && grounded && input.Brake;
            WheelCmd? wheel = car.Wrecked || !grounded ? (WheelCmd?)null : input.Wheel;

            if (!grounded)
            {
                // keep fwd and side as they are
            }
            else if (wheel.HasValue)
            {
                var w = wheel.Value;
                // like a car: the wheel turns it only while it rolls, and the other way round in reverse
                double rolling = Math.Min(1, Math.Abs(fwd) / 30);
                double turnScale = Math.Min(1, Math.Max(0.35, Math.Abs(fwd) / (top * 0.3))) * rolling * (fwd < 0 ? -1 : 1);
                double turn = Math.Max(-1, Math.Min(1, w.Turn)) * cls.TurnRate * car.TyreGrip * dt * turnScale * (handbrake ? p.HandbrakeTurn : 1);
                double next = car.Heading + turn;
                if (!BodyBlocked(grid, car, next) || BodyBlocked(grid, car, car.Heading)) car.Heading = next;
                var nf0 = ForwardOf(car.Heading);
                var nr0 = RightOf(car.Heading);
                fwd = car.Vx * nf0.X + car.Vy * nf0.Y;
                side = car.Vx * nr0.X + car.Vy * nr0.Y;
                double gas = Math.Max(0, Math.Min(1, w.Gas));
                if (w.Reverse)
                {
                    double want = -Math.Min(top * 0.35, limit);
                    fwd = fwd > want ? Math.Max(want, fwd - EnginePull(cls, fwd) * dt) : Toward(fwd, want, drag, dt);
                }
                else if (gas > 0)
                {
                    double want = Math.Min(top * gas, limit);
                    fwd = fwd < want ? Math.Min(want, fwd + EnginePull(cls, fwd) * dt) : Toward(fwd, want, drag, dt);
                }
                else
                {
                    fwd = Toward(fwd, 0, drag, dt);
                }
            }
            else if (steer.HasValue && mag > 0)
            {
                var s = steer.Value;
                double target = JsMath.Atan2(s.X, -s.Y);
                double diff = AngleDiff(target, car.Heading);
                bool reversing = p.AllowReverse && Math.Abs(diff) > (Math.PI * 5) / 6 && fwd < 20;
                if (reversing)
                {
                    target += Math.PI;
                    diff = AngleDiff(target, car.Heading);
                }
                double turnScale = Math.Min(1, Math.Max(0.35, Math.Abs(fwd) / (top * 0.3)));
                double turn = cls.TurnRate * car.TyreGrip * dt * turnScale * (handbrake ? p.HandbrakeTurn : 1);
                double next = car.Heading + Math.Max(-turn, Math.Min(turn, diff));
                if (!BodyBlocked(grid, car, next) || BodyBlocked(grid, car, car.Heading)) car.Heading = next;
                var nf0 = ForwardOf(car.Heading);
                var nr0 = RightOf(car.Heading);
                fwd = car.Vx * nf0.X + car.Vy * nf0.Y;
                side = car.Vx * nr0.X + car.Vy * nr0.Y;
                if (reversing)
                {
                    double want = -Math.Min(top * 0.35 * mag, limit);
                    fwd = fwd > want ? Math.Max(want, fwd - EnginePull(cls, fwd) * dt) : Toward(fwd, want, drag, dt);
                }
                else if (Math.Abs(diff) < Math.PI / 2)
                {
                    double want = Math.Min(top * mag, limit);
                    fwd = fwd < want ? Math.Min(want, fwd + EnginePull(cls, fwd) * (1 - Math.Abs(diff) / Math.PI) * dt) : Toward(fwd, want, drag, dt);
                }
                else
                {
                    fwd = Toward(fwd, 0, brake, dt);
                }
            }
            else
            {
                fwd = Toward(fwd, 0, car.Wrecked ? brake * 2 : drag, dt);
            }
            var nf = ForwardOf(car.Heading);
            var nr = RightOf(car.Heading);
            if (grounded)
            {
                if (handbrake) fwd = Toward(fwd, 0, brake * 0.5, dt);
                if (braking) fwd = Toward(fwd, 0, brake, dt);
                if (slope.Gx != 0 || slope.Gy != 0)
                {
                    double ax = -p.Gravity * slope.Gx;
                    double ay = -p.Gravity * slope.Gy;
                    fwd += (ax * nf.X + ay * nf.Y) * p.SlopeGravity * dt;
                    side += (ax * nr.X + ay * nr.Y) * p.BankGravity * dt;
                }
                fwd = Math.Max(-cls.TopSpeed * 0.6, Math.Min(cls.TopSpeed * 1.25, fwd));

                double gripShare = (0.5 + 0.5 * rough) * (handbrake ? p.HandbrakeGrip : 1) * (car.Wrecked ? 3 : 1);
                double grip = cls.Grip * car.TyreGrip * gripShare;
                double bite = side * (1 - JsMath.Exp(-grip * dt));
                double most = double.IsFinite(p.LateralGrip) ? p.LateralGrip * grip * dt : double.PositiveInfinity;
                side -= Math.Sign(bite) * Math.Min(Math.Abs(bite), most);
                if (p.SlideScrub != 0 && fwd > 0) fwd = Math.Max(0, fwd - Math.Abs(side) * p.SlideScrub * dt);
                events.Skidding = !car.Wrecked && Math.Abs(side) > SkidSpeed;
            }

            car.Vx = nf.X * fwd + nr.X * side;
            car.Vy = nf.Y * fwd + nr.Y * side;

            var moved = MoveBody(grid, car, car.Vx * dt, car.Vy * dt);
            car.X = moved.X;
            car.Y = moved.Y;
            double impact = 0;
            if (moved.HitX)
            {
                impact = Math.Max(impact, Math.Abs(car.Vx));
                car.Vx *= -0.25;
            }
            if (moved.HitY)
            {
                impact = Math.Max(impact, Math.Abs(car.Vy));
                car.Vy *= -0.25;
            }
            double damage = Math.Max(0, impact - p.CrashThreshold) * p.CrashDamage;

            var under = Sim.GroundAt(grid, car.X, car.Y);
            double ground = under.H;
            if (car.Airborne)
            {
                car.Vz -= p.Gravity * dt;
                car.Z += car.Vz * dt;
                if (car.Z <= ground)
                {
                    events.Landed = -car.Vz;
                    damage += Math.Max(0, -car.Vz - p.LandThreshold) * p.CrashDamage;
                    car.Z = ground;
                    double sp = SpeedOf(car);
                    car.Vz = Math.Max(-sp * MaxLaunchGrade, Math.Min(sp * MaxLaunchGrade, under.Gx * car.Vx + under.Gy * car.Vy));
                    car.Airborne = false;
                }
            }
            else if (Math.Abs(ground - car.Z) > 20)
            {
                // placed or reset somewhere else: snap to the ground
                car.Z = ground;
                car.Vz = 0;
            }
            else
            {
                double climb = under.Gx * car.Vx + under.Gy * car.Vy;
                if (car.Vz - climb > p.Gravity * dt + TakeoffMargin)
                {
                    car.Airborne = true;
                    car.Z = Math.Max(ground, car.Z + car.Vz * dt - 0.5 * p.Gravity * dt * dt);
                    car.Vz -= p.Gravity * dt;
                }
                else
                {
                    car.Vz = Math.Min(climb, SpeedOf(car) * MaxLaunchGrade);
                    car.Z = ground;
                }
            }
            events.Airborne = car.Airborne;

            if (damage > 0)
            {
                events.Damage = damage;
                events.WreckedNow = ApplyDamage(car, damage, p);
            }

            if (car.Burn.HasValue && !car.Wrecked)
            {
                car.Burn -= dt;
                if (car.Burn <= 0)
                {
                    car.Wrecked = true;
                    car.Burn = null;
                    car.Health = 0;
                    events.WreckedNow = true;
                }
            }
            return events;
        }

        /// <summary>How the body sits: pitch (nose up, radians) and roll (right side up) from the slope under it, or the flight path in the air.</summary>
        public static void BodyTilt(Car car, Grid grid, out double pitch, out double roll)
        {
            if (car.Airborne)
            {
                pitch = JsMath.Atan2(car.Vz, Math.Max(40, SpeedOf(car))) * 0.6;
                roll = 0;
                return;
            }
            var g = Sim.GroundAt(grid, car.X, car.Y);
            var f = ForwardOf(car.Heading);
            var r = RightOf(car.Heading);
            pitch = JsMath.Atan(g.Gx * f.X + g.Gy * f.Y);
            roll = JsMath.Atan(g.Gx * r.X + g.Gy * r.Y);
        }

        /// <summary>Resolve a hit between two vehicles (their body circles, 1 px fatter): push them apart, exchange momentum by
        /// mass, and damage both by the closing speed. Returns the closing speed (0 when they weren't colliding).</summary>
        public static double CollideCars(Car a, Car b, HandlingParams p)
        {
            bool found = false;
            double bnx = 0, bny = 0, bo = 0;
            foreach (var ca in BodyCircles(a, a.Heading, a.X, a.Y))
                foreach (var cb in BodyCircles(b, b.Heading, b.X, b.Y))
                {
                    double dx = cb.X - ca.X, dy = cb.Y - ca.Y;
                    double d = JsMath.Hypot(dx, dy);
                    double overlap = ca.R + cb.R + 2 - d;
                    if (overlap > 0 && d > 0 && (!found || overlap > bo)) { found = true; bnx = dx / d; bny = dy / d; bo = overlap; }
                }
            if (!found) return 0;
            double ma = a.Cls.Mass, mb = b.Cls.Mass;
            a.X -= bnx * bo * (mb / (ma + mb));
            a.Y -= bny * bo * (mb / (ma + mb));
            b.X += bnx * bo * (ma / (ma + mb));
            b.Y += bny * bo * (ma / (ma + mb));
            double closing = (a.Vx - b.Vx) * bnx + (a.Vy - b.Vy) * bny;
            if (closing <= 0) return 0;
            const double e = 0.3;
            double j = (1 + e) * closing / (1 / ma + 1 / mb);
            a.Vx -= j / ma * bnx;
            a.Vy -= j / ma * bny;
            b.Vx += j / mb * bnx;
            b.Vy += j / mb * bny;
            double hit = Math.Max(0, closing - p.CrashThreshold) * p.CrashDamage;
            ApplyDamage(a, hit * (mb / ma), p);
            ApplyDamage(b, hit * (ma / mb), p);
            return closing;
        }

        /// <summary>Fully repaired and stopped, at a position and heading.</summary>
        public static void ResetCar(Car car, double x, double y, double heading)
        {
            car.X = x; car.Y = y; car.Heading = heading; car.Vx = 0; car.Vy = 0;
            car.Health = car.Cls.Health; car.Burn = null; car.Wrecked = false; car.Z = 0; car.Vz = 0; car.Airborne = false;
        }
    }
}
