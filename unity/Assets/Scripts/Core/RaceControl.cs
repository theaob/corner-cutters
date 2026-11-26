// Race control: a port of src/f1/raceControl.ts. Runs the whole field for one step (start lights, inputs, driving,
// contact, lap timing) and applies the race rules round it: a wreck is cleared and retires; a wreck brings out the
// safety car (no overtaking behind it), a big crash a car survives the virtual one; cutting a marked corner is a
// strike; pit stops for tyres and repairs as each car's strategy and the weather call them; after the flag an in-lap
// and home to the garage. Engine-free, so a whole race runs in a test exactly as in the web game (Tests~/Core.Tests).
using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.CompilerServices;

namespace CornerCutters.Core
{
    public sealed class GridSlot
    {
        public double X, Y, Heading;
    }

    public sealed class InLap
    {
        public double Driven;
        public bool ToGarage;
        public bool Parked;
    }

    public sealed class PlanState
    {
        public Plan Plan;
        public int? StopAt;
    }

    public sealed class Entrant
    {
        public Car Car;
        public GridSlot Slot;
        /// <summary>the AI driving it; null for the player</summary>
        public AiDriver Ai;
        public RaceProgress Progress;
        public double? WreckedAt;
        public int Box;
        public PitStop Pit;
        public double? Blend;
        public int Stops;
        public TyreSet Tyres;
        public double Tow;
        public Limits Limits = new Limits();
        /// <summary>the player's limiter this step under the safety car (or the virtual one)</summary>
        public double? Held;
        /// <summary>blue flags: the car lapping it (its index)</summary>
        public int? Blue;
        public InLap InLap;
        public PlanState Plan;
        /// <summary>the dry tyres to fit at its next stop (the player's pick)</summary>
        public Compound? Next;
    }

    public sealed class FieldEntry
    {
        public Car Car;
        public AiDriver Ai;
        public int Box;
        public Compound? Start;
    }

    public sealed class Practice
    {
        public double LapTime, PerLap;
    }

    public sealed class SafetyCarState
    {
        public Car Car;
        public int Idx;
        public double Led, Out;
    }

    public enum RacePhase { Lights, Racing }

    public enum RaceEventKind
    {
        LightsOut, Crash, Wreck, Retired, SafetyCar, Vsc, VscEnding, Green, Penalty, PitIn, PitStop, PitOut, Contact,
        PitRepaired, Mistake, Blue, TrackLimits, OffTrack, Rain, TrackCondition,
    }

    public sealed class RaceEvent
    {
        public RaceEventKind Kind;
        public int Who = -1;
        /// <summary>contact: the two cars; blue: By is the car lapping</summary>
        public int A = -1, B = -1, By = -1;
        public double Seconds, Vx, Vy, Hit;
        public bool Wrecked, On;
        public int Strike;
        public Slip What;
        public Weather Condition;

        public override string ToString() => $"{Kind} {Who}";
    }

    public sealed class StepResult
    {
        public StepEvents[] Cars;
        public List<RaceEvent> Race;
    }

    public sealed class Race
    {
        public Track Track;
        public Grid Grid;
        public List<Corner> Corners;
        public PitLane Pit;
        public Weather Weather;
        public double Wetness, Rain;
        public ForecastPlan Forecast;
        public HandlingParams Handling;
        public int Laps;
        public Practice Practice;
        public List<Entrant> Entrants;
        public RacePhase Phase;
        public double Clock;
        public double LightsOut;
        public SafetyCarState Sc;
        /// <summary>the virtual safety car, while it's out: seconds since it came out</summary>
        public double? Vsc;
        /// <summary>per entrant: the entrants it has to stay behind while either safety car is out (in the order they were added)</summary>
        public List<List<int>> HoldBehind;
    }

    public static class RaceControl
    {
        // SAFETY_CAR
        public const double ScSpeed = 150, ScLimit = 200, BigHit = 0.4, JoinAhead = 160, QueueGap = 120, DropBack = 300, LeadFor = 12, MaxOut = 40, ScPenalty = 5;
        // HOLD
        public const double HoldGap = 72, HoldReach = 320, HoldClose = 1.4, HoldCrawl = 40, HoldOver = 12, HoldTight = 0.7;
        // VSC
        public const double VscLimit = 190, VscLength = 10, VscWarn = 3;
        public const double Settle = 15, ClearAfter = 2.5, Lights = 3.6, GridHold = 2, DirtKnocks = 2;
        public const double SimDt = 1.0 / 60;
        const double PracticeRunUp = 1200, TyreLookahead = 0.5, BlendLine = 400, InLapShare = 0.5;
        const int PitCall = 20;
        public const double RepairBelow = 0.7, WornOut = 0.95;
        // INCIDENT
        public const double IncidentDamage = 0.25, IncidentSpin = 2.6, IncidentSlow = 0.5;

        static readonly ConditionalWeakTable<Track, Practice> practiced = new ConditionalWeakTable<Track, Practice>();

        static List<int> NewSet(IEnumerable<int> items)
        {
            var l = new List<int>();
            foreach (var i in items) if (!l.Contains(i)) l.Add(i);
            return l;
        }

        static List<List<int>> EmptyHolds(int count) => Enumerable.Range(0, count).Select(_ => new List<int>()).ToList();

        /// <summary>The track's practice: one car flat out alone on new SOFTs, a flying lap timed and its wear measured.</summary>
        public static Practice PracticeOf(Track track, Grid grid, HandlingParams handling)
        {
            if (practiced.TryGetValue(track, out var kept)) return kept;
            var race = NewRace(track, grid, handling, 99, new List<FieldEntry> { new FieldEntry { Car = new Car(CarClass.F1(), 0, 0, 0), Ai = new AiDriver { Lane = 0, Pace = 1 } } }, 0, null, Weather.Dry);
            int n = track.Count;
            int idx = n - JsMath.RoundToInt(PracticeRunUp / track.Spacing);
            while (idx < n - 1 && Math.Abs(track.Curve[idx]) >= 1.0 / 500) idx++;
            var e = race.Entrants[0];
            e.Car.X = track.X[idx]; e.Car.Y = track.Y[idx]; e.Car.Heading = track.Dir[idx]; e.Car.Vx = 0; e.Car.Vy = 0;
            e.Progress = Racing.NewProgress(idx);
            race.Phase = RacePhase.Racing;
            race.Clock = 0;
            double? from = null;
            for (double t = 0; t < 300 && e.Progress.LapTimes.Count == 0; t += SimDt)
            {
                StepRace(race, SimDt);
                if (from == null && e.Progress.LapStart != null) from = e.Tyres.Wear;
            }
            Practice practice = e.Progress.LapTimes.Count > 0 && e.Progress.LapTimes[0] != 0 && from != null
                ? new Practice { LapTime = e.Progress.LapTimes[0], PerLap = Math.Max(0.05, e.Tyres.Wear - from.Value) }
                : new Practice { LapTime = track.Length / 300, PerLap = Tyres.LapWear };
            practiced.AddOrUpdate(track, practice);
            return practice;
        }

        static int? StopLapOf(Plan p, double from) => p.Stints.Count > 1 ? JsMath.RoundToInt(from + p.Stints[0].Laps) : (int?)null;

        static double SoftWear(TyreSet set, double trackLength) =>
            Tyres.WearPerLap(set, trackLength) / (Tyres.IsDry(set.Compound) ? Tyres.DryFit(set.Compound).Wear / Tyres.DryFit(Compound.Slick).Wear : 1);

        static StrategyInput InputFor(Race race, Entrant e, double lapsLeft, Compound? current, double currentWear, double? perLap = null)
        {
            double lapTime = e != null ? PlanLapTime(race, e) : race.Practice?.LapTime ?? race.Track.Length / 300;
            return new StrategyInput
            {
                Laps = lapsLeft, LapTime = lapTime, PerLap = perLap ?? race.Practice?.PerLap ?? Tyres.LapWear, StopCost = Pits.Stop + Tyres.LaneCost,
                Current = current, CurrentWear = currentWear,
            };
        }

        static Plan PlanFor(Race race, int k, double lapsLeft, Compound? current = null, double currentWear = 0, List<Plan> options = null, double? perLap = null)
        {
            var e = race.Entrants[k];
            var input = InputFor(race, current.HasValue ? e : null, lapsLeft, current, currentWear, perLap);
            if (race.Pit == null)
            {
                Plan One(Compound c) => new Plan
                {
                    Stints = new List<Stint> { new Stint(c, lapsLeft) },
                    Time = Strategy.StintTime(c, lapsLeft, current.HasValue ? currentWear : 0, input.PerLap, input.LapTime),
                };
                if (current.HasValue) return One(current.Value);
                var both = Tyres.DryCompounds.Select(One).ToList();
                JsMath.StableSort(both, (a, b) => Math.Sign(a.Time - b.Time));
                return both[0];
            }
            if (e.Ai == null) return Strategy.BestPlan(input);
            return Strategy.PickFor(options ?? Strategy.Choices(input), k);
        }

        /// <summary>A race about to start: the lights come on, then go out `lightsOut` s after the fifth.</summary>
        public static Race NewRace(Track track, Grid grid, HandlingParams handling, int laps, List<FieldEntry> field, double lightsOut = 0.5, PitLane pit = null,
            Weather weather = Weather.Dry, ForecastPlan forecast = null)
        {
            if (track.Dirt)
            {
                handling = handling.Clone();
                handling.CrashThreshold *= DirtKnocks;
            }
            var now = forecast != null ? Forecast.Start(forecast) : new WeatherState { Wetness = Tyres.WetnessOf(weather), Rain = weather == Weather.Wet ? 1 : 0 };
            var entrants = field.Select(f => new Entrant
            {
                Car = f.Car, Ai = f.Ai, Box = f.Box, Tyres = Tyres.Fresh(Tyres.TyreFor(now.Wetness, track.Dirt)), Progress = Racing.NewProgress(track.Count - 4),
            }).ToList();
            var race = new Race
            {
                Track = track, Grid = grid, Corners = TrackLimits.MarkCorners(track), Pit = pit, Weather = Forecast.ConditionOf(now.Wetness), Wetness = now.Wetness,
                Rain = now.Rain, Forecast = forecast, Handling = handling, Laps = laps, Entrants = entrants, Phase = RacePhase.Lights, Clock = -Lights,
                LightsOut = lightsOut, HoldBehind = EmptyHolds(entrants.Count),
            };
            if (Tyres.IsDry(Tyres.TyreFor(now.Wetness, track.Dirt)) && laps > 0)
            {
                if (pit != null) race.Practice = PracticeOf(track, grid, handling);
                var options = race.Pit != null ? Strategy.Choices(InputFor(race, null, laps, null, 0)) : null;
                for (int k = 0; k < entrants.Count; k++)
                {
                    var e = entrants[k];
                    var plan = PlanFor(race, k, laps, null, 0, options);
                    var start = field[k].Start ?? plan.Stints[0].Compound;
                    var mine = start == plan.Stints[0].Compound ? plan : PlanFor(race, k, laps, start, 0);
                    e.Tyres = Tyres.Fresh(start);
                    e.Plan = new PlanState { Plan = mine, StopAt = StopLapOf(mine, 0) };
                }
            }
            foreach (var e in entrants) Tyres.FitTyres(e.Tyres, e.Car, now.Wetness);
            return race;
        }

        public static double WetnessAhead(Race race, double ahead)
        {
            if (race.Forecast == null || race.Phase != RacePhase.Racing) return race.Wetness;
            return Forecast.Ahead(new WeatherState { Wetness = race.Wetness, Rain = race.Rain }, race.Forecast, race.Clock, ahead).Wetness;
        }

        static double Done(Race race, Entrant e) => e.Progress.Lap + (double)e.Progress.Idx / race.Track.Count;

        public static Compound TyreCall(Race race, Entrant e)
        {
            var weather = Tyres.TyreFor(WetnessAhead(race, PlanLapTime(race, e) * TyreLookahead), race.Track.Dirt);
            if (!Tyres.IsDry(weather)) return weather;
            if (e.Next.HasValue) return e.Next.Value;
            var plan = e.Plan;
            double done = Done(race, e);
            if (plan?.StopAt != null && plan.Plan.Stints.Count > 1 && done >= plan.StopAt.Value - 1.5) return plan.Plan.Stints[1].Compound;
            double left = Math.Max(1, race.Laps - done);
            double lapTime = PlanLapTime(race, e);
            double perLap = race.Practice?.PerLap ?? Tyres.LapWear;
            var best = Tyres.DryCompounds[0];
            foreach (var c in Tyres.DryCompounds) if (Strategy.StintTime(c, left, 0, perLap, lapTime) < Strategy.StintTime(best, left, 0, perLap, lapTime)) best = c;
            return best;
        }

        public static bool PlanDue(Race race, Entrant e)
        {
            if (e.Plan?.StopAt == null || !Tyres.IsDry(Tyres.TyreFor(race.Wetness, race.Track.Dirt)) || !Tyres.IsDry(e.Tyres.Compound)) return false;
            return Done(race, e) >= e.Plan.StopAt.Value - 0.5;
        }

        public static bool WrongTyres(Race race, int i)
        {
            var e = race.Entrants[i];
            var call = TyreCall(race, e);
            if (call == e.Tyres.Compound) return false;
            double loss = Tyres.WrongTyreLoss(e.Tyres.Compound, WetnessAhead(race, PlanLapTime(race, e) * TyreLookahead));
            return loss > (e.Ai != null ? 0.05 + ((i * 37) % 10) * 0.012 : 0.04);
        }

        public static double PlanLapTime(Race race, Entrant e) =>
            e.Progress.LapTimes.Count > 0 ? e.Progress.LapTimes.Min() : race.Practice?.LapTime ?? race.Track.Length / 300;

        static bool AiPits(Race race, Entrant e)
        {
            var pit = race.Pit;
            int n = race.Track.Count;
            if (pit == null || e.Progress.LapStart == null || !Pits.Between(e.Progress.Idx, pit.Entry - PitCall, pit.Entry + 4, n)) return false;
            return StopCalled(race, e);
        }

        public static bool StopCalled(Race race, Entrant e)
        {
            int n = race.Track.Count;
            double lapsLeft = race.Laps - e.Progress.Lap - (double)e.Progress.Idx / n;
            if (lapsLeft > 0.4 && WrongTyres(race, race.Entrants.IndexOf(e))) return true;
            bool Pays() => Pits.WantsPit(e.Car, e.Tyres, lapsLeft, PlanLapTime(race, e), race.Handling.DamageSlow, race.Track.Length);
            if (e.Plan != null && Tyres.IsDry(e.Tyres.Compound) && Tyres.IsDry(Tyres.TyreFor(race.Wetness, race.Track.Dirt)))
            {
                if (PlanDue(race, e)) return true;
                if (e.Car.Health < e.Car.Cls.Health * RepairBelow)
                {
                    var fresh = e.Tyres.Clone();
                    fresh.Wear = 0;
                    if (Pits.WantsPit(e.Car, fresh, lapsLeft, PlanLapTime(race, e), race.Handling.DamageSlow, race.Track.Length)) return true;
                }
                return e.Tyres.Wear >= WornOut && Pays();
            }
            return Pays();
        }

        static void ParkAfterRace(Race race, int i)
        {
            var e = race.Entrants[i];
            var lap = e.InLap;
            var pit = race.Pit;
            var track = race.Track;
            int n = track.Count;
            if (pit == null || lap.ToGarage || lap.Driven < track.Length * InLapShare) return;
            if (!Pits.Between(e.Progress.Idx, pit.Entry - PitCall, pit.Entry + 4, n)) return;
            lap.ToGarage = true;
            bool first = !race.Entrants.Any(o => o != e && o.Box == e.Box && o.InLap != null && o.InLap.ToGarage);
            e.Pit = Pits.NewPitStop(pit, e.Car, e.Box, Pits.GarageSlots[first ? 0 : 1]);
        }

        /// <summary>Skip to the end: every car still racing given the finish its pace would bring, and every finisher put in its garage. Returns the top three.</summary>
        public static List<int> SkipToParked(Race race)
        {
            var track = race.Track;
            var pit = race.Pit;
            var entrants = race.Entrants;
            int n = track.Count;
            race.Phase = RacePhase.Racing;
            race.Sc = null;
            race.Vsc = null;
            race.HoldBehind = EmptyHolds(entrants.Count);
            foreach (var e in entrants)
            {
                var p = e.Progress;
                if (p.Retired) continue;
                if (e.Car.Wrecked)
                {
                    e.Progress = p.Clone();
                    e.Progress.Retired = true;
                    continue;
                }
                if (p.Finished != null) continue;
                var times = p.LapTimes;
                double lap = times.Count > 0 ? times.Aggregate(0.0, (a, b) => a + b) / times.Count : PlanLapTime(race, e);
                double left = Math.Max(0, race.Laps - p.Lap - (p.LapStart == null ? 0 : (double)p.Idx / n));
                e.Progress = p.Clone();
                e.Progress.Lap = race.Laps;
                e.Progress.Finished = race.Clock + left * lap;
            }
            var finishers = Order(race).Where(i => entrants[i].Progress.Finished != null).ToList();
            var home = new HashSet<int>();
            foreach (int i in finishers)
            {
                var e = entrants[i];
                var car = e.Car;
                car.Vx = car.Vy = 0;
                e.InLap = new InLap { Driven = track.Length, ToGarage = true, Parked = true };
                if (pit == null) continue;
                double slot = Pits.GarageSlots[home.Contains(e.Box) ? 1 : 0];
                home.Add(e.Box);
                var q = Pits.BoxPoint(pit, e.Box);
                e.Pit = new PitStop { Phase = PitPhase.Garage, At = 0, Box = e.Box, Home = slot, Push = new PitPush { X = q.X, Y = q.Y, Heading = q.Dir, Done = Pits.GaragePush } };
                Pits.PushIntoGarage(pit, e.Pit, car);
                e.Progress = e.Progress.Clone();
                e.Progress.Idx = Racing.NearestSample(track, car.X, car.Y);
            }
            return finishers.Take(3).ToList();
        }

        public static bool Running(Entrant e) => !e.Progress.Retired;

        public static bool Settled(Race race) => race.Entrants.All(e => e.Progress.Retired || e.Progress.Finished != null);

        public static bool IsBigCrash(Car car, double healthBefore, bool wreckedNow) => wreckedNow || healthBefore - car.Health >= BigHit * car.Cls.Health;

        public static void RacingIncident(Car diver, Car hit, double closing, HandlingParams p)
        {
            Driving.ApplyDamage(diver, closing * IncidentDamage, p);
            Driving.ApplyDamage(hit, closing * IncidentDamage * 1.2, p);
            double side = JsMath.Sign((hit.X - diver.X) * JsMath.Cos(hit.Heading) + (hit.Y - diver.Y) * JsMath.Sin(hit.Heading));
            if (side == 0) side = 1;
            hit.Heading += side * IncidentSpin * (0.7 + 0.3 * Math.Min(1, closing / 150));
            hit.Vx *= IncidentSlow;
            hit.Vy *= IncidentSlow;
        }

        /// <summary>Race order (indexes into the entrants).</summary>
        public static List<int> Order(Race race) => Racing.Standings(race.Entrants.Select(e => e.Progress).ToList(), race.Track);

        public static RaceEvent CallVsc(Race race)
        {
            var ranked = Order(race);
            race.Vsc = 0;
            race.HoldBehind = race.Entrants.Select((_, i) => NewSet(ranked.Take(ranked.IndexOf(i)))).ToList();
            return new RaceEvent { Kind = RaceEventKind.Vsc };
        }

        static SafetyCarState SafetyCarAhead(Track track, Car car, int idx)
        {
            int n = track.Count;
            int i = (idx + JsMath.RoundToInt(JoinAhead / track.Spacing)) % n;
            var sc = new Car(CarClass.F1(), track.X[i], track.Y[i], track.Dir[i]);
            double v = Math.Min(ScSpeed, Driving.SpeedOf(car));
            sc.Vx = JsMath.Sin(track.Dir[i]) * v;
            sc.Vy = -JsMath.Cos(track.Dir[i]) * v;
            return new SafetyCarState { Car = sc, Idx = i };
        }

        static Orders Given(Orders o) => o.Clone();

        /// <summary>One step of the race. `player` gives the input for an entrant without an AI (the race applies the safety car's limiter on top).</summary>
        public static StepResult StepRace(Race race, double dt, Func<Entrant, DriveInput> player = null)
        {
            var track = race.Track;
            var grid = race.Grid;
            var p = race.Handling;
            var entrants = race.Entrants;
            var output = new List<RaceEvent>();
            race.Clock += dt;
            if (race.Phase == RacePhase.Lights && race.Clock >= race.LightsOut)
            {
                race.Phase = RacePhase.Racing;
                race.Clock = 0;
                output.Add(new RaceEvent { Kind = RaceEventKind.LightsOut });
            }
            bool racing = race.Phase == RacePhase.Racing;
            if (racing && race.Forecast != null)
            {
                var wasCondition = race.Weather;
                bool wasRaining = race.Rain > 0.15;
                var now = new WeatherState { Wetness = race.Wetness, Rain = race.Rain };
                Forecast.Step(ref now, race.Forecast, race.Clock, dt);
                race.Wetness = now.Wetness;
                race.Rain = now.Rain;
                race.Weather = Forecast.ConditionOf(now.Wetness);
                if (race.Rain > 0.15 != wasRaining) output.Add(new RaceEvent { Kind = RaceEventKind.Rain, On = !wasRaining });
                if (race.Weather != wasCondition) output.Add(new RaceEvent { Kind = RaceEventKind.TrackCondition, Condition = race.Weather });
            }
            var sc = race.Sc;
            var vsc = race.Vsc;
            var orders = sc != null ? new Orders { Limit = ScLimit, NoOvertaking = true } : vsc != null ? new Orders { Limit = VscLimit, NoOvertaking = true } : new Orders();
            var onTrack = entrants.Where(Running).ToList();
            int n = track.Count;
            double ToSafetyCar(Entrant e) => sc != null ? JsMath.Wrap(sc.Idx - e.Progress.Idx, n) * track.Spacing : double.PositiveInfinity;
            var cars = onTrack.Where(e => e.Pit == null || e.Pit.Phase != PitPhase.Garage).Select(e => e.Car).ToList();
            if (sc != null) cars.Add(sc.Car);

            (double? limit, bool tight) PlayerLimit(Entrant e, int i)
            {
                if (sc == null && vsc == null) return (null, false);
                if (sc != null && n * track.Spacing - ToSafetyCar(e) <= DropBack) return (ScSpeed * 0.6, false);
                double limit = sc != null ? ScLimit : VscLimit;
                bool tight = false;
                var ahead = race.HoldBehind[i].Select(j => entrants[j])
                    .Where(o => Running(o) && o.Pit == null && !o.Car.Wrecked && o.Progress.Finished == null)
                    .Select(o => (car: o.Car, idx: o.Progress.Idx)).ToList();
                if (sc != null) ahead.Add((sc.Car, sc.Idx));
                foreach (var a in ahead)
                {
                    double d = JsMath.Wrap(a.idx - e.Progress.Idx, n) * track.Spacing;
                    if (d > HoldReach) continue;
                    limit = Math.Min(limit, Math.Max(HoldCrawl, Driving.SpeedOf(a.car) + HoldClose * (d - HoldGap)));
                    if (d < HoldGap * HoldTight && Driving.SpeedOf(e.Car) > Driving.SpeedOf(a.car)) tight = true;
                }
                return (limit, tight);
            }

            // blue flags
            {
                var eligible = entrants.Select(e => racing && sc == null && vsc == null && Running(e) && e.Pit == null && !e.Car.Wrecked && e.Progress.Finished == null && race.Clock > Settle).ToArray();
                var blue = BlueFlags.Flags(entrants.Select(e => e.Progress).ToList(), eligible, entrants.Select(e => e.Blue).ToArray(), n, track.Spacing);
                for (int i = 0; i < entrants.Count; i++)
                {
                    var e = entrants[i];
                    if (blue[i] != null && blue[i] != e.Blue) output.Add(new RaceEvent { Kind = RaceEventKind.Blue, Who = i, By = blue[i].Value });
                    e.Blue = blue[i];
                }
            }

            // drive
            var before = entrants.Select(e => e.Car.Health).ToArray();
            var moving = entrants.Select(e => (vx: e.Car.Vx, vy: e.Car.Vy)).ToArray();
            var events = new StepEvents[entrants.Count];
            for (int i = 0; i < entrants.Count; i++) events[i] = DriveOne(i);

            StepEvents DriveOne(int i)
            {
                var e = entrants[i];
                var quiet = new StepEvents();
                if (!Running(e)) return quiet;
                var others = cars.Where(c => c != e.Car && Bridge.SameLevel(c, e.Car)).ToList();
                var pit = race.Pit;
                if (e.Progress.Finished != null && !e.Car.Wrecked)
                {
                    e.InLap ??= new InLap();
                    e.InLap.Driven += Driving.SpeedOf(e.Car) * dt;
                    if (e.Pit == null) ParkAfterRace(race, i);
                }
                if (pit != null && racing && e.Pit == null && e.Progress.Finished == null && (e.Ai != null ? AiPits(race, e) : Pits.EntersPit(pit, track, e.Car, e.Progress.Idx)))
                {
                    e.Pit = Pits.NewPitStop(pit, e.Car, e.Box);
                    e.Stops++;
                    output.Add(new RaceEvent { Kind = RaceEventKind.PitIn, Who = i });
                }
                if (pit != null && e.Pit != null)
                {
                    var inLane = race.Entrants.Where(o => o != e && o.Pit != null && Running(o) && !o.Car.Wrecked).Select(o => o.Car).ToList();
                    var r = Pits.PitStep(pit, e.Pit, e.Car, inLane, dt);
                    if (e.Pit.Phase == PitPhase.Garage)
                    {
                        if (e.Pit.Push.Done >= Pits.GaragePush) e.InLap.Parked = true;
                        return quiet;
                    }
                    if (r.Stopped)
                    {
                        double worn = SoftWear(e.Tyres, track.Length);
                        e.Tyres = Tyres.Fresh(TyreCall(race, e));
                        e.Next = null;
                        Tyres.FitTyres(e.Tyres, e.Car, race.Wetness);
                        if (Tyres.IsDry(e.Tyres.Compound))
                        {
                            double done = Done(race, e);
                            double left = race.Laps - done;
                            var was = e.Plan;
                            bool planned = was?.StopAt != null && done >= was.StopAt.Value - 1 && was.Plan.Stints.Count > 1 && was.Plan.Stints[1].Compound == e.Tyres.Compound;
                            if (left <= 0.5) e.Plan = null;
                            else if (planned)
                            {
                                var rest = was.Plan.Stints.Skip(1).ToList();
                                double before0 = 0;
                                for (int k = 0; k < rest.Count - 1; k++) before0 += rest[k].Laps;
                                var stints = rest.Select((st, k) => k == rest.Count - 1 ? new Stint(st.Compound, left - before0) : st).ToList();
                                var plan = new Plan { Stints = stints, Time = was.Plan.Time };
                                e.Plan = new PlanState { Plan = plan, StopAt = StopLapOf(plan, JsMath.Round(done)) };
                            }
                            else
                            {
                                var plan = PlanFor(race, i, left, e.Tyres.Compound, 0, null, worn);
                                e.Plan = new PlanState { Plan = plan, StopAt = StopLapOf(plan, done) };
                            }
                        }
                        output.Add(new RaceEvent { Kind = RaceEventKind.PitStop, Who = i, Seconds = e.Pit.Time });
                    }
                    if (r.Repaired) output.Add(new RaceEvent { Kind = RaceEventKind.PitRepaired, Who = i });
                    if (!r.Done) return Driving.StepCar(e.Car, r.Input, p, dt, Bridge.GridFor(track, grid, e.Progress.Idx));
                    e.Pit = null;
                    e.Blend = BlendLine;
                    if (race.Sc != null || race.Vsc != null)
                    {
                        var nowOrder = Order(race);
                        int at = nowOrder.IndexOf(i);
                        race.HoldBehind[i] = NewSet(nowOrder.Take(at));
                        foreach (int j in nowOrder.Skip(at + 1))
                            if (entrants[j].Pit == null && !race.HoldBehind[j].Contains(i)) race.HoldBehind[j].Add(i);
                    }
                    output.Add(new RaceEvent { Kind = RaceEventKind.PitOut, Who = i });
                }
                DriveInput input;
                if (!racing) input = new DriveInput { Handbrake = true, Brake = true };
                else if (e.Progress.Finished != null)
                {
                    input = Ai.CoolDownInput(e.Car, track, e.Progress.Idx, others);
                    input.Limit = orders.Limit;
                }
                else if (e.Ai != null && race.Clock < e.Ai.Reaction && e.Progress.LapStart == null) input = new DriveInput { Handbrake = false, Brake = true };
                else if (e.Ai != null)
                {
                    var slip = e.Ai.Slip;
                    bool lunging = e.Ai.LungeCar != null;
                    bool blending = pit != null && e.Blend != null && e.Blend > 0;
                    if (blending) e.Blend -= Driving.SpeedOf(e.Car) * dt;
                    AiDriver ai = e.Ai;
                    if (blending)
                    {
                        ai = e.Ai.Clone();
                        ai.Lane = pit.Side * Pits.JoinAt;
                    }
                    var lapping = entrants.Where(o => o.Blue == i).Select(o => o.Car).ToList();
                    var spare = entrants.FirstOrDefault(o => o.Ai == null)?.Car;
                    var given = Given(orders);
                    given.Spare = spare;
                    if (e.Blue != null || lapping.Count > 0)
                    {
                        given.Blue = e.Blue == null ? null : entrants[e.Blue.Value].Car;
                        given.Lapping = lapping;
                    }
                    if (race.Clock < Settle || blending) given.NoOvertaking = true;
                    input = Ai.AiInput(e.Car, track, e.Progress.Idx, ai, others, given, Slipstream.TowBoost(e.Tow));
                    if (e.Ai.Slip != Slip.None && e.Ai.Slip != slip) output.Add(new RaceEvent { Kind = RaceEventKind.Mistake, Who = i, What = e.Ai.Slip });
                    if (e.Ai.LungeCar != null && !lunging) output.Add(new RaceEvent { Kind = RaceEventKind.Mistake, Who = i, What = Slip.Late });
                }
                else
                {
                    var (limit, tight) = PlayerLimit(e, i);
                    e.Held = limit;
                    var given = player != null ? player(e) : new DriveInput { Handbrake = false };
                    input = new DriveInput { Steer = given.Steer, Handbrake = given.Handbrake, Brake = given.Brake, Limit = limit, Wheel = given.Wheel };
                    if (limit != null && (tight || Driving.SpeedOf(e.Car) > limit.Value + HoldOver)) input.Brake = true;
                }
                if (!racing)
                {
                    var slot = e.Slot ??= new GridSlot { X = e.Car.X, Y = e.Car.Y, Heading = e.Car.Heading };
                    var ev = Driving.StepCar(e.Car, input, p, dt, Bridge.GridFor(track, grid, e.Progress.Idx));
                    double off = JsMath.Hypot(e.Car.X - slot.X, e.Car.Y - slot.Y);
                    if (off > GridHold)
                    {
                        double k = GridHold / off;
                        e.Car.X = slot.X + (e.Car.X - slot.X) * k;
                        e.Car.Y = slot.Y + (e.Car.Y - slot.Y) * k;
                        e.Car.Heading = slot.Heading;
                        e.Car.Vx = 0;
                        e.Car.Vy = 0;
                    }
                    return ev;
                }
                return Driving.StepCar(e.Car, input, p, dt, Bridge.GridFor(track, grid, e.Progress.Idx));
            }

            // tyres
            for (int i = 0; i < entrants.Count; i++)
                if (Running(entrants[i])) Tyres.WearTyres(entrants[i].Tyres, entrants[i].Car, events[i], dt, race.Wetness, track.TyreWear);
            // slipstream
            foreach (var e in entrants)
            {
                if (!Running(e)) continue;
                bool towing = racing && e.Pit == null && race.Sc == null && race.Vsc == null && e.Progress.Finished == null;
                e.Tow = Slipstream.StepTow(e.Tow, towing ? Slipstream.TowFrom(e.Car, cars.Where(c => Bridge.SameLevel(c, e.Car))) : 0, dt);
                e.Car.SpeedScale *= Slipstream.TowBoost(e.Tow);
            }
            if (sc != null)
            {
                var inTheWay = cars.Where(c => c != sc.Car && Bridge.SameLevel(c, sc.Car)).ToList();
                Driving.StepCar(sc.Car, Ai.AiInput(sc.Car, track, sc.Idx, new AiDriver { Lane = 0, Pace = 1 }, inTheWay, new Orders { Limit = ScSpeed }), p, dt, Bridge.GridFor(track, grid, sc.Idx));
                sc.Idx = Racing.NearestSample(track, sc.Car.X, sc.Car.Y, sc.Idx);
            }
            // contact
            var diving = new Dictionary<Car, Entrant>();
            foreach (var e in entrants) if (e.Ai?.LungeCar != null) diving[e.Car] = e;
            var owner = new Dictionary<Car, int>();
            for (int k = 0; k < entrants.Count; k++) owner[entrants[k].Car] = k;
            for (int i = 0; i < cars.Count; i++)
            {
                for (int j = i + 1; j < cars.Count; j++)
                {
                    if (!Bridge.SameLevel(cars[i], cars[j])) continue;
                    double closing = Driving.CollideCars(cars[i], cars[j], p);
                    if (closing <= 0) continue;
                    if (owner.TryGetValue(cars[i], out int a) && owner.TryGetValue(cars[j], out int b)) output.Add(new RaceEvent { Kind = RaceEventKind.Contact, A = a, B = b });
                    diving.TryGetValue(cars[i], out var di);
                    diving.TryGetValue(cars[j], out var dj);
                    var diver = di?.Ai?.LungeCar == cars[j] ? di : dj?.Ai?.LungeCar == cars[i] ? dj : null;
                    if (diver?.Ai?.LungeCar == null) continue;
                    var hit = diver.Ai.LungeCar;
                    diver.Ai.LungeCar = null;
                    RacingIncident(diver.Car, hit, closing, p);
                }
            }
            if (sc != null) sc.Car.Health = sc.Car.Cls.Health;
            if (racing) foreach (var e in onTrack) e.Progress = Racing.StepProgress(e.Progress, track, e.Car, race.Clock, race.Laps, dt);

            // track limits
            if (racing)
            {
                for (int i = 0; i < entrants.Count; i++)
                {
                    var e = entrants[i];
                    if (!Running(e) || e.Car.Wrecked || e.Pit != null || e.Progress.Finished != null) continue;
                    var cut = TrackLimits.Judge(e.Limits, track, race.Corners, e.Progress.Idx, e.Car.X, e.Car.Y, e.Car.Cls.Width);
                    var pit = race.Pit;
                    bool toPits = pit != null && Pits.Between(e.Progress.Idx, pit.Entry, pit.WallTo, n) && Racing.LateralOffset(track, e.Progress.Idx, e.Car.X, e.Car.Y) * pit.Side > 0;
                    if (TrackLimits.OffTrack(e.Limits, track, e.Progress.Idx, e.Car.X, e.Car.Y, e.Car.Cls.Width, toPits)) output.Add(new RaceEvent { Kind = RaceEventKind.OffTrack, Who = i });
                    if (cut == null) continue;
                    if (cut.Value.Seconds != 0)
                    {
                        e.Progress = e.Progress.Clone();
                        e.Progress.Penalty += cut.Value.Seconds;
                    }
                    output.Add(new RaceEvent { Kind = RaceEventKind.TrackLimits, Who = i, Strike = cut.Value.Number, Seconds = cut.Value.Seconds });
                }
            }

            // wrecks
            bool wreck = false, bigCrash = false;
            for (int i = 0; i < entrants.Count; i++)
            {
                var e = entrants[i];
                if (!Running(e)) continue;
                bool wreckedNow = events[i].WreckedNow || (e.Car.Wrecked && e.WreckedAt == null);
                if (IsBigCrash(e.Car, before[i], wreckedNow))
                {
                    bigCrash = true;
                    if (e.Car.Wrecked) wreck = true;
                    output.Add(new RaceEvent { Kind = RaceEventKind.Crash, Who = i, Vx = moving[i].vx, Vy = moving[i].vy, Hit = (before[i] - e.Car.Health) / e.Car.Cls.Health, Wrecked = e.Car.Wrecked });
                }
                if (e.Car.Wrecked && e.WreckedAt == null)
                {
                    e.WreckedAt = race.Clock;
                    output.Add(new RaceEvent { Kind = RaceEventKind.Wreck, Who = i });
                }
                if (e.WreckedAt != null && race.Clock - e.WreckedAt.Value >= ClearAfter)
                {
                    e.Progress = e.Progress.Clone();
                    e.Progress.Retired = true;
                    output.Add(new RaceEvent { Kind = RaceEventKind.Retired, Who = i });
                }
            }

            var ranked = Order(race);
            Entrant leader = null;
            foreach (int i in ranked)
            {
                var e = entrants[i];
                if (Running(e) && !e.Car.Wrecked && e.Progress.Finished == null) { leader = e; break; }
            }
            if (race.Sc == null && racing && wreck && leader != null)
            {
                race.Vsc = null;
                race.Sc = SafetyCarAhead(track, leader.Car, leader.Progress.Idx);
                race.HoldBehind = entrants.Select((_, i) => NewSet(ranked.Take(ranked.IndexOf(i)))).ToList();
                output.Add(new RaceEvent { Kind = RaceEventKind.SafetyCar });
            }
            else if (race.Sc == null && race.Vsc == null && racing && bigCrash && leader != null)
            {
                output.Add(CallVsc(race));
            }
            else if (sc != null || vsc != null)
            {
                if (sc != null)
                {
                    if (leader != null && ToSafetyCar(leader) <= QueueGap) sc.Led += dt;
                    sc.Out += dt;
                }
                for (int i = 0; i < entrants.Count; i++)
                {
                    var e = entrants[i];
                    if (e.Pit != null) continue;
                    var hold = race.HoldBehind[i];
                    foreach (int j in hold.ToList())
                    {
                        var other = entrants[j];
                        if (!Running(other) || other.Car.Wrecked || other.Pit != null || other.Progress.Finished != null || !Running(e)) hold.Remove(j);
                        else if (ranked.IndexOf(i) < ranked.IndexOf(j))
                        {
                            e.Progress = e.Progress.Clone();
                            e.Progress.Penalty += ScPenalty;
                            hold.Remove(j);
                            output.Add(new RaceEvent { Kind = RaceEventKind.Penalty, Who = i, Seconds = ScPenalty });
                        }
                    }
                }
                if (vsc != null)
                {
                    double was = race.Vsc.Value;
                    race.Vsc = was + dt;
                    if (was < VscLength - VscWarn && race.Vsc.Value >= VscLength - VscWarn) output.Add(new RaceEvent { Kind = RaceEventKind.VscEnding });
                }
                if (sc != null ? sc.Led >= LeadFor || sc.Out >= MaxOut || leader == null : race.Vsc.Value >= VscLength || leader == null)
                {
                    race.Sc = null;
                    race.Vsc = null;
                    race.HoldBehind = EmptyHolds(entrants.Count);
                    output.Add(new RaceEvent { Kind = RaceEventKind.Green });
                }
            }
            return new StepResult { Cars = events, Race = output };
        }
    }
}
