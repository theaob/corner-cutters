// A race on one circuit: you and the AI field, lights to flag, with the web game's race rules (CornerCutters.Core's
// RaceControl, checked bit for bit against the web game's own races): rivals in their team liveries, contact, pit
// stops for tyres and repairs, the safety car and the virtual one, track limits and penalties, blue flags, the
// cool-down lap and home to the garages. This class wires input, the fixed-step clock, the views and the HUD (the
// timing tower, your place, the race's calls). Restart replays the same weekend; a new circuit draws a new one.
using System.Collections.Generic;
using System.Linq;
using CornerCutters.Core;
using UnityEngine;
using Grid = CornerCutters.Core.Grid;

namespace CornerCutters.Game
{
    public sealed class RaceController : MonoBehaviour
    {
        /// <summary>the web game's race length (src/f1/laps.ts RACE_LAPS: a SPRINT)</summary>
        const int Laps = 5;

        readonly FixedClock clock = new FixedClock();
        GameInput input;
        ChaseCamera chase;
        GameObject circuitView;
        StartLights lights;
        StandView stands;
        HudView hud;
        /// <summary>the best lap ever on this circuit (PlayerPrefs)</summary>
        double record = double.NaN;
        CircuitData circuit;
        Grid grid;
        Track track;
        PitLane pit;
        bool paused;
        SceneryMovers movers;
        ScenePlanes planes;
        CritterView critters;
        int circuitIndex;
        IReadOnlyList<string> ids;
        double bestLap = double.NaN;

        // the weekend: its seed (restart replays it), the field drawn from it, the race
        uint seed;
        readonly Team team = Field.Teams[0];
        readonly Difficulty difficulty = Field.Normal;
        Weekend weekend;
        Race race;
        int you;
        GapTimer gaps;
        readonly List<CarView> views = new List<CarView>();
        readonly List<Compound> viewTyres = new List<Compound>();
        SafetyCarView safetyCar;
        // a call of the race's on the screen (SAFETY CAR, a penalty, your pit stop...), till a race time
        string notice;
        Color noticeColor;
        double noticeUntil;
        double sinceStart;

        /// <summary>each car's last two simulation poses (the safety car last), for drawing between steps</summary>
        Pose[] was = new Pose[0], now = new Pose[0];
        struct Pose { public double X, Y, Z, H; }

        void Start()
        {
            input = new GameInput();
            input.Enable();
            var camGo = new GameObject("Camera");
            camGo.transform.SetParent(transform, false);
            var cam = camGo.AddComponent<Camera>();
            camGo.AddComponent<TiltShiftEffect>();
            camGo.tag = "MainCamera";
            camGo.AddComponent<AudioListener>();
            chase = new ChaseCamera(cam);
            safetyCar = new SafetyCarView();
            safetyCar.Root.transform.SetParent(transform, false);
            safetyCar.Root.SetActive(false);
            ids = CircuitLoader.Ids();
            circuitIndex = Mathf.Max(0, new List<string>(ids).IndexOf(PlayerPrefs.GetString("circuit", "crescent-park")));
            LoadCircuit(circuitIndex);
        }

        void OnDestroy() => input?.Disable();

        void LoadCircuit(int index)
        {
            circuitIndex = ((index % ids.Count) + ids.Count) % ids.Count;
            if (circuitView != null) Destroy(circuitView);
            circuit = CircuitLoader.Load(ids[circuitIndex]);
            PlayerPrefs.SetString("circuit", circuit.id);
            grid = circuit.ToGrid();
            track = circuit.ToTrack();
            pit = circuit.ToPitLane();
            // the web game's own scenery, baked (BakedScenery: towns, buildings, trees, stands, pits, barriers...); without it,
            // the hand-built stand-ins
            bool baked = BakedScenery.Has(circuit.id);
            circuitView = TrackView.Build(circuit, barriers: !baked);
            circuitView.transform.SetParent(transform, false);
            movers = baked ? BakedScenery.Build(circuitView, circuit) : null;
            planes = baked ? ScenePlanes.Load(circuit.id) : null;
            critters = baked ? CritterView.Load(circuit) : null;
            if (!baked)
            {
                SceneryView.Build(circuitView, circuit);
                PitView.Build(circuitView, circuit);
            }
            stands = StandView.Build(circuitView, circuit, structure: !baked);
            lights = new StartLights(circuitView.transform, circuit);
            hud = new HudView(circuit);
            record = PlayerPrefs.HasKey("rec." + circuit.id) ? PlayerPrefs.GetFloat("rec." + circuit.id) : double.NaN;
            bestLap = double.NaN;
            // a new weekend: a new seed, so new rivals and a new grid (restart replays this one)
            seed = (uint)Random.Range(1, int.MaxValue);
            Restart();
        }

        /// <summary>The weekend's race from the lights: the field drawn from its seed, each car in its own slot.</summary>
        void Restart()
        {
            weekend = Field.DrawWeekend(seed, circuit.slots.Length, team, difficulty);
            you = weekend.YouDriver;
            var field = new List<FieldEntry>();
            for (int k = 0; k < weekend.Drivers.Count; k++)
            {
                var slot = circuit.slots[k];
                field.Add(new FieldEntry { Car = new Car(CarClass.F1(), slot.x, slot.y, slot.heading), Ai = weekend.Drivers[k].Ai, Box = weekend.Drivers[k].Box });
            }
            race = RaceControl.NewRace(track, grid, difficulty.Handling(), Laps, field, weekend.LightsOut, pit, Weather.Dry);
            foreach (var e in race.Entrants) e.Car.Z = Sim.GroundAt(grid, e.Car.X, e.Car.Y).H;
            gaps = new GapTimer(race.Entrants.Count);
            foreach (var v in views) Destroy(v.Root);
            views.Clear();
            viewTyres.Clear();
            for (int k = 0; k < race.Entrants.Count; k++) AddView(k);
            was = new Pose[race.Entrants.Count + 1];
            now = new Pose[race.Entrants.Count + 1];
            for (int k = 0; k < race.Entrants.Count; k++) was[k] = now[k] = PoseOf(race.Entrants[k].Car);
            notice = null;
            sinceStart = 0;
            paused = false;
            clock.Carry = 0;
            input.ResetWheel();
            chase.Snap();
        }

        /// <summary>Entrant k's car, in its team's livery, on the tyres it's on (built again when they change).</summary>
        void AddView(int k)
        {
            var d = weekend.Drivers[k];
            var tyres = race.Entrants[k].Tyres.Compound;
            var view = new CarView(Livery.FromTeam(d.Team, d.Seat), Tyres.Color(tyres));
            view.Root.transform.SetParent(transform, false);
            if (k < views.Count)
            {
                Destroy(views[k].Root);
                views[k] = view;
                viewTyres[k] = tyres;
            }
            else
            {
                views.Add(view);
                viewTyres.Add(tyres);
            }
        }

        static Pose PoseOf(Car c) => new Pose { X = c.X, Y = c.Y, Z = c.Z, H = c.Heading };

        Entrant Me => race.Entrants[you];

        void Update()
        {
            input.Poll();
            if (input.PausePressed) paused = !paused;
            if (input.RestartPressed) Restart();
            if (input.CircuitStep != 0) LoadCircuit(circuitIndex + input.CircuitStep);
            if (input.CameraPressed) chase.Cycle();

            float frame = Time.unscaledDeltaTime;
            if (!paused)
            {
                clock.Advance(frame, out int steps, out double alpha);
                for (int i = 0; i < steps; i++) Step();
                alpha = System.Math.Min(1, clock.Carry / clock.Step);
                Draw(alpha, frame);
            }
            else
            {
                Draw(1, frame);
            }
        }

        void Step()
        {
            double dt = FixedClock.SimDt;
            sinceStart += dt;
            for (int k = 0; k < now.Length; k++) was[k] = now[k];
            // (the wheel read every step, held or not, so its smoothing runs on through the lights)
            var wheel = input.Wheel(dt);
            int lapsBefore = Me.Progress.Lap;
            bool scWasOut = race.Sc != null;
            var result = RaceControl.StepRace(race, dt, e => Racing.WheelInput(wheel, e.Car));
            if (race.Phase == RacePhase.Racing) gaps.Step(race.Entrants.Select(e => e.Progress).ToList(), track, race.Clock);
            // your laps: the best this race, and the circuit's record
            if (Me.Progress.Lap > lapsBefore && Me.Progress.LapTimes.Count > 0)
            {
                double t = Me.Progress.LapTimes[Me.Progress.LapTimes.Count - 1];
                if (double.IsNaN(bestLap) || t < bestLap) bestLap = t;
                if (double.IsNaN(record) || t < record) { record = t; PlayerPrefs.SetFloat("rec." + circuit.id, (float)t); }
            }
            foreach (var ev in result.Race) Call(ev);
            for (int k = 0; k < race.Entrants.Count; k++) now[k] = PoseOf(race.Entrants[k].Car);
            int sc = race.Entrants.Count;
            if (race.Sc != null)
            {
                // (just out: drawn where it joins, not swept there from the last place it was)
                now[sc] = PoseOf(race.Sc.Car);
                if (!scWasOut) was[sc] = now[sc];
            }
        }

        /// <summary>The race's calls, as the web game's banner makes them: for the whole field, and for you.</summary>
        void Call(RaceEvent ev)
        {
            var gold = TrackView.Hex(0xf2c14e);
            var red = TrackView.Hex(0xd8323c);
            var ink = TrackView.Hex(0xf4f2fa);
            var blue = TrackView.Hex(0x4fa3ff);
            bool mine = ev.Who == you;
            switch (ev.Kind)
            {
                case RaceEventKind.SafetyCar: Notice("SAFETY CAR", gold, 4); break;
                case RaceEventKind.Vsc: Notice("VIRTUAL SAFETY CAR", gold, 4); break;
                case RaceEventKind.VscEnding: Notice("VSC ENDING", gold, 3); break;
                case RaceEventKind.Green: Notice("GREEN FLAG", TrackView.Hex(0x3ccf4e), 3); break;
                case RaceEventKind.Penalty when mine: Notice($"+{ev.Seconds:0}S PENALTY · NO OVERTAKING", red, 4); break;
                case RaceEventKind.TrackLimits when mine:
                    Notice(ev.Seconds > 0 ? $"TRACK LIMITS · +{ev.Seconds:0}S" : $"TRACK LIMITS · WARNING {ev.Strike}", ev.Seconds > 0 ? red : gold, 3);
                    break;
                case RaceEventKind.Blue when mine: Notice("BLUE FLAG · LET THEM BY", blue, 3); break;
                case RaceEventKind.PitStop when mine: Notice($"PIT STOP · {ev.Seconds:0.0}S · {Tyres.Name(Me.Tyres.Compound)}", ink, 3); break;
                case RaceEventKind.Wreck when mine: Notice("WRECKED", red, 4); break;
                case RaceEventKind.Retired when !mine: Notice($"{weekend.Drivers[ev.Who].Code} OUT", ink, 3); break;
            }
        }

        void Notice(string text, Color color, double seconds)
        {
            notice = text;
            noticeColor = color;
            noticeUntil = sinceStart + seconds;
        }

        Pose Between(int k, double alpha)
        {
            var a = was[k];
            var b = now[k];
            return new Pose { X = a.X + (b.X - a.X) * alpha, Y = a.Y + (b.Y - a.Y) * alpha, Z = a.Z + (b.Z - a.Z) * alpha, H = a.H + Driving.AngleDiff(b.H, a.H) * alpha };
        }

        void Draw(double alpha, float frame)
        {
            lights.Show(race.Phase == RacePhase.Lights ? StartLights.LitAt(race.Clock + RaceControl.Lights) : 0);
            for (int k = 0; k < race.Entrants.Count; k++)
            {
                var e = race.Entrants[k];
                // (a wreck cleared off by the marshals is gone)
                bool shown = !e.Progress.Retired;
                if (views[k].Root.activeSelf != shown) views[k].Root.SetActive(shown);
                if (!shown) continue;
                if (viewTyres[k] != e.Tyres.Compound) AddView(k);
                var p = Between(k, alpha);
                var g = Bridge.GridFor(track, grid, e.Progress.Idx);
                views[k].Root.transform.SetPositionAndRotation(Units.ToWorld(p.X, p.Y, p.Z), Units.Rotation(e.Car, g, p.H));
            }
            bool scOut = race.Sc != null;
            if (safetyCar.Root.activeSelf != scOut) safetyCar.Root.SetActive(scOut);
            if (scOut)
            {
                var p = Between(race.Entrants.Count, alpha);
                safetyCar.Root.transform.SetPositionAndRotation(Units.ToWorld(p.X, p.Y, p.Z), Units.Rotation(race.Sc.Car, grid, p.H));
                safetyCar.Step(frame);
            }
            var me = Between(you, alpha);
            var car = Me.Car;
            var pos = Units.ToWorld(me.X, me.Y, me.Z);
            // (the crowds sway on while paused, as the web game's: frame is 0 then only if the clock stops)
            if (stands != null) stands.Step(frame, me.X, me.Y);
            movers?.Step(frame);
            planes?.Step(frame, me.X, me.Y, car.Vx, car.Vy);
            critters?.Step(frame, me.X, me.Y, car.Vx, car.Vy);
            float speed01 = Mathf.Clamp01((float)(Driving.SpeedOf(car) / car.Cls.TopSpeed));
            // look a little ahead of where the car is going (the web game's lead: about 40 px at full speed)
            var lead = new Vector3((float)(car.Vx / car.Cls.TopSpeed * 2.5), 0, (float)(-car.Vy / car.Cls.TopSpeed * 2.5));
            chase.Follow(pos, Units.Yaw(me.H), speed01, lead, frame);
        }

        // ---- the HUD (HudView: the web game's, in its pixel font) ----

        /// <summary>The timing tower's rows (race.ts drawTower): the top three, then the cars round you.</summary>
        List<HudView.TowerRow> TowerRows(List<int> order)
        {
            int n = track.Count;
            int lead = order[0];
            double Along(int i) => (double)race.Entrants[i].Progress.Lap * n + race.Entrants[i].Progress.Idx;
            var rows = new List<HudView.TowerRow>();
            foreach (int i in Tower.Rows(order, you))
            {
                if (i < 0) { rows.Add(new HudView.TowerRow { Gap = null }); continue; }
                var e = race.Entrants[i];
                var d = weekend.Drivers[i];
                int place = order.IndexOf(i) + 1;
                string gap = e.Progress.Retired ? "OUT" : e.Pit != null ? "PIT" : e.Blue != null ? "BLUE"
                    : Tower.Gap(place, gaps.Between(lead, i), System.Math.Max(0, (int)System.Math.Floor((Along(lead) - Along(i)) / n)));
                rows.Add(new HudView.TowerRow
                {
                    Place = place, Body = TrackView.Hex(d.Team.Body), Trim = TrackView.Hex(d.Team.Trim), Name = i == you ? "YOU" : d.Code, Gap = gap,
                    You = i == you, Out = e.Progress.Retired, Blue = e.Blue != null,
                });
            }
            return rows;
        }

        void OnGUI()
        {
            if (race == null || hud == null) return;
            var p = Me.Progress;
            bool racing = race.Phase == RacePhase.Racing;
            bool finished = p.Finished.HasValue;
            var order = RaceControl.Order(race);
            double lapNow = p.LapStart.HasValue && racing && !finished ? race.Clock - p.LapStart.Value : double.NaN;
            string held = Me.Held.HasValue ? (race.Sc != null ? "SAFETY CAR" : "VSC") : null;
            var choice = hud.Draw(new HudView.State
            {
                LapTime = lapNow,
                Last = p.LapTimes.Count > 0 ? p.LapTimes[p.LapTimes.Count - 1] : double.NaN,
                Best = bestLap,
                Record = record,
                Health = Me.Car.Health / Me.Car.Cls.Health,
                Wrecked = Me.Car.Wrecked,
                Lap = System.Math.Min(Laps, p.Lap + 1),
                Laps = Laps,
                Lights = race.Phase == RacePhase.Lights,
                Lit = StartLights.LitAt(race.Clock + RaceControl.Lights),
                AllLit = race.Phase == RacePhase.Lights && race.Clock >= 0,
                SinceGo = racing ? race.Clock : double.NaN,
                WrongWay = p.WrongWay,
                Finished = finished,
                RaceTime = (p.Finished ?? 0) + p.Penalty,
                Paused = paused,
                CarX = now[you].X, CarY = now[you].Y,
                Source = input.Source,
                Team = team.Name.ToUpperInvariant(), Difficulty = difficulty.Name, Weather = "DRY",
                Place = order.IndexOf(you) + 1,
                Cars = order.Count,
                Tower = racing ? TowerRows(order) : null,
                Tyre = $"{Tyres.Short(Me.Tyres.Compound)} {System.Math.Round((1 - Me.Tyres.Wear) * 100):0}%",
                TyreColor = TrackView.Hex(Tyres.Color(Me.Tyres.Compound)),
                Notice = sinceStart < noticeUntil ? notice : held,
                NoticeColor = sinceStart < noticeUntil ? noticeColor : TrackView.Hex(0xf2c14e),
                Others = race.Entrants.Select((e, i) => (e, i)).Where(t => t.i != you && !t.e.Progress.Retired).Select(t => (t.e.Car.X, t.e.Car.Y)).ToList(),
            });
            if (choice == HudView.PauseChoice.Resume) paused = false;
            else if (choice == HudView.PauseChoice.Restart) Restart();
            else if (choice == HudView.PauseChoice.NextCircuit) LoadCircuit(circuitIndex + 1);
        }
    }
}
