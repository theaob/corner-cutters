// Tyre wear and the compounds: a port of src/f1/tyres.ts. Every car's tyres wear as it drives (faster sliding and on
// rough ground); worn tyres grip less and lose top speed, sharply over the cliff. Four compounds, each at its best in
// its own weather (SOFT and HARD slicks, intermediates, full wets), and off-road tyres on dirt.
using System;

namespace CornerCutters.Core
{
    public enum Compound { Slick, Hard, Inter, Wet, Dirt }
    public enum Weather { Dry, Damp, Wet }

    public struct Fit
    {
        public double Grip, Speed, Wear;
        public Fit(double grip, double speed, double wear) { Grip = grip; Speed = speed; Wear = wear; }
    }

    public sealed class TyreSet
    {
        public Compound Compound;
        /// <summary>0 = new … 1 = gone</summary>
        public double Wear;
        /// <summary>px driven on this set</summary>
        public double Driven;

        public TyreSet Clone() => (TyreSet)MemberwiseClone();
    }

    public struct StopPlan
    {
        public double LapsLeft, LapTime, Wear, PerLap, Damage, DamageSlow, StopTime;
    }

    public static class Tyres
    {
        public static readonly Compound[] DryCompounds = { Compound.Slick, Compound.Hard };
        public static bool IsDry(Compound c) => c == Compound.Slick || c == Compound.Hard;

        public static string Name(Compound c) => c switch
        {
            Compound.Slick => "SOFTS", Compound.Hard => "HARDS", Compound.Inter => "INTERMEDIATES", Compound.Wet => "FULL WETS", _ => "OFF-ROAD",
        };
        public static string Short(Compound c) => c switch
        {
            Compound.Slick => "SFT", Compound.Hard => "HRD", Compound.Inter => "INT", Compound.Wet => "WET", _ => "OFF",
        };
        /// <summary>its colour, 0xRRGGBB</summary>
        public static int Color(Compound c) => c switch
        {
            Compound.Slick => 0xe8463c, Compound.Hard => 0xf4f2fa, Compound.Inter => 0x3ccf4e, Compound.Wet => 0x2f8bff, _ => 0xd08a3e,
        };

        /// <summary>each compound's fit on a dry, damp and wet track</summary>
        static readonly Fit[][] On =
        {
            new[] { new Fit(1, 1, 1), new Fit(0.7, 0.88, 0.8), new Fit(0.5, 0.78, 0.6) },
            new[] { new Fit(0.96, 0.96, 0.5), new Fit(0.66, 0.85, 0.32), new Fit(0.47, 0.75, 0.24) },
            new[] { new Fit(0.85, 0.93, 2.2), new Fit(0.9, 0.95, 1), new Fit(0.75, 0.87, 0.8) },
            new[] { new Fit(0.75, 0.86, 3.5), new Fit(0.8, 0.9, 1.6), new Fit(0.85, 0.9, 1) },
            new[] { new Fit(0.8, 1, 0.3), new Fit(0.7, 0.95, 0.3), new Fit(0.62, 0.9, 0.3) },
        };

        public static Fit DryFit(Compound c) => On[(int)c][0];

        public static double WetnessOf(Weather w) => w == Weather.Wet ? 2 : w == Weather.Damp ? 1 : 0;

        public static Fit FitAt(Compound compound, double wetness)
        {
            double x = Math.Max(0, Math.Min(2, wetness));
            var on = On[(int)compound];
            Fit a, b;
            double t;
            if (x <= 1) { a = on[0]; b = on[1]; t = x; } else { a = on[1]; b = on[2]; t = x - 1; }
            return new Fit(a.Grip + (b.Grip - a.Grip) * t, a.Speed + (b.Speed - a.Speed) * t, a.Wear + (b.Wear - a.Wear) * t);
        }

        static readonly Compound[] All = { Compound.Slick, Compound.Hard, Compound.Inter, Compound.Wet };

        public static Compound TyreFor(double wetness, bool dirt = false)
        {
            if (dirt) return Compound.Dirt;
            var best = All[0];
            foreach (var c in All) if (FitAt(c, wetness).Grip > FitAt(best, wetness).Grip) best = c;
            return best;
        }

        public static double WrongTyreLoss(Compound compound, double wetness)
        {
            if (compound == Compound.Dirt) return 0;
            var right = TyreFor(wetness);
            if (IsDry(compound) && IsDry(right)) return 0;
            return 1 - FitAt(IsDry(compound) ? Compound.Slick : compound, wetness).Grip / FitAt(right, wetness).Grip;
        }

        // TYRES
        public const double Base = 0.009, Slide = 0.03, SlideFull = 150, Rough = 0.01, Cliff = 0.7;
        public const double GripLoss = 0.2, CliffGripLoss = 0.25, SpeedLoss = 0.06, CliffSpeedLoss = 0.14, LapWear = 0.3, LaneCost = 4;

        public static TyreSet Fresh(Compound c = Compound.Slick) => new TyreSet { Compound = c };

        static double OverCliff(double wear) => Math.Max(0, (wear - Cliff) / (1 - Cliff));
        public static double TyreGrip(double wear) => 1 - GripLoss * wear - CliffGripLoss * OverCliff(wear);
        public static double TyreSpeed(double wear) => 1 - SpeedLoss * wear - CliffSpeedLoss * OverCliff(wear);

        public static void WearTyres(TyreSet set, Car car, StepEvents events, double dt, double wetness = 0, double scale = 1)
        {
            if (!car.Airborne && !car.Wrecked)
            {
                double v = Driving.SpeedOf(car);
                double fx = JsMath.Sin(car.Heading), fy = -JsMath.Cos(car.Heading);
                double slide = Math.Abs(car.Vx * -fy + car.Vy * fx);
                double rate = Base * Math.Min(1, v / car.Cls.TopSpeed) + Slide * Math.Min(1, slide / SlideFull) + (events.OnRough && v > 20 ? Rough : 0);
                set.Wear = Math.Min(1, set.Wear + rate * FitAt(set.Compound, wetness).Wear * scale * dt);
                set.Driven += v * dt;
            }
            FitTyres(set, car, wetness);
        }

        public static void FitTyres(TyreSet set, Car car, double wetness = 0)
        {
            var fit = FitAt(set.Compound, wetness);
            car.TyreGrip = TyreGrip(set.Wear) * fit.Grip;
            car.SpeedScale = TyreSpeed(set.Wear) * fit.Speed;
        }

        static double LapLoss(double lapTime, double wear) => lapTime * (1 / TyreSpeed(wear) - 1);

        static double StintLoss(double laps, double wear, double perLap, double lapTime)
        {
            double loss = 0;
            for (int i = 0; i < laps; i++)
            {
                double part = Math.Min(1, laps - i);
                loss += LapLoss(lapTime, Math.Min(1, wear + perLap * (i + part / 2))) * part;
            }
            return loss;
        }

        public static double WearPerLap(TyreSet set, double trackLength)
        {
            double laps = set.Driven / trackLength;
            return laps >= 0.5 ? set.Wear / laps : LapWear * DryFit(set.Compound).Wear;
        }

        public static bool StopNow(StopPlan p)
        {
            if (p.LapsLeft < 1) return false;
            double DamageLoss(double laps) => p.LapTime * p.Damage * p.DamageSlow * laps;
            double noStop = StintLoss(p.LapsLeft, p.Wear, p.PerLap, p.LapTime) + DamageLoss(p.LapsLeft);
            double StopAfter(double k) => StintLoss(k, p.Wear, p.PerLap, p.LapTime) + DamageLoss(k) + p.StopTime + LaneCost + StintLoss(p.LapsLeft - k, 0, p.PerLap, p.LapTime);
            double now = StopAfter(0);
            if (now >= noStop) return false;
            for (int k = 1; k <= Math.Floor(p.LapsLeft) - 1; k++) if (StopAfter(k) < now) return false;
            return true;
        }
    }
}
