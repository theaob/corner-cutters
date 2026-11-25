// Track samples, lap and sector timing, and the player's wheel. Port of the player-facing parts of src/f1/racing.ts
// (smoothLoop/buildTrack are not ported: the circuits are baked from the web game's own output, see tools/unity/bake.ts).
// Not yet ported: standings and the AI drivers.
using System;
using System.Collections.Generic;

namespace CornerCutters.Core
{
    public sealed class Track
    {
        public double[] X, Y, S, Dir, Curve, Speed;
        public double Spacing;
        public double Length;
        public int Count => X.Length;
    }

    public sealed class RaceProgress
    {
        /// <summary>completed laps</summary>
        public int Lap;
        /// <summary>nearest track sample</summary>
        public int Idx;
        public int Sector;
        /// <summary>race time when this lap started; null before the first crossing</summary>
        public double? LapStart;
        public List<double> LapTimes = new List<double>();
        public double? Finished;
        public double WrongWay;

        public RaceProgress Clone()
        {
            var c = (RaceProgress)MemberwiseClone();
            c.LapTimes = new List<double>(LapTimes);
            return c;
        }
    }

    public static class Racing
    {
        public const int Sectors = 3;

        public static RaceProgress NewProgress(int idx) => new RaceProgress { Idx = idx };

        /// <summary>Index of the sample nearest (x, y): a local search from hint when given, else the whole track.</summary>
        public static int NearestSample(Track t, double x, double y, int? hint = null, bool stay = false)
        {
            int n = t.Count;
            double D2(int i)
            {
                int k = ((i % n) + n) % n;
                double dx = t.X[k] - x, dy = t.Y[k] - y;
                return dx * dx + dy * dy;
            }
            int best = 0;
            double bestD = double.PositiveInfinity;
            if (hint.HasValue)
            {
                for (int k = -40; k <= 40; k++)
                {
                    double d = D2(hint.Value + k);
                    if (d < bestD) { best = (((hint.Value + k) % n) + n) % n; bestD = d; }
                }
                if (bestD < 200 * 200 || stay) return best;
            }
            for (int i = 0; i < n; i++)
            {
                double d = D2(i);
                if (d < bestD) { best = i; bestD = d; }
            }
            return best;
        }

        /// <summary>Update a racer's progress. The first crossing starts lap 1's clock; later crossings complete a lap when every sector was passed in order.</summary>
        public static RaceProgress StepProgress(RaceProgress p, Track track, Car car, double raceTime, int laps, double dt)
        {
            int n = track.Count;
            int idx = NearestSample(track, car.X, car.Y, p.Idx, true);
            var next = p.Clone();
            next.Idx = idx;
            if (p.Finished.HasValue) return next;
            int per = n / Sectors;
            int boundary = (next.Sector + 1) * per;
            if (next.Sector < Sectors - 1 && idx >= boundary && idx < boundary + per && p.Idx < boundary) next.Sector++;
            bool crossed = p.Idx > n - 60 && idx < 60;
            if (crossed)
            {
                if (!next.LapStart.HasValue)
                {
                    next.LapStart = raceTime;
                }
                else if (next.Sector == Sectors - 1)
                {
                    next.LapTimes.Add(raceTime - next.LapStart.Value);
                    next.Lap = p.Lap + 1;
                    next.LapStart = raceTime;
                    if (next.Lap >= laps) next.Finished = raceTime;
                }
                next.Sector = 0;
            }
            double along = Driving.AngleDiff(car.Heading, track.Dir[idx]);
            next.WrongWay = Math.Abs(along) > Math.PI * 0.6 && Driving.SpeedOf(car) > 20 ? p.WrongWay + dt : 0;
            return next;
        }

        // ---- the player's wheel ----

        /// <summary>Keys and gamepads drive the car itself: steering (-1 left … 1 right), gas and brake (0…1), and drift.</summary>
        public struct WheelPad
        {
            public double Turn, Gas, Brake;
            public bool Drift;
        }

        /// <summary>How hard the wheel turns at full lock (a share of the car's turn rate).</summary>
        public const double WheelLock = 0.8;
        const double ReverseBelow = 10;

        public static WheelPad KeysWheel(bool up, bool down, bool left, bool right, bool drift) => new WheelPad
        {
            Turn = (right ? 1 : 0) - (left ? 1 : 0), Gas = up ? 1 : 0, Brake = down ? 1 : 0, Drift = drift,
        };

        public static WheelPad StickWheel(double x, double y, bool drift) => new WheelPad
        {
            Turn = x, Gas = Math.Max(0, -y), Brake = Math.Max(0, y), Drift = drift,
        };

        /// <summary>The drive input for a wheel: steering eased (finer around the middle), brakes that turn into reverse once nearly stopped.</summary>
        public static DriveInput WheelInput(WheelPad w, Car car)
        {
            double turn = Math.Sign(w.Turn) * Math.Pow(Math.Min(1, Math.Abs(w.Turn)), 1.5) * WheelLock;
            double forward = car.Vx * Math.Sin(car.Heading) - car.Vy * Math.Cos(car.Heading);
            bool braking = w.Brake > 0.2;
            if (braking && w.Gas < 0.1 && forward < ReverseBelow)
                return new DriveInput { Wheel = new WheelCmd { Turn = turn, Gas = 0, Reverse = true }, Handbrake = w.Drift };
            return new DriveInput { Wheel = new WheelCmd { Turn = turn, Gas = w.Gas, Reverse = false }, Handbrake = w.Drift, Brake = braking };
        }
    }
}
